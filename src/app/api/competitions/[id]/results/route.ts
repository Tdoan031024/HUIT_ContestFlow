import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { aggregateJudgeScores } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lock'), roundId: z.string().uuid() }),
  z.object({ action: z.literal('publish'), roundId: z.string().uuid() }),
  z.object({ action: z.literal('reopen-score'), roundId: z.string().uuid(), scoreSheetId: z.string().uuid(), reason: z.string().trim().min(10).max(2000) }),
]);
type Context = { params: Promise<{ id: string }> };
type JudgeResult = { judge: string; score: number | null; details?: { criterionId: string; criterion: string; score: number }[] };
type ResultRow = { entryId: string; entryCode: string; title: string | null; contestant: string; organization: string | null; totalScore: number | null; rank: number | null; submittedCount: number; requiredCount: number; judges: JudgeResult[] };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canViewCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền xem cuộc thi.' }, { status: 403 });
  const roundId = new URL(request.url).searchParams.get('roundId');
  if (!roundId) return Response.json({ error: 'Chọn vòng thi để xem kết quả.' }, { status: 400 });
  const [round, manager] = await Promise.all([
    prisma.competitionRound.findFirst({ where: { id: roundId, competitionId: id }, include: { entries: { where: { status: 'ACTIVE' }, orderBy: { sequence: 'asc' }, include: { contestant: true } } } }),
    canManageCompetition(user, id),
  ]);
  if (!round) return Response.json({ error: 'Không tìm thấy vòng thi.' }, { status: 404 });
  const snapshot = await prisma.resultSnapshot.findFirst({ where: { roundId, ...(manager ? {} : { published: true }) }, orderBy: { version: 'desc' } });
  const showSnapshot = snapshot && (!manager || round.status === 'COMPLETED');
  if (showSnapshot && snapshot) {
    const snapshotRows = snapshot.data as ResultRow[];
    const rows = manager ? snapshotRows : snapshotRows.map((row) => ({ ...row, judges: round.publishScores ? row.judges.map(({ judge, score }) => ({ judge, score })) : [] }));
    if (new URL(request.url).searchParams.get('format') === 'csv') return csvResponse(rows, round.name);
    return Response.json({ round: { id: round.id, name: round.name, status: round.status }, snapshot: { ...snapshot, data: rows }, missing: [] });
  }
  if (!manager) return Response.json({ error: 'Kết quả chưa được công bố.' }, { status: 404 });

  const sheets = await prisma.scoreSheet.findMany({
    where: { roundId, status: 'SUBMITTED' },
    include: { judge: { select: { fullName: true } }, details: { orderBy: { criterion: { sequence: 'asc' } }, include: { criterion: { select: { id: true, name: true } } } } },
  });
  const requiredCount = round.requiredJudgeCount;
  const missing = round.entries.map((entry) => ({ entryId: entry.id, entryCode: entry.entryCode, displayName: entry.contestant.displayName, submittedCount: sheets.filter((sheet) => sheet.entryId === entry.id).length, requiredCount }))
    .filter((entry) => entry.submittedCount < requiredCount);
  const rows: ResultRow[] = round.entries.map((entry) => {
    const entrySheets = sheets.filter((sheet) => sheet.entryId === entry.id);
    const values = entrySheets.map((sheet) => Number(sheet.totalScore ?? 0));
    return {
      entryId: entry.id, entryCode: entry.entryCode, title: entry.title,
      contestant: round.anonymous ? 'Danh tính được ẩn' : entry.contestant.displayName,
      organization: round.anonymous ? null : entry.contestant.organization,
      totalScore: aggregateJudgeScores(values, round.aggregateMethod as 'AVERAGE' | 'MEDIAN'), rank: null,
      submittedCount: entrySheets.length, requiredCount,
      judges: entrySheets.map((sheet) => ({ judge: sheet.judge.fullName, score: sheet.totalScore === null ? null : Number(sheet.totalScore), details: sheet.details.map((detail) => ({ criterionId: detail.criterion.id, criterion: detail.criterion.name, score: Number(detail.score) })) })),
    };
  });
  rows.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1) || a.entryCode.localeCompare(b.entryCode, 'vi'));
  let priorScore: number | null = null;
  let priorRank = 0;
  rows.forEach((row, index) => {
    if (row.totalScore === priorScore) row.rank = priorRank;
    else { row.rank = index + 1; priorRank = row.rank; priorScore = row.totalScore; }
  });
  if (new URL(request.url).searchParams.get('format') === 'csv') return csvResponse(rows, round.name);
  return Response.json({ round: { id: round.id, name: round.name, status: round.status, requiredJudgeCount: requiredCount, allowAdvanceWithGaps: round.allowAdvanceWithGaps }, rows, missing, snapshot: null });
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin mới được chốt kết quả.' }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Yêu cầu cập nhật kết quả không hợp lệ.' }, { status: 400 });
  const round = await prisma.competitionRound.findFirst({ where: { id: parsed.data.roundId, competitionId: id } });
  if (!round) return Response.json({ error: 'Không tìm thấy vòng thi.' }, { status: 404 });

  if (parsed.data.action === 'reopen-score') {
    const sheet = await prisma.scoreSheet.findFirst({ where: { id: parsed.data.scoreSheetId, roundId: round.id, competitionId: id } });
    if (!sheet || sheet.status !== 'SUBMITTED') return Response.json({ error: 'Không tìm thấy phiếu đã nộp để mở lại.' }, { status: 404 });
    const reason = parsed.data.reason;
    await prisma.$transaction(async (tx) => {
      await tx.scoreSheet.update({ where: { id: sheet.id }, data: { status: 'REOPENED', submittedAt: null, reopenedReason: reason } });
      await tx.competitionRound.update({ where: { id: round.id }, data: { status: 'READY' } });
      await tx.competitionSession.updateMany({ where: { roundId: round.id }, data: { state: 'PAUSED', version: { increment: 1 } } });
      await tx.competition.update({ where: { id }, data: { status: 'READY' } });
      await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'SCORE_REOPENED', entityType: 'ScoreSheet', entityId: sheet.id, details: { reason } } });
    });
    return Response.json({ ok: true, message: 'Đã mở lại phiếu chấm; bản kết quả cũ vẫn được lưu trong lịch sử.' });
  }

  if (parsed.data.action === 'publish') {
    const snapshot = await prisma.resultSnapshot.findFirst({ where: { roundId: round.id }, orderBy: { version: 'desc' } });
    if (!snapshot) return Response.json({ error: 'Cần khóa kết quả trước khi công bố.' }, { status: 409 });
    const published = await prisma.resultSnapshot.update({ where: { id: snapshot.id }, data: { published: true } });
    await prisma.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'RESULTS_PUBLISHED', entityType: 'ResultSnapshot', entityId: published.id, details: { version: published.version } } });
    return Response.json({ snapshot: published });
  }

  if (round.status === 'COMPLETED' && await prisma.resultSnapshot.findFirst({ where: { roundId: round.id } })) return Response.json({ error: 'Kết quả đã khóa. Mở lại phiếu bằng lý do trước khi chốt phiên bản mới.' }, { status: 409 });
  const entries = await prisma.competitionEntry.findMany({ where: { roundId: round.id, status: 'ACTIVE' }, orderBy: { sequence: 'asc' }, include: { contestant: true } });
  if (!entries.length) return Response.json({ error: 'Vòng thi chưa có thí sinh.' }, { status: 409 });
  const sheets = await prisma.scoreSheet.findMany({ where: { roundId: round.id, status: 'SUBMITTED' }, include: { judge: { select: { fullName: true } }, details: { orderBy: { criterion: { sequence: 'asc' } }, include: { criterion: { select: { id: true, name: true } } } } } });
  const missing = entries.filter((entry) => sheets.filter((sheet) => sheet.entryId === entry.id).length < round.requiredJudgeCount);
  if (missing.length && !round.allowAdvanceWithGaps) return Response.json({ error: `Còn ${missing.length} lượt thi thiếu phiếu điểm.`, missing: missing.map((entry) => entry.entryCode) }, { status: 409 });

  const rows: ResultRow[] = entries.map((entry) => {
    const entrySheets = sheets.filter((sheet) => sheet.entryId === entry.id);
    return {
      entryId: entry.id, entryCode: entry.entryCode, title: entry.title,
      contestant: round.anonymous ? 'Danh tính được ẩn' : entry.contestant.displayName,
      organization: round.anonymous ? null : entry.contestant.organization,
      totalScore: aggregateJudgeScores(entrySheets.map((sheet) => Number(sheet.totalScore ?? 0)), round.aggregateMethod as 'AVERAGE' | 'MEDIAN'), rank: null,
      submittedCount: entrySheets.length, requiredCount: round.requiredJudgeCount,
      judges: entrySheets.map((sheet) => ({ judge: sheet.judge.fullName, score: sheet.totalScore === null ? null : Number(sheet.totalScore), details: sheet.details.map((detail) => ({ criterionId: detail.criterion.id, criterion: detail.criterion.name, score: Number(detail.score) })) })),
    };
  });
  rows.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1) || a.entryCode.localeCompare(b.entryCode, 'vi'));
  let previous: number | null = null;
  let rank = 0;
  rows.forEach((row, index) => {
    if (row.totalScore !== previous) { rank = index + 1; previous = row.totalScore; }
    row.rank = rank;
  });
  const version = (await prisma.resultSnapshot.aggregate({ where: { roundId: round.id }, _max: { version: true } }))._max.version ?? 0;
  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.resultSnapshot.create({ data: {
      competitionId: id, roundId: round.id, version: version + 1, lockedBy: user.id, published: false, data: rows as never,
    } });
    await tx.competitionRound.update({ where: { id: round.id }, data: { status: 'COMPLETED' } });
    await tx.competitionSession.updateMany({ where: { roundId: round.id }, data: { currentEntryId: null, state: 'COMPLETED', version: { increment: 1 } } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'RESULTS_LOCKED', entityType: 'ResultSnapshot', entityId: created.id, details: { version: version + 1, entryCount: rows.length, missingCount: missing.length } } });
    return created;
  });
  return Response.json({ snapshot }, { status: 201 });
}

function csvResponse(rows: ResultRow[], roundName: string) {
  const quote = (value: unknown) => {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const judgeNames = [...new Set(rows.flatMap((row) => row.judges.map((judge) => judge.judge)))].sort((a, b) => a.localeCompare(b, 'vi'));
  const criteria = [...new Map(rows.flatMap((row) => row.judges.flatMap((judge) => judge.details ?? [])).map((detail) => [detail.criterionId, detail])).values()];
  const lines = [
    ['Vòng thi', 'Hạng', 'Mã dự thi', 'Tên thí sinh', 'Đơn vị', 'Điểm tổng', 'Số phiếu', 'Số phiếu yêu cầu', 'Trạng thái phiếu', ...judgeNames.map((name) => `Tổng · ${name}`), ...judgeNames.flatMap((judge) => criteria.map((criterion) => `${judge} · ${criterion.criterion}`))].map(quote).join(','),
    ...rows.map((row) => [
      roundName, row.rank, row.entryCode, row.contestant, row.organization, row.totalScore,
      row.submittedCount, row.requiredCount,
      row.submittedCount >= row.requiredCount ? 'Đủ phiếu' : `Thiếu ${row.requiredCount - row.submittedCount}`,
      ...judgeNames.map((name) => row.judges.find((judge) => judge.judge === name)?.score ?? ''),
      ...judgeNames.flatMap((judgeName) => criteria.map((criterion) => row.judges.find((judge) => judge.judge === judgeName)?.details?.find((detail) => detail.criterionId === criterion.criterionId)?.score ?? '')),
    ].map(quote).join(',')),
  ];
  return new Response(`\uFEFF${lines.join('\r\n')}`, { headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="contestflow-results.csv"`,
    'cache-control': 'no-store',
  } });
}

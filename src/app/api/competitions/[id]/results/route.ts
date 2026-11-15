import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { refreshCompetitionStatus } from '@/lib/competition-status';
import { aggregateJudgeScores, aggregateRequiredGateResults, roundScore } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';
import { ensureCompetitionWorkspace } from '@/lib/competition-workspace-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lock'), reason: z.string().trim().min(10).max(2000).optional() }),
  z.object({ action: z.literal('publish') }),
  z.object({ action: z.literal('reopen-score'), scoreSheetId: z.string().uuid(), reason: z.string().trim().min(10).max(2000) }),
]);
type Context = { params: Promise<{ id: string }> };
type JudgeResult = { judge: string; score: number | null; outcome?: string | null; details?: { criterionId: string; criterion: string; score: number | null; value: unknown; displayValue: string }[] };
type ResultRow = { entryId: string; entryCode: string; title: string | null; contestant: string; organization: string | null; totalScore: number | null; rank: number | null; outcome: 'PASS' | 'FAIL'; submittedCount: number; requiredCount: number; judges: JudgeResult[] };
type RankableResult = ResultRow & { tieBreakScores: number[] };
type SnapshotPolicy = { anonymous: boolean; requiredJudgeCount: number; allowAdvanceWithGaps: boolean; publishJudgeScores: boolean; aggregateMethod: string; tieBreakMethod: string; roundingPrecision: number };
type SnapshotData = { policy: SnapshotPolicy; rows: ResultRow[] };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canViewCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền xem cuộc thi.' }, { status: 403 });
  const [workspace, manager] = await Promise.all([
    ensureCompetitionWorkspace(id),
    canManageCompetition(user, id),
  ]);
  if (!workspace) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const roundId = workspace.id;
  const round = await prisma.competitionRound.findUnique({ where: { id: roundId }, include: { competition: { select: { name: true } }, entries: { where: { status: 'ACTIVE' }, orderBy: { sequence: 'asc' }, include: { contestant: true } } } });
  if (!round) return Response.json({ error: 'Chưa có dữ liệu kết quả cho cuộc thi.' }, { status: 404 });
  const snapshot = await prisma.resultSnapshot.findFirst({ where: { roundId, ...(manager ? {} : { published: true }) }, orderBy: { version: 'desc' } });
  const showSnapshot = snapshot && (!manager || round.status === 'COMPLETED');
  if (showSnapshot && snapshot) {
    const lockedBy = await prisma.user.findUnique({ where: { id: snapshot.lockedBy }, select: { fullName: true } });
    const stored = snapshot.data as unknown as SnapshotData | ResultRow[];
    const snapshotRows = Array.isArray(stored) ? stored : stored.rows;
    const policy = Array.isArray(stored) ? null : stored.policy;
    const rows = manager ? snapshotRows.map((row) => ({ ...row, outcome: row.outcome ?? 'PASS' as const })) : snapshotRows.map((row) => ({
      ...row,
      outcome: row.outcome ?? 'PASS' as const,
      judges: policy?.publishJudgeScores ? row.judges.map(({ judge, score }) => ({ judge, score })) : [],
    }));
    if (new URL(request.url).searchParams.get('format') === 'csv') return csvResponse(rows, round.competition.name);
    return Response.json({ round: { id: round.id, name: round.name, status: round.status, aggregateMethod: policy?.aggregateMethod ?? round.aggregateMethod, tieBreakMethod: policy?.tieBreakMethod ?? round.tieBreakMethod, roundingPrecision: policy?.roundingPrecision ?? round.roundingPrecision, anonymous: policy?.anonymous ?? true, requiredJudgeCount: policy?.requiredJudgeCount ?? round.requiredJudgeCount, allowAdvanceWithGaps: policy?.allowAdvanceWithGaps ?? round.allowAdvanceWithGaps }, snapshot: { ...snapshot, data: rows, policy, lockedByName: lockedBy?.fullName ?? 'Tài khoản đã bị xóa' }, missing: [] });
  }
  if (!manager) return Response.json({ error: 'Kết quả chưa được công bố.' }, { status: 404 });

  const sheets = await prisma.scoreSheet.findMany({
    where: { roundId, status: 'SUBMITTED' },
    include: { judge: { select: { fullName: true } }, details: { orderBy: { criterion: { sequence: 'asc' } }, include: { criterion: { select: { id: true, name: true, sequence: true, type: true, config: true } } } }, rubricVersion: { select: { criteria: { orderBy: { sequence: 'asc' }, select: { sequence: true } } } } },
  });
  const requiredCount = round.requiredJudgeCount;
  const missing = round.entries.map((entry) => ({ entryId: entry.id, entryCode: entry.entryCode, displayName: entry.contestant.displayName, submittedCount: sheets.filter((sheet) => sheet.entryId === entry.id).length, requiredCount }))
    .filter((entry) => entry.submittedCount < requiredCount);
  const rankable: RankableResult[] = round.entries.map((entry) => {
    const entrySheets = sheets.filter((sheet) => sheet.entryId === entry.id);
    const values = entrySheets.flatMap((sheet) => sheet.totalScore === null ? [] : [Number(sheet.totalScore)]);
    const totalScore = aggregateJudgeScores(values, round.aggregateMethod as 'AVERAGE' | 'MEDIAN');
    const outcome = aggregateRequiredGateResults(entrySheets.map((sheet) => sheet.outcome as 'PASS' | 'FAIL' | null));
    return {
      entryId: entry.id, entryCode: entry.entryCode, title: entry.title,
      contestant: round.anonymous ? 'Danh tính được ẩn' : entry.contestant.displayName,
      organization: round.anonymous ? null : entry.contestant.organization,
      totalScore: totalScore === null ? null : roundScore(totalScore, round.roundingPrecision), rank: null, outcome,
      submittedCount: entrySheets.length, requiredCount,
      judges: entrySheets.map((sheet) => ({ judge: sheet.judge.fullName, score: sheet.totalScore === null ? null : Number(sheet.totalScore), outcome: sheet.outcome, details: sheet.details.map((detail) => ({ criterionId: detail.criterion.id, criterion: detail.criterion.name, score: detail.score === null ? null : Number(detail.score), value: detail.value ?? (detail.score === null ? null : Number(detail.score)), displayValue: displayCriterionValue(detail.criterion.type, detail.criterion.config, detail.value, detail.score) })) })),
      tieBreakScores: collectTieBreakScores(entrySheets, entrySheets[0]?.rubricVersion.criteria.map((criterion) => criterion.sequence) ?? [], round.aggregateMethod as 'AVERAGE' | 'MEDIAN'),
    };
  });
  const rows = applyRanks(rankable, round.tieBreakMethod);
  if (new URL(request.url).searchParams.get('format') === 'csv') return csvResponse(rows, round.competition.name);
  return Response.json({ round: { id: round.id, name: round.name, status: round.status, requiredJudgeCount: requiredCount, allowAdvanceWithGaps: round.allowAdvanceWithGaps, tieBreakMethod: round.tieBreakMethod, roundingPrecision: round.roundingPrecision }, rows, missing, snapshot: null });
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin mới được chốt kết quả.' }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Yêu cầu cập nhật kết quả không hợp lệ.' }, { status: 400 });
  const workspace = await ensureCompetitionWorkspace(id);
  if (!workspace) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const round = await prisma.competitionRound.findUnique({ where: { id: workspace.id }, include: { session: true } });
  if (!round) return Response.json({ error: 'Chưa có dữ liệu chấm cho cuộc thi.' }, { status: 404 });

  if (parsed.data.action === 'reopen-score') {
    const earlyClosure = await prisma.auditEvent.findFirst({ where: { competitionId: id, action: 'COMPETITION_CLOSED_EARLY' }, select: { id: true } });
    if (earlyClosure) return Response.json({ error: 'Cuộc thi đã được đóng sớm và không thể mở lại phiếu. Hãy liên hệ quản trị hệ thống để xử lý tiếp.' }, { status: 409 });
    const sheet = await prisma.scoreSheet.findFirst({ where: { id: parsed.data.scoreSheetId, roundId: round.id, competitionId: id } });
    const hasSnapshot = await prisma.resultSnapshot.findFirst({ where: { roundId: round.id }, select: { id: true } });
    if (!sheet || !['SUBMITTED', 'DRAFT'].includes(sheet.status) || (sheet.status === 'DRAFT' && !hasSnapshot)) return Response.json({ error: 'Không tìm thấy phiếu cần mở lại.' }, { status: 404 });
    const reason = parsed.data.reason;
    await prisma.$transaction(async (tx) => {
      await tx.scoreSheet.update({ where: { id: sheet.id }, data: { status: 'REOPENED', submittedAt: null, reopenedReason: reason } });
      await tx.competitionRound.update({ where: { id: round.id }, data: { status: 'READY' } });
      await tx.competitionSession.updateMany({ where: { roundId: round.id }, data: { state: 'PAUSED', version: { increment: 1 } } });
      await refreshCompetitionStatus(tx, id);
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
  const previousSnapshot = await prisma.resultSnapshot.findFirst({ where: { roundId: round.id }, select: { id: true } });
  if (round.session?.state !== 'COMPLETED' && !(round.session?.state === 'PAUSED' && previousSnapshot)) return Response.json({ error: 'Kết thúc phiên điều phối trước khi khóa kết quả.' }, { status: 409 });
  const pendingSheets = await prisma.scoreSheet.findMany({ where: { roundId: round.id, status: { in: ['DRAFT', 'REOPENED'] } }, include: { entry: { select: { entryCode: true } }, judge: { select: { fullName: true } } } });
  if (pendingSheets.length) {
    const pending = pendingSheets.map((sheet) => `${sheet.entry.entryCode} · ${sheet.judge.fullName}`);
    return Response.json({ error: `Còn ${pendingSheets.length} bản nháp hoặc phiếu vừa mở lại chưa nộp: ${pending.join(', ')}. Không thể khóa snapshot khi còn công việc này.` }, { status: 409 });
  }
  const entries = await prisma.competitionEntry.findMany({ where: { roundId: round.id, status: 'ACTIVE' }, orderBy: { sequence: 'asc' }, include: { contestant: true } });
  if (!entries.length) return Response.json({ error: 'Cuộc thi chưa có thí sinh.' }, { status: 409 });
    const sheets = await prisma.scoreSheet.findMany({ where: { roundId: round.id, status: 'SUBMITTED' }, include: { judge: { select: { fullName: true } }, details: { orderBy: { criterion: { sequence: 'asc' } }, include: { criterion: { select: { id: true, name: true, sequence: true, type: true, config: true } } } }, rubricVersion: { select: { criteria: { orderBy: { sequence: 'asc' }, select: { sequence: true } } } } } });
  const missing = entries.filter((entry) => sheets.filter((sheet) => sheet.entryId === entry.id).length < round.requiredJudgeCount);
  if (missing.length && !round.allowAdvanceWithGaps) return Response.json({ error: `Còn ${missing.length} lượt thi thiếu phiếu điểm.`, missing: missing.map((entry) => entry.entryCode) }, { status: 409 });
  if (missing.length && round.allowAdvanceWithGaps && !parsed.data.reason) return Response.json({ error: `Còn ${missing.length} lượt thi thiếu phiếu. Nhập lý do để khóa kết quả với ngoại lệ.`, missing: missing.map((entry) => entry.entryCode), needsOverrideReason: true }, { status: 409 });

  const rankable: RankableResult[] = entries.map((entry) => {
    const entrySheets = sheets.filter((sheet) => sheet.entryId === entry.id);
    const totalScore = aggregateJudgeScores(entrySheets.flatMap((sheet) => sheet.totalScore === null ? [] : [Number(sheet.totalScore)]), round.aggregateMethod as 'AVERAGE' | 'MEDIAN');
    const outcome = aggregateRequiredGateResults(entrySheets.map((sheet) => sheet.outcome as 'PASS' | 'FAIL' | null));
    return {
      entryId: entry.id, entryCode: entry.entryCode, title: entry.title,
      contestant: round.anonymous ? 'Danh tính được ẩn' : entry.contestant.displayName,
      organization: round.anonymous ? null : entry.contestant.organization,
      totalScore: totalScore === null ? null : roundScore(totalScore, round.roundingPrecision), rank: null, outcome,
      submittedCount: entrySheets.length, requiredCount: round.requiredJudgeCount,
      judges: entrySheets.map((sheet) => ({ judge: sheet.judge.fullName, score: sheet.totalScore === null ? null : Number(sheet.totalScore), outcome: sheet.outcome, details: sheet.details.map((detail) => ({ criterionId: detail.criterion.id, criterion: detail.criterion.name, score: detail.score === null ? null : Number(detail.score), value: detail.value ?? (detail.score === null ? null : Number(detail.score)), displayValue: displayCriterionValue(detail.criterion.type, detail.criterion.config, detail.value, detail.score) })) })),
      tieBreakScores: collectTieBreakScores(entrySheets, entrySheets[0]?.rubricVersion.criteria.map((criterion) => criterion.sequence) ?? [], round.aggregateMethod as 'AVERAGE' | 'MEDIAN'),
    };
  });
  const rows = applyRanks(rankable, round.tieBreakMethod);
  const version = (await prisma.resultSnapshot.aggregate({ where: { roundId: round.id }, _max: { version: true } }))._max.version ?? 0;
  const snapshotData: SnapshotData = {
    policy: {
      anonymous: round.anonymous,
      requiredJudgeCount: round.requiredJudgeCount,
      allowAdvanceWithGaps: round.allowAdvanceWithGaps,
      publishJudgeScores: round.publishScores,
      aggregateMethod: round.aggregateMethod,
      tieBreakMethod: round.tieBreakMethod,
      roundingPrecision: round.roundingPrecision,
    },
    rows,
  };
  const exceptionReason = parsed.data.action === 'lock' ? parsed.data.reason : undefined;
  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.resultSnapshot.create({ data: {
      competitionId: id, roundId: round.id, version: version + 1, lockedBy: user.id, published: false, data: snapshotData as never,
    } });
    await tx.competitionRound.update({ where: { id: round.id }, data: { status: 'COMPLETED' } });
    await tx.competitionSession.updateMany({ where: { roundId: round.id }, data: { currentEntryId: null, state: 'COMPLETED', version: { increment: 1 } } });
    await refreshCompetitionStatus(tx, id);
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'RESULTS_LOCKED', entityType: 'ResultSnapshot', entityId: created.id, details: { version: version + 1, entryCount: rows.length, missingCount: missing.length, aggregateMethod: round.aggregateMethod, tieBreakMethod: round.tieBreakMethod, roundingPrecision: round.roundingPrecision, ...(missing.length ? { reason: exceptionReason, missingEntryIds: missing.map((entry) => entry.id) } : {}) } } });
    return created;
  });
  return Response.json({ snapshot }, { status: 201 });
}

function collectTieBreakScores(
  sheets: { details: { score: unknown; criterion: { sequence: number } }[]; rubricVersion: { criteria: { sequence: number }[] } }[],
  sequences: number[],
  method: 'AVERAGE' | 'MEDIAN',
) {
  return sequences.map((sequence) => {
    const scores = sheets.flatMap((sheet) => {
      const detail = sheet.details.find((item) => item.criterion.sequence === sequence);
      return detail?.score === null || detail?.score === undefined ? [] : [Number(detail.score)];
    });
    return aggregateJudgeScores(scores, method) ?? Number.NEGATIVE_INFINITY;
  });
}

function displayCriterionValue(type: string, config: unknown, value: unknown, score: unknown) {
  if (type === 'PASS_FAIL') return typeof value === 'boolean' ? (value ? 'Đạt' : 'Không đạt') : '—';
  if (type === 'RATING' && typeof value === 'string') {
    const options = (config as { options?: { id: string; label: string }[] } | null)?.options ?? [];
    return options.find((option) => option.id === value)?.label ?? 'Mức không xác định';
  }
  if (type === 'CHECKLIST' && Array.isArray(value)) {
    const items = (config as { items?: { id: string; label: string }[] } | null)?.items ?? [];
    const labels = value.map((id) => items.find((item) => item.id === id)?.label).filter((label): label is string => Boolean(label));
    return labels.length ? labels.join(' · ') : 'Không chọn mục nào';
  }
  return score === null || score === undefined ? '—' : String(Number(score));
}

function applyRanks(rows: RankableResult[], tieBreakMethod: string): ResultRow[] {
  rows.sort((a, b) => {
    if (a.outcome !== b.outcome) return a.outcome === 'PASS' ? -1 : 1;
    if (a.totalScore === null || b.totalScore === null) {
      if (a.totalScore === b.totalScore) return a.entryCode.localeCompare(b.entryCode, 'vi');
      return a.totalScore === null ? 1 : -1;
    }
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    if (tieBreakMethod === 'CRITERIA_PRIORITY') {
      const count = Math.max(a.tieBreakScores.length, b.tieBreakScores.length);
      for (let index = 0; index < count; index += 1) {
        const difference = (b.tieBreakScores[index] ?? Number.NEGATIVE_INFINITY) - (a.tieBreakScores[index] ?? Number.NEGATIVE_INFINITY);
        if (difference) return difference;
      }
    }
    return a.entryCode.localeCompare(b.entryCode, 'vi');
  });
  let previous: RankableResult | null = null;
  let rank = 0;
  rows.forEach((row, index) => {
    if (row.outcome === 'FAIL' || row.totalScore === null) { row.rank = null; return; }
    const tiedOnTotal = previous?.totalScore === row.totalScore;
    const tiedOnCriteria = tieBreakMethod !== 'CRITERIA_PRIORITY' || (previous?.tieBreakScores.length === row.tieBreakScores.length && previous.tieBreakScores.every((score, scoreIndex) => score === row.tieBreakScores[scoreIndex]));
    if (!tiedOnTotal || !tiedOnCriteria) rank = index + 1;
    row.rank = rank;
    previous = row;
  });
  return rows.map(({ tieBreakScores: _tieBreakScores, ...row }) => row);
}

function csvResponse(rows: ResultRow[], competitionName: string) {
  const quote = (value: unknown) => {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const judgeNames = [...new Set(rows.flatMap((row) => row.judges.map((judge) => judge.judge)))].sort((a, b) => a.localeCompare(b, 'vi'));
  const criteria = [...new Map(rows.flatMap((row) => row.judges.flatMap((judge) => judge.details ?? [])).map((detail) => [detail.criterionId, detail])).values()];
  const lines = [
    ['Cuộc thi', 'Hạng', 'Mã dự thi', 'Tên thí sinh', 'Đơn vị', 'Điều kiện', 'Điểm tổng', 'Số phiếu', 'Số phiếu yêu cầu', 'Trạng thái phiếu', ...judgeNames.map((name) => `Tổng · ${name}`), ...judgeNames.flatMap((judge) => criteria.map((criterion) => `${judge} · ${criterion.criterion}`))].map(quote).join(','),
    ...rows.map((row) => [
      competitionName, row.rank, row.entryCode, row.contestant, row.organization, row.outcome === 'PASS' ? 'Đạt' : 'Không đạt', row.totalScore,
      row.submittedCount, row.requiredCount,
      row.submittedCount >= row.requiredCount ? 'Đủ phiếu' : `Thiếu ${row.requiredCount - row.submittedCount}`,
      ...judgeNames.map((name) => row.judges.find((judge) => judge.judge === name)?.score ?? ''),
      ...judgeNames.flatMap((judgeName) => criteria.map((criterion) => row.judges.find((judge) => judge.judge === judgeName)?.details?.find((detail) => detail.criterionId === criterion.criterionId)?.displayValue ?? '')),
    ].map(quote).join(',')),
  ];
  return new Response(`\uFEFF${lines.join('\r\n')}`, { headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="contestflow-results.csv"`,
    'cache-control': 'no-store',
  } });
}

import { getCurrentUser } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.systemRole !== 'JUDGE') return Response.json({ error: 'Khu vực này chỉ dành cho giám khảo.' }, { status: 403 });

  const assignments = await prisma.judgeAssignment.findMany({
    where: { userId: user.id, user: { isActive: true }, competition: { status: { not: 'ARCHIVED' } }, round: { sequence: 1 } },
    orderBy: [{ round: { competition: { startsAt: 'asc' } } }, { round: { sequence: 'asc' } }],
    include: {
      competition: { select: { id: true, name: true, status: true, startsAt: true } },
      round: { include: {
        activeRubricVersion: { include: { criteria: { orderBy: { sequence: 'asc' } } } },
        snapshots: { orderBy: { version: 'desc' }, take: 1, select: { id: true } },
        entries: { where: { status: 'ACTIVE' }, orderBy: { sequence: 'asc' }, include: { contestant: true } },
      } },
    },
  });

  // Keep assigned competitions visible even before contestants are added.
  // The scoring queue below is intentionally one task per active entry.
  const assignedCompetitions = [...new Map(assignments.map((assignment) => [assignment.competition.id, {
    ...assignment.competition,
    contestantCount: assignment.round.entries.length,
  }])).values()];

  const scopes = new Map<string, { assignment: typeof assignments[number]; entry: typeof assignments[number]['round']['entries'][number] }>();
  for (const assignment of assignments) {
    for (const entry of assignment.round.entries) {
      const key = `${assignment.roundId}:${entry.id}`;
      if (!scopes.has(key)) scopes.set(key, { assignment, entry });
    }
  }

  const entryIds = [...new Set([...scopes.values()].map(({ entry }) => entry.id))];
  const [ownSheets, earliestSheets] = entryIds.length ? await Promise.all([
    prisma.scoreSheet.findMany({
      where: { judgeId: user.id, entryId: { in: entryIds } },
      select: { id: true, entryId: true, status: true, totalScore: true, submittedAt: true, rubricVersionId: true },
    }),
    prisma.scoreSheet.findMany({
      where: { entryId: { in: entryIds } },
      orderBy: { createdAt: 'asc' },
      select: { entryId: true, rubricVersionId: true },
    }),
  ]) : [[], []];
  const ownByEntry = new Map(ownSheets.map((sheet) => [sheet.entryId, sheet]));
  const rubricByEntry = new Map<string, string>();
  for (const sheet of earliestSheets) if (!rubricByEntry.has(sheet.entryId)) rubricByEntry.set(sheet.entryId, sheet.rubricVersionId);
  const rubricIds = [...new Set([...scopes.values()].map(({ entry }) => {
    const sheet = ownByEntry.get(entry.id);
    return sheet?.rubricVersionId ?? rubricByEntry.get(entry.id);
  }).filter((id): id is string => Boolean(id)))];
  const pinnedRubrics = rubricIds.length ? await prisma.rubricVersion.findMany({
    where: { id: { in: rubricIds } },
    include: { criteria: { orderBy: { sequence: 'asc' } } },
  }) : [];
  const rubricById = new Map(pinnedRubrics.map((rubric) => [rubric.id, rubric]));

  const tasks = [...scopes.values()].map(({ assignment, entry }) => {
    const currentEntry = entry;
    const round = assignment.round;
    const scoreSheet = ownByEntry.get(currentEntry.id) ?? null;
    const rubricId = scoreSheet?.rubricVersionId ?? rubricByEntry.get(currentEntry.id);
    const rubric = (rubricId ? rubricById.get(rubricId) : null) ?? round.activeRubricVersion;
    const snapshotLocked = round.snapshots.length > 0;
    const status = scoreSheet?.status === 'DRAFT' && snapshotLocked
      ? 'LOCKED'
      : scoreSheet?.status ?? (
      round.status === 'COMPLETED'
        ? 'UNAVAILABLE'
        : 'READY'
    );
    const message = status === 'LOCKED'
      ? 'Kết quả đã khóa. Bản nháp được giữ lại ở chế độ chỉ đọc; liên hệ Admin nếu cần mở lại.'
      : status === 'UNAVAILABLE'
      ? 'Cuộc thi đã kết thúc; liên hệ Admin nếu cần mở lại lượt chấm.'
      : status === 'DRAFT'
              ? 'Có bản nháp để tiếp tục.'
              : status === 'REOPENED'
                ? 'Phiếu đã được Admin mở lại để chỉnh sửa.'
                : 'Phiếu đã nộp và đang ở chế độ chỉ đọc.';

    return {
      competition: assignment.competition,
      round: { id: round.id, name: round.name, sequence: round.sequence, status: round.status, anonymous: round.anonymous, roundingPrecision: round.roundingPrecision },
      entry: { id: currentEntry.id, code: currentEntry.entryCode, sequence: currentEntry.sequence, title: round.anonymous ? null : currentEntry.title, displayName: round.anonymous ? 'Danh tính được ẩn' : currentEntry.contestant.displayName, organization: round.anonymous ? null : currentEntry.contestant.organization },
      rubric,
      scoreSheet: scoreSheet ? { id: scoreSheet.id, status: scoreSheet.status, totalScore: scoreSheet.totalScore, submittedAt: scoreSheet.submittedAt } : null,
      taskStatus: status,
      taskMessage: message,
      canOpen: status !== 'UNAVAILABLE',
    };
  });

  tasks.sort((a, b) => {
    const aStartsAt = a.competition.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const bStartsAt = b.competition.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    return aStartsAt - bStartsAt
      || a.competition.name.localeCompare(b.competition.name, 'vi')
      || a.round.sequence - b.round.sequence
      || a.entry.sequence - b.entry.sequence
      || a.entry.code.localeCompare(b.entry.code, 'vi');
  });

  return Response.json({ tasks, competitions: assignedCompetitions });
}

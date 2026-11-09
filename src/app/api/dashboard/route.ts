import { getCurrentUser } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Progress = { submitted: number; expected: number; percent: number };

function progress(submitted: number, expected: number): Progress {
  return { submitted, expected, percent: expected ? Math.min(100, Math.round(submitted / expected * 100)) : 0 };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const isAdmin = user.systemRole === 'ADMIN';
  const competitionWhere = isAdmin
    ? { status: { not: 'ARCHIVED' as const } }
    : { status: { not: 'ARCHIVED' as const }, members: { some: { userId: user.id } } };
  const [competitions, competitionCount, contestantCount] = await Promise.all([
    prisma.competition.findMany({
      where: competitionWhere,
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: {
        _count: { select: { contestants: true } },
        rounds: { orderBy: { sequence: 'asc' }, select: { id: true, name: true, sequence: true, status: true, _count: { select: { entries: true } } } },
      },
    }),
    prisma.competition.count({ where: competitionWhere }),
    prisma.contestant.count({ where: { status: 'ACTIVE', competition: competitionWhere } }),
  ]);
  const competitionIds = competitions.map(({ id }) => id);
  const allCompetitions = await prisma.competition.findMany({ where: competitionWhere, select: { id: true, name: true } });
  const allCompetitionIds = allCompetitions.map(({ id }) => id);

  if (!isAdmin) {
    const assignments = allCompetitionIds.length ? await prisma.judgeAssignment.findMany({
      where: { userId: user.id, competitionId: { in: allCompetitionIds }, user: { isActive: true } },
      select: {
        competitionId: true,
        roundId: true,
        entryId: true,
        entry: { select: { id: true, status: true } },
        round: { select: { entries: { where: { status: 'ACTIVE' }, select: { id: true } } } },
      },
    }) : [];
    const taskEntries = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      const key = `${assignment.competitionId}:${assignment.roundId}`;
      const set = taskEntries.get(key) ?? new Set<string>();
      if (assignment.entryId) {
        if (assignment.entry?.status === 'ACTIVE') set.add(assignment.entryId);
      } else {
        for (const entry of assignment.round.entries) set.add(entry.id);
      }
      taskEntries.set(key, set);
    }
    const allEntryIds = [...new Set([...taskEntries.values()].flatMap((entries) => [...entries]))];
    const ownSheets = allEntryIds.length ? await prisma.scoreSheet.findMany({
      where: { judgeId: user.id, entryId: { in: allEntryIds }, status: 'SUBMITTED' },
      select: { competitionId: true, roundId: true, entryId: true },
    }) : [];
    const submittedByRound = new Map<string, Set<string>>();
    const submittedByCompetition = new Map<string, Set<string>>();
    for (const sheet of ownSheets) {
      const roundKey = `${sheet.competitionId}:${sheet.roundId}`;
      const roundSet = submittedByRound.get(roundKey) ?? new Set<string>();
      roundSet.add(sheet.entryId);
      submittedByRound.set(roundKey, roundSet);
      const competitionSet = submittedByCompetition.get(sheet.competitionId) ?? new Set<string>();
      competitionSet.add(`${sheet.roundId}:${sheet.entryId}`);
      submittedByCompetition.set(sheet.competitionId, competitionSet);
    }
    const visibleCompetitions = competitions.flatMap((competition) => {
      const rounds = competition.rounds.flatMap((round) => {
        const key = `${competition.id}:${round.id}`;
        const entries = taskEntries.get(key);
        if (!entries?.size) return [];
        return [{ ...round, _count: { entries: entries.size, scoreSheets: submittedByRound.get(key)?.size ?? 0 } }];
      });
      if (!rounds.length) return [];
      const expected = rounds.reduce((sum, round) => sum + round._count.entries, 0);
      const submitted = submittedByCompetition.get(competition.id)?.size ?? 0;
      return [{ ...competition, rounds, progress: progress(submitted, expected) }];
    });
    const visibleCompetitionIds = visibleCompetitions.map(({ id }) => id);
    const activities = visibleCompetitionIds.length ? await prisma.auditEvent.findMany({
      where: { competitionId: { in: visibleCompetitionIds }, actorId: user.id },
      orderBy: { createdAt: 'desc' }, take: 6,
      include: { actor: { select: { fullName: true } }, competition: { select: { name: true } } },
    }) : [];
    const expected = [...taskEntries.values()].reduce((sum, entries) => sum + entries.size, 0);
    const submitted = ownSheets.length;
    return Response.json({
      systemRole: user.systemRole,
      stats: { competitionCount: new Set([...taskEntries.keys()].map((key) => key.split(':', 1)[0])).size, contestantCount: expected, judgeCount: 0, ...progress(submitted, expected), submittedScores: submitted, expectedScores: expected },
      competitions: visibleCompetitions,
      activities,
    });
  }

  const [rounds, submittedGroups, judgeAssignments, activities] = await Promise.all([
    prisma.competitionRound.findMany({
      where: { competitionId: { in: allCompetitionIds } },
      select: {
        id: true, competitionId: true, name: true, sequence: true, status: true, requiredJudgeCount: true,
        session: { select: { state: true } },
        activeRubricVersion: { select: { criteria: { select: { id: true } } } },
        entries: { where: { status: 'ACTIVE' }, select: { id: true, entryCode: true, contestant: { select: { displayName: true } } } },
        assignments: { where: { user: { isActive: true, systemRole: 'JUDGE' } }, select: { userId: true, entryId: true } },
        scoreSheets: { where: { status: 'SUBMITTED', entry: { status: 'ACTIVE' } }, select: { entryId: true } },
        snapshots: { orderBy: { version: 'desc' }, take: 1, select: { version: true, published: true } },
      },
    }),
    allCompetitionIds.length ? prisma.scoreSheet.groupBy({ by: ['competitionId'], where: { competitionId: { in: allCompetitionIds }, status: 'SUBMITTED', entry: { status: 'ACTIVE' } }, _count: { _all: true } }) : Promise.resolve([]),
    allCompetitionIds.length ? prisma.judgeAssignment.findMany({ where: { competitionId: { in: allCompetitionIds }, user: { systemRole: 'JUDGE', isActive: true } }, distinct: ['userId'], select: { userId: true } }) : Promise.resolve([]),
    allCompetitionIds.length ? prisma.auditEvent.findMany({
      where: { competitionId: { in: allCompetitionIds } }, orderBy: { createdAt: 'desc' }, take: 6,
      include: { actor: { select: { fullName: true } }, competition: { select: { name: true } } },
    }) : Promise.resolve([]),
  ]);

  const submittedByCompetition = new Map(submittedGroups.map((item) => [item.competitionId, item._count._all]));
  const roundByCompetition = new Map<string, typeof rounds>();
  for (const round of rounds) {
    const items = roundByCompetition.get(round.competitionId) ?? [];
    items.push(round);
    roundByCompetition.set(round.competitionId, items);
  }
  const progressByCompetition = new Map<string, Progress>();
  for (const [competitionId, items] of roundByCompetition) {
    const expected = items.reduce((sum, round) => sum + round.entries.length * round.requiredJudgeCount, 0);
    progressByCompetition.set(competitionId, progress(submittedByCompetition.get(competitionId) ?? 0, expected));
  }

  const actionItems: { id: string; kind: string; title: string; detail: string; href: string }[] = [];
  for (const round of rounds) {
    const competition = allCompetitions.find((item) => item.id === round.competitionId);
    if (!competition) continue;
    const href = `/competitions/${round.competitionId}/live?roundId=${round.id}`;
    if (round.session?.state === 'LIVE') actionItems.push({ id: `${round.id}-live`, kind: 'live', title: `Đang điều phối · ${round.name}`, detail: competition.name, href });
    if (round.entries.length && !round.activeRubricVersion?.criteria.length) actionItems.push({ id: `${round.id}-rubric`, kind: 'attention', title: `Chưa có rubric · ${round.name}`, detail: competition.name, href: `/competitions/${round.competitionId}/rubric?roundId=${round.id}` });
    const missingCoverage = round.entries.filter((entry) => {
      const assigned = new Set(round.assignments.filter((item) => item.entryId === null || item.entryId === entry.id).map((item) => item.userId));
      return assigned.size < round.requiredJudgeCount;
    });
    if (missingCoverage.length) actionItems.push({ id: `${round.id}-coverage`, kind: 'attention', title: `Thiếu phân công · ${round.name}`, detail: `${competition.name} · ${missingCoverage.length} lượt thi chưa đủ giám khảo`, href: `/competitions/${round.competitionId}/judges?roundId=${round.id}` });
    const submitted = round.scoreSheets.length;
    const expected = round.entries.length * round.requiredJudgeCount;
    if (round.status === 'COMPLETED' && submitted < expected) actionItems.push({ id: `${round.id}-scores`, kind: 'attention', title: `Còn thiếu phiếu · ${round.name}`, detail: `${competition.name} · ${submitted}/${expected} phiếu`, href: `/competitions/${round.competitionId}/scores?roundId=${round.id}` });
    if (round.status === 'COMPLETED' && round.snapshots[0] && !round.snapshots[0].published) actionItems.push({ id: `${round.id}-publish`, kind: 'publish', title: `Kết quả chờ công bố · ${round.name}`, detail: `${competition.name} · snapshot v${round.snapshots[0].version}`, href: `/competitions/${round.competitionId}/results?roundId=${round.id}` });
  }
  const totalExpected = rounds.reduce((sum, round) => sum + round.entries.length * round.requiredJudgeCount, 0);
  const submittedScores = submittedGroups.reduce((sum, item) => sum + item._count._all, 0);
  return Response.json({
    systemRole: user.systemRole,
    stats: { competitionCount, contestantCount, judgeCount: judgeAssignments.length, ...progress(submittedScores, totalExpected), submittedScores, expectedScores: totalExpected },
    competitions: competitions.map((competition) => ({
      ...competition,
      progress: progressByCompetition.get(competition.id) ?? progress(0, 0),
      rounds: (roundByCompetition.get(competition.id) ?? []).map((round) => ({ ...round, _count: { entries: round.entries.length, scoreSheets: round.scoreSheets.length, assignments: round.assignments.length } })),
    })),
    activities,
    actionItems: actionItems.slice(0, 12),
  });
}

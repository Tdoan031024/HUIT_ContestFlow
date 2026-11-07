import { getCurrentUser } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const isAdmin = user.systemRole === 'ADMIN';
  const accessScope = isAdmin ? {} : { members: { some: { userId: user.id } } };
  const competitionWhere = { ...accessScope, status: { not: 'ARCHIVED' as const } };
  const [competitions, allCompetitionIds, competitionCount] = await Promise.all([
    prisma.competition.findMany({
      where: competitionWhere,
      orderBy: { updatedAt: 'desc' }, take: 8,
      include: { rounds: { include: { _count: { select: { entries: true, scoreSheets: true, assignments: true } } } }, _count: { select: { contestants: true } } },
    }),
    prisma.competition.findMany({ where: isAdmin ? accessScope : competitionWhere, select: { id: true } }),
    prisma.competition.count({ where: competitionWhere }),
  ]);
  const competitionIds = allCompetitionIds.map(({ id }) => id);

  if (!isAdmin) {
    const assignments = await prisma.judgeAssignment.findMany({
      where: { userId: user.id, competitionId: { in: competitionIds } },
      select: {
        competitionId: true, roundId: true, entryId: true,
        entry: { select: { id: true, status: true } },
        round: { select: { entries: { where: { status: 'ACTIVE' }, select: { id: true } } } },
      },
    });
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
    const ownSubmitted = new Map<string, Set<string>>();
    for (const sheet of ownSheets) {
      const key = `${sheet.competitionId}:${sheet.roundId}`;
      const set = ownSubmitted.get(key) ?? new Set<string>();
      set.add(sheet.entryId);
      ownSubmitted.set(key, set);
    }
    const visibleCompetitions = competitions.flatMap((competition) => {
      const rounds = competition.rounds.flatMap((round) => {
        const key = `${competition.id}:${round.id}`;
        const entries = taskEntries.get(key);
        if (!entries?.size) return [];
        return [{ ...round, _count: { entries: entries.size, scoreSheets: ownSubmitted.get(key)?.size ?? 0, assignments: 1 } }];
      });
      if (!rounds.length) return [];
      return [{ ...competition, rounds, _count: { contestants: rounds.reduce((sum, round) => sum + round._count.entries, 0) } }];
    });
    const totalExpected = [...taskEntries.values()].reduce((sum, entries) => sum + entries.size, 0);
    const submittedScores = ownSheets.length;
    const visibleCompetitionIds = visibleCompetitions.map(({ id }) => id);
    const activities = visibleCompetitionIds.length ? await prisma.auditEvent.findMany({
      where: { competitionId: { in: visibleCompetitionIds }, actorId: user.id },
      orderBy: { createdAt: 'desc' }, take: 6,
      include: { actor: { select: { fullName: true } }, competition: { select: { name: true } } },
    }) : [];
    return Response.json({
      systemRole: user.systemRole,
      stats: { competitionCount: new Set([...taskEntries.keys()].map((key) => key.split(':', 1)[0])).size, contestantCount: totalExpected, judgeCount: 0, scoreCompletion: totalExpected ? Math.min(100, Math.round(submittedScores / totalExpected * 100)) : 0, submittedScores, expectedScores: totalExpected },
      competitions: visibleCompetitions,
      activities,
    });
  }

  const [contestantCount, judgeAssignments, rounds, submittedScores, activities] = await Promise.all([
    prisma.contestant.count({ where: { competition: accessScope } }),
    prisma.judgeAssignment.findMany({ where: { competitionId: { in: competitionIds } }, distinct: ['userId'], select: { userId: true } }),
    prisma.competitionRound.findMany({ where: { competitionId: { in: competitionIds } }, select: { requiredJudgeCount: true, _count: { select: { entries: true } } } }),
    prisma.scoreSheet.count({ where: { competitionId: { in: competitionIds }, status: 'SUBMITTED' } }),
    prisma.auditEvent.findMany({ where: { competitionId: { in: competitionIds } }, orderBy: { createdAt: 'desc' }, take: 6, include: { actor: { select: { fullName: true } }, competition: { select: { name: true } } } }),
  ]);
  const totalExpected = rounds.reduce((sum, round) => sum + round.requiredJudgeCount * round._count.entries, 0);
  return Response.json({
    systemRole: user.systemRole,
    stats: { competitionCount, contestantCount, judgeCount: judgeAssignments.length, scoreCompletion: totalExpected ? Math.min(100, Math.round(submittedScores / totalExpected * 100)) : 0, submittedScores, expectedScores: totalExpected },
    competitions,
    activities,
  });
}

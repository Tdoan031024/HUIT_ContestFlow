import { getCurrentUser } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const where = user.systemRole === 'ADMIN' ? {} : { members: { some: { userId: user.id } } };
  const competitions = await prisma.competition.findMany({
    where: { ...where, status: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' }, take: 8,
    include: { rounds: { include: { _count: { select: { entries: true, scoreSheets: true, assignments: true } } } }, _count: { select: { contestants: true } } },
  });
  const allCompetitionIds = await prisma.competition.findMany({ where, select: { id: true } });
  const ids = allCompetitionIds.map((competition) => competition.id);
  const [competitionCount, contestantCount, judgeCount, expectedScores, submittedScores, activities] = await Promise.all([
    prisma.competition.count({ where: { ...where, status: { not: 'ARCHIVED' } } }),
    prisma.contestant.count({ where: { competition: where } }),
    prisma.judgeAssignment.findMany({ where: { competitionId: { in: ids } }, distinct: ['userId'], select: { userId: true } }),
    prisma.competitionRound.findMany({ where: { competitionId: { in: ids } }, select: { requiredJudgeCount: true, _count: { select: { entries: true } } } }),
    prisma.scoreSheet.count({ where: { competitionId: { in: ids }, status: 'SUBMITTED' } }),
    prisma.auditEvent.findMany({ where: { competitionId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 6, include: { actor: { select: { fullName: true } }, competition: { select: { name: true } } } }),
  ]);
  const totalExpected = expectedScores.reduce((sum, round) => sum + round.requiredJudgeCount * round._count.entries, 0);
  return Response.json({
    systemRole: user.systemRole,
    stats: { competitionCount, contestantCount, judgeCount: judgeCount.length, scoreCompletion: totalExpected ? Math.min(100, Math.round(submittedScores / totalExpected * 100)) : 0, submittedScores, expectedScores: totalExpected },
    competitions,
    activities,
  });
}

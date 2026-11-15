import { prisma } from '@/lib/prisma';

/**
 * The database still stores judging records under a round for compatibility,
 * but the product now exposes one judging workspace per competition.
 */
export async function ensureCompetitionWorkspace(competitionId: string) {
  const current = await prisma.competitionRound.findFirst({
    where: { competitionId },
    orderBy: { sequence: 'asc' },
    include: { session: { select: { state: true } }, _count: { select: { scoreSheets: true, snapshots: true } } },
  });
  if (current) return current;

  const competition = await prisma.competition.findUnique({ where: { id: competitionId }, select: { id: true } });
  if (!competition) return null;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.competitionRound.findFirst({
        where: { competitionId },
        orderBy: { sequence: 'asc' },
        include: { session: { select: { state: true } }, _count: { select: { scoreSheets: true, snapshots: true } } },
      });
      if (existing) return existing;

      const workspace = await tx.competitionRound.create({
        data: { competitionId, name: 'Chấm thi', sequence: 1, anonymous: true },
      });
      await tx.competitionSession.create({ data: { roundId: workspace.id } });
      return tx.competitionRound.findUniqueOrThrow({
        where: { id: workspace.id },
        include: { session: { select: { state: true } }, _count: { select: { scoreSheets: true, snapshots: true } } },
      });
    });
  } catch (error) {
    const createdByAnotherRequest = await prisma.competitionRound.findFirst({
      where: { competitionId },
      orderBy: { sequence: 'asc' },
      include: { session: { select: { state: true } }, _count: { select: { scoreSheets: true, snapshots: true } } },
    });
    if (createdByAnotherRequest) return createdByAnotherRequest;
    throw error;
  }
}


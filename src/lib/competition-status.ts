import type { Prisma } from '@/generated/prisma/client';

type StatusDatabase = Pick<Prisma.TransactionClient, 'competition' | 'competitionRound'>;

export async function refreshCompetitionStatus(db: StatusDatabase, competitionId: string) {
  const competition = await db.competition.findUnique({ where: { id: competitionId }, select: { status: true } });
  if (!competition || competition.status === 'ARCHIVED') return competition?.status;

  const rounds = await db.competitionRound.findMany({
    where: { competitionId },
    select: { status: true, session: { select: { state: true } } },
  });

  const nextStatus = rounds.length > 0 && rounds.every((round) => round.status === 'COMPLETED')
    ? 'COMPLETED'
    : rounds.some((round) => round.session?.state === 'LIVE')
      ? 'LIVE'
      : rounds.some((round) => round.status === 'READY' || round.status === 'COMPLETED' || round.session?.state === 'PAUSED')
        ? 'READY'
        : competition.status === 'REGISTRATION'
          ? 'REGISTRATION'
          : 'DRAFT';

  if (nextStatus !== competition.status) {
    await db.competition.update({ where: { id: competitionId }, data: { status: nextStatus } });
  }
  return nextStatus;
}

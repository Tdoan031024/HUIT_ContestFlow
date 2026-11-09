import type { Prisma } from '@/generated/prisma/client';

type RoundDatabase = Pick<Prisma.TransactionClient, 'competitionRound'>;

export type RoundReadiness = {
  roundId: string;
  roundName: string;
  entryCount: number;
  requiredJudgeCount: number;
  rubricReady: boolean;
  missingAssignments: {
    entryId: string;
    entryCode: string;
    displayName: string;
    assignedJudgeCount: number;
    requiredJudgeCount: number;
  }[];
  canStart: boolean;
};

export async function inspectRoundReadiness(
  db: RoundDatabase,
  competitionId: string,
  roundId: string,
): Promise<RoundReadiness | null> {
  const round = await db.competitionRound.findFirst({
    where: { id: roundId, competitionId },
    include: {
      activeRubricVersion: { select: { criteria: { select: { id: true } } } },
      entries: {
        where: { status: 'ACTIVE' },
        orderBy: { sequence: 'asc' },
        select: { id: true, entryCode: true, contestant: { select: { displayName: true } } },
      },
      assignments: {
        where: { user: { isActive: true, systemRole: 'JUDGE' } },
        select: { entryId: true, userId: true },
      },
    },
  });

  if (!round) return null;

  const missingAssignments = round.entries.flatMap((entry) => {
    const assignedJudgeCount = new Set(
      round.assignments
        .filter((assignment) => assignment.entryId === null || assignment.entryId === entry.id)
        .map((assignment) => assignment.userId),
    ).size;

    return assignedJudgeCount >= round.requiredJudgeCount
      ? []
      : [{
          entryId: entry.id,
          entryCode: entry.entryCode,
          displayName: entry.contestant.displayName,
          assignedJudgeCount,
          requiredJudgeCount: round.requiredJudgeCount,
        }];
  });
  const rubricReady = Boolean(round.activeRubricVersion?.criteria.length);

  return {
    roundId: round.id,
    roundName: round.name,
    entryCount: round.entries.length,
    requiredJudgeCount: round.requiredJudgeCount,
    rubricReady,
    missingAssignments,
    canStart: round.entries.length > 0 && rubricReady && missingAssignments.length === 0,
  };
}

import type { Prisma } from '@/generated/prisma/client';

type RoundDatabase = Pick<Prisma.TransactionClient, 'competitionRound'>;

export async function roundEditLockReason(db: RoundDatabase, competitionId: string, roundId: string) {
  const round = await db.competitionRound.findFirst({
    where: { id: roundId, competitionId },
    select: { status: true, session: { select: { state: true } }, _count: { select: { scoreSheets: true, snapshots: true } } },
  });
  if (!round) return 'Không tìm thấy vòng thi.';
  if (round.status === 'LIVE' || round.status === 'COMPLETED' || (round.session && round.session.state !== 'IDLE') || round._count.scoreSheets > 0 || round._count.snapshots > 0) {
    return 'Dữ liệu lượt thi đã khóa sau khi vòng bắt đầu điều phối, chấm điểm hoặc lưu kết quả.';
  }
  return null;
}

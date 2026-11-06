import { getCurrentUser } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const rounds = await prisma.competitionRound.findMany({
    where: user.systemRole === 'ADMIN' ? {} : { competition: { members: { some: { userId: user.id } } } },
    orderBy: [{ competition: { updatedAt: 'desc' } }, { sequence: 'asc' }],
    include: {
      competition: { select: { id: true, name: true, status: true } },
      _count: { select: { entries: true, scoreSheets: true } },
      snapshots: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, published: true, lockedAt: true } },
    },
  });
  const visible = await Promise.all(rounds.map(async (round) => {
    if (user.systemRole === 'ADMIN') return round;
    const snapshots = await prisma.resultSnapshot.findMany({ where: { roundId: round.id, published: true }, orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, published: true, lockedAt: true } });
    const snapshot = snapshots[0];
    return snapshot ? { ...round, snapshots: [snapshot] } : null;
  })).then((items) => items.filter(Boolean));
  return Response.json({ rounds: visible });
}

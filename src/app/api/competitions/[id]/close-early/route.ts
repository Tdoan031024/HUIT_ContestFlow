import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ reason: z.string().trim().min(10).max(2000) }).strict();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin được đóng sớm cuộc thi.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Nhập lý do đóng sớm từ 10 đến 2.000 ký tự.' }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    if (!competition) return { error: 'Không tìm thấy cuộc thi.', status: 404 as const };
    if (competition.status === 'ARCHIVED' || competition.status === 'COMPLETED') return { error: 'Cuộc thi đã được lưu trữ hoặc hoàn tất.', status: 409 as const };
    const rounds = await tx.competitionRound.findMany({ where: { competitionId: id }, select: { id: true, status: true, session: { select: { id: true, state: true } } } });
    await tx.competitionRound.updateMany({ where: { competitionId: id }, data: { status: 'COMPLETED' } });
    await tx.competitionSession.updateMany({ where: { roundId: { in: rounds.map((round) => round.id) } }, data: { state: 'COMPLETED', currentEntryId: null, version: { increment: 1 } } });
    const updated = await tx.competition.update({ where: { id }, data: { status: 'COMPLETED' } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'COMPETITION_CLOSED_EARLY', entityType: 'Competition', entityId: id, details: { reason: parsed.data.reason, stoppedLiveRounds: rounds.filter((round) => round.session?.state === 'LIVE').map((round) => round.id), completedRounds: rounds.length } } });
    return { competition: updated };
  });
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ competition: result.competition });
}

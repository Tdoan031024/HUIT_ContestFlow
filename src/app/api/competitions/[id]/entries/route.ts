import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({ contestantId: z.string().uuid(), roundId: z.string().uuid(), title: z.string().trim().max(180).optional().default('') });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền đăng ký lượt thi.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Thông tin lượt thi không hợp lệ.' }, { status: 400 });
  const [contestant, round] = await Promise.all([
    prisma.contestant.findFirst({ where: { id: parsed.data.contestantId, competitionId: id }, select: { id: true } }),
    prisma.competitionRound.findFirst({ where: { id: parsed.data.roundId, competitionId: id }, select: { id: true } }),
  ]);
  if (!contestant || !round) return Response.json({ error: 'Thí sinh hoặc vòng thi không thuộc cuộc thi này.' }, { status: 400 });
  const sequence = (await prisma.competitionEntry.aggregate({ where: { roundId: round.id }, _max: { sequence: true } }))._max.sequence ?? 0;
  try {
    const entry = await prisma.competitionEntry.create({ data: {
      competitionId: id, roundId: round.id, contestantId: contestant.id,
      sequence: sequence + 1, entryCode: `CF-${String(sequence + 1).padStart(3, '0')}`, title: parsed.data.title || null,
    } });
    await prisma.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'ENTRY_CREATED', entityType: 'CompetitionEntry', entityId: entry.id } });
    return Response.json({ entry }, { status: 201 });
  } catch {
    return Response.json({ error: 'Thí sinh đã có lượt thi trong vòng này hoặc mã dự thi bị trùng.' }, { status: 409 });
  }
}

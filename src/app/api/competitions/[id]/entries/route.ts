import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({ contestantId: z.string().uuid(), roundId: z.string().uuid(), title: z.string().trim().max(180).optional().default('') });
const reorderSchema = z.object({ roundId: z.string().uuid(), entryIds: z.array(z.string().uuid()).min(1).max(2000) });
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

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền đổi thứ tự thi.' }, { status: 403 });
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data?.entryIds ?? []).size !== parsed.data?.entryIds.length) return Response.json({ error: 'Danh sách lượt thi không hợp lệ hoặc bị lặp.' }, { status: 400 });
  const round = await prisma.competitionRound.findFirst({ where: { id: parsed.data.roundId, competitionId: id }, select: { id: true, status: true, session: { select: { state: true } }, _count: { select: { scoreSheets: true } } } });
  if (!round) return Response.json({ error: 'Vòng thi không thuộc cuộc thi này.' }, { status: 404 });
  if (round.status === 'LIVE' || round.status === 'COMPLETED' || Boolean(round.session && round.session.state !== 'IDLE') || round._count.scoreSheets > 0) {
    return Response.json({ error: 'Chỉ được đổi thứ tự trước khi điều phối hoặc chấm điểm bắt đầu.' }, { status: 409 });
  }
  const entries = await prisma.competitionEntry.findMany({ where: { competitionId: id, roundId: round.id }, orderBy: { sequence: 'asc' }, select: { id: true, entryCode: true, sequence: true } });
  const entryIds = parsed.data.entryIds;
  if (entries.length !== entryIds.length || entries.some((entry) => !entryIds.includes(entry.id))) return Response.json({ error: 'Danh sách phải chứa đầy đủ lượt thi của vòng.' }, { status: 400 });
  if (entries.every((entry, index) => entry.id === entryIds[index])) return Response.json({ entries });
  const before = entries.map(({ id: entryId, entryCode, sequence }) => ({ entryId, entryCode, sequence }));
  await prisma.$transaction(async (tx) => {
    const maxSequence = Math.max(0, ...entries.map((entry) => entry.sequence));
    const offset = maxSequence + entries.length + 1;
    await tx.competitionEntry.updateMany({ where: { roundId: round.id }, data: { sequence: { increment: offset } } });
    for (const [index, entryId] of entryIds.entries()) await tx.competitionEntry.update({ where: { id: entryId }, data: { sequence: index + 1 } });
    const ordered = await tx.competitionEntry.findMany({ where: { roundId: round.id }, orderBy: { sequence: 'asc' }, select: { id: true, entryCode: true, sequence: true } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'ENTRY_ORDER_UPDATED', entityType: 'CompetitionRound', entityId: round.id, details: { before, after: ordered.map(({ id: entryId, entryCode, sequence }) => ({ entryId, entryCode, sequence })) } } });
  });
  return Response.json({ entries: await prisma.competitionEntry.findMany({ where: { roundId: round.id }, orderBy: { sequence: 'asc' } }) });
}

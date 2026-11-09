import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { roundEditLockReason } from '@/lib/round-editability';

export const runtime = 'nodejs';
const schema = z.object({
  roundId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(180),
  organization: z.string().trim().max(180).optional().default(''),
  email: z.union([z.string().trim().email().max(255), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  title: z.string().trim().max(180).optional().default(''),
});
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin được xem thông tin thí sinh.' }, { status: 403 });
  const roundId = new URL(request.url).searchParams.get('roundId') || undefined;
  const contestants = await prisma.contestant.findMany({
    where: { competitionId: id },
    orderBy: { displayName: 'asc' },
    include: { entries: { where: roundId ? { roundId } : undefined, orderBy: { sequence: 'asc' }, include: { round: { select: { id: true, name: true, sequence: true } }, _count: { select: { scoreSheets: true } } } } },
  });
  return Response.json({ contestants });
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền quản lý thí sinh.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Kiểm tra lại tên thí sinh, email và vòng thi.' }, { status: 400 });
  const round = await prisma.competitionRound.findFirst({ where: { id: parsed.data.roundId, competitionId: id }, select: { id: true } });
  if (!round) return Response.json({ error: 'Vòng thi không thuộc cuộc thi này.' }, { status: 400 });
  const lockReason = await roundEditLockReason(prisma, id, round.id);
  if (lockReason) return Response.json({ error: lockReason }, { status: 409 });
  const contestant = await prisma.$transaction(async (tx) => {
    const created = await tx.contestant.create({ data: {
      competitionId: id,
      displayName: parsed.data.displayName,
      organization: parsed.data.organization || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    } });
    const sequence = (await tx.competitionEntry.aggregate({ where: { roundId: round.id }, _max: { sequence: true } }))._max.sequence ?? 0;
    const entryCode = `CF-${String(sequence + 1).padStart(3, '0')}`;
    await tx.competitionEntry.create({ data: {
      competitionId: id,
      roundId: round.id,
      contestantId: created.id,
      entryCode,
      sequence: sequence + 1,
      title: parsed.data.title || null,
    } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'CONTESTANT_CREATED', entityType: 'Contestant', entityId: created.id } });
    return tx.contestant.findUniqueOrThrow({ where: { id: created.id }, include: { entries: true } });
  });
  return Response.json({ contestant }, { status: 201 });
}

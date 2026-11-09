import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { roundEditLockReason } from '@/lib/round-editability';

export const runtime = 'nodejs';
const schema = z.object({
  displayName: z.string().trim().min(2).max(180).optional(),
  organization: z.string().trim().max(180).nullable().optional(),
  email: z.union([z.string().trim().email().max(255), z.literal(''), z.null()]).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  status: z.enum(['ACTIVE', 'WITHDRAWN', 'DISQUALIFIED']).optional(),
});
type Context = { params: Promise<{ id: string; contestantId: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, contestantId } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền sửa thông tin thí sinh.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Thông tin thí sinh không hợp lệ.' }, { status: 400 });
  const contestant = await prisma.contestant.findFirst({ where: { id: contestantId, competitionId: id }, select: { id: true, entries: { select: { roundId: true } } } });
  if (!contestant) return Response.json({ error: 'Không tìm thấy thí sinh.' }, { status: 404 });
  for (const entry of contestant.entries) {
    const lockReason = await roundEditLockReason(prisma, id, entry.roundId);
    if (lockReason) return Response.json({ error: `Không thể sửa hồ sơ vì ${lockReason.toLocaleLowerCase('vi-VN')}` }, { status: 409 });
  }
  const status = parsed.data.status;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.contestant.update({ where: { id: contestantId }, data: {
      displayName: parsed.data.displayName,
      organization: parsed.data.organization,
      email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
      phone: parsed.data.phone,
      status,
    } });
    if (status && status !== 'ACTIVE') await tx.competitionEntry.updateMany({ where: { contestantId, competitionId: id, status: 'ACTIVE' }, data: { status } });
    if (status === 'ACTIVE') await tx.competitionEntry.updateMany({ where: { contestantId, competitionId: id, status: { in: ['WITHDRAWN', 'DISQUALIFIED'] } }, data: { status: 'ACTIVE' } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'CONTESTANT_UPDATED', entityType: 'Contestant', entityId: contestantId, details: parsed.data as never } });
    return result;
  });
  return Response.json({ contestant: updated });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, contestantId } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền rút thí sinh.' }, { status: 403 });
  const contestant = await prisma.contestant.findFirst({ where: { id: contestantId, competitionId: id }, include: { entries: { select: { roundId: true } } } });
  if (!contestant) return Response.json({ error: 'Không tìm thấy thí sinh.' }, { status: 404 });
  for (const entry of contestant.entries) {
    const lockReason = await roundEditLockReason(prisma, id, entry.roundId);
    if (lockReason) return Response.json({ error: `Không thể rút hồ sơ vì ${lockReason.toLocaleLowerCase('vi-VN')}` }, { status: 409 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.contestant.update({ where: { id: contestantId }, data: { status: 'WITHDRAWN' } });
    await tx.competitionEntry.updateMany({ where: { contestantId, competitionId: id, status: 'ACTIVE' }, data: { status: 'WITHDRAWN' } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'CONTESTANT_WITHDRAWN', entityType: 'Contestant', entityId: contestantId } });
  });
  return Response.json({ ok: true });
}

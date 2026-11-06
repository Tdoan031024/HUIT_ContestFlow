import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, errorMessage, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const updateSchema = z.object({
  name: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  organizingUnit: z.string().trim().max(180).nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  modality: z.enum(['ONSITE', 'ONLINE', 'HYBRID']).optional(),
  status: z.enum(['DRAFT', 'REGISTRATION', 'READY', 'LIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canViewCompetition(user, id))) return Response.json({ error: 'Không tìm thấy cuộc thi hoặc bạn không có quyền xem.' }, { status: 404 });
  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      rounds: { orderBy: { sequence: 'asc' }, include: { activeRubricVersion: { include: { criteria: { orderBy: { sequence: 'asc' } } } }, _count: { select: { entries: true, assignments: true, scoreSheets: true } } } },
      _count: { select: { contestants: true, members: true } },
    },
  });
  if (!competition) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  return Response.json({ competition, permissions: { manage: await canManageCompetition(user, id) } });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền chỉnh sửa cuộc thi.' }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Thông tin cập nhật không hợp lệ.' }, { status: 400 });
  const current = await prisma.competition.findUnique({ where: { id }, select: { id: true, startsAt: true, endsAt: true } });
  if (!current) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const nextStart = parsed.data.startsAt === undefined ? current.startsAt : parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  const nextEnd = parsed.data.endsAt === undefined ? current.endsAt : parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (nextStart && nextEnd && nextEnd < nextStart) return Response.json({ error: 'Ngày kết thúc phải sau ngày bắt đầu.' }, { status: 400 });
  try {
    const competition = await prisma.competition.update({ where: { id }, data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt === undefined ? undefined : parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      endsAt: parsed.data.endsAt === undefined ? undefined : parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    } });
    await prisma.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'COMPETITION_UPDATED', entityType: 'Competition', entityId: id, details: parsed.data as never } });
    return Response.json({ competition });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền lưu trữ cuộc thi.' }, { status: 403 });
  const competition = await prisma.competition.update({ where: { id }, data: { status: 'ARCHIVED' } }).catch(() => null);
  if (!competition) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  await prisma.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'COMPETITION_ARCHIVED', entityType: 'Competition', entityId: id } });
  return Response.json({ competition });
}

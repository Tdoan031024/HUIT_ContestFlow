import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin được xem nhật ký.' }, { status: 403 });
  const query = new URL(request.url).searchParams;
  const page = Math.max(1, Number(query.get('page') || 1));
  const take = 50;
  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({ where: { competitionId: id }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take, include: { actor: { select: { fullName: true, email: true } } } }),
    prisma.auditEvent.count({ where: { competitionId: id } }),
  ]);
  return Response.json({ events, total, page, pageSize: take });
}

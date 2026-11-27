import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId } = await params;
  const exists = await prisma.attendanceEvent.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!exists) return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  const events = await prisma.auditEvent.findMany({
    where: { OR: [
      { entityType: 'AttendanceEvent', entityId: eventId },
      { details: { path: '$.eventId', equals: eventId } },
    ] },
    orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, action: true, entityType: true, entityId: true, details: true, createdAt: true, actor: { select: { fullName: true } } },
  });
  return Response.json({ events }, { headers: { 'Cache-Control': 'private, no-store' } });
}

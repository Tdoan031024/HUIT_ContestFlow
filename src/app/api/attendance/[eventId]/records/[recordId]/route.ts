import { getCurrentUser } from '@/lib/auth';
import { removeAttendanceTicketPhotos } from '@/lib/attendance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ eventId: string; recordId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId, recordId } = await params;
  const record = await prisma.attendanceRecord.findFirst({ where: { id: recordId, eventId }, select: { id: true, ticketId: true } });
  if (!record) return Response.json({ error: 'Không tìm thấy lượt điểm danh.' }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.attendanceRecord.delete({ where: { id: record.id } });
    await tx.auditEvent.create({ data: { actorId: user.id, action: 'ATTENDANCE_RECORD_DELETED', entityType: 'AttendanceRecord', entityId: record.id, details: { eventId } } });
  });
  await removeAttendanceTicketPhotos(eventId, record.ticketId);
  return Response.json({ ok: true });
}

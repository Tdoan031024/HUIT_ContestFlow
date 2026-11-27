import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';
import { attendanceEventInput, removeAttendanceEventPhotos, removeAttendanceTicketPhotos } from '@/lib/attendance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId } = await params;
  const event = await prisma.attendanceEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true, publicCode: true, name: true, description: true, venue: true,
      eventStartsAt: true, eventEndsAt: true, checkInStartsAt: true, checkInEndsAt: true,
      latitude: true, longitude: true, geofenceRadiusMeters: true, locationRequired: true,
      photoRequired: true, expectedAttendees: true, maxActiveCheckins: true, maxQueueSize: true,
      customFields: true, status: true, createdAt: true, updatedAt: true,
      _count: { select: { records: true, failures: true } },
    },
  });
  if (!event) return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  const queueCounts = await prisma.attendanceQueueTicket.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } });
  const queue = Object.fromEntries(queueCounts.map((row) => [row.status.toLowerCase(), row._count._all]));
  return Response.json({ event: { ...event, latitude: event.latitude == null ? null : Number(event.latitude), longitude: event.longitude == null ? null : Number(event.longitude), checkedIn: event._count.records, failedAttempts: event._count.failures, queue } });
}

export async function PUT(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId } = await params;
  const existing = await prisma.attendanceEvent.findUnique({ where: { id: eventId } });
  if (!existing) return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  if (existing.status !== 'DRAFT' && existing.status !== 'CLOSED') return Response.json({ error: 'Chỉ có thể sửa sự kiện ở trạng thái nháp hoặc đã đóng.' }, { status: 409 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 }); }
  const parsed = attendanceEventInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Thông tin sự kiện không hợp lệ.' }, { status: 400 });
  const data = parsed.data;
  const recordsExist = await prisma.attendanceRecord.count({ where: { eventId } });
  if (recordsExist > 0) {
    const savedFields = Array.isArray(existing.customFields) ? existing.customFields as Array<{ key?: string; label?: string }> : [];
    const identityChanged = savedFields.length !== data.customFields.length || savedFields.some((field, index) => field.key !== data.customFields[index]?.key || field.label !== data.customFields[index]?.label);
    if (identityChanged) return Response.json({ error: 'Không thể thêm, xóa, đổi tên hoặc sắp xếp lại trường sau khi đã có lượt điểm danh.' }, { status: 409 });
  }
  const event = await prisma.$transaction(async (tx) => {
    const updated = await tx.attendanceEvent.update({ where: { id: eventId }, data: {
      name: data.name, description: data.description || null, venue: data.venue,
      eventStartsAt: new Date(data.eventStartsAt), eventEndsAt: new Date(data.eventEndsAt),
      checkInStartsAt: new Date(data.checkInStartsAt), checkInEndsAt: new Date(data.checkInEndsAt),
      latitude: data.latitude ?? null, longitude: data.longitude ?? null,
      geofenceRadiusMeters: data.geofenceRadiusMeters, locationRequired: data.locationRequired,
      photoRequired: data.photoRequired, expectedAttendees: data.expectedAttendees,
      maxActiveCheckins: data.maxActiveCheckins, maxQueueSize: data.maxQueueSize,
      customFields: data.customFields as never,
    } });
    const slots = await tx.attendanceCapacitySlot.findMany({ where: { eventId }, orderBy: { slotNo: 'asc' }, select: { id: true, slotNo: true, ticketId: true } });
    const occupied = slots.filter((slot) => slot.ticketId !== null);
    if (occupied.length > data.maxActiveCheckins) throw new Error('Không thể giảm số lượt xử lý song song xuống dưới số lượt đang hoạt động.');
    const free = slots.filter((slot) => slot.ticketId === null);
    if (free.length > data.maxActiveCheckins - occupied.length) await tx.attendanceCapacitySlot.deleteMany({ where: { id: { in: free.slice(data.maxActiveCheckins - occupied.length).map((slot) => slot.id) } } });
    else if (data.maxActiveCheckins > slots.length) await tx.attendanceCapacitySlot.createMany({ data: Array.from({ length: data.maxActiveCheckins - slots.length }, (_, index) => ({ eventId, slotNo: slots.length + index + 1 })) });
    await tx.auditEvent.create({ data: { actorId: user.id, action: 'ATTENDANCE_EVENT_UPDATED', entityType: 'AttendanceEvent', entityId: eventId } });
    return updated;
  });
  return Response.json({ event });
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 }); }
  const actionSchema = z.object({ action: z.enum(['OPEN', 'CLOSE', 'COMPLETE', 'ARCHIVE']) });
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
  const event = await prisma.attendanceEvent.findUnique({ where: { id: eventId } });
  if (!event) return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  const action = parsed.data.action;
  const now = new Date();
  if (action === 'OPEN') {
    if (event.status !== 'DRAFT' && event.status !== 'CLOSED') return Response.json({ error: 'Sự kiện không thể mở từ trạng thái hiện tại.' }, { status: 409 });
    if (event.checkInEndsAt <= now) return Response.json({ error: 'Khung giờ điểm danh đã kết thúc.' }, { status: 400 });
    if (event.locationRequired && (event.latitude == null || event.longitude == null)) return Response.json({ error: 'Cần tọa độ địa điểm trước khi mở điểm danh.' }, { status: 400 });
  }
  if (action === 'COMPLETE' && event.status === 'OPEN') return Response.json({ error: 'Hãy đóng điểm danh trước khi hoàn tất sự kiện.' }, { status: 409 });
  const status = action === 'OPEN' ? 'OPEN' : action === 'CLOSE' ? 'CLOSED' : action === 'COMPLETE' ? 'COMPLETED' : 'ARCHIVED';
  const activeTickets = action === 'CLOSE' || action === 'COMPLETE' || action === 'ARCHIVE'
    ? await prisma.attendanceQueueTicket.findMany({ where: { eventId, status: 'ACTIVE' }, select: { id: true } })
    : [];
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.attendanceEvent.update({ where: { id: eventId }, data: { status } });
    if (action === 'CLOSE' || action === 'COMPLETE' || action === 'ARCHIVE') {
      await tx.attendanceQueueTicket.updateMany({ where: { eventId, status: { in: ['WAITING', 'ACTIVE'] } }, data: { status: 'EXPIRED', activeUntil: null } });
      await tx.attendanceCapacitySlot.updateMany({ where: { eventId }, data: { ticketId: null } });
    }
    await tx.auditEvent.create({ data: { actorId: user.id, action: `ATTENDANCE_EVENT_${action}`, entityType: 'AttendanceEvent', entityId: eventId } });
    return result;
  });
  if (activeTickets.length) {
    const expiredTickets = await prisma.attendanceQueueTicket.findMany({ where: { id: { in: activeTickets.map(({ id }) => id) }, status: 'EXPIRED', checkedInAt: null }, select: { id: true } });
    await Promise.all(expiredTickets.map(({ id }) => removeAttendanceTicketPhotos(eventId, id)));
  }
  return Response.json({ event: updated });
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId } = await params;
  const event = await prisma.attendanceEvent.findUnique({ where: { id: eventId }, select: { id: true, name: true, status: true, _count: { select: { records: true } } } });
  if (!event) return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  if (event.status === 'OPEN') return Response.json({ error: 'Hãy đóng điểm danh trước khi xóa sự kiện.' }, { status: 409 });
  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({ data: { actorId: user.id, action: 'ATTENDANCE_EVENT_DELETED', entityType: 'AttendanceEvent', entityId: eventId, details: { name: event.name, eventId, deletedRecords: event._count.records } } });
    await tx.attendanceEvent.delete({ where: { id: eventId } });
  });
  await removeAttendanceEventPhotos(eventId);
  return Response.json({ ok: true, deletedRecords: event._count.records });
}

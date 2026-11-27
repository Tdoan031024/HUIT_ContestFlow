import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  checkinRateLimitKey, consumeAttendanceRateLimit, getAttendanceToken, haversineMeters,
  getClientAddress, hasAttendancePhoto, removeAttendanceTicketPhotos, sha256,
} from '@/lib/attendance';

export const dynamic = 'force-dynamic';

const submissionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  fullName: z.string().trim().min(2).max(180),
  studentId: z.string().trim().max(80).optional().default(''),
  email: z.string().trim().email().max(255).optional().or(z.literal('')).default(''),
  organization: z.string().trim().max(180).optional().default(''),
  customAnswers: z.record(z.string(), z.string().max(500)).default({}),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(5000).nullable().optional(),
  locationCapturedAt: z.string().datetime({ offset: true }).nullable().optional(),
  photoKey: z.string().max(255).nullable().optional(),
});

async function failedResponse(eventId: string, request: Request, status: number, reasonCode: string, message: string, ticketId?: string) {
  await prisma.attendanceFailure.create({ data: { eventId, reasonCode, sourceHash: sha256(getClientAddress(request)) } }).catch(() => undefined);
  if (ticketId) await removeAttendanceTicketPhotos(eventId, ticketId);
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9_-]{20,48}$/.test(code)) return Response.json({ error: 'Liên kết điểm danh không hợp lệ.' }, { status: 404 });
  const token = await getAttendanceToken(code);
  if (!token) return Response.json({ error: 'Lượt điểm danh không còn hiệu lực. Hãy quét lại mã QR.' }, { status: 401 });
  const tokenHash = sha256(token);
  const ticket = await prisma.attendanceQueueTicket.findUnique({ where: { tokenHash }, include: { event: true, record: { select: { id: true, checkedInAt: true } } } });
  if (!ticket || ticket.event.publicCode !== code) return Response.json({ error: 'Không tìm thấy lượt điểm danh.' }, { status: 404 });
  const reject = (status: number, reasonCode: string, message: string) => failedResponse(ticket.eventId, request, status, reasonCode, message, ticket.id);
  if (ticket.record) return Response.json({ ok: true, duplicate: true, checkedInAt: ticket.record.checkedInAt }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (ticket.status !== 'ACTIVE' || !ticket.activeUntil || ticket.activeUntil <= new Date()) return reject(409, 'QUEUE_EXPIRED', 'Lượt điểm danh đã hết hạn. Hãy vào lại hàng đợi.');
  if (ticket.event.status !== 'OPEN') return reject(409, 'EVENT_CLOSED', 'Sự kiện đã đóng điểm danh.');
  const now = new Date();
  const retryAfter = await consumeAttendanceRateLimit(checkinRateLimitKey(code, request), 300, 60_000);
  if (retryAfter) return Response.json({ error: 'Có quá nhiều yêu cầu. Hãy thử lại sau.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfter / 1000)) } });
  const bodyLength = Number(request.headers.get('content-length') ?? 0);
  if (bodyLength > 20_000) return Response.json({ error: 'Thông tin gửi lên vượt giới hạn.' }, { status: 413 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return Response.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 }); }
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Vui lòng kiểm tra lại thông tin.' }, { status: 400 });
  const data = parsed.data;
  if (!data.studentId && !data.email) return reject(400, 'IDENTITY_REQUIRED', 'Cần nhập mã sinh viên hoặc email để tránh điểm danh trùng.');
  const fields = Array.isArray(ticket.event.customFields) ? ticket.event.customFields as Array<{ key?: string; label?: string; required?: boolean; type?: string }> : [];
  for (const field of fields) {
    const value = data.customAnswers[field.key ?? '']?.trim() ?? '';
    if (field.required && !value) return reject(400, 'CUSTOM_FIELD_REQUIRED', `Vui lòng nhập ${field.label ?? 'đầy đủ thông tin'}.`);
    if (field.type === 'email' && value && !z.string().email().safeParse(value).success) return reject(400, 'CUSTOM_FIELD_INVALID', `${field.label ?? 'Email'} không hợp lệ.`);
  }
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: Date } | null = null;
  if (ticket.event.locationRequired) {
    if (data.latitude == null || data.longitude == null || data.accuracy == null || !data.locationCapturedAt) return reject(400, 'LOCATION_REQUIRED', 'Cần cho phép truy cập vị trí để điểm danh.');
    const capturedAt = new Date(data.locationCapturedAt);
    if (Math.abs(now.getTime() - capturedAt.getTime()) > 120_000) return reject(400, 'LOCATION_STALE', 'Vị trí đã cũ. Hãy xác định lại vị trí rồi thử lại.');
    if (data.accuracy > 100) return reject(400, 'LOCATION_INACCURATE', 'Tín hiệu vị trí chưa đủ chính xác. Hãy thử lại ở khu vực thông thoáng.');
    const distance = haversineMeters(Number(ticket.event.latitude), Number(ticket.event.longitude), data.latitude, data.longitude);
    if (distance + data.accuracy > ticket.event.geofenceRadiusMeters) return reject(403, 'LOCATION_OUT_OF_RANGE', 'Bạn đang ngoài phạm vi điểm danh hợp lệ.');
    location = { latitude: data.latitude, longitude: data.longitude, accuracy: data.accuracy, capturedAt };
  }
  if (ticket.event.photoRequired && !data.photoKey) return reject(400, 'PHOTO_REQUIRED', 'Cần chụp ảnh trực tiếp trước khi gửi điểm danh.');
  if (data.photoKey && !data.photoKey.startsWith(`${ticket.eventId}/${ticket.id}/`)) return reject(400, 'PHOTO_INVALID', 'Ảnh không thuộc lượt điểm danh này.');
  if (data.photoKey && !await hasAttendancePhoto(data.photoKey)) return reject(400, 'PHOTO_MISSING', 'Không tìm thấy ảnh vừa tải lên. Hãy chụp lại ảnh.');
  const identity = (data.studentId || data.email).trim().toLocaleLowerCase('en-US');
  const identityHash = sha256(`${ticket.eventId}\0${identity}`);
  const idempotencyKey = sha256(`${ticket.id}\0${data.idempotencyKey}`);
  try {
    const record = await prisma.$transaction(async (tx) => {
      const freshTicket = await tx.attendanceQueueTicket.findUnique({ where: { id: ticket.id }, select: { status: true, activeUntil: true } });
      if (!freshTicket || freshTicket.status !== 'ACTIVE' || !freshTicket.activeUntil || freshTicket.activeUntil <= new Date()) throw new Error('TICKET_EXPIRED');
      const freshEvent = await tx.attendanceEvent.findUnique({ where: { id: ticket.eventId }, select: { status: true } });
      if (!freshEvent || freshEvent.status !== 'OPEN') throw new Error('EVENT_CLOSED');
      const created = await tx.attendanceRecord.create({ data: {
        eventId: ticket.eventId, ticketId: ticket.id, idempotencyKey, identityHash,
        fullName: data.fullName, studentId: data.studentId || null, email: data.email || null,
        organization: data.organization || null, customAnswers: data.customAnswers as never,
        latitude: location?.latitude ?? null, longitude: location?.longitude ?? null,
        locationAccuracyMeters: location?.accuracy ?? null, locationCapturedAt: location?.capturedAt ?? null,
        photoKey: data.photoKey ?? null,
      } });
      await tx.attendanceQueueTicket.update({ where: { id: ticket.id }, data: { status: 'CHECKED_IN', checkedInAt: new Date(), activeUntil: null } });
      await tx.attendanceCapacitySlot.updateMany({ where: { ticketId: ticket.id }, data: { ticketId: null } });
      await tx.auditEvent.create({ data: { action: 'ATTENDANCE_CHECKED_IN', entityType: 'AttendanceRecord', entityId: created.id, details: { eventId: ticket.eventId, hasLocation: Boolean(location), hasPhoto: Boolean(data.photoKey) } } });
      return created;
    });
    await prisma.attendanceCapacitySlot.updateMany({ where: { ticketId: ticket.id }, data: { ticketId: null } });
    const waitingTicket = await prisma.attendanceQueueTicket.findFirst({ where: { eventId: ticket.eventId, status: 'WAITING' }, select: { id: true } });
    if (waitingTicket) await prisma.$transaction(async (tx) => {
      const slot = await tx.attendanceCapacitySlot.findFirst({ where: { eventId: ticket.eventId, ticketId: null }, orderBy: { slotNo: 'asc' }, select: { id: true } });
      if (!slot) return;
      const claimed = await tx.attendanceCapacitySlot.updateMany({ where: { id: slot.id, ticketId: null }, data: { ticketId: waitingTicket.id } });
      if (!claimed.count) return;
      const activated = await tx.attendanceQueueTicket.updateMany({ where: { id: waitingTicket.id, status: 'WAITING' }, data: { status: 'ACTIVE', activeUntil: new Date(Date.now() + 5 * 60 * 1000) } });
      if (!activated.count) await tx.attendanceCapacitySlot.updateMany({ where: { id: slot.id, ticketId: waitingTicket.id }, data: { ticketId: null } });
    });
    return Response.json({ ok: true, checkedInAt: record.checkedInAt }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'TICKET_EXPIRED') return reject(409, 'QUEUE_EXPIRED', 'Lượt điểm danh đã hết hạn. Hãy vào lại hàng đợi.');
    if (error instanceof Error && error.message === 'EVENT_CLOSED') return reject(409, 'EVENT_CLOSED', 'Sự kiện đã đóng điểm danh.');
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return reject(409, 'DUPLICATE_IDENTITY', 'Thông tin này đã được dùng để điểm danh sự kiện.');
    throw error;
  }
}

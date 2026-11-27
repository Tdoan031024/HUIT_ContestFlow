import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  attendanceCookieName, consumeAttendanceRateLimit, expireQueueTickets, getAttendanceToken,
  getEventClientHash, promoteOneWaitingTicket, queueRateLimitKey, setAttendanceToken, sha256,
  removeAttendanceTicketPhotos,
} from '@/lib/attendance';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ code: string }> };

async function findEvent(code: string) {
  if (!/^[A-Za-z0-9_-]{20,48}$/.test(code)) return null;
  return prisma.attendanceEvent.findUnique({ where: { publicCode: code } });
}

export async function POST(request: Request, { params }: Context) {
  const { code } = await params;
  const event = await findEvent(code);
  if (!event || event.status === 'ARCHIVED') return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  const now = new Date();
  if (event.status !== 'OPEN') return Response.json({ error: 'Điểm danh hiện chưa mở.' }, { status: 409 });
  if (now < event.checkInStartsAt || now > event.checkInEndsAt) return Response.json({ error: 'Hiện chưa đến khung giờ điểm danh.' }, { status: 409 });
  const retryAfter = await consumeAttendanceRateLimit(queueRateLimitKey(code, request), 3000, 5 * 60 * 1000);
  if (retryAfter) return Response.json({ error: 'Đang có nhiều lượt yêu cầu. Hãy thử lại sau.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfter / 1000)) } });
  const oldToken = await getAttendanceToken(code);
  if (oldToken) {
    const existing = await prisma.attendanceQueueTicket.findUnique({ where: { tokenHash: sha256(oldToken) } });
    if (existing?.eventId === event.id && (existing.status === 'WAITING' || (existing.status === 'ACTIVE' && existing.activeUntil && existing.activeUntil > now))) {
      return Response.json({ ok: true, status: existing.status, ticketId: existing.id }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (existing?.eventId === event.id && existing.status === 'ACTIVE' && existing.activeUntil && existing.activeUntil <= now) {
      await prisma.attendanceQueueTicket.updateMany({ where: { id: existing.id, status: 'ACTIVE', activeUntil: { lte: now } }, data: { status: 'EXPIRED', activeUntil: null } });
      await prisma.attendanceCapacitySlot.updateMany({ where: { ticketId: existing.id }, data: { ticketId: null } });
      await removeAttendanceTicketPhotos(event.id, existing.id);
      await promoteOneWaitingTicket(event.id);
    }
    if (existing?.eventId === event.id && existing.status === 'CHECKED_IN') return Response.json({ error: 'Lượt điểm danh này đã được ghi nhận.' }, { status: 409 });
  }
  // Sweep a small batch occasionally so abandoned tickets do not consume capacity.
  if (Math.random() < 0.005) await expireQueueTickets(event.id);
  const queued = await prisma.attendanceQueueTicket.count({ where: { eventId: event.id, status: { in: ['WAITING', 'ACTIVE'] } } });
  if (queued >= event.maxQueueSize) return Response.json({ error: 'Hàng đợi đã đạt giới hạn. Vui lòng thử lại sau.' }, { status: 429, headers: { 'Retry-After': '60' } });
  const token = randomBytes(32).toString('base64url');
  const ticket = await prisma.attendanceQueueTicket.create({ data: { eventId: event.id, tokenHash: sha256(token), clientHash: getEventClientHash(request) } });
  await setAttendanceToken(code, token);
  await promoteOneWaitingTicket(event.id);
  const current = await prisma.attendanceQueueTicket.findUnique({ where: { id: ticket.id }, select: { status: true } });
  return Response.json({ ok: true, status: current?.status ?? 'WAITING', ticketId: ticket.id, cookie: attendanceCookieName(code) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(_request: Request, { params }: Context) {
  const { code } = await params;
  const event = await findEvent(code);
  if (!event || event.status === 'ARCHIVED') return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  const token = await getAttendanceToken(code);
  if (!token) return Response.json({ status: 'NONE' }, { headers: { 'Cache-Control': 'private, no-store' } });
  const tokenHash = sha256(token);
  const retryAfter = await consumeAttendanceRateLimit(`attendance:poll:${code}:${tokenHash}`, 30, 60_000);
  if (retryAfter) return Response.json({ error: 'Đang cập nhật quá thường xuyên. Hãy đợi một chút.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfter / 1000)), 'Cache-Control': 'private, no-store' } });
  const ticket = await prisma.attendanceQueueTicket.findUnique({ where: { tokenHash } });
  if (!ticket || ticket.eventId !== event.id) return Response.json({ status: 'NONE' }, { headers: { 'Cache-Control': 'private, no-store' } });
  let current = await prisma.attendanceQueueTicket.findUnique({ where: { id: ticket.id }, select: { id: true, status: true, activeUntil: true, createdAt: true, checkedInAt: true } });
  if (!current) return Response.json({ status: 'NONE' }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (event.status !== 'OPEN' || new Date() > event.checkInEndsAt) {
    if (current.status === 'WAITING' || current.status === 'ACTIVE') {
      await prisma.attendanceQueueTicket.updateMany({ where: { id: current.id, status: { in: ['WAITING', 'ACTIVE'] } }, data: { status: 'EXPIRED', activeUntil: null } });
      await prisma.attendanceCapacitySlot.updateMany({ where: { ticketId: current.id }, data: { ticketId: null } });
      current = { ...current, status: 'EXPIRED', activeUntil: null };
    }
  }
  if (current.status === 'ACTIVE' && current.activeUntil && current.activeUntil <= new Date()) {
    await prisma.attendanceQueueTicket.updateMany({ where: { id: current.id, status: 'ACTIVE', activeUntil: { lte: new Date() } }, data: { status: 'EXPIRED', activeUntil: null } });
    await prisma.attendanceCapacitySlot.updateMany({ where: { ticketId: current.id }, data: { ticketId: null } });
    await removeAttendanceTicketPhotos(event.id, current.id);
    await promoteOneWaitingTicket(event.id);
    current = { ...current, status: 'EXPIRED', activeUntil: null };
  } else if (current.status === 'WAITING') {
    await promoteOneWaitingTicket(event.id);
    const updated = await prisma.attendanceQueueTicket.findUnique({ where: { id: current.id }, select: { status: true, activeUntil: true } });
    if (updated) current = { ...current, ...updated };
  }
  const position = current.status === 'WAITING' ? await prisma.attendanceQueueTicket.count({ where: { eventId: event.id, status: 'WAITING', createdAt: { lte: current.createdAt } } }) : null;
  return Response.json({ status: current.status, position, activeUntil: current.activeUntil, checkedInAt: current.checkedInAt }, { headers: { 'Cache-Control': 'private, no-store' } });
}

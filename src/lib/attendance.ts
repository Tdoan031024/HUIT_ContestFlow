import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const attendanceEventInput = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(5000).optional().default(''),
  venue: z.string().trim().min(2).max(240),
  eventStartsAt: z.string().datetime({ offset: true }),
  eventEndsAt: z.string().datetime({ offset: true }),
  checkInStartsAt: z.string().datetime({ offset: true }),
  checkInEndsAt: z.string().datetime({ offset: true }),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusMeters: z.number().int().min(25).max(2000).default(150),
  locationRequired: z.boolean().default(true),
  photoRequired: z.boolean().default(true),
  expectedAttendees: z.number().int().min(0).max(100000).default(0),
  maxActiveCheckins: z.number().int().min(1).max(250).default(30),
  maxQueueSize: z.number().int().min(10).max(50000).default(5000),
  customFields: z.array(z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]{1,39}$/),
    label: z.string().trim().min(1).max(100),
    type: z.enum(['text', 'email', 'tel']),
    required: z.boolean(),
  })).max(12).default([]),
}).superRefine((data, ctx) => {
  const eventStarts = Date.parse(data.eventStartsAt);
  const eventEnds = Date.parse(data.eventEndsAt);
  const checkInStarts = Date.parse(data.checkInStartsAt);
  const checkInEnds = Date.parse(data.checkInEndsAt);
  if (eventEnds <= eventStarts) ctx.addIssue({ code: 'custom', path: ['eventEndsAt'], message: 'Thời gian kết thúc sự kiện phải sau thời gian bắt đầu.' });
  if (checkInEnds <= checkInStarts) ctx.addIssue({ code: 'custom', path: ['checkInEndsAt'], message: 'Thời gian kết thúc điểm danh phải sau thời gian bắt đầu.' });
  if (checkInStarts < eventStarts - 24 * 60 * 60 * 1000 || checkInEnds > eventEnds + 24 * 60 * 60 * 1000) ctx.addIssue({ code: 'custom', path: ['checkInStartsAt'], message: 'Khung giờ điểm danh cần nằm trong khoảng một ngày trước hoặc sau sự kiện.' });
  if (data.locationRequired && (data.latitude == null || data.longitude == null)) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Cần tọa độ địa điểm khi bật xác minh vị trí.' });
  const keys = data.customFields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', path: ['customFields'], message: 'Tên trường tùy chỉnh không được trùng nhau.' });
});

export type AttendanceEventInput = z.infer<typeof attendanceEventInput>;
export type AttendanceCustomField = AttendanceEventInput['customFields'][number];

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function newPublicCode() {
  return randomBytes(18).toString('base64url');
}

export function getClientAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean).at(-1);
  const real = request.headers.get('x-real-ip')?.trim();
  const candidate = forwarded || real || 'unknown';
  return candidate.length <= 128 ? candidate : 'unknown';
}

export function attendanceCookieName(code: string) {
  return `hcf_at_${code}`;
}

export async function getAttendanceToken(code: string) {
  return (await cookies()).get(attendanceCookieName(code))?.value ?? null;
}

export async function setAttendanceToken(code: string, token: string) {
  const cookieJar = await cookies();
  cookieJar.set(attendanceCookieName(code), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: `/api/public/attendance/${code}`,
    maxAge: 60 * 60 * 4,
  });
}

export async function getAdmin() {
  const user = await getCurrentUser();
  return user?.systemRole === 'ADMIN' ? user : null;
}

export async function consumeAttendanceRateLimit(bucket: string, maximum: number, windowMs: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  await prisma.$executeRaw`
    INSERT INTO attendance_rate_limits (bucket_key, count, reset_at)
    VALUES (${bucket}, 1, ${resetAt})
    ON DUPLICATE KEY UPDATE
      count = IF(reset_at <= ${now}, 1, count + 1),
      reset_at = IF(reset_at <= ${now}, ${resetAt}, reset_at)
  `;
  const current = await prisma.attendanceRateLimit.findUnique({ where: { bucketKey: bucket } });
  if (Math.random() < 0.005) void prisma.attendanceRateLimit.deleteMany({ where: { resetAt: { lt: now } } }).catch(() => undefined);
  return current && current.count > maximum ? Math.max(1, current.resetAt.getTime() - now.getTime()) : null;
}

export function getEventClientHash(request: Request) {
  return sha256(`${getClientAddress(request)}\0${request.headers.get('user-agent')?.slice(0, 300) ?? ''}`);
}

export function queueRateLimitKey(code: string, request: Request) {
  return `attendance:queue:${code}:${sha256(getClientAddress(request))}`;
}

export function checkinRateLimitKey(code: string, request: Request) {
  return `attendance:checkin:${code}:${sha256(getClientAddress(request))}`;
}

export function uploadRateLimitKey(code: string, tokenHash: string) {
  return `attendance:photo:${code}:${tokenHash}`;
}

export async function promoteOneWaitingTicket(eventId: string) {
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const [ticket, slot] = await Promise.all([
        tx.attendanceQueueTicket.findFirst({ where: { eventId, status: 'WAITING' }, orderBy: { createdAt: 'asc' }, select: { id: true } }),
        tx.attendanceCapacitySlot.findFirst({ where: { eventId, ticketId: null }, orderBy: { slotNo: 'asc' }, select: { id: true } }),
      ]);
      if (!ticket || !slot) return false;
      const claimedSlot = await tx.attendanceCapacitySlot.updateMany({ where: { id: slot.id, ticketId: null }, data: { ticketId: ticket.id } });
      if (!claimedSlot.count) return false;
      const claimedTicket = await tx.attendanceQueueTicket.updateMany({
        where: { id: ticket.id, eventId, status: 'WAITING' },
        data: { status: 'ACTIVE', activeUntil: new Date(now.getTime() + 5 * 60 * 1000) },
      });
      if (!claimedTicket.count) {
        await tx.attendanceCapacitySlot.updateMany({ where: { id: slot.id, ticketId: ticket.id }, data: { ticketId: null } });
        return false;
      }
      return true;
    });
  } catch (error) {
    // A competing promoter may win the unique slot claim; another queue poll will retry.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return false;
    throw error;
  }
}

export async function expireQueueTickets(eventId: string) {
  const now = new Date();
  const waitingCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const expired = await prisma.attendanceQueueTicket.findMany({
    where: { eventId, OR: [{ status: 'ACTIVE', activeUntil: { lte: now } }, { status: 'WAITING', createdAt: { lte: waitingCutoff } }] },
    select: { id: true },
    take: 1000,
  });
  if (!expired.length) return;
  const ids = expired.map(({ id }) => id);
  await prisma.attendanceQueueTicket.updateMany({
    where: { id: { in: ids }, OR: [{ status: 'ACTIVE', activeUntil: { lte: now } }, { status: 'WAITING', createdAt: { lte: waitingCutoff } }] },
    data: { status: 'EXPIRED', activeUntil: null },
  });
  await prisma.attendanceCapacitySlot.updateMany({ where: { ticketId: { in: ids } }, data: { ticketId: null } });
  const expiredIds = await prisma.attendanceQueueTicket.findMany({ where: { id: { in: ids }, status: 'EXPIRED', checkedInAt: null }, select: { id: true } });
  await Promise.all(expiredIds.map(({ id }) => removeAttendanceTicketPhotos(eventId, id)));
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (degrees: number) => degrees * (Math.PI / 180);
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function attendanceStorageRoot() {
  const configured = process.env.ATTENDANCE_STORAGE_DIR || '.data/attendance-private';
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function attendancePhotoPath(key: string) {
  if (!/^[a-f\d-]{36}\/[a-f\d-]{36}\/[a-f\d-]{36}\.(jpg|webp)$/.test(key)) throw new Error('Ảnh điểm danh không hợp lệ.');
  const root = attendanceStorageRoot();
  const fullPath = path.resolve(root, ...key.split('/'));
  const relative = path.relative(root, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ảnh điểm danh không hợp lệ.');
  return fullPath;
}

export async function saveAttendancePhoto(eventId: string, ticketId: string, bytes: Buffer, extension: 'jpg' | 'webp') {
  const key = `${eventId}/${ticketId}/${randomUUID()}.${extension}`;
  const fullPath = path.join(attendanceStorageRoot(), ...key.split('/'));
  await mkdir(path.dirname(fullPath), { recursive: true, mode: 0o700 });
  await writeFile(fullPath, bytes, { mode: 0o600, flag: 'wx' });
  return key;
}

export async function readAttendancePhoto(key: string) {
  return readFile(attendancePhotoPath(key));
}

export async function hasAttendancePhoto(key: string) {
  try { return (await stat(attendancePhotoPath(key))).isFile(); } catch { return false; }
}

export async function readLimitedBody(request: Request, maximumBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export async function removeAttendancePhoto(key: string | null | undefined) {
  if (!key) return;
  try { await rm(attendancePhotoPath(key), { force: true }); } catch { /* the database action remains authoritative */ }
}

export async function removeAttendanceTicketPhotos(eventId: string, ticketId: string) {
  if (!/^[a-f\d-]{36}$/i.test(eventId) || !/^[a-f\d-]{36}$/i.test(ticketId)) return;
  try { await rm(path.join(attendanceStorageRoot(), eventId, ticketId), { recursive: true, force: true }); } catch { /* the database action remains authoritative */ }
}

export async function removeAttendanceEventPhotos(eventId: string) {
  if (!/^[a-f\d-]{36}$/i.test(eventId)) return;
  try { await rm(path.join(attendanceStorageRoot(), eventId), { recursive: true, force: true }); } catch { /* the database action remains authoritative */ }
}

export function csvCell(value: unknown) {
  const stringValue = value == null ? '' : String(value);
  const safe = /^[\s]*[=+@\-]/.test(stringValue) ? `'${stringValue}` : stringValue;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function privateNoStoreHeaders() {
  return { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
}

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { sha256 } from '@/lib/attendance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const schema = z.object({
  fullName: z.string().trim().min(2).max(180),
  studentId: z.string().trim().max(80).optional().default(''),
  email: z.string().trim().email().max(255).optional().or(z.literal('')).default(''),
  organization: z.string().trim().max(180).optional().default(''),
  reason: z.string().trim().min(8).max(1000),
});

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId } = await params;
  const event = await prisma.attendanceEvent.findUnique({ where: { id: eventId }, select: { id: true, status: true } });
  if (!event || event.status === 'ARCHIVED') return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return Response.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Thông tin không hợp lệ.' }, { status: 400 });
  const data = parsed.data;
  if (!data.studentId && !data.email) return Response.json({ error: 'Cần có mã sinh viên hoặc email để tránh trùng.' }, { status: 400 });
  const identity = (data.studentId || data.email).toLocaleLowerCase('en-US');
  const identityHash = sha256(`${eventId}\0${identity}`);
  try {
    const record = await prisma.$transaction(async (tx) => {
      const ticket = await tx.attendanceQueueTicket.create({ data: {
        eventId, tokenHash: sha256(randomBytes(32)), clientHash: sha256(`admin:${user.id}`), status: 'CHECKED_IN', checkedInAt: new Date(),
      } });
      const created = await tx.attendanceRecord.create({ data: {
        eventId, ticketId: ticket.id, idempotencyKey: sha256(`manual:${randomBytes(32).toString('hex')}`), identityHash,
        fullName: data.fullName, studentId: data.studentId || null, email: data.email || null,
        organization: data.organization || null, manualOverride: true, overrideReason: data.reason,
      } });
      await tx.auditEvent.create({ data: { actorId: user.id, action: 'ATTENDANCE_MANUAL_CHECK_IN', entityType: 'AttendanceRecord', entityId: created.id, details: { eventId, reason: data.reason } } });
      return created;
    });
    return Response.json({ record: { id: record.id, fullName: record.fullName, checkedInAt: record.checkedInAt, manualOverride: true } }, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return Response.json({ error: 'Thông tin này đã được dùng để điểm danh sự kiện.' }, { status: 409 });
    throw error;
  }
}

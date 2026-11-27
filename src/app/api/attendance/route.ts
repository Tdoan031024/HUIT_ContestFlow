import { getCurrentUser } from '@/lib/auth';
import { attendanceEventInput, newPublicCode } from '@/lib/attendance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const events = await prisma.attendanceEvent.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ checkInStartsAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true, publicCode: true, name: true, venue: true, eventStartsAt: true, eventEndsAt: true,
      checkInStartsAt: true, checkInEndsAt: true, expectedAttendees: true, status: true,
      _count: { select: { records: true } },
    },
  });
  const ids = events.map(({ id }) => id);
  const [queueCounts, failureCounts] = ids.length ? await Promise.all([prisma.attendanceQueueTicket.groupBy({
    by: ['eventId', 'status'], where: { eventId: { in: ids } }, _count: { _all: true },
  }), prisma.attendanceFailure.groupBy({ by: ['eventId'], where: { eventId: { in: ids } }, _count: { _all: true } })]) : [[], []];
  const queueByEvent = new Map<string, { waiting: number; active: number }>();
  for (const row of queueCounts) {
    const current = queueByEvent.get(row.eventId) ?? { waiting: 0, active: 0 };
    if (row.status === 'WAITING') current.waiting = row._count._all;
    if (row.status === 'ACTIVE') current.active = row._count._all;
    queueByEvent.set(row.eventId, current);
  }
  const failuresByEvent = new Map(failureCounts.map((row) => [row.eventId, row._count._all]));
  return Response.json({ events: events.map(({ _count, ...event }) => ({ ...event, checkedIn: _count.records, failedAttempts: failuresByEvent.get(event.id) ?? 0, ...(queueByEvent.get(event.id) ?? { waiting: 0, active: 0 }) })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 64_000) return Response.json({ error: 'Dữ liệu sự kiện vượt quá giới hạn.' }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 }); }
  const parsed = attendanceEventInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Thông tin sự kiện không hợp lệ.' }, { status: 400 });
  const data = parsed.data;
  const slots = Array.from({ length: data.maxActiveCheckins }, (_, index) => ({ slotNo: index + 1 }));
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.attendanceEvent.create({ data: {
      publicCode: newPublicCode(), name: data.name, description: data.description || null, venue: data.venue,
      eventStartsAt: new Date(data.eventStartsAt), eventEndsAt: new Date(data.eventEndsAt),
      checkInStartsAt: new Date(data.checkInStartsAt), checkInEndsAt: new Date(data.checkInEndsAt),
      latitude: data.latitude ?? null, longitude: data.longitude ?? null,
      geofenceRadiusMeters: data.geofenceRadiusMeters, locationRequired: data.locationRequired,
      photoRequired: data.photoRequired, expectedAttendees: data.expectedAttendees,
      maxActiveCheckins: data.maxActiveCheckins, maxQueueSize: data.maxQueueSize,
      customFields: data.customFields as never, status: 'DRAFT', createdById: user.id,
    } });
    await tx.attendanceCapacitySlot.createMany({ data: slots.map((slot) => ({ ...slot, eventId: created.id })) });
    await tx.auditEvent.create({ data: { actorId: user.id, action: 'ATTENDANCE_EVENT_CREATED', entityType: 'AttendanceEvent', entityId: created.id, details: { name: created.name, publicCode: created.publicCode } } });
    return created;
  });
  return Response.json({ event }, { status: 201 });
}

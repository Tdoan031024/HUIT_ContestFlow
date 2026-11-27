import { prisma } from '@/lib/prisma';
import { privateNoStoreHeaders } from '@/lib/attendance';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9_-]{20,48}$/.test(code)) return Response.json({ error: 'Liên kết điểm danh không hợp lệ.' }, { status: 404 });
  const event = await prisma.attendanceEvent.findUnique({ where: { publicCode: code } });
  if (!event || event.status === 'ARCHIVED') return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  const now = new Date();
  const inWindow = now >= event.checkInStartsAt && now <= event.checkInEndsAt;
  return Response.json({ event: {
    name: event.name, description: event.description, venue: event.venue,
    eventStartsAt: event.eventStartsAt, eventEndsAt: event.eventEndsAt,
    checkInStartsAt: event.checkInStartsAt, checkInEndsAt: event.checkInEndsAt,
    status: event.status, acceptingCheckins: event.status === 'OPEN' && inWindow,
    locationRequired: event.locationRequired, photoRequired: event.photoRequired,
    customFields: event.customFields ?? [],
  } }, { headers: privateNoStoreHeaders() });
}

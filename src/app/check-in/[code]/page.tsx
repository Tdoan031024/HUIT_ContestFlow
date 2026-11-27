import { notFound } from 'next/navigation';
import { AttendanceParticipant } from '@/components/attendance-participant';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AttendanceParticipantPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9_-]{20,48}$/.test(code)) notFound();
  const event = await prisma.attendanceEvent.findUnique({ where: { publicCode: code } });
  if (!event || event.status === 'ARCHIVED') notFound();
  return <AttendanceParticipant event={{
    code, name: event.name, description: event.description, venue: event.venue,
    eventStartsAt: event.eventStartsAt.toISOString(), checkInStartsAt: event.checkInStartsAt.toISOString(),
    checkInEndsAt: event.checkInEndsAt.toISOString(), status: event.status,
    locationRequired: event.locationRequired, photoRequired: event.photoRequired,
    customFields: Array.isArray(event.customFields) ? event.customFields as Array<{ key: string; label: string; required: boolean; type: 'text' | 'email' | 'tel' }> : [],
  }} />;
}

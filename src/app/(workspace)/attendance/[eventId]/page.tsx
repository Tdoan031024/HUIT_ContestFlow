import { redirect } from 'next/navigation';
import { AttendanceEventDetail } from '@/components/attendance-event-detail';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AttendanceEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.systemRole !== 'ADMIN') redirect('/');
  const { eventId } = await params;
  return <AttendanceEventDetail eventId={eventId} />;
}

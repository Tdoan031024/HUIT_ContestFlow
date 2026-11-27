import { redirect } from 'next/navigation';
import { AttendanceWorkspace } from '@/components/attendance-workspace';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.systemRole !== 'ADMIN') redirect('/');
  return <AttendanceWorkspace />;
}

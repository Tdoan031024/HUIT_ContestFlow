import { JudgeTasks } from '@/components/judge-workspace';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function JudgePage() {
  const user = await getCurrentUser();
  if (user?.systemRole !== 'JUDGE') redirect('/');
  return <JudgeTasks />;
}

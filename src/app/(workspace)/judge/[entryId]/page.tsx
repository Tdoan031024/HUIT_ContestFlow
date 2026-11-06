import { JudgeScoreForm } from '@/components/judge-workspace';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function JudgeScorePage({ params }: { params: Promise<{ entryId: string }> }) {
  const user = await getCurrentUser();
  if (user?.systemRole !== 'JUDGE') redirect('/');
  const { entryId } = await params;
  return <JudgeScoreForm entryId={entryId} />;
}

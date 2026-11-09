import { JudgeScoreForm } from '@/components/judge-workspace';
import { requirePageRole } from '@/lib/page-auth';

export default async function JudgeScorePage({ params }: { params: Promise<{ entryId: string }> }) {
  await requirePageRole('JUDGE');
  const { entryId } = await params;
  return <JudgeScoreForm entryId={entryId} />;
}

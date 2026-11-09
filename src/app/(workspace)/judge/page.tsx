import { JudgeTasks } from '@/components/judge-workspace';
import { requirePageRole } from '@/lib/page-auth';

export default async function JudgePage() {
  await requirePageRole('JUDGE');
  return <JudgeTasks />;
}

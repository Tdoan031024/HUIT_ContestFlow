import { CompetitionsList } from '@/components/competitions-list';
import { requirePageRole } from '@/lib/page-auth';

export default async function CompetitionsPage() {
  await requirePageRole('ADMIN');
  return <CompetitionsList />;
}

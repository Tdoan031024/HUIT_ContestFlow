import { CompetitionWorkspace } from '@/components/competition-workspace';
import { requirePageRole } from '@/lib/page-auth';

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole('ADMIN');
  const { id } = await params;
  return <CompetitionWorkspace id={id} section="overview" />;
}

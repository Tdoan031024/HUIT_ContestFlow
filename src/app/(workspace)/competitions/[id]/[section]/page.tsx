import { CompetitionWorkspace } from '@/components/competition-workspace';
import { redirect } from 'next/navigation';
import { requireSignedInPage } from '@/lib/page-auth';

export default async function CompetitionSectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const user = await requireSignedInPage();
  const { id, section } = await params;
  const allowedSections = ['contestants', 'judges', 'rubric', 'live', 'scores', 'results', 'activity'];
  if (!allowedSections.includes(section)) redirect('/competitions');
  if (user.systemRole !== 'ADMIN' && section !== 'results') redirect('/judge');
  return <CompetitionWorkspace id={id} section={section} />;
}

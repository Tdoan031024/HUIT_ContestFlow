import { CompetitionWorkspace } from '@/components/competition-workspace';

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompetitionWorkspace id={id} section="overview" />;
}

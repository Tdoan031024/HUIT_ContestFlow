import { CompetitionWorkspace } from '@/components/competition-workspace';

export default async function CompetitionSectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = await params;
  return <CompetitionWorkspace id={id} section={section} />;
}

import { redirect } from 'next/navigation';
import { JudgeDirectory } from '@/components/judge-directory';
import { requireSignedInPage } from '@/lib/page-auth';

export default async function JudgesPage() {
  const user = await requireSignedInPage();
  if (user.systemRole !== 'ADMIN') redirect('/');
  return <JudgeDirectory />;
}

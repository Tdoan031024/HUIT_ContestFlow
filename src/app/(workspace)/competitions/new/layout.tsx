import type { ReactNode } from 'react';
import { requirePageRole } from '@/lib/page-auth';

export default async function NewCompetitionLayout({ children }: { children: ReactNode }) {
  await requirePageRole('ADMIN');
  return children;
}

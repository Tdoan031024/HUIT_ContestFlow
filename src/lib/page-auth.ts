import { redirect } from 'next/navigation';
import { getCurrentUser, type SessionUser } from '@/lib/auth';

export async function requirePageRole(role: SessionUser['systemRole']): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.systemRole !== role) redirect(role === 'ADMIN' ? '/judge' : '/');
  return user;
}

export async function requireSignedInPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

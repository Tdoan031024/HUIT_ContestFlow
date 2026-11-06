import { clearSession, getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST() {
  const user = await getCurrentUser();
  await clearSession();
  if (user) await prisma.auditEvent.create({ data: { actorId: user.id, action: 'LOGOUT', entityType: 'Session' } });
  return Response.json({ ok: true });
}

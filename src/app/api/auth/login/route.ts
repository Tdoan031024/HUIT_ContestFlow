import { z } from 'zod';
import { createSession, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({
  identifier: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).optional(),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(false),
}).refine((data) => Boolean(data.identifier || data.email), { path: ['identifier'] });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Username, email hoặc mật khẩu không hợp lệ.' }, { status: 400 });
  const identifier = (parsed.data.identifier ?? parsed.data.email!).trim();
  const normalizedIdentifier = identifier.toLowerCase();
  const user = normalizedIdentifier.includes('@')
    ? await prisma.user.findUnique({ where: { email: normalizedIdentifier } })
    : await prisma.user.findUnique({ where: { username: normalizedIdentifier } });
  if (!user || !user.isActive || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return Response.json({ error: 'Username/email hoặc mật khẩu không đúng.' }, { status: 401 });
  }
  await createSession(user.id, parsed.data.rememberMe);
  await prisma.auditEvent.create({ data: { actorId: user.id, action: 'LOGIN', entityType: 'Session' } });
  return Response.json({ user: { id: user.id, email: user.email, fullName: user.fullName, systemRole: user.systemRole } });
}

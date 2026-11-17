import { scryptSync } from 'node:crypto';
import { z } from 'zod';
import { createSession, verifyPassword } from '@/lib/auth';
import { clearLoginFailures, consumeLoginAttempt } from '@/lib/login-rate-limit';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${scryptSync('not-a-real-account-password', '0'.repeat(32), 64).toString('hex')}`;
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
  const waitMs = consumeLoginAttempt(request, normalizedIdentifier);
  if (waitMs !== null) {
    const retryAfter = Math.max(1, Math.ceil(waitMs / 1000));
    return Response.json(
      { error: 'Bạn đã thử đăng nhập nhiều lần. Vui lòng đợi một lúc rồi thử lại.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  const user = normalizedIdentifier.includes('@')
    ? await prisma.user.findUnique({ where: { email: normalizedIdentifier } })
    : await prisma.user.findUnique({ where: { username: normalizedIdentifier } });
  const passwordMatches = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.isActive || !passwordMatches) {
    return Response.json({ error: 'Username/email hoặc mật khẩu không đúng.' }, { status: 401 });
  }
  clearLoginFailures(request, normalizedIdentifier);
  await createSession(user.id, parsed.data.rememberMe);
  await prisma.auditEvent.create({ data: { actorId: user.id, action: 'LOGIN', entityType: 'Session' } });
  return Response.json({ user: { id: user.id, email: user.email, fullName: user.fullName, systemRole: user.systemRole } });
}

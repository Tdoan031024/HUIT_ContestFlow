import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createSession, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({
  setupKey: z.string().min(1),
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const setupKey = process.env.ADMIN_SETUP_KEY;
  if (!setupKey) return Response.json({ error: 'First-run setup is disabled. Configure ADMIN_SETUP_KEY.' }, { status: 503 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Kiểm tra lại thông tin. Mật khẩu cần ít nhất 12 ký tự.' }, { status: 400 });
  const submitted = Buffer.from(parsed.data.setupKey);
  const expected = Buffer.from(setupKey);
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
    return Response.json({ error: 'Mã khởi tạo không hợp lệ.' }, { status: 403 });
  }

  const existingAdmin = await prisma.user.findFirst({ where: { systemRole: 'ADMIN' }, select: { id: true } });
  if (existingAdmin) return Response.json({ error: 'Tài khoản quản trị đã được khởi tạo.' }, { status: 409 });

  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) return Response.json({ error: 'Email này đã được sử dụng.' }, { status: 409 });

  const user = await prisma.user.create({ data: {
    email,
    fullName: parsed.data.fullName,
    passwordHash: await hashPassword(parsed.data.password),
    systemRole: 'ADMIN',
  } });
  await prisma.auditEvent.create({ data: { actorId: user.id, action: 'ADMIN_BOOTSTRAPPED', entityType: 'User', entityId: user.id } });
  await createSession(user.id);
  return Response.json({ user: { id: user.id, email: user.email, fullName: user.fullName, systemRole: user.systemRole } }, { status: 201 });
}

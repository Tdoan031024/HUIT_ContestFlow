import { z } from 'zod';
import { hashPassword } from '@/lib/auth';
import { consumeRecoveryAttempt, hashRecoveryToken } from '@/lib/password-recovery';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const schema = z.object({ token: z.string().min(32).max(256), password: z.string().min(8).max(128) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Liên kết hoặc mật khẩu chưa hợp lệ. Mật khẩu cần ít nhất 8 ký tự.' }, { status: 400 });

  const tokenHash = hashRecoveryToken(parsed.data.token);
  const retryMs = consumeRecoveryAttempt(request, tokenHash);
  if (retryMs !== null) {
    const retryAfter = Math.max(1, Math.ceil(retryMs / 1000));
    return Response.json({ error: 'Bạn đã thử nhiều lần. Vui lòng đợi một lúc rồi thử lại.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  const now = new Date();
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, email: true, isActive: true } } } });
  if (!reset || reset.usedAt || reset.expiresAt <= now || !reset.user.isActive) {
    return Response.json({ error: 'Liên kết đặt lại mật khẩu đã hết hạn hoặc không còn sử dụng được. Hãy yêu cầu liên kết mới.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const changed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, tokenHash, usedAt: null, expiresAt: { gt: now }, email: reset.email }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: reset.user.id, isActive: true }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: reset.user.id } });
    await tx.passwordResetToken.updateMany({ where: { userId: reset.user.id, id: { not: reset.id }, usedAt: null }, data: { usedAt: now } });
    await tx.auditEvent.create({ data: { actorId: reset.user.id, action: 'PASSWORD_RESET_BY_EMAIL', entityType: 'User', entityId: reset.user.id } });
    return true;
  });

  if (!changed) return Response.json({ error: 'Liên kết đặt lại mật khẩu đã hết hạn hoặc không còn sử dụng được. Hãy yêu cầu liên kết mới.' }, { status: 400 });
  return Response.json({ message: 'Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.' });
}

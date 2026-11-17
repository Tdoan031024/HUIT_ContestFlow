import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { consumeRecoveryAttempt, getAppBaseUrl, hashRecoveryToken, isRecoveryEmailConfigured, sendPasswordResetEmail } from '@/lib/password-recovery';

export const runtime = 'nodejs';

const schema = z.object({ identifier: z.string().trim().min(1).max(255) });
const genericMessage = 'Nếu tài khoản hợp lệ, hướng dẫn khôi phục sẽ được gửi đến hộp thư đã cấu hình. Hãy kiểm tra cả thư mục thư rác.';

function maskEmail(email: string) {
  const separator = email.lastIndexOf('@');
  if (separator < 1) return 'địa chỉ đã đăng ký';
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const first = local[0];
  const last = local.length > 3 ? local.charAt(local.length - 1) : '';
  const hidden = '•'.repeat(Math.min(6, Math.max(3, local.length - first.length - last.length)));
  return `${first}${hidden}${last}@${domain}`;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Chưa nhận được thông tin tài khoản. Hãy quay lại trang đăng nhập và nhập tên đăng nhập hoặc email.' }, { status: 400 });

  const identifier = parsed.data.identifier.toLowerCase();
  const retryMs = consumeRecoveryAttempt(request, identifier);
  if (retryMs !== null) {
    const retryAfter = Math.max(1, Math.ceil(retryMs / 1000));
    return Response.json({ error: 'Bạn đã yêu cầu nhiều lần. Vui lòng đợi một lúc rồi thử lại.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  const baseUrl = getAppBaseUrl(request);
  if (!isRecoveryEmailConfigured() || !baseUrl) {
    return Response.json({ error: 'Tính năng khôi phục mật khẩu chưa được cấu hình. Vui lòng liên hệ Ban tổ chức.' }, { status: 503 });
  }

  const user = identifier.includes('@')
    ? await prisma.user.findFirst({ where: { email: identifier, isActive: true }, select: { id: true, email: true, fullName: true } })
    : await prisma.user.findFirst({ where: { username: identifier, isActive: true }, select: { id: true, email: true, fullName: true } });
  if (!user) return Response.json({ message: genericMessage });

  // Prefer the designated recovery inbox; SMTP_USER is the configured mail
  // account used for local setups where no separate recovery inbox is set.
  const configuredRecipient = process.env.HCF_ADMIN_RECOVERY_EMAIL?.trim()
    || process.env.SMTP_USER?.trim();
  const recipient = configuredRecipient || user.email;
  if (!recipient || !z.string().email().safeParse(recipient).success) {
    return Response.json({ error: 'Chưa có hộp thư nhận hướng dẫn khôi phục. Vui lòng liên hệ Ban tổ chức.' }, { status: 503 });
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashRecoveryToken(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, email: recipient, tokenHash, expiresAt } }),
  ]);

  const resetUrl = new URL('/reset-password', baseUrl);
  resetUrl.searchParams.set('token', token);
  try {
    await sendPasswordResetEmail({ to: recipient, fullName: user.fullName, resetUrl: resetUrl.toString() });
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } }).catch(() => {});
    console.error('[password-recovery] Email delivery failed.', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Chưa gửi được thư khôi phục. Vui lòng thử lại sau hoặc liên hệ Ban tổ chức.' }, { status: 503 });
  }

  return Response.json({ message: 'Đã gửi hướng dẫn đặt lại mật khẩu đến hộp thư nhận đã cấu hình.', sentTo: maskEmail(recipient) });
}

import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL_IP = 5;
const MAX_PER_IP = 20;
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashRecoveryToken(token: string) {
  return digest(token);
}

export function consumeRecoveryAttempt(request: Request, identifier: string) {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (!oldest) break;
    buckets.delete(oldest);
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',').map((part) => part.trim()).filter(Boolean).at(-1)
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
  const keys = [
    { key: `recovery-account:${digest(`${ip}\0${identifier.toLowerCase()}`)}`, limit: MAX_PER_EMAIL_IP },
    { key: `recovery-ip:${digest(ip)}`, limit: MAX_PER_IP },
  ];
  const blocked = keys.map(({ key, limit }) => ({ bucket: buckets.get(key), limit }))
    .filter(({ bucket, limit }) => bucket && bucket.count >= limit);
  if (blocked.length) return Math.max(...blocked.map(({ bucket }) => bucket!.resetAt - now));

  for (const { key } of keys) {
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
  return null;
}

export function isRecoveryEmailConfigured() {
  const port = Number(process.env.SMTP_PORT);
  return Boolean(
    process.env.SMTP_HOST?.trim()
    && Number.isInteger(port) && port > 0 && port <= 65535
    && process.env.SMTP_USER?.trim()
    && process.env.SMTP_PASS
    && process.env.SMTP_FROM?.trim(),
  );
}

export function getAppBaseUrl(request: Request) {
  const configured = process.env.HCF_APP_BASE_URL?.trim();
  const baseUrl = configured || (process.env.NODE_ENV === 'production' ? '' : new URL(request.url).origin);
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    const developmentOrigin = !configured && process.env.NODE_ENV !== 'production';
    if (url.protocol !== 'https:' && !developmentOrigin && !(configured && process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }: { to: string; fullName: string; resetUrl: string }) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
    throw new Error('SMTP delivery is not configured.');
  }

  const safeName = fullName.replace(/[<>]/g, '').trim() || 'bạn';
  const htmlName = safeName.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeUrl = resetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transporter.sendMail({
      from,
      to,
      subject: 'Đặt lại mật khẩu HUIT ContestFlow',
      text: `Xin chào ${safeName},\n\nBạn vừa yêu cầu đặt lại mật khẩu HUIT ContestFlow. Mở liên kết sau trong vòng 30 phút:\n${resetUrl}\n\nNếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.`,
      html: `<div style="font-family:Arial,sans-serif;color:#17384c;line-height:1.6"><h2>Đặt lại mật khẩu</h2><p>Xin chào ${htmlName},</p><p>Bạn vừa yêu cầu đặt lại mật khẩu HUIT ContestFlow.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0754a5;color:#fff;text-decoration:none;font-weight:700">Tạo mật khẩu mới</a></p><p>Liên kết có hiệu lực trong 30 phút và chỉ sử dụng được một lần.</p><p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p></div>`,
    });
  } finally {
    transporter.close();
  }
}

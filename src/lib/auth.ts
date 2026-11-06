import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'hcf_session';
const SESSION_HOURS = 12;
const REMEMBER_SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string;
  systemRole: 'ADMIN' | 'JUDGE';
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function digestToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string, rememberMe = false) {
  const token = randomBytes(32).toString('base64url');
  const lifetime = rememberMe
    ? REMEMBER_SESSION_DAYS * 24 * 60 * 60 * 1000
    : SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + lifetime);
  await prisma.session.create({ data: { tokenHash: digestToken(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(rememberMe ? { expires: expiresAt } : {}),
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: digestToken(token) } });
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: digestToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    jar.delete(COOKIE_NAME);
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    systemRole: session.user.systemRole,
  };
}

export function isAdmin(user: SessionUser | null): user is SessionUser {
  return user?.systemRole === 'ADMIN';
}

import { createHash } from 'node:crypto';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT_IP = 8;
const MAX_PER_IP = 40;
const MAX_BUCKETS = 20_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function clientIp(request: Request) {
  // In a proxy deployment, use the rightmost forwarded address added by the proxy.
  // Fall back to a single address header, then a shared unknown bucket.
  const forwarded = request.headers.get('x-forwarded-for');
  const forwardedIp = forwarded?.split(',').map((part) => part.trim()).filter(Boolean).at(-1);
  const realIp = request.headers.get('x-real-ip')?.trim();
  const value = forwardedIp || realIp;
  return value && value.length <= 128 ? value : 'unknown';
}

function keys(request: Request, identifier: string) {
  const ip = clientIp(request);
  return {
    ip: `ip:${digest(ip)}`,
    accountIp: `account-ip:${digest(`${ip}\0${identifier.toLowerCase()}`)}`,
  };
}

function getActiveBucket(key: string, now: number) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.delete(key);
    return null;
  }
  return bucket;
}

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

export function consumeLoginAttempt(request: Request, identifier: string) {
  const now = Date.now();
  prune(now);
  const bucketKeys = keys(request, identifier);
  const limits = [
    { bucket: getActiveBucket(bucketKeys.accountIp, now), maximum: MAX_PER_ACCOUNT_IP },
    { bucket: getActiveBucket(bucketKeys.ip, now), maximum: MAX_PER_IP },
  ];
  const blocked = limits.filter(({ bucket, maximum }) => bucket && bucket.count >= maximum);
  if (blocked.length) return Math.max(...blocked.map(({ bucket }) => bucket!.resetAt - now));
  for (const key of Object.values(bucketKeys)) {
    const bucket = getActiveBucket(key, now);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
  return null;
}

export function clearLoginFailures(request: Request, identifier: string) {
  const bucketKeys = keys(request, identifier);
  buckets.delete(bucketKeys.accountIp);
}

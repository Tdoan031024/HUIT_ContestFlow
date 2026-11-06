import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATABASE_CHECK_TIMEOUT_MS = 2_500;

export async function GET() {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Database health check timed out.')), DATABASE_CHECK_TIMEOUT_MS);
      }),
    ]);
    return Response.json({ status: 'ok', service: 'huit-contestflow', database: 'ok' });
  } catch {
    return Response.json(
      { status: 'error', service: 'huit-contestflow', database: 'unavailable' },
      { status: 503 },
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminCount = await prisma.user.count({ where: { systemRole: 'ADMIN' } });
    return Response.json({ setupRequired: adminCount === 0 });
  } catch {
    return Response.json({ error: 'Không kết nối được cơ sở dữ liệu. Kiểm tra MySQL và DATABASE_URL.' }, { status: 503 });
  }
}

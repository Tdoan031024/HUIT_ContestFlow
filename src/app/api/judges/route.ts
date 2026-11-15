import { z } from 'zod';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  username: z.string().trim().min(3).max(80).optional().or(z.literal('')),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  password: z.string().min(8).max(128),
}).refine((value) => Boolean(value.username || value.email), { message: 'Cần nhập username hoặc email.' });

function adminRequired(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return !user ? unauthorized() : user.systemRole !== 'ADMIN' ? Response.json({ error: 'Chỉ Admin được quản lý danh sách giám khảo.' }, { status: 403 }) : null;
}

export async function GET() {
  const user = await getCurrentUser();
  const denied = adminRequired(user);
  if (denied) return denied;

  const judges = await prisma.user.findMany({
    where: { systemRole: 'JUDGE' },
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    select: {
      id: true, fullName: true, username: true, email: true, isActive: true, createdAt: true,
      _count: { select: { assignments: true, scoreSheets: true, memberships: true } },
    },
  });
  return Response.json({ judges });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const denied = adminRequired(user);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Nhập họ tên, username hoặc email hợp lệ và mật khẩu có ít nhất 8 ký tự.' }, { status: 400 });

  const username = parsed.data.username?.trim().toLowerCase() || null;
  const email = parsed.data.email?.trim().toLowerCase() || null;
  if (username && email) {
    return Response.json({ error: 'Mỗi tài khoản dùng username hoặc email đăng nhập, không nhập cả hai.' }, { status: 400 });
  }

  try {
    const judge = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: parsed.data.fullName,
          username,
          email,
          passwordHash: await hashPassword(parsed.data.password),
          systemRole: 'JUDGE',
        },
        select: { id: true, fullName: true, username: true, email: true, isActive: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: { actorId: user!.id, action: 'JUDGE_CREATED', entityType: 'User', entityId: created.id, details: { username, email } },
      });
      return created;
    });
    return Response.json({ judge }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return Response.json({ error: 'Username hoặc email này đã được sử dụng.' }, { status: 409 });
    }
    console.error('Create judge failed:', error);
    return Response.json({ error: 'Không thể tạo tài khoản giám khảo.' }, { status: 500 });
  }
}

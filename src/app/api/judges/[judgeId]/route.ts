import { z } from 'zod';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ judgeId: string }> };

function adminRequired(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return !user ? unauthorized() : user.systemRole !== 'ADMIN' ? Response.json({ error: 'Chỉ Admin được quản lý danh sách giám khảo.' }, { status: 403 }) : null;
}

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  identifier: z.string().trim().min(3).max(255).optional(),
  password: z.union([z.string().min(8).max(128), z.literal('')]).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Không có thông tin cần cập nhật.' });

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  const denied = adminRequired(user);
  if (denied) return denied;
  const { judgeId } = await context.params;
  const judge = await prisma.user.findFirst({
    where: { id: judgeId, systemRole: 'JUDGE' },
    select: {
      id: true, fullName: true, username: true, email: true, isActive: true, createdAt: true,
      assignments: { select: { competition: { select: { id: true, name: true } } } },
      _count: { select: { assignments: true, scoreSheets: true, memberships: true } },
    },
  });
  if (!judge) return Response.json({ error: 'Không tìm thấy giám khảo.' }, { status: 404 });
  const competitions = [...new Map(judge.assignments.map(({ competition }) => [competition.id, competition])).values()];
  return Response.json({ judge: { ...judge, assignments: undefined, competitions } });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  const denied = adminRequired(user);
  if (denied) return denied;
  const { judgeId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const passwordError = parsed.error.issues.some((issue) => issue.path[0] === 'password');
    return Response.json({ error: passwordError ? 'Mật khẩu mới cần ít nhất 8 ký tự.' : 'Thông tin giám khảo không hợp lệ.' }, { status: 400 });
  }

  const { fullName, identifier, password, isActive } = parsed.data;
  let username: string | null | undefined;
  let email: string | null | undefined;
  if (identifier !== undefined) {
    if (identifier.includes('@')) {
      const validEmail = z.string().email().max(255).safeParse(identifier);
      if (!validEmail.success) return Response.json({ error: 'Email đăng nhập không hợp lệ.' }, { status: 400 });
      email = identifier.toLowerCase();
      username = null;
    } else {
      const validUsername = z.string().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/).safeParse(identifier);
      if (!validUsername.success) return Response.json({ error: 'Username chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.' }, { status: 400 });
      username = identifier.toLowerCase();
      email = null;
    }
  }

  const existing = await prisma.user.findFirst({ where: { id: judgeId, systemRole: 'JUDGE' }, select: { id: true, isActive: true } });
  if (!existing) return Response.json({ error: 'Không tìm thấy giám khảo.' }, { status: 404 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const judge = await tx.user.update({
        where: { id: judgeId },
        data: {
          ...(fullName !== undefined ? { fullName } : {}),
          ...(identifier !== undefined ? { username, email } : {}),
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
        select: { id: true, fullName: true, username: true, email: true, isActive: true, createdAt: true },
      });
      let revokedSessionCount = 0;
      if (password || isActive === false) {
        const removed = await tx.session.deleteMany({ where: { userId: judgeId } });
        revokedSessionCount = removed.count;
      }
      const action = isActive === false && existing.isActive ? 'JUDGE_DEACTIVATED' : isActive === true && !existing.isActive ? 'JUDGE_ACTIVATED' : 'JUDGE_UPDATED';
      await tx.auditEvent.create({
        data: {
          actorId: user!.id, action, entityType: 'User', entityId: judgeId,
          details: { updatedFields: Object.keys(parsed.data), passwordChanged: Boolean(password), revokedSessionCount },
        },
      });
      return judge;
    });
    return Response.json({ judge: updated });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return Response.json({ error: 'Username hoặc email này đã được sử dụng.' }, { status: 409 });
    }
    console.error('Update judge failed:', error);
    return Response.json({ error: 'Không thể cập nhật tài khoản giám khảo.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  const denied = adminRequired(user);
  if (denied) return denied;
  const { judgeId } = await context.params;

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const judge = await tx.user.findFirst({
        where: { id: judgeId, systemRole: 'JUDGE' },
        select: { id: true, fullName: true, username: true, email: true, _count: { select: { assignments: true, scoreSheets: true, memberships: true } } },
      });
      if (!judge) return { kind: 'missing' as const };
      if (judge._count.assignments || judge._count.scoreSheets || judge._count.memberships) return { kind: 'has-history' as const };
      await tx.user.delete({ where: { id: judgeId } });
      await tx.auditEvent.create({
        data: { actorId: user!.id, action: 'JUDGE_DELETED', entityType: 'User', entityId: judgeId, details: { fullName: judge.fullName, username: judge.username, email: judge.email } },
      });
      return { kind: 'deleted' as const };
    }, { isolationLevel: 'Serializable' });
    if (deleted.kind === 'missing') return Response.json({ error: 'Không tìm thấy giám khảo.' }, { status: 404 });
    if (deleted.kind === 'has-history') return Response.json({ error: 'Tài khoản đã có phân công hoặc lịch sử chấm; hãy ngừng hoạt động để giữ nguyên dữ liệu.' }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Delete judge failed:', error);
    return Response.json({ error: 'Không thể xóa tài khoản giám khảo.' }, { status: 500 });
  }
}

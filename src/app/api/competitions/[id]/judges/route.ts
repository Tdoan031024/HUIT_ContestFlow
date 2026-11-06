import { z } from 'zod';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({
  roundId: z.string().uuid(),
  entryId: z.string().uuid().optional().nullable(),
  fullName: z.string().trim().min(2).max(160).optional(),
  identifier: z.string().trim().min(3).max(255).optional(),
  email: z.string().trim().email().max(255).optional(),
  password: z.string().min(12).max(128).optional(),
  judgeId: z.string().uuid().optional(),
});
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin được quản lý danh sách giám khảo.' }, { status: 403 });
  const assignments = await prisma.judgeAssignment.findMany({
    where: { competitionId: id },
    orderBy: [{ round: { sequence: 'asc' } }, { user: { fullName: 'asc' } }],
    include: { user: { select: { id: true, fullName: true, username: true, email: true, isActive: true } }, round: { select: { id: true, name: true } }, entry: { select: { id: true, entryCode: true } } },
  });
  return Response.json({ assignments });
}

export async function POST(request: Request, context: Context) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(currentUser, id))) return Response.json({ error: 'Bạn không có quyền phân công giám khảo.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.judgeId && !(parsed.data.identifier || parsed.data.email))) {
    return Response.json({ error: 'Nhập username hoặc email giám khảo.' }, { status: 400 });
  }
  const round = await prisma.competitionRound.findFirst({ where: { id: parsed.data.roundId, competitionId: id }, select: { id: true } });
  if (!round) return Response.json({ error: 'Vòng thi không thuộc cuộc thi này.' }, { status: 400 });
  if (parsed.data.entryId) {
    const entry = await prisma.competitionEntry.findFirst({ where: { id: parsed.data.entryId, roundId: round.id, competitionId: id }, select: { id: true } });
    if (!entry) return Response.json({ error: 'Lượt thi không thuộc vòng này.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const identifier = (parsed.data.identifier ?? parsed.data.email)?.trim().toLowerCase();
      const isEmail = identifier?.includes('@') ?? false;
      let judge = parsed.data.judgeId
        ? await tx.user.findUnique({ where: { id: parsed.data.judgeId } })
        : isEmail
          ? await tx.user.findUnique({ where: { email: identifier! } })
          : await tx.user.findUnique({ where: { username: identifier! } });
      if (parsed.data.judgeId && !judge) throw new Error('Không tìm thấy tài khoản giám khảo.');
      if (!judge) {
        if (!parsed.data.fullName) throw new Error('Nhập họ tên cho tài khoản giám khảo mới.');
        if (!parsed.data.password) throw new Error('Cần đặt mật khẩu ban đầu tối thiểu 12 ký tự cho tài khoản mới.');
        judge = await tx.user.create({ data: {
          fullName: parsed.data.fullName!, email: isEmail ? identifier! : null, username: isEmail ? null : identifier!,
          passwordHash: await hashPassword(parsed.data.password), systemRole: 'JUDGE',
        } });
      }
      if (judge.systemRole !== 'JUDGE') throw new Error('Không thể phân công tài khoản Admin làm giám khảo.');
      await tx.competitionMember.upsert({
        where: { competitionId_userId: { competitionId: id, userId: judge.id } },
        create: { competitionId: id, userId: judge.id },
        update: {},
      });
      const entryId = parsed.data.entryId ?? null;
      const existingAssignments = await tx.judgeAssignment.findMany({ where: { competitionId: id, roundId: round.id, userId: judge.id }, select: { entryId: true } });
      if (existingAssignments.some((item) => item.entryId === null || entryId === null || item.entryId === entryId)) throw new Error('Giám khảo đã được phân công vào phạm vi này.');
      const assignment = await tx.judgeAssignment.create({ data: {
        competitionId: id, roundId: round.id, userId: judge.id, entryId,
      } });
      await tx.auditEvent.create({ data: { competitionId: id, actorId: currentUser.id, action: 'JUDGE_ASSIGNED', entityType: 'JudgeAssignment', entityId: assignment.id, details: { judgeId: judge.id, roundId: round.id, entryId } } });
      return { assignment, judge };
    });
    return Response.json({ assignment: result.assignment, judge: { id: result.judge.id, fullName: result.judge.fullName, username: result.judge.username, email: result.judge.email } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể phân công giám khảo.';
    return Response.json({ error: message }, { status: 409 });
  }
}

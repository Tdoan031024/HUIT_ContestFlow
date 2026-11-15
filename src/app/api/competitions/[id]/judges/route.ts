import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { ensureCompetitionWorkspace } from '@/lib/competition-workspace-data';

export const runtime = 'nodejs';
const schema = z.union([
  z.object({ judgeId: z.string().uuid() }).strict(),
  z.object({ judgeIds: z.array(z.string().uuid()).min(1).max(100) }).strict(),
]);
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin được quản lý danh sách giám khảo.' }, { status: 403 });
  const workspace = await ensureCompetitionWorkspace(id);
  if (!workspace) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const assignments = await prisma.judgeAssignment.findMany({
    where: { competitionId: id },
    orderBy: { user: { fullName: 'asc' } },
    include: { user: { select: { id: true, fullName: true, username: true, email: true, isActive: true } } },
  });
  return Response.json({ assignments });
}

export async function POST(request: Request, context: Context) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(currentUser, id))) return Response.json({ error: 'Bạn không có quyền phân công giám khảo.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Chọn giám khảo trong danh sách tài khoản đã tạo.' }, { status: 400 });
  const judgeIds = 'judgeIds' in parsed.data ? parsed.data.judgeIds : [parsed.data.judgeId];
  if (new Set(judgeIds).size !== judgeIds.length) return Response.json({ error: 'Danh sách có giám khảo bị chọn trùng.' }, { status: 400 });
  const round = await ensureCompetitionWorkspace(id);
  if (!round) return Response.json({ error: 'Không tìm thấy khu vực chấm của cuộc thi.' }, { status: 400 });
  if (round.status === 'LIVE' || round.status === 'COMPLETED' || (round.session && round.session.state !== 'IDLE') || round._count.scoreSheets > 0 || round._count.snapshots > 0) {
    return Response.json({ error: 'Phân công đã khóa sau khi bắt đầu điều phối, chấm điểm hoặc khóa kết quả.' }, { status: 409 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const foundJudges = await tx.user.findMany({ where: { id: { in: judgeIds } } });
      if (foundJudges.length !== judgeIds.length) throw new Error('Không tìm thấy một hoặc nhiều tài khoản giám khảo đã chọn.');
      const judges = judgeIds.map((judgeId) => foundJudges.find((judge) => judge.id === judgeId)!);
      const nonJudges = judges.filter((judge) => judge.systemRole !== 'JUDGE');
      if (nonJudges.length) throw new Error('Chỉ có thể thêm tài khoản giám khảo vào cuộc thi.');
      if (judges.some((judge) => !judge.isActive)) throw new Error('Một hoặc nhiều tài khoản giám khảo đang bị khóa.');
      const existingAssignments = await tx.judgeAssignment.findMany({ where: { competitionId: id, userId: { in: judgeIds } }, select: { userId: true } });
      if (existingAssignments.length) throw new Error('Một hoặc nhiều giám khảo đã có trong cuộc thi. Hãy tải lại danh sách rồi thử lại.');

      const assignments = [];
      for (const judge of judges) {
        await tx.competitionMember.upsert({
          where: { competitionId_userId: { competitionId: id, userId: judge.id } },
          create: { competitionId: id, userId: judge.id },
          update: {},
        });
        const assignment = await tx.judgeAssignment.create({ data: {
          competitionId: id, roundId: round.id, userId: judge.id, entryId: null,
        } });
        await tx.auditEvent.create({ data: { competitionId: id, actorId: currentUser.id, action: 'JUDGE_ASSIGNED', entityType: 'JudgeAssignment', entityId: assignment.id, details: { judgeId: judge.id, roundId: round.id, scope: 'COMPETITION' } } });
        assignments.push(assignment);
      }
      return { assignments, judges };
    });
    const judges = result.judges.map(({ id: judgeId, fullName, username, email }) => ({ id: judgeId, fullName, username, email }));
    return Response.json({ assignment: result.assignments[0], judge: judges[0], assignments: result.assignments, judges }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể phân công giám khảo.';
    return Response.json({ error: message }, { status: 409 });
  }
}

import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { ensureCompetitionWorkspace } from '@/lib/competition-workspace-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canViewCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền xem cuộc thi.' }, { status: 403 });
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin được xem trạng thái toàn bộ phiếu chấm.' }, { status: 403 });
  const workspace = await ensureCompetitionWorkspace(id);
  if (!workspace) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const roundId = workspace.id;
  const round = await prisma.competitionRound.findUnique({ where: { id: roundId }, select: { id: true, name: true, requiredJudgeCount: true, entries: { where: { status: 'ACTIVE' }, orderBy: { sequence: 'asc' }, include: { contestant: true } } } });
  if (!round) return Response.json({ error: 'Chưa có dữ liệu chấm cho cuộc thi.' }, { status: 404 });
  const [assignments, sheets] = await Promise.all([
    prisma.judgeAssignment.findMany({ where: { roundId, user: { isActive: true, systemRole: 'JUDGE' } }, include: { user: { select: { id: true, fullName: true, email: true } } } }),
    prisma.scoreSheet.findMany({ where: { roundId }, include: { judge: { select: { id: true, fullName: true, email: true } }, entry: { select: { id: true, entryCode: true } } } }),
  ]);
  const rows = round.entries.map((entry) => {
    const eligible = [...new Map(assignments.map((assignment) => [assignment.userId, assignment])).values()];
    const related = sheets.filter((sheet) => sheet.entryId === entry.id);
    const eligibleIds = new Set(eligible.map((assignment) => assignment.userId));
    return {
      entry: { id: entry.id, code: entry.entryCode, name: entry.contestant.displayName },
      requiredCount: round.requiredJudgeCount,
      assignedCount: eligibleIds.size,
      submittedCount: related.filter((sheet) => sheet.status === 'SUBMITTED' && eligibleIds.has(sheet.judgeId)).length,
      judges: eligible.map((assignment) => {
        const sheet = related.find((item) => item.judgeId === assignment.userId);
        return { id: assignment.user.id, name: assignment.user.fullName, email: assignment.user.email, status: sheet?.status ?? 'MISSING', totalScore: sheet?.totalScore === null || !sheet ? null : Number(sheet.totalScore), scoreSheetId: sheet?.id ?? null, updatedAt: sheet?.updatedAt.toISOString() ?? null, submittedAt: sheet?.submittedAt?.toISOString() ?? null };
      }),
    };
  });
  return Response.json({ round: { id: round.id, name: round.name, requiredJudgeCount: round.requiredJudgeCount }, rows });
}

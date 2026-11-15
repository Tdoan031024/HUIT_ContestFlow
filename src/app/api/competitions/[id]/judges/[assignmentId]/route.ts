import { randomBytes } from 'node:crypto';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; assignmentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();
  const { id, assignmentId } = await context.params;
  if (!(await canManageCompetition(currentUser, id))) return Response.json({ error: 'Bạn không có quyền đặt lại mật khẩu giám khảo.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action !== 'reset-password') return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
  const assignment = await prisma.judgeAssignment.findFirst({ where: { id: assignmentId, competitionId: id } });
  if (!assignment) return Response.json({ error: 'Không tìm thấy phân công giám khảo.' }, { status: 404 });
  const targetUser = await prisma.user.findUnique({ where: { id: assignment.userId }, select: { systemRole: true } });
  if (!targetUser || targetUser.systemRole !== 'JUDGE') return Response.json({ error: 'Chỉ có thể đặt lại mật khẩu cho tài khoản giám khảo.' }, { status: 409 });

  const temporaryPassword = randomBytes(18).toString('base64url');
  const sessionCount = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: assignment.userId }, data: { passwordHash: await hashPassword(temporaryPassword) } });
    const removedSessions = await tx.session.deleteMany({ where: { userId: assignment.userId } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: currentUser.id, action: 'JUDGE_PASSWORD_RESET', entityType: 'User', entityId: assignment.userId, details: { roundId: assignment.roundId, revokedSessionCount: removedSessions.count } } });
    return removedSessions.count;
  });
  return Response.json({ temporaryPassword, revokedSessionCount: sessionCount });
}

export async function DELETE(_request: Request, context: Context) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();
  const { id, assignmentId } = await context.params;
  if (!(await canManageCompetition(currentUser, id))) return Response.json({ error: 'Bạn không có quyền gỡ giám khảo.' }, { status: 403 });
  const assignment = await prisma.judgeAssignment.findFirst({ where: { id: assignmentId, competitionId: id } });
  if (!assignment) return Response.json({ error: 'Không tìm thấy phân công.' }, { status: 404 });
  const judgeAssignments = await prisma.judgeAssignment.findMany({ where: { competitionId: id, userId: assignment.userId }, select: { id: true, roundId: true } });
  const roundIds = [...new Set(judgeAssignments.map((item) => item.roundId))];
  const rounds = await prisma.competitionRound.findMany({ where: { id: { in: roundIds } }, select: { id: true, status: true, session: { select: { state: true } }, _count: { select: { scoreSheets: true, snapshots: true } } } });
  if (rounds.length !== roundIds.length || rounds.some((round) => round.status === 'LIVE' || round.status === 'COMPLETED' || (round.session && round.session.state !== 'IDLE') || round._count.scoreSheets > 0 || round._count.snapshots > 0)) {
    return Response.json({ error: 'Không thể gỡ phân công sau khi hoạt động chấm đã bắt đầu hoặc có phiếu.' }, { status: 409 });
  }
  const removed = await prisma.$transaction(async (tx) => {
    const result = await tx.judgeAssignment.deleteMany({ where: { competitionId: id, userId: assignment.userId } });
    const remaining = await tx.judgeAssignment.count({ where: { competitionId: id, userId: assignment.userId } });
    if (!remaining) await tx.competitionMember.deleteMany({ where: { competitionId: id, userId: assignment.userId } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: currentUser.id, action: 'JUDGE_UNASSIGNED', entityType: 'JudgeAssignment', entityId: assignment.id, details: { userId: assignment.userId, roundIds, removedAssignmentCount: result.count } } });
    return result.count;
  });
  return Response.json({ ok: true, removedAssignments: removed });
}

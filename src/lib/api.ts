import { prisma } from '@/lib/prisma';
import type { SessionUser } from '@/lib/auth';

export function unauthorized(message = 'Vui lòng đăng nhập để tiếp tục.') {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Bạn không có quyền thực hiện thao tác này.') {
  return Response.json({ error: message }, { status: 403 });
}

export function validationError(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function canViewCompetition(user: SessionUser, competitionId: string) {
  if (user.systemRole === 'ADMIN') return true;
  return Boolean(await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId: user.id } },
    select: { id: true },
  }));
}

export async function canManageCompetition(user: SessionUser, _competitionId: string) {
  return user.systemRole === 'ADMIN';
}

export async function isAssignedJudge(user: SessionUser, roundId: string, entryId?: string) {
  if (user.systemRole !== 'JUDGE') return false;
  const assignments = await prisma.judgeAssignment.findMany({
    where: { userId: user.id, roundId },
    select: { entryId: true },
  });
  return assignments.some((assignment) => assignment.entryId === null || assignment.entryId === entryId);
}

export function slugify(value: string) {
  const ascii = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 150) || 'cuoc-thi';
}

export async function writeAudit(input: {
  competitionId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
}) {
  return prisma.auditEvent.create({
    data: {
      competitionId: input.competitionId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: input.details as never,
    },
  });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Đã xảy ra lỗi ngoài dự kiến.';
}

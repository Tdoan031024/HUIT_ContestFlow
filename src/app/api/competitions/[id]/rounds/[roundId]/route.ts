import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  anonymous: z.boolean().optional(),
  requiredJudgeCount: z.number().int().min(1).max(30).optional(),
  allowAdvanceWithGaps: z.boolean().optional(),
  publishScores: z.boolean().optional(),
  aggregateMethod: z.enum(['AVERAGE', 'MEDIAN']).optional(),
  tieBreakMethod: z.enum(['TOTAL_SCORE', 'CRITERIA_PRIORITY']).optional(),
  roundingPrecision: z.number().int().min(0).max(4).optional(),
}).strict();
type Context = { params: Promise<{ id: string; roundId: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, roundId } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền chỉnh sửa vòng thi.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Thông tin vòng thi không hợp lệ.' }, { status: 400 });
  const current = await prisma.competitionRound.findFirst({
    where: { id: roundId, competitionId: id },
    select: { status: true, anonymous: true, requiredJudgeCount: true, allowAdvanceWithGaps: true, publishScores: true, aggregateMethod: true, tieBreakMethod: true, roundingPrecision: true, session: { select: { state: true } }, _count: { select: { scoreSheets: true, snapshots: true } } },
  });
  if (!current) return Response.json({ error: 'Không tìm thấy vòng thi.' }, { status: 404 });
  const scoringPolicyChanged = (parsed.data.requiredJudgeCount !== undefined && parsed.data.requiredJudgeCount !== current.requiredJudgeCount)
    || (parsed.data.anonymous !== undefined && parsed.data.anonymous !== current.anonymous)
    || (parsed.data.allowAdvanceWithGaps !== undefined && parsed.data.allowAdvanceWithGaps !== current.allowAdvanceWithGaps)
    || (parsed.data.publishScores !== undefined && parsed.data.publishScores !== current.publishScores)
    || (parsed.data.aggregateMethod !== undefined && parsed.data.aggregateMethod !== current.aggregateMethod)
    || (parsed.data.tieBreakMethod !== undefined && parsed.data.tieBreakMethod !== current.tieBreakMethod)
    || (parsed.data.roundingPrecision !== undefined && parsed.data.roundingPrecision !== current.roundingPrecision);
  if (scoringPolicyChanged && (current._count.scoreSheets > 0 || current._count.snapshots > 0 || current.status === 'LIVE' || current.status === 'COMPLETED' || (current.session && current.session.state !== 'IDLE'))) {
    return Response.json({ error: 'Không thể đổi quy chế chấm, số phiếu, ẩn danh hoặc chính sách công bố sau khi vòng đã bắt đầu. Tạo phiên bản quy chế mới trước khi chấm vòng khác.' }, { status: 409 });
  }
  const round = await prisma.competitionRound.update({ where: { id: roundId }, data: parsed.data });
  await prisma.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'ROUND_UPDATED', entityType: 'CompetitionRound', entityId: roundId, details: parsed.data as never } });
  return Response.json({ round });
}

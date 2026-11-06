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
  status: z.enum(['DRAFT', 'READY', 'LIVE', 'COMPLETED']).optional(),
});
type Context = { params: Promise<{ id: string; roundId: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, roundId } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền chỉnh sửa vòng thi.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Thông tin vòng thi không hợp lệ.' }, { status: 400 });
  const round = await prisma.competitionRound.updateMany({ where: { id: roundId, competitionId: id }, data: parsed.data });
  if (!round.count) return Response.json({ error: 'Không tìm thấy vòng thi.' }, { status: 404 });
  await prisma.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'ROUND_UPDATED', entityType: 'CompetitionRound', entityId: roundId, details: parsed.data as never } });
  return Response.json({ round: await prisma.competitionRound.findUnique({ where: { id: roundId } }) });
}

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const criterionSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().default(''),
  minimum: z.number().finite(),
  maximum: z.number().finite(),
  step: z.number().finite().positive(),
  weight: z.number().finite().positive(),
  commentRequired: z.boolean().default(false),
});
const schema = z.object({ roundId: z.string().uuid(), name: z.string().trim().min(2).max(160), criteria: z.array(criterionSchema).min(1).max(40) });
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canViewCompetition(user, id))) return Response.json({ error: 'Không tìm thấy cuộc thi hoặc bạn không có quyền xem.' }, { status: 404 });
  const roundId = new URL(request.url).searchParams.get('roundId');
  if (!roundId) return Response.json({ error: 'Thiếu mã vòng thi.' }, { status: 400 });
  const rubrics = await prisma.rubric.findMany({
    where: { competitionId: id, roundId },
    include: { versions: { orderBy: { version: 'desc' }, include: { criteria: { orderBy: { sequence: 'asc' } } } } },
  });
  const round = await prisma.competitionRound.findFirst({ where: { id: roundId, competitionId: id }, select: { activeRubricVersionId: true } });
  return Response.json({ rubrics, activeRubricVersionId: round?.activeRubricVersionId ?? null });
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền chỉnh sửa tiêu chí chấm.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Kiểm tra lại rubric: cần có ít nhất một tiêu chí hợp lệ.' }, { status: 400 });
  for (const criterion of parsed.data.criteria) {
    const interval = criterion.maximum - criterion.minimum;
    const steps = interval / criterion.step;
    if (criterion.maximum <= criterion.minimum || steps > 1000 || Math.abs(steps - Math.round(steps)) > 1e-7) {
      return Response.json({ error: `Khoảng điểm hoặc bước điểm của “${criterion.name}” không hợp lệ.` }, { status: 400 });
    }
  }
  const round = await prisma.competitionRound.findFirst({ where: { id: parsed.data.roundId, competitionId: id }, select: { id: true } });
  if (!round) return Response.json({ error: 'Vòng thi không thuộc cuộc thi này.' }, { status: 400 });
  const scores = await prisma.scoreSheet.count({ where: { roundId: round.id } });
  if (scores) return Response.json({ error: 'Vòng này đã có phiếu điểm. Hãy giữ phiên bản rubric hiện tại để bảo toàn tính nhất quán của kết quả.' }, { status: 409 });

  const activeRubric = await prisma.rubric.findFirst({ where: { competitionId: id, roundId: round.id }, orderBy: { createdAt: 'asc' } });
  const rubric = activeRubric ?? await prisma.rubric.create({ data: { competitionId: id, roundId: round.id, name: parsed.data.name } });
  const nextVersion = (await prisma.rubricVersion.aggregate({ where: { rubricId: rubric.id }, _max: { version: true } }))._max.version ?? 0;
  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.rubricVersion.create({ data: {
      rubricId: rubric.id,
      version: nextVersion + 1,
      name: parsed.data.name,
      criteria: { create: parsed.data.criteria.map((criterion, index) => ({
        ...criterion, description: criterion.description || null, sequence: index + 1,
      })) },
    } });
    await tx.competitionRound.update({ where: { id: round.id }, data: { activeRubricVersionId: created.id } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'RUBRIC_VERSION_ACTIVATED', entityType: 'RubricVersion', entityId: created.id, details: { version: nextVersion + 1, criteriaCount: parsed.data.criteria.length } } });
    return tx.rubricVersion.findUniqueOrThrow({ where: { id: created.id }, include: { criteria: { orderBy: { sequence: 'asc' } } } });
  });
  return Response.json({ version }, { status: 201 });
}

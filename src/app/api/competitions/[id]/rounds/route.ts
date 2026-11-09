import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({ name: z.string().trim().min(2).max(160) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền quản lý vòng thi.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Tên vòng thi không hợp lệ.' }, { status: 400 });
  const competition = await prisma.competition.findUnique({ where: { id }, select: { id: true } });
  if (!competition) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const sequence = (await prisma.competitionRound.aggregate({ where: { competitionId: id }, _max: { sequence: true } }))._max.sequence ?? 0;
  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.competitionRound.create({ data: { competitionId: id, name: parsed.data.name, sequence: sequence + 1, anonymous: true } });
    const rubric = await tx.rubric.create({ data: {
      competitionId: id,
      roundId: created.id,
      name: 'Rubric mặc định',
      versions: { create: { version: 1, name: 'Phiên bản 1', criteria: { create: [
        { name: 'Chất lượng nội dung', minimum: 0, maximum: 10, step: 0.5, weight: 1, sequence: 1 },
        { name: 'Trình bày', minimum: 0, maximum: 10, step: 0.5, weight: 1, sequence: 2 },
      ] } } },
    } });
    const version = await tx.rubricVersion.findFirstOrThrow({ where: { rubricId: rubric.id, version: 1 }, select: { id: true } });
    await tx.competitionRound.update({ where: { id: created.id }, data: { activeRubricVersionId: version.id } });
    await tx.competitionSession.create({ data: { roundId: created.id } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'ROUND_CREATED', entityType: 'CompetitionRound', entityId: created.id } });
    return created;
  });
  return Response.json({ round }, { status: 201 });
}

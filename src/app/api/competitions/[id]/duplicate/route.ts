import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, errorMessage, slugify, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ name: z.string().trim().min(3).max(180) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền nhân bản cuộc thi này.' }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Tên cuộc thi mới cần từ 3 đến 180 ký tự.' }, { status: 400 });
  const source = await prisma.competition.findUnique({
    where: { id },
    include: { rounds: { orderBy: { sequence: 'asc' }, include: { activeRubricVersion: { include: { criteria: { orderBy: { sequence: 'asc' } } } } } } },
  });
  if (!source) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });

  try {
    const competition = await prisma.$transaction(async (tx) => {
      const copy = await tx.competition.create({ data: {
        name: parsed.data.name,
        slug: `${slugify(parsed.data.name)}-${Date.now().toString(36)}`,
        description: source.description,
        organizingUnit: source.organizingUnit,
        location: source.location,
        modality: source.modality,
        status: 'DRAFT',
        startsAt: null,
        endsAt: null,
      } });

      for (const original of source.rounds) {
        const round = await tx.competitionRound.create({ data: {
          competitionId: copy.id,
          name: original.name,
          sequence: original.sequence,
          status: 'DRAFT',
          anonymous: original.anonymous,
          requiredJudgeCount: original.requiredJudgeCount,
          allowAdvanceWithGaps: original.allowAdvanceWithGaps,
          publishScores: original.publishScores,
          aggregateMethod: original.aggregateMethod,
          tieBreakMethod: original.tieBreakMethod,
          roundingPrecision: original.roundingPrecision,
        } });
        const criteria = original.activeRubricVersion?.criteria ?? [];
        const rubric = await tx.rubric.create({ data: {
          competitionId: copy.id,
          roundId: round.id,
          name: original.activeRubricVersion?.name ?? 'Rubric chấm điểm',
          versions: { create: {
            version: 1,
            name: original.activeRubricVersion?.name ?? 'Phiên bản 1',
            description: original.activeRubricVersion?.description ?? null,
            criteria: { create: criteria.map((criterion) => ({
              name: criterion.name,
              description: criterion.description,
              minimum: criterion.minimum,
              maximum: criterion.maximum,
              step: criterion.step,
              weight: criterion.weight,
              commentRequired: criterion.commentRequired,
              sequence: criterion.sequence,
            })) },
          } },
        } });
        const version = await tx.rubricVersion.findFirstOrThrow({ where: { rubricId: rubric.id }, select: { id: true } });
        await tx.competitionRound.update({ where: { id: round.id }, data: { activeRubricVersionId: version.id } });
        await tx.competitionSession.create({ data: { roundId: round.id } });
      }

      await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'COMPETITION_DUPLICATED', entityType: 'Competition', entityId: copy.id, details: { newCompetitionId: copy.id, roundCount: source.rounds.length } } });
      await tx.auditEvent.create({ data: { competitionId: copy.id, actorId: user.id, action: 'COMPETITION_CREATED_FROM_COPY', entityType: 'Competition', entityId: copy.id, details: { sourceCompetitionId: id } } });
      return copy;
    });
    return Response.json({ competition }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

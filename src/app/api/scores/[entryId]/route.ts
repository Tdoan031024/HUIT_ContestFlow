import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { isAssignedJudge, unauthorized, writeAudit } from '@/lib/api';
import { validateScoreInput, weightedScore, type ScoreInput } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const saveSchema = z.object({
  details: z.array(z.object({ criterionId: z.string().uuid(), score: z.number().finite(), comment: z.string().max(5000).optional().nullable() })).max(40),
  submit: z.boolean().optional().default(false),
});
type Context = { params: Promise<{ entryId: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { entryId } = await context.params;
  const entry = await prisma.competitionEntry.findUnique({ where: { id: entryId }, include: { round: true, contestant: true } });
  if (!entry) return Response.json({ error: 'Không tìm thấy lượt thi.' }, { status: 404 });
  if (!(await isAssignedJudge(user, entry.roundId, entry.id))) return Response.json({ error: 'Bạn chưa được phân công chấm lượt thi này.' }, { status: 403 });
  const sheet = await prisma.scoreSheet.findUnique({
    where: { entryId_judgeId: { entryId, judgeId: user.id } },
    include: { rubricVersion: { include: { criteria: { orderBy: { sequence: 'asc' } } } }, details: true },
  });
  const pinnedSheet = sheet ?? await prisma.scoreSheet.findFirst({ where: { entryId }, orderBy: { createdAt: 'asc' }, select: { rubricVersionId: true } });
  const rubricVersion = sheet?.rubricVersion ?? (pinnedSheet?.rubricVersionId
    ? await prisma.rubricVersion.findUnique({ where: { id: pinnedSheet.rubricVersionId }, include: { criteria: { orderBy: { sequence: 'asc' } } } })
    : entry.round.activeRubricVersionId
    ? await prisma.rubricVersion.findUnique({ where: { id: entry.round.activeRubricVersionId }, include: { criteria: { orderBy: { sequence: 'asc' } } } })
    : null);
  if (!rubricVersion) return Response.json({ error: 'Vòng thi chưa có rubric được kích hoạt.' }, { status: 409 });
  return Response.json({
    entry: {
      id: entry.id, code: entry.entryCode, title: entry.title,
      displayName: entry.round.anonymous ? 'Danh tính được ẩn' : entry.contestant.displayName,
      organization: entry.round.anonymous ? null : entry.contestant.organization,
    },
    round: { id: entry.round.id, name: entry.round.name, status: entry.round.status, anonymous: entry.round.anonymous, roundingPrecision: entry.round.roundingPrecision },
    rubric: rubricVersion,
    scoreSheet: sheet ? { id: sheet.id, status: sheet.status, totalScore: sheet.totalScore, submittedAt: sheet.submittedAt, details: sheet.details } : null,
  });
}

export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { entryId } = await context.params;
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Dữ liệu phiếu chấm không hợp lệ.' }, { status: 400 });
  const entry = await prisma.competitionEntry.findUnique({ where: { id: entryId }, include: { round: true } });
  if (!entry) return Response.json({ error: 'Không tìm thấy lượt thi.' }, { status: 404 });
  if (!(await isAssignedJudge(user, entry.roundId, entry.id))) return Response.json({ error: 'Bạn chưa được phân công chấm lượt thi này.' }, { status: 403 });
  const existing = await prisma.scoreSheet.findUnique({ where: { entryId_judgeId: { entryId, judgeId: user.id } }, select: { id: true, status: true, rubricVersionId: true } });
  if (existing?.status === 'SUBMITTED') return Response.json({ error: 'Phiếu đã nộp. Chỉ Admin mới có thể mở lại phiếu.' }, { status: 409 });
  if (entry.round.status === 'COMPLETED' && !existing) return Response.json({ error: 'Vòng thi đã kết thúc; cần Admin mở lại phiếu trước khi tạo điểm mới.' }, { status: 409 });

  const assignment = await prisma.judgeAssignment.findFirst({ where: { userId: user.id, roundId: entry.roundId } });
  const session = await prisma.competitionSession.findUnique({ where: { roundId: entry.roundId }, select: { currentEntryId: true, state: true } });
  if (assignment?.entryId === null && existing?.status !== 'REOPENED' && session?.currentEntryId !== entryId) {
    return Response.json({ error: 'Bạn chỉ được bắt đầu chấm thí sinh đang được điều phối trực tiếp.' }, { status: 409 });
  }
  if (assignment?.entryId === null && !existing && session?.state !== 'LIVE') {
    return Response.json({ error: 'Phiên chấm hiện chưa được bắt đầu.' }, { status: 409 });
  }

  const pinnedSheet = existing ?? await prisma.scoreSheet.findFirst({ where: { entryId }, orderBy: { createdAt: 'asc' }, select: { rubricVersionId: true } });
  const rubricVersionId = pinnedSheet?.rubricVersionId ?? entry.round.activeRubricVersionId;
  if (!rubricVersionId) return Response.json({ error: 'Vòng thi chưa có rubric được kích hoạt.' }, { status: 409 });
  const rubricVersion = await prisma.rubricVersion.findUnique({ where: { id: rubricVersionId }, include: { criteria: true } });
  if (!rubricVersion) return Response.json({ error: 'Không tìm thấy phiên bản rubric.' }, { status: 409 });
  const details: ScoreInput[] = parsed.data.details;
  const validationMessage = validateScoreInput(rubricVersion.criteria.map((criterion) => ({
    id: criterion.id, minimum: Number(criterion.minimum), maximum: Number(criterion.maximum), step: Number(criterion.step), weight: Number(criterion.weight), commentRequired: criterion.commentRequired,
  })), details, parsed.data.submit);
  if (validationMessage) return Response.json({ error: validationMessage }, { status: 400 });
  const totalScore = weightedScore(rubricVersion.criteria.map((criterion) => ({
    id: criterion.id, minimum: Number(criterion.minimum), maximum: Number(criterion.maximum), step: Number(criterion.step), weight: Number(criterion.weight), commentRequired: criterion.commentRequired,
  })), details);

  try {
    const sheet = await prisma.$transaction(async (tx) => {
      const saved = await tx.scoreSheet.upsert({
        where: { entryId_judgeId: { entryId, judgeId: user.id } },
        create: { competitionId: entry.competitionId, roundId: entry.roundId, entryId, judgeId: user.id, rubricVersionId, status: 'DRAFT' },
        update: {},
      });
      if (saved.status === 'SUBMITTED') throw new Error('Phiếu đã được nộp trước đó.');
      const previousDetails = await tx.scoreDetail.findMany({ where: { scoreSheetId: saved.id }, select: { criterionId: true, score: true, comment: true } });
      await tx.scoreDetail.deleteMany({ where: { scoreSheetId: saved.id } });
      if (details.length) await tx.scoreDetail.createMany({ data: details.map((detail) => ({
        scoreSheetId: saved.id, criterionId: detail.criterionId, score: detail.score, comment: detail.comment?.trim() || null,
      })) });
      if (parsed.data.submit) {
        const changed = await tx.scoreSheet.updateMany({
          where: { id: saved.id, status: { in: ['DRAFT', 'REOPENED'] } },
          data: { status: 'SUBMITTED', totalScore, submittedAt: new Date() },
        });
        if (!changed.count) throw new Error('Phiếu đã được nộp trước đó.');
        await tx.auditEvent.create({ data: { competitionId: entry.competitionId, actorId: user.id, action: 'SCORE_SUBMITTED', entityType: 'ScoreSheet', entityId: saved.id, details: { entryId, totalScore, before: previousDetails.map((detail) => ({ ...detail, score: Number(detail.score) })), after: details } } });
      } else {
        await tx.scoreSheet.update({ where: { id: saved.id }, data: { status: 'DRAFT', totalScore, submittedAt: null } });
        await tx.auditEvent.create({ data: { competitionId: entry.competitionId, actorId: user.id, action: 'SCORE_DRAFT_SAVED', entityType: 'ScoreSheet', entityId: saved.id, details: { entryId, totalScore, before: previousDetails.map((detail) => ({ ...detail, score: Number(detail.score) })), after: details } } });
      }
      return tx.scoreSheet.findUniqueOrThrow({ where: { id: saved.id }, include: { details: true } });
    });
    return Response.json({ scoreSheet: sheet });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('nộp') ? error.message : 'Không thể lưu phiếu điểm. Thử tải lại trang.';
    return Response.json({ error: message }, { status: 409 });
  }
}

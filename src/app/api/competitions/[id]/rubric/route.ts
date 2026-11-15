import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { ensureCompetitionWorkspace } from '@/lib/competition-workspace-data';
import { isSafeScoreDecimal, rubricCriterionSchema } from '@/lib/scoring';

export const runtime = 'nodejs';
const DEFAULT_SCORING_CONFIG = { resultMinimum: 0, resultMaximum: 10 };
const criterionSchema = z.object({
  clientKey: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).default(''),
  type: z.enum(['NUMERIC', 'RATING', 'PASS_FAIL', 'CHECKLIST', 'BONUS_PENALTY']), config: z.unknown(),
  required: z.boolean().default(true), weight: z.number().finite().positive().refine(isSafeScoreDecimal).default(1), commentRequired: z.boolean().default(false),
});
const saveSchema = z.object({
  name: z.string().trim().min(2).max(160).default('Bộ tiêu chí chấm'),
  criteria: z.array(criterionSchema).max(40),
}).strict();
type Context = { params: Promise<{ id: string }> };

function validateDraft(input: z.infer<typeof saveSchema>) {
  if (new Set(input.criteria.map((criterion) => criterion.clientKey)).size !== input.criteria.length) return 'Có tiêu chí bị lặp. Hãy tải lại trang rồi thử lại.';
  for (const criterion of input.criteria) {
    const parsed = rubricCriterionSchema.safeParse({ type: criterion.type, config: criterion.config });
    if (!parsed.success) return `Thông tin chấm cho “${criterion.name}” còn thiếu hoặc chưa đúng. Hãy kiểm tra lại mục này.`;
    if (criterion.type === 'NUMERIC' || criterion.type === 'BONUS_PENALTY') {
      const config = parsed.data.config as { minimum: number; maximum: number; step: number };
      const steps = (config.maximum - config.minimum) / config.step;
      if (config.maximum <= config.minimum || steps > 1000 || Math.abs(steps - Math.round(steps)) > 1e-7) return `Khoảng điểm hoặc bước điểm của “${criterion.name}” không hợp lệ.`;
    }
    if (criterion.type === 'RATING') {
      const options = (parsed.data.config as { options: { id: string; label: string; value: number }[] }).options;
      if (new Set(options.map((option) => option.id)).size !== options.length || new Set(options.map((option) => option.label.toLocaleLowerCase('vi'))).size !== options.length) return `Các mức đánh giá của “${criterion.name}” cần có mã và tên riêng.`;
      if (new Set(options.map((option) => option.value)).size < 2) return `Các mức đánh giá của “${criterion.name}” cần có ít nhất hai điểm quy đổi khác nhau.`;
    }
    if (criterion.type === 'CHECKLIST') {
      const config = parsed.data.config as { mode: string; items: { id: string; label: string; points: number }[] };
      if (new Set(config.items.map((item) => item.id)).size !== config.items.length || new Set(config.items.map((item) => item.label.toLocaleLowerCase('vi'))).size !== config.items.length) return `Các mục checklist của “${criterion.name}” cần có tên riêng.`;
      if (config.mode === 'POINTS' && config.items.reduce((sum, item) => sum + item.points, 0) <= 0) return `Checklist “${criterion.name}” cần có tổng điểm lớn hơn 0.`;
      if (config.mode === 'POINTS' && !isSafeScoreDecimal(config.items.reduce((sum, item) => sum + item.points, 0))) return `Tổng điểm của checklist “${criterion.name}” quá lớn. Hãy giảm điểm ở các mục.`;
    }
  }
  if (input.criteria.some((criterion) => !isSafeScoreDecimal(criterion.weight))) return 'Trọng số chỉ hỗ trợ tối đa 4 chữ số sau dấu phẩy.';
  if (!input.criteria.length) return 'Thêm ít nhất một tiêu chí trước khi áp dụng.';
  return null;
}

function criterionColumns(criterion: z.infer<typeof criterionSchema>) {
  const parsed = rubricCriterionSchema.parse({ type: criterion.type, config: criterion.config });
  if (criterion.type === 'NUMERIC' || criterion.type === 'BONUS_PENALTY') return parsed.config as { minimum: number; maximum: number; step: number };
  if (criterion.type === 'RATING') {
    const values = (parsed.config as { options: { value: number }[] }).options.map((option) => option.value);
    return { minimum: Math.min(...values), maximum: Math.max(...values), step: 0.0001 };
  }
  return { minimum: 0, maximum: criterion.type === 'CHECKLIST' ? (parsed.config as { mode: string; items: { points: number }[] }).items.reduce((sum, item) => sum + item.points, 0) : 1, step: 1 };
}

export async function GET(request: Request, context: Context) {
  try {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canViewCompetition(user, id))) return Response.json({ error: 'Không tìm thấy cuộc thi hoặc bạn không có quyền xem.' }, { status: 404 });
  const workspace = await ensureCompetitionWorkspace(id);
  if (!workspace) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const [rubrics, round] = await Promise.all([
    prisma.rubric.findMany({ where: { competitionId: id, roundId: workspace.id }, include: { versions: { orderBy: { version: 'desc' }, include: { criteria: { orderBy: { sequence: 'asc' } } } } } }),
    prisma.competitionRound.findUnique({ where: { id: workspace.id }, select: { activeRubricVersionId: true } }),
  ]);
  return Response.json({ rubrics, activeRubricVersionId: round?.activeRubricVersionId ?? null });
  } catch (error) {
    console.error('Failed to load competition rubric', error);
    return Response.json({ error: 'Chưa thể tải bộ tiêu chí lúc này. Vui lòng thử lại sau ít phút.' }, { status: 503 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền chỉnh sửa tiêu chí chấm.' }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const criterionIndex = issue?.path[0] === 'criteria' && typeof issue.path[1] === 'number' ? issue.path[1] + 1 : null;
    const field = issue?.path[2];
    const error = field === 'name' && criterionIndex
      ? `Tên tiêu chí ${criterionIndex} không được để trống và tối đa 160 ký tự.`
      : field === 'weight' && criterionIndex
        ? `Trọng số tiêu chí ${criterionIndex} phải là số dương hợp lệ.`
        : criterionIndex
          ? `Thông tin ở tiêu chí ${criterionIndex} chưa đúng. Hãy mở tiêu chí đó và kiểm tra lại.`
          : 'Thông tin bộ tiêu chí chưa đầy đủ. Hãy kiểm tra lại các mục rồi thử lần nữa.';
    return Response.json({ error }, { status: 400 });
  }
  const validationError = validateDraft(parsed.data);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  const round = await ensureCompetitionWorkspace(id);
  if (!round) return Response.json({ error: 'Không tìm thấy khu vực chấm của cuộc thi.' }, { status: 404 });
  if (round.status === 'LIVE' || round.status === 'COMPLETED' || round.session?.state !== 'IDLE') return Response.json({ error: 'Không thể chỉnh sửa tiêu chí khi cuộc thi đang được điều phối hoặc đã kết thúc.' }, { status: 409 });
  if (await prisma.scoreSheet.count({ where: { roundId: round.id } })) return Response.json({ error: 'Đã có phiếu chấm. Không thể đổi bộ tiêu chí đang áp dụng.' }, { status: 409 });
  if (await prisma.resultSnapshot.count({ where: { roundId: round.id } })) return Response.json({ error: 'Kết quả đã được khóa; không thể đổi bộ tiêu chí.' }, { status: 409 });
  const rubric = await prisma.rubric.findFirst({ where: { competitionId: id, roundId: round.id }, orderBy: { createdAt: 'asc' } })
    ?? await prisma.rubric.create({ data: { competitionId: id, roundId: round.id, name: parsed.data.name } });
  const draft = await prisma.rubricVersion.findFirst({ where: { rubricId: rubric.id, status: 'DRAFT', scoreSheets: { none: {} } }, orderBy: { version: 'desc' } });
  const versionNumber = draft?.version ?? ((await prisma.rubricVersion.aggregate({ where: { rubricId: rubric.id }, _max: { version: true } }))._max.version ?? 0) + 1;
  const version = await prisma.$transaction(async (tx) => {
    const target = draft
      ? await tx.rubricVersion.update({ where: { id: draft.id }, data: { name: parsed.data.name, scoringConfig: DEFAULT_SCORING_CONFIG } })
      : await tx.rubricVersion.create({ data: { rubricId: rubric.id, version: versionNumber, name: parsed.data.name, status: 'DRAFT', scoringConfig: DEFAULT_SCORING_CONFIG } });
    if (draft) {
      await tx.rubricCriterion.deleteMany({ where: { rubricVersionId: target.id } });
    }
    await tx.rubricCriterion.createMany({ data: parsed.data.criteria.map((criterion, index) => {
      const range = criterionColumns(criterion);
      return { rubricVersionId: target.id, name: criterion.name, description: criterion.description || null, type: criterion.type, config: criterion.config as object, required: criterion.required, minimum: range.minimum, maximum: range.maximum, step: range.step, weight: ['NUMERIC', 'RATING', 'CHECKLIST'].includes(criterion.type) ? criterion.weight : 1, commentRequired: criterion.commentRequired, sequence: index + 1 };
    }) });
    await tx.rubricVersion.updateMany({ where: { rubricId: rubric.id, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
    const published = await tx.rubricVersion.update({ where: { id: target.id }, data: { status: 'PUBLISHED' }, include: { criteria: { orderBy: { sequence: 'asc' } } } });
    await tx.competitionRound.update({ where: { id: round.id }, data: { activeRubricVersionId: published.id } });
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'RUBRIC_VERSION_ACTIVATED', entityType: 'RubricVersion', entityId: published.id, details: { version: published.version, criteriaCount: published.criteria.length } } });
    return published;
  });
  return Response.json({ version });
  } catch (error) {
    console.error('Failed to apply competition rubric', error);
    return Response.json({ error: 'Chưa lưu được bộ tiêu chí lúc này. Vui lòng thử lại sau ít phút.' }, { status: 503 });
  }
}

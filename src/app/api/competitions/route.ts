import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { errorMessage, slugify, unauthorized, writeAudit } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(3).max(180),
  description: z.string().trim().max(5000).optional().default(''),
  organizingUnit: z.string().trim().max(180).optional().default(''),
  location: z.string().trim().max(240).optional().default(''),
  modality: z.enum(['ONSITE', 'ONLINE', 'HYBRID']).optional().default('ONSITE'),
  startsAt: z.string().datetime().optional().or(z.literal('')),
  endsAt: z.string().datetime().optional().or(z.literal('')),
  firstRoundName: z.string().trim().min(2).max(160).optional().default('Vòng sơ khảo'),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const where = user.systemRole === 'ADMIN' ? {} : { members: { some: { userId: user.id } } };
  const competitions = await prisma.competition.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      _count: { select: { contestants: true, rounds: true, scoreSheets: true } },
      rounds: { orderBy: { sequence: 'asc' }, include: { _count: { select: { entries: true, scoreSheets: true } } } },
    },
  });
  return Response.json({ competitions });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Chỉ quản trị viên hệ thống được tạo cuộc thi.' }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Tên cuộc thi cần từ 3 đến 180 ký tự.' }, { status: 400 });
  if (parsed.data.startsAt && parsed.data.endsAt && new Date(parsed.data.endsAt) < new Date(parsed.data.startsAt)) {
    return Response.json({ error: 'Ngày kết thúc phải sau ngày bắt đầu.' }, { status: 400 });
  }

  try {
    const baseSlug = slugify(parsed.data.name);
    const competition = await prisma.$transaction(async (tx) => {
      const created = await tx.competition.create({
        data: {
          name: parsed.data.name,
          slug: `${baseSlug}-${Date.now().toString(36)}`,
          description: parsed.data.description || null,
          organizingUnit: parsed.data.organizingUnit || null,
          location: parsed.data.location || null,
          modality: parsed.data.modality,
          startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
          endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
        },
      });
      const round = await tx.competitionRound.create({
        data: { competitionId: created.id, name: parsed.data.firstRoundName, sequence: 1 },
      });
      const rubric = await tx.rubric.create({
        data: {
          competitionId: created.id,
          roundId: round.id,
          name: 'Rubric mặc định',
          versions: { create: {
            version: 1,
            name: 'Phiên bản 1',
            criteria: { create: [
              { name: 'Tính sáng tạo', description: 'Mức độ mới và khác biệt của ý tưởng.', minimum: 0, maximum: 10, step: 0.5, weight: 1, sequence: 1 },
              { name: 'Tính khả thi', description: 'Khả năng triển khai trong thực tế.', minimum: 0, maximum: 10, step: 0.5, weight: 1, sequence: 2 },
              { name: 'Tác động', description: 'Giá trị mang lại cho đối tượng thụ hưởng.', minimum: 0, maximum: 10, step: 0.5, weight: 1, sequence: 3 },
            ] },
          } },
        },
      });
      const version = await tx.rubricVersion.findFirstOrThrow({ where: { rubricId: rubric.id, version: 1 }, select: { id: true } });
      await tx.competitionRound.update({ where: { id: round.id }, data: { activeRubricVersionId: version.id } });
      await tx.competitionSession.create({ data: { roundId: round.id } });
      await tx.auditEvent.create({ data: { competitionId: created.id, actorId: user.id, action: 'COMPETITION_CREATED', entityType: 'Competition', entityId: created.id } });
      return created;
    });
    return Response.json({ competition }, { status: 201 });
  } catch (error) {
    console.error('Create competition failed:', error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

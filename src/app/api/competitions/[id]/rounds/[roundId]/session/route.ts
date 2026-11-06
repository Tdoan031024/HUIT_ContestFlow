import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, canViewCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['start', 'pause', 'resume', 'next', 'previous', 'select', 'finish']), entryId: z.string().uuid().optional(), expectedVersion: z.number().int().min(0) });
type Context = { params: Promise<{ id: string; roundId: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, roundId } = await context.params;
  if (!(await canViewCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền xem cuộc thi.' }, { status: 403 });
  const session = await prisma.competitionSession.findUnique({
    where: { roundId },
    include: { round: { select: { id: true, name: true, status: true, competitionId: true, anonymous: true } }, currentEntry: { include: { contestant: true } } },
  });
  if (!session || session.round.competitionId !== id) return Response.json({ error: 'Không tìm thấy phiên điều phối.' }, { status: 404 });
  let safeEntry = null;
  if (session.currentEntry) {
    const { contestant, ...entry } = session.currentEntry;
    safeEntry = { ...entry, contestant: session.round.anonymous ? undefined : contestant };
  }
  return Response.json({ session: { ...session, currentEntry: safeEntry } });
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, roundId } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin mới được điều phối vòng thi.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Lệnh điều phối không hợp lệ.' }, { status: 400 });
  const round = await prisma.competitionRound.findFirst({ where: { id: roundId, competitionId: id }, include: { session: true } }).catch(() => null);
  if (!round) return Response.json({ error: 'Không tìm thấy vòng thi.' }, { status: 404 });
  const currentVersion = round.session?.version ?? 0;
  if (parsed.data.expectedVersion !== currentVersion) return Response.json({ error: 'Trạng thái điều phối đã thay đổi. Tải lại trước khi gửi lệnh tiếp.' }, { status: 409 });
  const entries = await prisma.competitionEntry.findMany({ where: { roundId, status: 'ACTIVE' }, orderBy: { sequence: 'asc' }, select: { id: true } });
  if (!entries.length && parsed.data.action !== 'finish') return Response.json({ error: 'Thêm ít nhất một thí sinh vào vòng trước khi điều phối.' }, { status: 409 });

  let currentEntryId = round.session?.currentEntryId ?? null;
  let state = round.session?.state ?? 'IDLE';
  const currentIndex = entries.findIndex((entry) => entry.id === currentEntryId);
  switch (parsed.data.action) {
    case 'start':
      if (!currentEntryId) currentEntryId = entries[0]?.id ?? null;
      state = 'LIVE';
      break;
    case 'pause':
      if (state !== 'LIVE') return Response.json({ error: 'Chỉ phiên đang trực tiếp mới có thể tạm dừng.' }, { status: 409 });
      state = 'PAUSED';
      break;
    case 'resume':
      if (state !== 'PAUSED') return Response.json({ error: 'Phiên hiện không ở trạng thái tạm dừng.' }, { status: 409 });
      state = 'LIVE';
      break;
    case 'next':
      currentEntryId = entries[Math.min(currentIndex + 1, entries.length - 1)]?.id ?? null;
      state = currentEntryId ? 'LIVE' : 'PAUSED';
      break;
    case 'previous':
      currentEntryId = entries[Math.max(currentIndex - 1, 0)]?.id ?? entries[0]?.id ?? null;
      state = currentEntryId ? 'LIVE' : 'PAUSED';
      break;
    case 'select': {
      if (!parsed.data.entryId || !entries.some((entry) => entry.id === parsed.data.entryId)) return Response.json({ error: 'Thí sinh chọn không hợp lệ hoặc không còn hoạt động.' }, { status: 400 });
      currentEntryId = parsed.data.entryId;
      state = 'LIVE';
      break;
    }
    case 'finish':
      currentEntryId = null;
      state = 'COMPLETED';
      break;
  }

  try {
    const session = await prisma.$transaction(async (tx) => {
      if (!round.session) await tx.competitionSession.createMany({ data: [{ roundId }], skipDuplicates: true });
      const changed = await tx.competitionSession.updateMany({
        where: { roundId, version: currentVersion },
        data: { currentEntryId, state, version: { increment: 1 } },
      });
      if (!changed.count) throw new Error('SESSION_VERSION_CONFLICT');
      const updated = await tx.competitionSession.findUniqueOrThrow({ where: { roundId } });
      await tx.competitionRound.update({ where: { id: roundId }, data: { status: state === 'COMPLETED' ? 'COMPLETED' : 'LIVE' } });
      await tx.competition.update({ where: { id }, data: { status: state === 'COMPLETED' ? 'COMPLETED' : 'LIVE' } });
      await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: `SESSION_${parsed.data.action.toUpperCase()}`, entityType: 'CompetitionSession', entityId: updated.id, details: { currentEntryId, state, version: updated.version } } });
      return tx.competitionSession.findUniqueOrThrow({ where: { id: updated.id }, include: { currentEntry: { include: { contestant: true } } } });
    });
    return Response.json({ session });
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_VERSION_CONFLICT') return Response.json({ error: 'Trạng thái điều phối vừa được cập nhật. Tải lại và thử lại.' }, { status: 409 });
    return Response.json({ error: 'Không thể cập nhật phiên điều phối.' }, { status: 500 });
  }
}

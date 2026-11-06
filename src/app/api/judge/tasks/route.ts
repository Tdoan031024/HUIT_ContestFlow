import { getCurrentUser } from '@/lib/auth';
import { unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.systemRole !== 'JUDGE') return Response.json({ error: 'Khu vực này chỉ dành cho giám khảo.' }, { status: 403 });
  const assignments = await prisma.judgeAssignment.findMany({
    where: { userId: user.id },
    orderBy: [{ round: { competition: { startsAt: 'asc' } } }, { round: { sequence: 'asc' } }],
    include: {
      competition: { select: { id: true, name: true, status: true } },
      round: { include: { session: true, activeRubricVersion: { include: { criteria: { orderBy: { sequence: 'asc' } } } } } },
      entry: { include: { contestant: true } },
    },
  });
  const uniqueTasks = new Map<string, object>();
  for (const assignment of assignments) {
    const entryId = assignment.entryId ?? assignment.round.session?.currentEntryId;
    if (!entryId) continue;
    const entry = assignment.entryId ? assignment.entry : await prisma.competitionEntry.findUnique({ where: { id: entryId }, include: { contestant: true } });
    if (!entry || entry.status !== 'ACTIVE') continue;
    const key = `${assignment.roundId}:${entry.id}`;
    if (uniqueTasks.has(key)) continue;
    const scoreSheet = await prisma.scoreSheet.findUnique({ where: { entryId_judgeId: { entryId: entry.id, judgeId: user.id } }, select: { id: true, status: true, totalScore: true, submittedAt: true } });
    const hidden = assignment.round.anonymous;
    uniqueTasks.set(key, {
      competition: assignment.competition,
      round: { id: assignment.round.id, name: assignment.round.name, sequence: assignment.round.sequence, status: assignment.round.status, anonymous: hidden, sessionState: assignment.round.session?.state ?? 'IDLE' },
      entry: { id: entry.id, code: entry.entryCode, title: entry.title, displayName: hidden ? 'Danh tính được ẩn' : entry.contestant.displayName, organization: hidden ? null : entry.contestant.organization },
      rubric: assignment.round.activeRubricVersion,
      scoreSheet,
    });
  }
  return Response.json({ tasks: [...uniqueTasks.values()] });
}

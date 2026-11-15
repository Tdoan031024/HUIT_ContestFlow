import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { ensureCompetitionWorkspace } from '@/lib/competition-workspace-data';
import { inspectRoundReadiness } from '@/lib/round-readiness';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Chỉ Admin được kiểm tra điều kiện điều phối.' }, { status: 403 });
  const workspace = await ensureCompetitionWorkspace(id);
  if (!workspace) return Response.json({ error: 'Không tìm thấy cuộc thi.' }, { status: 404 });
  const roundId = workspace.id;
  const preflight = await inspectRoundReadiness(prisma, id, roundId);
  if (!preflight) return Response.json({ error: 'Không tìm thấy dữ liệu cuộc thi.' }, { status: 404 });
  return Response.json({ preflight });
}

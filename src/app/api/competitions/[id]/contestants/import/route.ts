import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { previewContestantCsv } from '@/lib/contestant-csv';
import { roundEditLockReason } from '@/lib/round-editability';

export const runtime = 'nodejs';
const schema = z.object({ roundId: z.string().uuid(), csv: z.string().min(1).max(1_000_000), confirm: z.boolean().optional().default(false) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!(await canManageCompetition(user, id))) return Response.json({ error: 'Bạn không có quyền nhập danh sách thí sinh.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Tệp CSV trống hoặc vượt quá 1 MB.' }, { status: 400 });
  const round = await prisma.competitionRound.findFirst({ where: { id: parsed.data.roundId, competitionId: id }, select: { id: true } });
  if (!round) return Response.json({ error: 'Vòng thi không thuộc cuộc thi này.' }, { status: 400 });
  const lockReason = await roundEditLockReason(prisma, id, round.id);
  if (lockReason) return Response.json({ error: lockReason }, { status: 409 });
  const preview = previewContestantCsv(parsed.data.csv);
  const emails = [...new Set(preview.rows.map((row) => row.email.toLocaleLowerCase('en-US')).filter(Boolean))];
  if (emails.length) {
    const existing = await prisma.contestant.findMany({ where: { competitionId: id, email: { in: emails } }, select: { email: true } });
    const existingEmails = new Set(existing.map((item) => item.email?.toLocaleLowerCase('en-US')).filter(Boolean));
    for (const row of preview.rows) if (row.email && existingEmails.has(row.email.toLocaleLowerCase('en-US'))) {
      preview.issues.push({ rowNumber: row.rowNumber, message: 'Email này đã có hồ sơ trong cuộc thi; hãy đăng ký hồ sơ hiện có vào vòng.' });
    }
  }
  if (!parsed.data.confirm) return Response.json({ preview });
  if (preview.issues.length) return Response.json({ error: 'Hãy sửa các dòng được báo trước khi nhập.', preview }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    let sequence = (await tx.competitionEntry.aggregate({ where: { roundId: round.id }, _max: { sequence: true } }))._max.sequence ?? 0;
    const result: { id: string; displayName: string; entryCode: string }[] = [];
    for (const row of preview.rows) {
      sequence += 1;
      const contestant = await tx.contestant.create({ data: {
        competitionId: id, displayName: row.displayName, organization: row.organization || null,
        email: row.email || null, phone: row.phone || null,
      } });
      const entryCode = `CF-${String(sequence).padStart(3, '0')}`;
      await tx.competitionEntry.create({ data: {
        competitionId: id, roundId: round.id, contestantId: contestant.id,
        entryCode, sequence, title: row.title || null,
      } });
      result.push({ id: contestant.id, displayName: contestant.displayName, entryCode });
    }
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'CONTESTANTS_IMPORTED', entityType: 'Contestant', details: { count: result.length, roundId: round.id } } });
    return result;
  });
  return Response.json({ imported: created.length, contestants: created }, { status: 201 });
}

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canManageCompetition, unauthorized } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
const schema = z.object({ roundId: z.string().uuid(), csv: z.string().min(1).max(1_000_000) });
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
  const records = parseCsv(parsed.data.csv).filter((row) => row.some((field) => field.trim()));
  const firstHeader = records[0]?.[0]?.trim().replace(/^\uFEFF/, '') ?? '';
  if (records.length && /^(tên(?: thí sinh)?|ho ten|họ tên|name|display name|full name)$/i.test(firstHeader)) records.shift();
  if (records.length > 500) return Response.json({ error: 'Mỗi lần nhập tối đa 500 dòng.' }, { status: 400 });
  if (!records.length) return Response.json({ error: 'Không tìm thấy dòng dữ liệu hợp lệ.' }, { status: 400 });
  const invalid = records.findIndex((row) => !row[0]?.trim() || row[0].trim().length > 180 || (row[2] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[2])));
  if (invalid >= 0) return Response.json({ error: `Dòng ${invalid + 1} thiếu tên hoặc email không hợp lệ.` }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    let sequence = (await tx.competitionEntry.aggregate({ where: { roundId: round.id }, _max: { sequence: true } }))._max.sequence ?? 0;
    const result: { id: string; displayName: string; entryCode: string }[] = [];
    for (const row of records) {
      sequence += 1;
      const contestant = await tx.contestant.create({ data: {
        competitionId: id, displayName: row[0].trim(), organization: row[1]?.trim() || null,
        email: row[2]?.trim() || null, phone: row[3]?.trim() || null,
      } });
      const entryCode = `CF-${String(sequence).padStart(3, '0')}`;
      await tx.competitionEntry.create({ data: {
        competitionId: id, roundId: round.id, contestantId: contestant.id,
        entryCode, sequence, title: row[4]?.trim() || null,
      } });
      result.push({ id: contestant.id, displayName: contestant.displayName, entryCode });
    }
    await tx.auditEvent.create({ data: { competitionId: id, actorId: user.id, action: 'CONTESTANTS_IMPORTED', entityType: 'Contestant', details: { count: result.length, roundId: round.id } } });
    return result;
  });
  return Response.json({ imported: created.length, contestants: created }, { status: 201 });
}

function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && value[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

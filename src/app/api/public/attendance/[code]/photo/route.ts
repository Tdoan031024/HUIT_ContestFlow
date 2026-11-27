import { prisma } from '@/lib/prisma';
import {
  consumeAttendanceRateLimit, getAttendanceToken, readLimitedBody, sha256, uploadRateLimitKey, saveAttendancePhoto,
} from '@/lib/attendance';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9_-]{20,48}$/.test(code)) return Response.json({ error: 'Liên kết điểm danh không hợp lệ.' }, { status: 404 });
  const token = await getAttendanceToken(code);
  if (!token) return Response.json({ error: 'Hãy vào hàng đợi trước.' }, { status: 401 });
  const tokenHash = sha256(token);
  const ticket = await prisma.attendanceQueueTicket.findUnique({ where: { tokenHash }, include: { event: true } });
  if (!ticket || ticket.event.publicCode !== code || ticket.status !== 'ACTIVE' || !ticket.activeUntil || ticket.activeUntil <= new Date()) return Response.json({ error: 'Lượt điểm danh chưa sẵn sàng hoặc đã hết hạn.' }, { status: 409 });
  if (ticket.event.status !== 'OPEN') return Response.json({ error: 'Sự kiện đã đóng điểm danh.' }, { status: 409 });
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 2_500_000) return Response.json({ error: 'Ảnh vượt quá dung lượng cho phép (2 MB).' }, { status: 413 });
  const retryAfter = await consumeAttendanceRateLimit(uploadRateLimitKey(code, tokenHash), 5, 60_000);
  if (retryAfter) return Response.json({ error: 'Bạn đã chụp ảnh quá nhiều lần. Hãy chờ một phút.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfter / 1000)) } });
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'image/jpeg' && contentType !== 'image/webp') return Response.json({ error: 'Chỉ nhận ảnh JPEG hoặc WebP từ camera.' }, { status: 415 });
  let bytes: Buffer;
  try { bytes = await readLimitedBody(request, 2_000_000); }
  catch { return Response.json({ error: 'Ảnh vượt quá dung lượng cho phép (2 MB).' }, { status: 413 }); }
  if (bytes.length < 12 || bytes.length > 2_000_000) return Response.json({ error: 'Ảnh không hợp lệ hoặc vượt quá 2 MB.' }, { status: 413 });
  const isJpeg = contentType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = contentType === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!isJpeg && !isWebp) return Response.json({ error: 'Định dạng ảnh không hợp lệ.' }, { status: 415 });
  const key = await saveAttendancePhoto(ticket.eventId, ticket.id, bytes, isJpeg ? 'jpg' : 'webp');
  return Response.json({ photoKey: key }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

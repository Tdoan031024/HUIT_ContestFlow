import { getCurrentUser } from '@/lib/auth';
import { privateNoStoreHeaders, readAttendancePhoto } from '@/lib/attendance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string; recordId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId, recordId } = await params;
  const record = await prisma.attendanceRecord.findFirst({ where: { eventId, id: recordId }, select: { photoKey: true } });
  if (!record?.photoKey) return Response.json({ error: 'Không tìm thấy ảnh.' }, { status: 404 });
  try {
    const image = await readAttendancePhoto(record.photoKey);
    return new Response(new Uint8Array(image), { headers: { ...privateNoStoreHeaders(), 'Content-Type': record.photoKey.endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'Content-Disposition': 'inline' } });
  } catch {
    return Response.json({ error: 'Không thể đọc ảnh điểm danh.' }, { status: 404 });
  }
}

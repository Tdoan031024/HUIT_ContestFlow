import { getCurrentUser } from '@/lib/auth';
import { csvCell, privateNoStoreHeaders } from '@/lib/attendance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  if (user.systemRole !== 'ADMIN') return Response.json({ error: 'Không đủ quyền truy cập.' }, { status: 403 });
  const { eventId } = await params;
  const event = await prisma.attendanceEvent.findUnique({ where: { id: eventId }, select: { id: true, name: true, customFields: true } });
  if (!event) return Response.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const format = url.searchParams.get('format');
  if (format === 'csv') {
    const rows = await prisma.attendanceRecord.findMany({
      where: { eventId, ...(query ? { OR: [{ fullName: { contains: query } }, { email: { contains: query } }, { studentId: { contains: query } }] } : {}) },
      orderBy: { checkedInAt: 'desc' }, take: 50000,
      select: { fullName: true, studentId: true, email: true, organization: true, checkedInAt: true, latitude: true, longitude: true, locationAccuracyMeters: true, customAnswers: true, manualOverride: true, overrideReason: true },
    });
    const fields = Array.isArray(event.customFields) ? event.customFields as Array<{ key: string; label: string }> : [];
    const headings = ['Họ và tên', 'Mã sinh viên', 'Email', 'Đơn vị', ...fields.map((field) => field.label), 'Thời điểm điểm danh', 'Vĩ độ', 'Kinh độ', 'Độ chính xác (m)', 'Điểm danh ngoại lệ', 'Lý do ngoại lệ'];
    const lines = [headings, ...rows.map((row) => {
      const answers = row.customAnswers && typeof row.customAnswers === 'object' && !Array.isArray(row.customAnswers) ? row.customAnswers as Record<string, unknown> : {};
      return [row.fullName, row.studentId, row.email, row.organization, ...fields.map((field) => answers[field.key]), row.checkedInAt.toISOString(), row.latitude, row.longitude, row.locationAccuracyMeters, row.manualOverride ? 'Có' : 'Không', row.overrideReason];
    })]
      .map((row) => row.map(csvCell).join(',')).join('\r\n');
    return new Response(`\uFEFF${lines}`, { headers: { ...privateNoStoreHeaders(), 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance-${eventId}.csv"` } });
  }
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const take = 50;
  const where = { eventId, ...(query ? { OR: [{ fullName: { contains: query } }, { email: { contains: query } }, { studentId: { contains: query } }] } : {}) };
  const [records, total] = await Promise.all([
    prisma.attendanceRecord.findMany({ where, orderBy: { checkedInAt: 'desc' }, skip: (page - 1) * take, take, select: { id: true, fullName: true, studentId: true, email: true, organization: true, checkedInAt: true, latitude: true, longitude: true, locationAccuracyMeters: true, photoKey: true, customAnswers: true, manualOverride: true, overrideReason: true } }),
    prisma.attendanceRecord.count({ where }),
  ]);
  return Response.json({ records: records.map(({ photoKey, ...record }) => ({ ...record, hasPhoto: Boolean(photoKey), latitude: record.latitude == null ? null : Number(record.latitude), longitude: record.longitude == null ? null : Number(record.longitude), locationAccuracyMeters: record.locationAccuracyMeters == null ? null : Number(record.locationAccuracyMeters) })), total, page, pageCount: Math.max(1, Math.ceil(total / take)) }, { headers: privateNoStoreHeaders() });
}

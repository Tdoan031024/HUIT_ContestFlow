'use client';

import { AttendanceLocationPicker } from '@/components/attendance-location-picker';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Dialog, Notice, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';
import { createQrMatrix, qrSvgPath } from '@/lib/qr-code';

type EventStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'COMPLETED' | 'ARCHIVED';
type EventData = {
  id: string; publicCode: string; name: string; description: string | null; venue: string;
  eventStartsAt: string; eventEndsAt: string; checkInStartsAt: string; checkInEndsAt: string;
  latitude: number | null; longitude: number | null; geofenceRadiusMeters: number;
  locationRequired: boolean; photoRequired: boolean; expectedAttendees: number;
  maxActiveCheckins: number; maxQueueSize: number; customFields: Array<{ key: string; label: string; required: boolean; type: string }>;
  status: EventStatus; checkedIn: number; failedAttempts: number; queue: Record<string, number>;
};
type AttendanceRecord = {
  id: string; fullName: string; studentId: string | null; email: string | null; organization: string | null;
  checkedInAt: string; latitude: number | null; longitude: number | null; locationAccuracyMeters: number | null;
  customAnswers: Record<string, string> | null;
  hasPhoto: boolean; manualOverride: boolean; overrideReason: string | null;
};
type AttendanceAudit = { id: string; action: string; createdAt: string; actor: { fullName: string } | null };

const statusLabels: Record<EventStatus, string> = { DRAFT: 'Bản nháp', OPEN: 'Đang mở', CLOSED: 'Đã đóng', COMPLETED: 'Đã hoàn tất', ARCHIVED: 'Đã lưu trữ' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

function localInput(value: string) {
  const date = new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return body.error || 'Có lỗi xảy ra.';
}

export function AttendanceEventDetail({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [audit, setAudit] = useState<AttendanceAudit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualError, setManualError] = useState('');
  const [photoRecord, setPhotoRecord] = useState<AttendanceRecord | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const pendingLoad = useRef<AbortController | null>(null);

  const reload = useCallback(async (nextPage = page, nextSearch = debouncedSearch) => {
    pendingLoad.current?.abort();
    const controller = new AbortController();
    pendingLoad.current = controller;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    setLoading(true);
    setError('');
    try {
      const [eventResponse, recordResponse, auditResponse] = await Promise.all([
        fetch(`/api/attendance/${eventId}`, options),
        fetch(`/api/attendance/${eventId}/records?page=${nextPage}&q=${encodeURIComponent(nextSearch)}`, options),
        fetch(`/api/attendance/${eventId}/audit`, options),
      ]);
      if (!eventResponse.ok) throw new Error(await readError(eventResponse));
      if (!recordResponse.ok) throw new Error(await readError(recordResponse));
      if (!auditResponse.ok) throw new Error(await readError(auditResponse));
      const eventData = await eventResponse.json() as { event: EventData };
      const recordData = await recordResponse.json() as { records: AttendanceRecord[]; total: number; page: number; pageCount: number };
      const auditData = await auditResponse.json() as { events: AttendanceAudit[] };
      if (controller.signal.aborted) return;
      setEvent({
        ...eventData.event,
        customFields: Array.isArray(eventData.event.customFields) ? eventData.event.customFields : [],
      });
      setRecords(recordData.records);
      setTotal(recordData.total);
      setPage(recordData.page);
      setPageCount(recordData.pageCount);
      setAudit(auditData.events);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu sự kiện.');
    } finally {
      if (pendingLoad.current === controller) {
        pendingLoad.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [eventId, page, debouncedSearch]);

  useEffect(() => { void reload(); return () => pendingLoad.current?.abort(); }, [reload]);
  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (event?.status !== 'OPEN') return;
    const refresh = () => {
      if (!document.hidden && navigator.onLine && !pendingLoad.current) void reload();
    };
    const timer = window.setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [event?.status, reload]);

  const publicUrl = typeof window === 'undefined' || !event ? '' : `${window.location.origin}/check-in/${event.publicCode}`;
  const qr = useMemo(() => {
    if (!publicUrl) return null;
    try { const matrix = createQrMatrix(publicUrl); return qrSvgPath(matrix); } catch { return null; }
  }, [publicUrl]);

  async function changeStatus(action: 'OPEN' | 'CLOSE' | 'COMPLETE' | 'ARCHIVE') {
    if (!event) return;
    if (action === 'ARCHIVE' && !window.confirm('Lưu trữ sự kiện này?')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/attendance/${eventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error(await readError(response));
      setNotice(action === 'OPEN' ? 'Điểm danh đã được mở.' : action === 'CLOSE' ? 'Điểm danh đã đóng.' : action === 'COMPLETE' ? 'Sự kiện đã hoàn tất.' : 'Sự kiện đã lưu trữ.');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật sự kiện.'); }
    finally { setBusy(false); }
  }

  async function saveSettings(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event) return;
    setEditError('');
    const form = new FormData(formEvent.currentTarget);
    const latitude = String(form.get('latitude') ?? '').trim();
    const longitude = String(form.get('longitude') ?? '').trim();
    if (form.get('locationRequired') === 'on' && (!latitude || !longitude)) {
      setEditError('Chọn vị trí trên bản đồ hoặc tắt xác minh vị trí.');
      return;
    }
    const customFields = parseCustomFields(String(form.get('customFieldLabels') ?? ''));
    const data = {
      name: String(form.get('name') ?? ''), description: String(form.get('description') ?? ''), venue: String(form.get('venue') ?? ''),
      eventStartsAt: new Date(String(form.get('eventStartsAt'))).toISOString(), eventEndsAt: new Date(String(form.get('eventEndsAt'))).toISOString(),
      checkInStartsAt: new Date(String(form.get('eventStartsAt'))).toISOString(), checkInEndsAt: new Date(String(form.get('eventEndsAt'))).toISOString(),
      latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null,
      geofenceRadiusMeters: Number(form.get('geofenceRadiusMeters')), locationRequired: form.get('locationRequired') === 'on',
      photoRequired: form.get('photoRequired') === 'on', expectedAttendees: Number(form.get('expectedAttendees')),
      maxActiveCheckins: Number(form.get('maxActiveCheckins')), maxQueueSize: Number(form.get('maxQueueSize')), customFields,
    };
    try {
      const response = await fetch(`/api/attendance/${eventId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error(await readError(response));
      setEditOpen(false); setNotice('Đã lưu cấu hình sự kiện.'); await reload();
    } catch (reason) { setEditError(reason instanceof Error ? reason.message : 'Không lưu được cấu hình.'); }
  }

  async function manualCheckIn(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setManualError('');
    const form = new FormData(formEvent.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/attendance/${eventId}/manual-check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await readError(response));
      setManualOpen(false); setNotice('Đã ghi nhận điểm danh ngoại lệ và lưu nhật ký thao tác.'); await reload();
    } catch (reason) { setManualError(reason instanceof Error ? reason.message : 'Không ghi nhận được.'); }
  }

  async function deleteRecord(record: AttendanceRecord) {
    if (!window.confirm(`Xóa lượt điểm danh của ${record.fullName}? Thông tin cá nhân và ảnh sẽ bị xóa.`)) return;
    try {
      const response = await fetch(`/api/attendance/${eventId}/records/${record.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      setNotice('Đã xóa lượt điểm danh và ảnh liên quan.');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không xóa được lượt điểm danh.'); }
  }

  async function copyPublicLink() {
    setError('');
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 1800);
    } catch {
      setError('Không thể tự động sao chép. Bạn có thể chọn và sao chép liên kết trong mục Chia sẻ sự kiện.');
    }
  }

  async function deleteEvent() {
    if (!event || event.status === 'OPEN') return;
    if (!window.confirm(`Xóa vĩnh viễn “${event.name}” cùng ${event.checkedIn} hồ sơ điểm danh và ảnh liên quan? Thao tác này không thể hoàn tác.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/attendance/${eventId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      window.location.assign('/attendance');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không xóa được sự kiện.'); }
    finally { setBusy(false); }
  }

  const checkedInPercent = event?.expectedAttendees ? Math.min(100, Math.round((event.checkedIn / event.expectedAttendees) * 100)) : 0;

  if (loading && !event) return <div className="attendance-page"><Link href="/attendance" className="text-button">← Danh sách sự kiện</Link><div className="attendance-loading" role="status">Đang tải sự kiện…</div></div>;
  if (!event) return <div className="attendance-page"><PageHeader title="Không tìm thấy sự kiện" description={error} action={<Link href="/attendance" className="button secondary-button">Danh sách sự kiện</Link>} />{error && <Notice tone="error">{error}</Notice>}</div>;

  return <div className="attendance-page attendance-detail-page">
    <PageHeader eyebrow="ĐIỂM DANH / SỰ KIỆN" title={event.name} description={`${event.venue} · ${formatDate(event.eventStartsAt)}`} action={<Link href="/attendance" className="button secondary-button"><Icon name="arrow-left" size={16} /> Danh sách</Link>} />
    {notice && <Notice tone="success">{notice}</Notice>}
    {error && <Notice tone="error">{error} <button className="text-button" type="button" onClick={() => void reload()}>Tải lại</button></Notice>}
    <div className="attendance-detail-toolbar">
      <div className="attendance-toolbar-row">
        <span className={`attendance-status ${event.status === 'OPEN' ? 'attendance-status-live' : event.status === 'DRAFT' ? 'attendance-status-draft' : 'attendance-status-complete'}`}><i />{statusLabels[event.status]}</span>
        <div className="attendance-toolbar-actions">
          {(event.status === 'DRAFT' || event.status === 'CLOSED') && <button className="button primary-button small-button" type="button" disabled={busy} onClick={() => void changeStatus('OPEN')}>Mở điểm danh</button>}
          {event.status === 'OPEN' && <button className="button secondary-button small-button" type="button" disabled={busy} onClick={() => void changeStatus('CLOSE')}>Đóng điểm danh</button>}
          {(event.status === 'DRAFT' || event.status === 'CLOSED') && (
            <button className="button secondary-button small-button" type="button" disabled={busy} onClick={() => { setEditError(''); setEditOpen(true); }}>Sửa sự kiện</button>
          )}
          <button className="button secondary-button small-button attendance-more-toggle" type="button" aria-expanded={moreActionsOpen} aria-controls="attendance-more-actions" onClick={() => setMoreActionsOpen((open) => !open)}>
            Thao tác khác <Icon name="chevron-down" size={16} />
          </button>
        </div>
      </div>
      {event.status === 'OPEN' && <p className="attendance-edit-hint">Đóng điểm danh trước khi sửa sự kiện. Sau khi lưu, bạn có thể mở lại.</p>}
      <div id="attendance-more-actions" className="attendance-more-actions" hidden={!moreActionsOpen}>
        {event.status !== 'ARCHIVED' && <div className="attendance-secondary-actions">
          {event.status === 'CLOSED' && <button className="button secondary-button small-button" type="button" disabled={busy} onClick={() => void changeStatus('COMPLETE')}>Hoàn tất sự kiện</button>}
          {event.status !== 'OPEN' && <button className="button secondary-button small-button" type="button" disabled={busy} onClick={() => void changeStatus('ARCHIVE')}>Lưu trữ</button>}
          <button className="button secondary-button small-button" type="button" onClick={() => { setManualError(''); setManualOpen(true); }}>Điểm danh ngoại lệ</button>
        </div>}
        {event.status !== 'OPEN' && <div className="attendance-destructive-action">
          <button className="button danger-button small-button" type="button" disabled={busy} onClick={() => void deleteEvent()}>Xóa dữ liệu sự kiện</button>
        </div>}
      </div>
    </div>

    <div className="attendance-detail-layout">
      <div className="attendance-detail-primary">
        <section className="attendance-metrics attendance-detail-metrics" aria-label="Tiến độ sự kiện">
          <div className="attendance-metric"><span className="attendance-metric-label">Đã điểm danh</span><strong>{event.checkedIn}<i> / {event.expectedAttendees}</i></strong><small>{checkedInPercent}% số người dự kiến</small></div>
          <div className="attendance-metric"><span className="attendance-metric-label">Lượt chưa thành công</span><strong>{event.failedAttempts.toLocaleString('vi-VN')}</strong><small>Các lần gửi bị từ chối khi xác minh</small></div>
          <div className="attendance-metric"><span className="attendance-metric-label">Đang chờ</span><strong>{event.queue.waiting ?? 0}</strong><small>Vị trí sẽ cập nhật trong luồng chờ</small></div>
          <div className="attendance-metric"><span className="attendance-metric-label">Đang xử lý</span><strong>{event.queue.active ?? 0}</strong><small>Giới hạn {event.maxActiveCheckins} lượt song song</small></div>
          <div className="attendance-metric"><span className="attendance-metric-label">Lịch sự kiện</span><strong className="attendance-date-metric">{formatDate(event.eventStartsAt)}</strong><small>đến {formatDate(event.eventEndsAt)}</small></div>
        </section>

        <section className="attendance-workspace" aria-labelledby="attendance-records-title">
          <div className="attendance-section-heading">
            <div><div className="eyebrow">KẾT QUẢ</div><h2 id="attendance-records-title">Người tham dự</h2><p>{total.toLocaleString('vi-VN')} lượt đã ghi nhận</p></div>
            <div className="attendance-toolbar"><label className="attendance-search"><Icon name="search" size={17} /><span className="sr-only">Tìm người tham dự</span><input value={search} onChange={(input) => setSearch(input.target.value)} placeholder="Tên, mã SV hoặc email" /></label><a className="button secondary-button small-button" href={`/api/attendance/${event.id}/records?format=csv`} download>↓ CSV</a><button className="button secondary-button small-button" type="button" aria-label="Tải lại kết quả" onClick={() => void reload()}><Icon name="arrow" size={15} /></button></div>
          </div>
          {records.length ? <div className="attendance-record-list">
            {records.map((record) => <article className="attendance-record-row" key={record.id}>
              <div className="attendance-record-avatar" aria-hidden="true">{record.fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('')}</div>
              <div className="attendance-record-person"><strong>{record.fullName}</strong><span>{[record.studentId, record.email, record.organization].filter(Boolean).join(' · ') || 'Không có thông tin bổ sung'}</span>{event.customFields.filter((field) => record.customAnswers?.[field.key]).length > 0 && <small>{event.customFields.filter((field) => record.customAnswers?.[field.key]).map((field) => `${field.label}: ${record.customAnswers?.[field.key]}`).join(' · ')}</small>}<small>{formatDate(record.checkedInAt)}{record.manualOverride ? ` · Ngoại lệ: ${record.overrideReason}` : ''}</small></div>
              <div className="attendance-record-evidence">
                {record.latitude != null && record.longitude != null ? <span title={`Độ chính xác ${record.locationAccuracyMeters ?? '—'}m`}>Vị trí đã xác minh</span> : <span>Không có vị trí</span>}
                {record.hasPhoto ? <button type="button" onClick={() => setPhotoRecord(record)}>Xem ảnh</button> : <span>Không có ảnh</span>}
                <button type="button" onClick={() => void deleteRecord(record)}>Xóa</button>
              </div>
            </article>)}
            <div className="attendance-pagination"><span>Trang {page} / {pageCount}</span><div><button className="button secondary-button small-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>← Trước</button><button className="button secondary-button small-button" type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Sau →</button></div></div>
          </div> : <div className="attendance-empty"><h3>{search ? 'Không tìm thấy người tham dự' : 'Chưa có lượt điểm danh'}</h3><p>{search ? 'Thử một từ khóa khác.' : 'Các lượt điểm danh đã xác minh sẽ xuất hiện ở đây.'}</p></div>}
        </section>
      </div>

      <aside className="attendance-detail-side">
        <section className="attendance-qr-panel">
          <div className="eyebrow">MÃ ĐIỂM DANH</div><h2>Chia sẻ sự kiện</h2><p>Người tham gia quét mã hoặc mở liên kết bằng trình duyệt điện thoại.</p>
          {qr ? <svg className="attendance-qr-svg" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="Mã QR điểm danh"><rect width={qr.size} height={qr.size} fill="white" /><path d={qr.path} fill="#101828" /></svg> : <div className="attendance-qr-error">Không tạo được QR. Hãy kiểm tra địa chỉ triển khai trong HCF_APP_BASE_URL.</div>}
          <a className="attendance-share-url" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a>
          <button className="button secondary-button" type="button" onClick={() => void copyPublicLink()}>{copyDone ? 'Đã sao chép' : 'Sao chép liên kết'}</button>
        </section>
        <section className="attendance-settings-summary"><div className="eyebrow">ĐIỀU KIỆN</div><h2>Cấu hình điểm danh</h2><dl>
          <div><dt>Vị trí</dt><dd>{event.locationRequired ? `Bán kính ${event.geofenceRadiusMeters} m` : 'Không bắt buộc'}</dd></div>
          <div><dt>Ảnh trực tiếp</dt><dd>{event.photoRequired ? 'Bắt buộc' : 'Không bắt buộc'}</dd></div>
          <div><dt>Hàng đợi</dt><dd>{event.maxQueueSize.toLocaleString('vi-VN')} lượt tối đa</dd></div>
          {event.customFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.required ? 'Bắt buộc' : 'Tùy chọn'}</dd></div>)}
        </dl></section>
        <section className="attendance-settings-summary attendance-audit-panel"><div className="eyebrow">NHẬT KÝ</div><h2>Hoạt động quản trị</h2><div className="attendance-audit-list">{audit.length ? audit.slice(0, 12).map((item) => <div className="attendance-audit-item" key={item.id}><strong>{auditLabel(item.action)}</strong><span>{item.actor?.fullName ?? 'Người tham gia / hệ thống'}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div>) : <p>Chưa có hoạt động.</p>}</div></section>
      </aside>
    </div>

    <Dialog open={editOpen} title="Sửa cấu hình sự kiện" description="Thay đổi được phép khi sự kiện ở trạng thái nháp hoặc đã đóng." onClose={() => setEditOpen(false)} className="attendance-modal">
      <form className="attendance-create-form" onSubmit={saveSettings}>
        <label className="field-label">Tên sự kiện<input className="field-input" name="name" defaultValue={event.name} required maxLength={180} /></label>
        <label className="field-label">Mô tả<textarea className="field-textarea" name="description" defaultValue={event.description ?? ''} rows={2} maxLength={5000} /></label>
        <label className="field-label">Địa điểm<input className="field-input" name="venue" defaultValue={event.venue} required maxLength={240} /></label>
        <div className="attendance-form-pair"><label className="field-label">Sự kiện bắt đầu<input className="field-input" name="eventStartsAt" type="datetime-local" defaultValue={localInput(event.eventStartsAt)} required /></label><label className="field-label">Sự kiện kết thúc<input className="field-input" name="eventEndsAt" type="datetime-local" defaultValue={localInput(event.eventEndsAt)} required /></label></div>
        {editOpen && <AttendanceLocationPicker latitude={event.latitude} longitude={event.longitude} radius={event.geofenceRadiusMeters} required={event.locationRequired} />}
        <label className="field-label">Số người dự kiến<input className="field-input" name="expectedAttendees" type="number" min="0" max="100000" defaultValue={event.expectedAttendees} required /></label>
        <div className="attendance-form-pair"><label className="field-label">Lượt song song<input className="field-input" name="maxActiveCheckins" type="number" min="1" max="250" defaultValue={event.maxActiveCheckins} required /></label><label className="field-label">Giới hạn hàng đợi<input className="field-input" name="maxQueueSize" type="number" min="10" max="50000" defaultValue={event.maxQueueSize} required /></label></div>
        <label className="field-label">Trường bổ sung <span className="field-help">Mỗi dòng: Tên | text/email/tel | required/optional</span><textarea className="field-textarea" name="customFieldLabels" rows={3} placeholder={'Mã lớp | text | required\nEmail liên hệ | email | optional'} defaultValue={event.customFields.map((field) => `${field.label} | ${field.type} | ${field.required ? 'required' : 'optional'}`).join('\n')} /></label>
        <div className="attendance-check-options"><label><input type="checkbox" name="photoRequired" defaultChecked={event.photoRequired} /> Ảnh chụp trực tiếp</label></div>
        {editError && <Notice tone="error">{editError}</Notice>}
        <div className="attendance-form-actions"><button className="button secondary-button" type="button" onClick={() => setEditOpen(false)}>Hủy</button><button className="button primary-button" type="submit">Lưu thay đổi</button></div>
      </form>
    </Dialog>
    <Dialog open={manualOpen} title="Điểm danh ngoại lệ" description="Ghi rõ lý do. Thao tác được lưu trong nhật ký quản trị." onClose={() => setManualOpen(false)}>
      <form className="attendance-create-form" onSubmit={manualCheckIn}>
        <label className="field-label">Họ và tên<input className="field-input" name="fullName" required minLength={2} maxLength={180} /></label>
        <div className="attendance-form-pair"><label className="field-label">Mã sinh viên<input className="field-input" name="studentId" maxLength={80} /></label><label className="field-label">Email<input className="field-input" name="email" type="email" maxLength={255} /></label></div>
        <label className="field-label">Lớp / đơn vị<input className="field-input" name="organization" maxLength={180} /></label>
        <label className="field-label">Lý do ngoại lệ<textarea className="field-textarea" name="reason" rows={3} minLength={8} maxLength={1000} required /></label>
        {manualError && <Notice tone="error">{manualError}</Notice>}
        <div className="attendance-form-actions"><button className="button secondary-button" type="button" onClick={() => setManualOpen(false)}>Hủy</button><button className="button primary-button" type="submit">Ghi nhận</button></div>
      </form>
    </Dialog>
    <Dialog open={Boolean(photoRecord)} title={photoRecord?.fullName ?? 'Ảnh điểm danh'} onClose={() => setPhotoRecord(null)} className="attendance-photo-dialog">
      {photoRecord && <img className="attendance-record-photo" src={`/api/attendance/${event.id}/records/${photoRecord.id}/photo`} alt={`Ảnh điểm danh của ${photoRecord.fullName}`} />}
    </Dialog>
  </div>;
}

function parseCustomFields(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12).map((line, index) => {
    const [rawLabel, rawType, rawRequired] = line.split('|').map((part) => part.trim());
    const type = rawType === 'email' || rawType === 'tel' ? rawType : 'text';
    return { key: `extra_${index + 1}`, label: rawLabel, type, required: rawRequired?.toLowerCase() === 'required' };
  });
}

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    ATTENDANCE_EVENT_CREATED: 'Tạo sự kiện', ATTENDANCE_EVENT_UPDATED: 'Sửa cấu hình', ATTENDANCE_EVENT_OPEN: 'Mở điểm danh',
    ATTENDANCE_EVENT_CLOSE: 'Đóng điểm danh', ATTENDANCE_EVENT_COMPLETE: 'Hoàn tất sự kiện', ATTENDANCE_EVENT_ARCHIVE: 'Lưu trữ sự kiện',
    ATTENDANCE_CHECKED_IN: 'Người tham gia điểm danh', ATTENDANCE_MANUAL_CHECK_IN: 'Điểm danh ngoại lệ', ATTENDANCE_RECORD_DELETED: 'Xóa lượt điểm danh',
  };
  return labels[action] ?? 'Cập nhật sự kiện';
}

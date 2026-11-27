'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Icon } from '@/components/icons';
import { Dialog, Notice, PageHeader } from '@/components/ui';

type EventStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'COMPLETED' | 'ARCHIVED';
type AttendanceEvent = {
  id: string;
  publicCode: string;
  name: string;
  venue: string;
  eventStartsAt: string;
  eventEndsAt: string;
  checkInStartsAt: string;
  checkInEndsAt: string;
  expectedAttendees: number;
  checkedIn: number;
  failedAttempts: number;
  waiting: number;
  active: number;
  status: EventStatus;
};

const eventStatuses: Record<EventStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Bản nháp', className: 'attendance-status-draft' },
  OPEN: { label: 'Đang mở', className: 'attendance-status-live' },
  CLOSED: { label: 'Đã đóng', className: 'attendance-status-complete' },
  COMPLETED: { label: 'Đã hoàn tất', className: 'attendance-status-complete' },
  ARCHIVED: { label: 'Đã lưu trữ', className: 'attendance-status-complete' },
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

function toIso(value: FormDataEntryValue | null) {
  return new Date(String(value ?? '')).toISOString();
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === 'string' ? body.error : 'Không thể hoàn tất thao tác.';
}

function localDateTime(daysAhead: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function AttendanceWorkspace() {
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/attendance', { cache: 'no-store' });
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json() as { events: AttendanceEvent[] };
      setEvents(data.events);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được danh sách sự kiện.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleEvents = useMemo(() => events.filter((event) => {
    const matchesFilter = filter === 'ALL' || event.status === filter;
    return matchesFilter && `${event.name} ${event.venue}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'));
  }), [events, filter, query]);

  const totalCheckedIn = events.reduce((sum, event) => sum + event.checkedIn, 0);
  const totalExpected = events.reduce((sum, event) => sum + event.expectedAttendees, 0);
  const activeEvents = events.filter((event) => event.status === 'OPEN').length;
  const totalWaiting = events.reduce((sum, event) => sum + event.waiting, 0);
  const totalFailed = events.reduce((sum, event) => sum + event.failedAttempts, 0);

  async function createEvent(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    setFormError('');
    const formData = new FormData(form.currentTarget);
    const locationRequired = formData.get('locationRequired') === 'on';
    const latitude = String(formData.get('latitude') ?? '').trim();
    const longitude = String(formData.get('longitude') ?? '').trim();
    const customFields = parseCustomFields(String(formData.get('customFieldLabels') ?? ''));
    const body = {
      name: String(formData.get('name') ?? ''), description: String(formData.get('description') ?? ''), venue: String(formData.get('venue') ?? ''),
      eventStartsAt: toIso(formData.get('eventStartsAt')), eventEndsAt: toIso(formData.get('eventEndsAt')),
      checkInStartsAt: toIso(formData.get('checkInStartsAt')), checkInEndsAt: toIso(formData.get('checkInEndsAt')),
      latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null,
      geofenceRadiusMeters: Number(formData.get('geofenceRadiusMeters') || 150), locationRequired,
      photoRequired: formData.get('photoRequired') === 'on', expectedAttendees: Number(formData.get('expectedAttendees') || 0),
      maxActiveCheckins: Number(formData.get('maxActiveCheckins') || 30), maxQueueSize: Number(formData.get('maxQueueSize') || 5000), customFields,
    };
    if (locationRequired && (!latitude || !longitude)) { setFormError('Nhập tọa độ hợp lệ hoặc tắt xác minh vị trí.'); return; }
    try {
      const response = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await responseError(response));
      setShowCreate(false);
      setNotice('Đã tạo sự kiện. Hãy kiểm tra cấu hình rồi mở điểm danh khi sẵn sàng.');
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Không thể tạo sự kiện.');
    }
  }

  async function changeStatus(event: AttendanceEvent, action: 'OPEN' | 'CLOSE' | 'COMPLETE' | 'ARCHIVE') {
    if (action === 'ARCHIVE' && !window.confirm(`Lưu trữ sự kiện “${event.name}”?`)) return;
    setBusyId(event.id);
    setError('');
    try {
      const response = await fetch(`/api/attendance/${event.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(action === 'OPEN' ? 'Điểm danh đã được mở.' : action === 'CLOSE' ? 'Điểm danh đã đóng.' : action === 'COMPLETE' ? 'Sự kiện đã hoàn tất.' : 'Sự kiện đã lưu trữ.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật sự kiện.');
    } finally {
      setBusyId(null);
    }
  }

  return <div className="attendance-page">
    <PageHeader eyebrow="VẬN HÀNH SỰ KIỆN" title="Điểm danh" description="Tạo sự kiện, mở lượt điểm danh và theo dõi kết quả." action={<button className="button primary-button" type="button" onClick={() => { setFormError(''); setShowCreate(true); }}><Icon name="plus" size={17} /> Tạo sự kiện</button>} />
    {notice && <Notice tone="success">{notice}</Notice>}
    {error && <Notice tone="error">{error} <button className="text-button" type="button" onClick={() => void load()}>Thử lại</button></Notice>}

    <section className="attendance-metrics" aria-label="Tổng quan điểm danh">
      <div className="attendance-metric"><span className="attendance-metric-label">Sự kiện đang mở</span><strong>{activeEvents}</strong><small>Đang tiếp nhận điểm danh</small></div>
      <div className="attendance-metric"><span className="attendance-metric-label">Đã điểm danh</span><strong>{totalCheckedIn.toLocaleString('vi-VN')}<i> / {totalExpected.toLocaleString('vi-VN')}</i></strong><small>Tổng các sự kiện</small></div>
      <div className="attendance-metric"><span className="attendance-metric-label">Đang trong hàng đợi</span><strong>{totalWaiting}</strong><small>Đang chờ đến lượt</small></div>
      <div className="attendance-metric"><span className="attendance-metric-label">Lượt chưa thành công</span><strong>{totalFailed.toLocaleString('vi-VN')}</strong><small>Các lần gửi bị từ chối khi xác minh</small></div>
    </section>

    <section className="attendance-workspace" aria-labelledby="attendance-events-heading">
      <div className="attendance-section-heading">
        <div><div className="eyebrow">DANH SÁCH</div><h2 id="attendance-events-heading">Sự kiện</h2><p>{loading ? 'Đang tải…' : `${visibleEvents.length} sự kiện phù hợp`}</p></div>
        <div className="attendance-toolbar attendance-list-toolbar">
          <label className="attendance-search"><Icon name="search" size={17} /><span className="sr-only">Tìm sự kiện</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên hoặc địa điểm" /></label>
          <label className="attendance-filter"><span className="sr-only">Lọc theo trạng thái</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Tất cả</option><option value="OPEN">Đang mở</option><option value="DRAFT">Bản nháp</option><option value="CLOSED">Đã đóng</option><option value="COMPLETED">Đã hoàn tất</option></select></label>
          <button className="button secondary-button small-button" type="button" onClick={() => void load()} disabled={loading}>Tải lại</button>
        </div>
      </div>

      {loading ? <div className="attendance-loading" role="status">Đang tải sự kiện…</div> : visibleEvents.length ? <div className="attendance-event-list">
        {visibleEvents.map((event) => {
          const percent = event.expectedAttendees ? Math.min(100, Math.round((event.checkedIn / event.expectedAttendees) * 100)) : 0;
          const status = eventStatuses[event.status];
          const publicUrl = typeof window === 'undefined' ? `/check-in/${event.publicCode}` : `${window.location.origin}/check-in/${event.publicCode}`;
          return <article className="attendance-event-row" key={event.id}>
            <div className="attendance-event-main">
              <div className="attendance-event-titleline"><Link href={`/attendance/${event.id}`}><h3>{event.name}</h3></Link><span className={`attendance-status ${status.className}`}><i />{status.label}</span></div>
              <p className="attendance-event-venue">{event.venue}</p>
              <div className="attendance-event-meta"><span><Icon name="calendar" size={15} /> {dateTime(event.eventStartsAt)}</span><span><Icon name="clock" size={15} /> Điểm danh {dateTime(event.checkInStartsAt)}–{dateTime(event.checkInEndsAt)}</span></div>
              {event.status !== 'DRAFT' && <a className="attendance-public-link" href={publicUrl} target="_blank" rel="noreferrer">Mở trang người tham gia <Icon name="arrow" size={14} /></a>}
            </div>
            <div className="attendance-event-progress"><div className="attendance-progress-label"><span>Đã có mặt</span><strong>{event.checkedIn}<i> / {event.expectedAttendees}</i></strong></div><div className="attendance-progress-track" role="progressbar" aria-label="Tiến độ điểm danh" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}% đã điểm danh`}><span style={{ width: `${percent}%` }} /></div><small>{percent}% người tham dự</small></div>
            <div className="attendance-event-queue"><span>Hàng đợi</span><strong>{event.waiting}</strong><small>{event.active} đang xử lý</small></div>
            <div className="attendance-row-actions">
              {event.status === 'DRAFT' || event.status === 'CLOSED' ? <button className="button secondary-button small-button" type="button" onClick={() => void changeStatus(event, 'OPEN')} disabled={busyId === event.id}>{busyId === event.id ? 'Đang mở…' : event.status === 'DRAFT' ? 'Mở điểm danh' : 'Mở lại'}</button> : null}
              {event.status === 'OPEN' ? <button className="button secondary-button small-button" type="button" onClick={() => void changeStatus(event, 'CLOSE')} disabled={busyId === event.id}>Đóng</button> : null}
              {event.status === 'CLOSED' ? <button className="button secondary-button small-button" type="button" onClick={() => void changeStatus(event, 'COMPLETE')} disabled={busyId === event.id}>Hoàn tất</button> : null}
            </div>
          </article>;
        })}
      </div> : <div className="attendance-empty"><span className="attendance-empty-mark"><Icon name="calendar" size={22} /></span><h3>{events.length ? 'Không tìm thấy sự kiện' : 'Chưa có sự kiện'}</h3><p>{events.length ? 'Thử từ khóa hoặc trạng thái khác.' : 'Tạo sự kiện để cấu hình thời gian, vị trí và luồng điểm danh.'}</p>{events.length ? <button className="button secondary-button" type="button" onClick={() => { setQuery(''); setFilter('ALL'); }}>Xóa bộ lọc</button> : <button className="button primary-button" type="button" onClick={() => { setFormError(''); setShowCreate(true); }}><Icon name="plus" size={17} /> Tạo sự kiện</button>}</div>}
    </section>

    <Dialog open={showCreate} title="Tạo sự kiện" description="Cấu hình thông tin, khung giờ và điều kiện điểm danh." onClose={() => setShowCreate(false)} className="attendance-modal">
      <form className="attendance-create-form" onSubmit={createEvent}>
        <label className="field-label">Tên sự kiện<input className="field-input" name="name" placeholder="Ví dụ: Hội thảo chuyên đề" maxLength={180} required /></label>
        <label className="field-label">Mô tả<textarea className="field-textarea" name="description" rows={2} maxLength={5000} placeholder="Thông tin hiển thị cho người tham gia" /></label>
        <label className="field-label">Địa điểm<input className="field-input" name="venue" placeholder="Tòa nhà, phòng hoặc khu vực" maxLength={240} required /></label>
        <div className="attendance-form-pair"><label className="field-label">Sự kiện bắt đầu<input className="field-input" name="eventStartsAt" type="datetime-local" defaultValue={localDateTime(1, 9)} required /></label><label className="field-label">Sự kiện kết thúc<input className="field-input" name="eventEndsAt" type="datetime-local" defaultValue={localDateTime(1, 17)} required /></label></div>
        <div className="attendance-form-pair"><label className="field-label">Mở điểm danh<input className="field-input" name="checkInStartsAt" type="datetime-local" defaultValue={localDateTime(1, 8)} required /></label><label className="field-label">Đóng điểm danh<input className="field-input" name="checkInEndsAt" type="datetime-local" defaultValue={localDateTime(1, 17)} required /></label></div>
        <div className="attendance-form-pair"><label className="field-label">Vĩ độ<input className="field-input" name="latitude" type="number" step="any" min="-90" max="90" placeholder="10.8380" /></label><label className="field-label">Kinh độ<input className="field-input" name="longitude" type="number" step="any" min="-180" max="180" placeholder="106.6650" /></label></div>
        <div className="attendance-form-pair"><label className="field-label">Bán kính hợp lệ (m)<input className="field-input" name="geofenceRadiusMeters" type="number" min="25" max="2000" defaultValue="150" required /></label><label className="field-label">Số người dự kiến<input className="field-input" name="expectedAttendees" type="number" min="0" max="100000" defaultValue="120" required /></label></div>
        <div className="attendance-form-pair"><label className="field-label">Lượt xử lý song song<input className="field-input" name="maxActiveCheckins" type="number" min="1" max="250" defaultValue="30" required /></label><label className="field-label">Giới hạn hàng đợi<input className="field-input" name="maxQueueSize" type="number" min="10" max="50000" defaultValue="5000" required /></label></div>
        <label className="field-label">Trường thông tin bổ sung <span className="field-help">Mỗi dòng: Tên | text/email/tel | required/optional</span><textarea className="field-textarea" name="customFieldLabels" rows={3} maxLength={1200} placeholder={'Lớp | text | required\nEmail liên hệ | email | optional'} /></label>
        <div className="attendance-check-options"><label><input type="checkbox" name="locationRequired" defaultChecked /> Xác minh vị trí</label><label><input type="checkbox" name="photoRequired" defaultChecked /> Ảnh chụp trực tiếp</label></div>
        {formError && <Notice tone="error">{formError}</Notice>}
        <p className="attendance-form-note">Lưu ý: xác minh GPS giúp kiểm tra khoảng cách nhưng không ngăn giả mạo vị trí tuyệt đối.</p>
        <div className="attendance-form-actions"><button className="button secondary-button" type="button" onClick={() => setShowCreate(false)}>Hủy</button><button className="button primary-button" type="submit">Tạo bản nháp</button></div>
      </form>
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

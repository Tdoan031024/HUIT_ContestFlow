'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/icons';

type ParticipantEvent = {
  code: string; name: string; description: string | null; venue: string;
  eventStartsAt: string; checkInStartsAt: string; checkInEndsAt: string; status: string;
  locationRequired: boolean; photoRequired: boolean;
  customFields: Array<{ key: string; label: string; required: boolean; type: 'text' | 'email' | 'tel' }>;
};
type QueueStatus = 'NONE' | 'WAITING' | 'ACTIVE' | 'CHECKED_IN' | 'EXPIRED';
type Location = { latitude: number; longitude: number; accuracy: number; capturedAt: string };

async function errorText(response: Response) {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : 'Không thể hoàn tất yêu cầu.';
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

export function AttendanceParticipant({ event }: { event: ParticipantEvent }) {
  const [status, setStatus] = useState<QueueStatus>('NONE');
  const [position, setPosition] = useState<number | null>(null);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [queueReady, setQueueReady] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [offline, setOffline] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [clock, setClock] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idempotencyRef = useRef<string | null>(null);
  const pollDelayRef = useRef(5000);

  const accepting = event.status === 'OPEN' && clock >= new Date(event.checkInStartsAt).getTime() && clock <= new Date(event.checkInEndsAt).getTime();

  useEffect(() => {
    const update = () => setClock(Date.now());
    update(); const timer = window.setInterval(update, 20_000); return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync(); window.addEventListener('online', sync); window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    void videoRef.current.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => () => { stream?.getTracks().forEach((track) => track.stop()); if (photoPreview) URL.revokeObjectURL(photoPreview); }, [stream, photoPreview]);

  const refreshQueue = useCallback(async (signal: AbortSignal) => {
    const response = await fetch(`/api/public/attendance/${event.code}/queue`, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(await errorText(response));
    const data = await response.json() as { status: QueueStatus; position?: number | null; activeUntil?: string | null; checkedInAt?: string | null };
    signal.throwIfAborted();
    setStatus(data.status);
    setPosition(data.position ?? null);
    setActiveUntil(data.activeUntil ?? null);
    setCheckedInAt(data.checkedInAt ?? null);
    return data.status;
  }, [event.code]);

  useEffect(() => {
    if (queueReady || offline) return;
    const controller = new AbortController();
    void refreshQueue(controller.signal).then(() => setQueueReady(true)).catch(() => {
      if (!controller.signal.aborted) setQueueError('Không kiểm tra được lượt điểm danh. Vui lòng thử lại.');
    });
    return () => controller.abort();
  }, [offline, queueReady, refreshQueue, restoreAttempt]);

  useEffect(() => {
    if (busy || offline || (status !== 'WAITING' && status !== 'ACTIVE')) return;
    let timer = 0;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const next = await refreshQueue(controller.signal);
        pollDelayRef.current = next === 'WAITING' ? Math.min(15_000, pollDelayRef.current + 1500) : 10_000;
      } catch {
        if (controller.signal.aborted) return;
        pollDelayRef.current = Math.min(20_000, pollDelayRef.current + 3000);
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, pollDelayRef.current + Math.random() * 700);
    };
    timer = window.setTimeout(poll, status === 'ACTIVE' ? 10_000 : pollDelayRef.current + Math.random() * 700);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [busy, offline, refreshQueue, status]);

  useEffect(() => {
    if (status !== 'ACTIVE' || !activeUntil) return;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(activeUntil).getTime() - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [status, activeUntil]);

  async function joinQueue() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/public/attendance/${event.code}/queue`, { method: 'POST' });
      if (!response.ok) throw new Error(await errorText(response));
      const data = await response.json() as { status: QueueStatus };
      setStatus(data.status);
      pollDelayRef.current = 5000;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không vào được hàng đợi.'); }
    finally { setBusy(false); }
  }

  function locate() {
    setLocationBusy(true); setError('');
    if (!navigator.geolocation) { setLocationBusy(false); setError('Trình duyệt này không hỗ trợ xác định vị trí.'); return; }
    navigator.geolocation.getCurrentPosition((positionValue) => {
      setLocation({ latitude: positionValue.coords.latitude, longitude: positionValue.coords.longitude, accuracy: positionValue.coords.accuracy, capturedAt: new Date(positionValue.timestamp).toISOString() });
      setLocationBusy(false);
    }, (reason) => {
      setLocationBusy(false);
      setError(reason.code === reason.PERMISSION_DENIED ? 'Bạn đã từ chối quyền vị trí. Hãy bật quyền trong cài đặt trình duyệt rồi thử lại.' : reason.code === reason.TIMEOUT ? 'Không xác định được vị trí kịp thời. Hãy thử lại ở khu vực thông thoáng.' : 'Chưa xác định được vị trí. Hãy kiểm tra GPS và thử lại.');
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  }

  async function startCamera() {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Thiết bị hoặc trình duyệt không hỗ trợ camera.'); return; }
    setCameraBusy(true);
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      setStream(cameraStream);
    } catch (reason) {
      const errorName = reason instanceof Error ? reason.name : '';
      setCameraError(errorName === 'NotAllowedError' ? 'Bạn chưa cấp quyền camera. Hãy cho phép camera trong trình duyệt rồi thử lại.' : errorName === 'NotFoundError' ? 'Không tìm thấy camera trên thiết bị này.' : 'Không thể mở camera. Hãy thử lại hoặc đổi trình duyệt.');
    } finally { setCameraBusy(false); }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) { setCameraError('Camera chưa sẵn sàng. Hãy đợi một chút rồi chụp lại.'); return; }
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) { setCameraError('Không thể xử lý ảnh trên thiết bị này.'); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setCameraError('Không tạo được ảnh. Hãy chụp lại.'); return; }
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhoto(blob); setPhotoPreview(URL.createObjectURL(blob)); setCameraError('');
      stream?.getTracks().forEach((track) => track.stop()); setStream(null);
    }, 'image/jpeg', 0.78);
  }

  function retakePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null); setPhotoPreview(''); setCameraError(''); void startCamera();
  }

  async function submitCheckIn(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    if (offline) { setError('Bạn đang ngoại tuyến. Hãy kết nối mạng rồi gửi lại.'); return; }
    if (event.locationRequired && !location) { setError('Hãy xác minh vị trí trước khi tiếp tục.'); return; }
    if (event.photoRequired && !photo && !photoPreview) { setError('Hãy chụp ảnh trực tiếp bằng camera trước khi tiếp tục.'); return; }
    setBusy(true); setError('');
    try {
      let photoKey: string | null = null;
      if (photo) {
        const upload = await fetch(`/api/public/attendance/${event.code}/photo`, { method: 'POST', headers: { 'Content-Type': photo.type || 'image/jpeg' }, body: photo });
        if (!upload.ok) throw new Error(await errorText(upload));
        photoKey = (await upload.json() as { photoKey: string }).photoKey;
      }
      idempotencyRef.current ??= crypto.randomUUID();
      const body = {
        idempotencyKey: idempotencyRef.current,
        fullName: String(form.get('fullName') ?? ''), studentId: String(form.get('studentId') ?? ''),
        email: String(form.get('email') ?? ''), organization: String(form.get('organization') ?? ''),
        customAnswers, photoKey,
        ...(location ? { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy, locationCapturedAt: location.capturedAt } : {}),
      };
      const response = await fetch(`/api/public/attendance/${event.code}/check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await errorText(response));
      const data = await response.json() as { checkedInAt?: string };
      setCheckedInAt(data.checkedInAt ?? new Date().toISOString()); setStatus('CHECKED_IN');
    } catch (reason) {
      setError(!navigator.onLine
        ? 'Mất kết nối khi gửi. Thông tin vẫn còn trên trang. Hãy kết nối mạng rồi gửi lại.'
        : reason instanceof TypeError ? 'Không kết nối được với máy chủ. Vui lòng gửi lại.'
          : reason instanceof Error ? reason.message : 'Không thể gửi điểm danh.');
    }
    finally { setBusy(false); }
  }

  const closed = event.status === 'CLOSED' || event.status === 'COMPLETED' || event.status === 'ARCHIVED' || Date.now() > new Date(event.checkInEndsAt).getTime();
  const showForm = status === 'ACTIVE';

  return <main className="attendance-public-shell">
    <header className="attendance-public-header"><span className="attendance-public-brand"><span aria-hidden="true">CF</span> ContestFlow</span><span>Điểm danh sự kiện</span></header>
    <section className="attendance-public-main">
      <div className="attendance-public-kicker"><span className={status === 'ACTIVE' ? 'is-live' : ''} />{status === 'ACTIVE' ? 'ĐÃ ĐẾN LƯỢT' : status === 'WAITING' ? 'ĐANG XẾP HÀNG' : 'SỰ KIỆN'}</div>
      <h1>{event.name}</h1>
      {event.description && <p className="attendance-public-description">{event.description}</p>}
      <div className="attendance-public-meta"><span><Icon name="calendar" size={16} /> {dateTime(event.eventStartsAt)}</span><span><Icon name="users" size={16} /> {event.venue}</span><span><Icon name="clock" size={16} /> Điểm danh {dateTime(event.checkInStartsAt)} – {dateTime(event.checkInEndsAt)}</span></div>

      {offline && <div className="attendance-public-alert is-error" role="status">Mất kết nối mạng. Các thao tác cần mạng sẽ chưa được gửi.</div>}
      {error && <div className="attendance-public-alert is-error" role="alert">{error}</div>}
      {!queueReady && !offline && (queueError
        ? <div className="attendance-public-alert is-error"><span role="alert">{queueError}</span> <button className="text-button" type="button" onClick={() => { setQueueError(''); setRestoreAttempt((attempt) => attempt + 1); }}>Thử lại</button></div>
        : <div className="attendance-public-alert" role="status">Đang kiểm tra lượt điểm danh…</div>)}

      {status === 'CHECKED_IN' ? <div className="attendance-success-state" role="status"><span className="attendance-success-icon"><Icon name="check" size={28} /></span><h2>Điểm danh thành công</h2><p>Thông tin của bạn đã được ghi nhận vào {checkedInAt ? dateTime(checkedInAt) : 'sự kiện này'}.</p><strong>Hãy lưu màn hình xác nhận này nếu ban tổ chức yêu cầu đối chiếu.</strong></div>
        : showForm ? <form className="attendance-participant-form" onSubmit={submitCheckIn}>
          <div className="attendance-queue-ready"><span>Đến lượt của bạn</span><strong>Còn {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</strong><small>Hoàn tất trong thời gian này để giữ lượt.</small></div>
          <div className="attendance-step-heading"><span>01</span><div><h2>Thông tin của bạn</h2><p>Dùng mã sinh viên hoặc email để ngăn ghi nhận trùng.</p></div></div>
          <label className="field-label">Họ và tên<input className="field-input" name="fullName" minLength={2} maxLength={180} autoComplete="name" required /></label>
          <div className="attendance-form-pair"><label className="field-label">Mã sinh viên<input className="field-input" name="studentId" maxLength={80} autoComplete="off" /></label><label className="field-label">Email<input className="field-input" name="email" type="email" maxLength={255} autoComplete="email" /></label></div>
          <label className="field-label">Lớp / đơn vị<input className="field-input" name="organization" maxLength={180} autoComplete="organization" /></label>
          {event.customFields.map((field) => <label className="field-label" key={field.key}>{field.label}<input className="field-input" name={field.key} type={field.type} required={field.required} onChange={(change) => setCustomAnswers((values) => ({ ...values, [field.key]: change.target.value }))} /></label>)}

          {event.locationRequired && <div className="attendance-participant-step"><div className="attendance-step-heading"><span>02</span><div><h2>Xác minh vị trí</h2><p>Vị trí chỉ được dùng để kiểm tra khoảng cách với địa điểm sự kiện.</p></div></div><button className="button secondary-button" type="button" onClick={locate} disabled={locationBusy}>{locationBusy ? 'Đang xác định…' : location ? 'Cập nhật vị trí' : 'Cho phép và xác định vị trí'}</button>{location && <small className={location.accuracy <= 100 ? 'attendance-location-good' : 'attendance-location-poor'}>Độ chính xác khoảng {Math.round(location.accuracy)} m · vừa cập nhật</small>}</div>}

          {event.photoRequired && <div className="attendance-participant-step"><div className="attendance-step-heading"><span>03</span><div><h2>Ảnh chụp trực tiếp</h2><p>Ảnh được tối ưu trên thiết bị trước khi gửi. Không dùng ảnh từ thư viện.</p></div></div>{photoPreview ? <div className="attendance-camera-preview"><img src={photoPreview} alt="Ảnh bạn vừa chụp" /><button className="button secondary-button" type="button" onClick={retakePhoto}>Chụp lại</button></div> : stream ? <div className="attendance-camera-view"><video ref={videoRef} playsInline muted aria-label="Khung hình camera trực tiếp" /><button className="button primary-button" type="button" onClick={capturePhoto}>Chụp ảnh</button></div> : <button className="button secondary-button" type="button" onClick={() => void startCamera()} disabled={cameraBusy}>{cameraBusy ? 'Đang mở camera…' : 'Mở camera'}</button>}{cameraError && <small className="attendance-camera-error">{cameraError}</small>}</div>}

          {(event.locationRequired && location || event.photoRequired && photoPreview) && <p className="attendance-privacy-note">Vị trí GPS có thể bị giả mạo; hệ thống dùng nó như một tín hiệu kiểm tra tại chỗ, không phải xác minh tuyệt đối. Ảnh và vị trí chỉ hiển thị cho ban tổ chức.</p>}
          <button className="button primary-button attendance-submit" type="submit" disabled={busy || offline}>{busy ? 'Đang gửi điểm danh…' : 'Xác nhận điểm danh'}</button>
        </form>
        : status === 'WAITING' ? <div className="attendance-wait-state"><div className="attendance-queue-number">{position ?? '—'}</div><h2>Đang chờ đến lượt</h2><p>Vị trí của bạn trong hàng đợi. Trang sẽ tự cập nhật và giữ lượt nếu bạn tải lại.</p><div className="attendance-queue-progress"><span /></div><small>Không cần tải lại trang. Thời gian chờ chưa thể ước tính chính xác.</small></div>
        : <div className="attendance-intro-state">
          <div className="attendance-steps-preview"><span><i>1</i> Vào hàng đợi</span><b>→</b><span><i>2</i> Xác minh thông tin</span><b>→</b><span><i>3</i> Hoàn tất</span></div>
          <p>{closed ? 'Sự kiện chưa mở hoặc đã kết thúc nhận điểm danh.' : accepting ? 'Xếp hàng chỉ mất một bước. Khi đến lượt, bạn sẽ cần hoàn tất thông tin trong vài phút.' : `Điểm danh mở từ ${dateTime(event.checkInStartsAt)} đến ${dateTime(event.checkInEndsAt)}.`}</p>
          {status === 'EXPIRED' && <div className="attendance-public-alert is-error">Lượt chờ đã hết hạn. Bạn có thể vào hàng đợi lại.</div>}
          <button className="button primary-button attendance-submit" type="button" onClick={() => void joinQueue()} disabled={!queueReady || !accepting || busy || offline}>{busy ? 'Đang kết nối…' : status === 'EXPIRED' ? 'Vào hàng đợi lại' : 'Bắt đầu điểm danh'}</button>
        </div>}
      <footer className="attendance-public-footer">HUIT ContestFlow · Bảo vệ thông tin người tham gia</footer>
    </section>
  </main>;
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState, Loading, Notice, PageHeader, SectionCard, StatusPill, formatDate, formatDateTime } from '@/components/ui';

type Round = { id: string; name: string; sequence: number; status: string; anonymous: boolean; requiredJudgeCount: number; allowAdvanceWithGaps: boolean; publishScores: boolean; aggregateMethod: string; activeRubricVersionId: string | null; activeRubricVersion?: { id: string; name: string; criteria: Criterion[] } | null; _count: { entries: number; assignments: number; scoreSheets: number } };
type Criterion = { id?: string; name: string; description: string | null; minimum: number | string; maximum: number | string; step: number | string; weight: number | string; commentRequired: boolean; sequence?: number };
type Competition = { id: string; name: string; slug: string; description: string | null; organizingUnit: string | null; location: string | null; modality: 'ONSITE' | 'ONLINE' | 'HYBRID'; status: string; startsAt: string | null; endsAt: string | null; rounds: Round[]; _count: { contestants: number; members: number } };
type ApiOptions = { method?: string; body?: unknown };

async function api<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', method: options.method ?? 'GET', headers: options.body ? { 'content-type': 'application/json' } : undefined, body: options.body ? JSON.stringify(options.body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể hoàn tất thao tác.');
  return result as T;
}

const sections = [
  ['overview', 'Tổng quan'], ['contestants', 'Thí sinh'], ['judges', 'Giám khảo'], ['rubric', 'Tiêu chí chấm'], ['live', 'Điều phối'], ['scores', 'Phiếu điểm'], ['results', 'Kết quả'], ['activity', 'Nhật ký'],
] as const;

export function CompetitionWorkspace({ id, section }: { id: string; section: string }) {
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [roundId, setRoundId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const currentSection = sections.some(([key]) => key === section) ? section : 'overview';
  const round = useMemo(() => competition?.rounds.find((item) => item.id === roundId) ?? competition?.rounds[0] ?? null, [competition, roundId]);

  async function reload() {
    setLoading(true); setError('');
    try {
      const result = await api<{ competition: Competition; permissions: { manage: boolean } }>(`/api/competitions/${id}`);
      setCompetition(result.competition);
      setCanManage(result.permissions.manage);
      const requestedRound = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('roundId') : null;
      setRoundId((previous) => result.competition.rounds.some((item) => item.id === previous) ? previous : result.competition.rounds.some((item) => item.id === requestedRound) ? requestedRound! : result.competition.rounds[0]?.id ?? '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được cuộc thi.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [id]);

  if (loading) return <Loading label="Đang tải thông tin cuộc thi…" />;
  if (error && !competition) return <Notice tone="error">{error}</Notice>;
  if (!competition) return <EmptyState title="Không tìm thấy cuộc thi" description={error} action={<Link className="button secondary-button" href="/competitions">Về danh sách cuộc thi</Link>} />;

  const visibleSections = canManage ? sections : sections.filter(([key]) => key === 'results');
  const selected = sections.find(([key]) => key === currentSection)?.[1] ?? 'Tổng quan';
  return <>
    <PageHeader eyebrow={`CUỘC THI · ${competition.slug}`} title={competition.name} description={competition.description || 'Quản lý vòng thi, thí sinh, giám khảo và kết quả.'} action={<Link className="button secondary-button" href="/competitions">← Danh sách</Link>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!canManage && currentSection !== 'results' ? <EmptyState title="Trang quản lý dành cho ban tổ chức" description="Tài khoản này chỉ được xem kết quả đã công bố." action={<Link className="button primary-button" href={`/competitions/${id}/results`}>Xem kết quả</Link>} /> : <>
    <nav className="subnav" aria-label="Quản lý cuộc thi">{visibleSections.map(([key, label]) => <Link key={key} className={key === currentSection ? 'active' : ''} href={key === 'overview' ? `/competitions/${id}` : `/competitions/${id}/${key}`}>{label}</Link>)}</nav>
    {currentSection === 'overview' && canManage && <Overview competition={competition} onReload={reload} onRoundChange={setRoundId} />}
    {currentSection !== 'overview' && <>
      {competition.rounds.length > 0 && <div className="toolbar"><div className="toolbar-left"><label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>Vòng thi<select className="field-select" style={{ width: 'min(320px,65vw)' }} value={round?.id ?? ''} onChange={(event) => setRoundId(event.target.value)}>{competition.rounds.map((item) => <option value={item.id} key={item.id}>{item.sequence}. {item.name}</option>)}</select></label></div><StatusPill value={round?.status ?? 'DRAFT'} /></div>}
      {!round ? <EmptyState title="Chưa có vòng thi" description="Thêm vòng thi trong trang tổng quan trước khi thiết lập dữ liệu." action={<Link href={`/competitions/${id}`} className="button primary-button">Quản lý vòng thi</Link>} /> : <SectionContent id={id} round={round} section={currentSection} reload={reload} />}
    </>}
    </>}
    <span className="field-help">Đang xem: {selected}</span>
  </>;
}

function Overview({ competition, onReload, onRoundChange }: { competition: Competition; onReload: () => void; onRoundChange: (id: string) => void }) {
  const [name, setName] = useState(competition.name);
  const [description, setDescription] = useState(competition.description ?? '');
  const [organizingUnit, setOrganizingUnit] = useState(competition.organizingUnit ?? '');
  const [location, setLocation] = useState(competition.location ?? '');
  const [modality, setModality] = useState(competition.modality);
  const [status, setStatus] = useState(competition.status);
  const [startsAt, setStartsAt] = useState(toDateTimeInput(competition.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(competition.endsAt));
  const [roundName, setRoundName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(competition.name); setDescription(competition.description ?? ''); setOrganizingUnit(competition.organizingUnit ?? ''); setLocation(competition.location ?? ''); setModality(competition.modality); setStatus(competition.status); setStartsAt(toDateTimeInput(competition.startsAt)); setEndsAt(toDateTimeInput(competition.endsAt)); }, [competition]);
  async function saveDetails(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/competitions/${competition.id}`, { method: 'PATCH', body: {
        name, description: description || null, organizingUnit: organizingUnit || null,
        location: location || null, modality, status,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      } });
      setNotice('Đã lưu thông tin cuộc thi.'); onReload();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được.'); } finally { setBusy(false); }
  }
  async function duplicateCompetition() {
    const copyName = window.prompt('Tên cuộc thi mới:', `${competition.name} (bản sao)`);
    if (!copyName?.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ competition: { id: string } }>(`/api/competitions/${competition.id}/duplicate`, { method: 'POST', body: { name: copyName.trim() } });
      window.location.assign(`/competitions/${result.competition.id}`);
    } catch (reason) { setError(errorText(reason)); setBusy(false); }
  }
  async function archiveCompetition() {
    if (!window.confirm(`Lưu trữ “${competition.name}”? Lịch sử sẽ được giữ lại và cuộc thi không còn xuất hiện trong danh sách đang hoạt động.`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await api(`/api/competitions/${competition.id}`, { method: 'DELETE' }); window.location.assign('/competitions'); }
    catch (reason) { setError(errorText(reason)); setBusy(false); }
  }
  async function createRound(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try { const result = await api<{ round: Round }>(`/api/competitions/${competition.id}/rounds`, { method: 'POST', body: { name: roundName } }); setRoundName(''); setNotice('Đã tạo vòng thi và rubric mặc định.'); onRoundChange(result.round.id); onReload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tạo được vòng.'); }
  }
  return <div className="page-section">
    <div className="stats-grid">
      <MiniStat value={competition.rounds.length} label="Vòng thi" icon="◷" />
      <MiniStat value={competition._count.contestants} label="Thí sinh" icon="♙" tone="purple" />
      <MiniStat value={competition.rounds.reduce((sum, item) => sum + item._count.assignments, 0)} label="Phân công giám khảo" icon="◉" tone="amber" />
      <MiniStat value={competition.rounds.reduce((sum, item) => sum + item._count.scoreSheets, 0)} label="Phiếu điểm" icon="✓" tone="green" />
    </div>
    {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
    <div className="card-grid two-columns">
      <SectionCard title="Thông tin cuộc thi" subtitle={`Ngày bắt đầu: ${formatDate(competition.startsAt)} · Ngày kết thúc: ${formatDate(competition.endsAt)}`}>
        <form className="form-stack" onSubmit={saveDetails}>
          <label className="field-label">Tên cuộc thi<input className="field-input" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={180} /></label>
          <label className="field-label">Mô tả<textarea className="field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} /></label>
          <div className="form-grid"><label className="field-label">Đơn vị tổ chức<input className="field-input" value={organizingUnit} onChange={(event) => setOrganizingUnit(event.target.value)} maxLength={180} /></label><label className="field-label">Địa điểm / đường dẫn<input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={240} /></label></div>
          <div className="form-grid"><label className="field-label">Hình thức<select className="field-select" value={modality} onChange={(event) => setModality(event.target.value as Competition['modality'])}><option value="ONSITE">Trực tiếp</option><option value="ONLINE">Trực tuyến</option><option value="HYBRID">Kết hợp</option></select></label><label className="field-label">Trạng thái<select className="field-select" value={status} onChange={(event) => setStatus(event.target.value)}>{['DRAFT','REGISTRATION','READY','LIVE','COMPLETED','ARCHIVED'].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label></div>
          <div className="form-grid"><label className="field-label">Ngày bắt đầu<input className="field-input" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="field-label">Ngày kết thúc<input className="field-input" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
          <div className="form-actions"><button className="button primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
        </form>
      </SectionCard>
      <SectionCard title="Các vòng thi" subtitle="Mỗi vòng có danh sách lượt thi và rubric độc lập." action={<span className="metric-chip">{competition.rounds.length} vòng</span>}>
        {competition.rounds.length ? <div className="page-section">{competition.rounds.map((item) => <div className="round-card" key={item.id}><div className="round-card-head"><div><h3>{item.sequence}. {item.name}</h3><p>{item._count.entries} lượt thi · {item._count.assignments} phân công · {item._count.scoreSheets} phiếu</p></div><StatusPill value={item.status} /></div><div className="pill-row" style={{ marginTop: 11 }}><span className="metric-chip">{item.requiredJudgeCount} phiếu / lượt</span><span className="metric-chip">{item.aggregateMethod === 'MEDIAN' ? 'Trung vị' : 'Trung bình'}</span><Link className="text-button" href={`/competitions/${competition.id}/live?roundId=${item.id}`}>Mở điều phối →</Link></div><RoundSettings competitionId={competition.id} round={item} onSaved={onReload} /></div>)}</div> : <EmptyState title="Chưa có vòng thi" description="Tạo vòng thi để nhận thí sinh và phân công giám khảo." />}
        <form className="toolbar" style={{ marginTop: 16 }} onSubmit={createRound}><input className="field-input" value={roundName} onChange={(event) => setRoundName(event.target.value)} minLength={2} maxLength={160} required placeholder="Tên vòng thi mới" /><button className="button secondary-button">＋ Thêm vòng</button></form>
      </SectionCard>
    </div>
    <SectionCard title="Thao tác cuộc thi" subtitle="Nhân bản chỉ sao chép cấu hình vòng và rubric; thí sinh, tài khoản, điểm và kết quả không được chép theo.">
      <div className="form-actions"><button className="button secondary-button" type="button" disabled={busy} onClick={() => void duplicateCompetition()}>Nhân bản cấu hình</button>{competition.status !== 'ARCHIVED' && <button className="button danger-button" type="button" disabled={busy} onClick={() => void archiveCompetition()}>Lưu trữ cuộc thi</button>}</div>
    </SectionCard>
  </div>;
}

function MiniStat({ value, label, icon, tone = '' }: { value: number; label: string; icon: string; tone?: string }) {
  return <article className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-number">{value}</div><div className="stat-label">{label}</div></article>;
}

function RoundSettings({ competitionId, round, onSaved }: { competitionId: string; round: Round; onSaved: () => void }) {
  const [requiredJudgeCount, setRequiredJudgeCount] = useState(round.requiredJudgeCount);
  const [aggregateMethod, setAggregateMethod] = useState(round.aggregateMethod);
  const [anonymous, setAnonymous] = useState(round.anonymous);
  const [allowAdvanceWithGaps, setAllowAdvanceWithGaps] = useState(round.allowAdvanceWithGaps);
  const [publishScores, setPublishScores] = useState(round.publishScores);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      await api(`/api/competitions/${competitionId}/rounds/${round.id}`, { method: 'PATCH', body: { requiredJudgeCount: Number(requiredJudgeCount), aggregateMethod, anonymous, allowAdvanceWithGaps, publishScores } });
      setMessage('Đã lưu quy tắc.'); onSaved();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <details style={{ marginTop: 12 }}><summary className="text-button" style={{ cursor: 'pointer' }}>Quy tắc vòng thi</summary>
    <form className="form-stack" style={{ marginTop: 12 }} onSubmit={save}>
      {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}
      <div className="form-grid">
        <label className="field-label">Số phiếu yêu cầu / lượt<input className="field-input" type="number" min="1" max="30" value={requiredJudgeCount} onChange={(event) => setRequiredJudgeCount(Number(event.target.value))} /></label>
        <label className="field-label">Cách tổng hợp<select className="field-select" value={aggregateMethod} onChange={(event) => setAggregateMethod(event.target.value)}><option value="AVERAGE">Trung bình cộng</option><option value="MEDIAN">Trung vị</option></select></label>
      </div>
      <label className="pill-row field-help"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /> Ẩn danh thí sinh với giám khảo</label>
      <label className="pill-row field-help"><input type="checkbox" checked={allowAdvanceWithGaps} onChange={(event) => setAllowAdvanceWithGaps(event.target.checked)} /> Cho phép khóa kết quả khi còn thiếu phiếu</label>
      <label className="pill-row field-help"><input type="checkbox" checked={publishScores} onChange={(event) => setPublishScores(event.target.checked)} /> Công khai điểm từng giám khảo khi công bố kết quả</label>
      <div><button className="button secondary-button small-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu quy tắc'}</button></div>
    </form>
  </details>;
}

function SectionContent({ id, round, section, reload }: { id: string; round: Round; section: string; reload: () => void }) {
  switch (section) {
    case 'contestants': return <Contestants id={id} round={round} />;
    case 'judges': return <Judges id={id} round={round} />;
    case 'rubric': return <RubricEditor id={id} round={round} />;
    case 'live': return <LiveControl id={id} round={round} />;
    case 'scores': return <ScoreStatus id={id} round={round} />;
    case 'results': return <Results id={id} round={round} reload={reload} />;
    case 'activity': return <CompetitionActivity id={id} />;
    default: return <Notice tone="warning">Không tìm thấy mục quản lý.</Notice>;
  }
}

type ContestantItem = { id: string; displayName: string; organization: string | null; email: string | null; phone: string | null; entries: { id: string; entryCode: string; title: string | null; status: string; sequence: number; _count: { scoreSheets: number } }[] };

function Contestants({ id, round }: { id: string; round: Round }) {
  const [items, setItems] = useState<ContestantItem[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ContestantItem | null>(null);
  const [existingId, setExistingId] = useState('');
  async function load() { try { const result = await api<{ contestants: ContestantItem[] }>(`/api/competitions/${id}/contestants?roundId=${round.id}`); setItems(result.contestants); } catch (reason) { setError(errorText(reason)); } }
  useEffect(() => { setItems(null); void load(); }, [id, round.id]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      if (editing) {
        await api(`/api/competitions/${id}/contestants/${editing.id}`, { method: 'PATCH', body: { displayName: form.get('displayName'), organization: form.get('organization'), email: form.get('email'), phone: form.get('phone') } });
        setEditing(null); setNotice('Đã cập nhật hồ sơ thí sinh.');
      } else {
        await api(`/api/competitions/${id}/contestants`, { method: 'POST', body: { roundId: round.id, displayName: form.get('displayName'), organization: form.get('organization'), email: form.get('email'), phone: form.get('phone'), title: form.get('title') } });
        event.currentTarget.reset(); setNotice('Đã thêm thí sinh vào vòng thi.');
      }
      await load();
    }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function registerExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    try { await api(`/api/competitions/${id}/entries`, { method: 'POST', body: { contestantId: existingId, roundId: round.id } }); setNotice('Đã đăng ký hồ sơ vào vòng thi.'); setExistingId(''); await load(); }
    catch (reason) { setError(errorText(reason)); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setError(''); setNotice(''); setImporting(true);
    try {
      const csv = await file.text();
      const result = await api<{ imported: number }>(`/api/competitions/${id}/contestants/import`, { method: 'POST', body: { roundId: round.id, csv } });
      setNotice(`Đã nhập ${result.imported} thí sinh.`); await load();
    } catch (reason) { setError(errorText(reason)); }
    finally { setImporting(false); }
  }
  return <div className="card-grid two-columns">
    <SectionCard title="Danh sách thí sinh" subtitle="Thông tin cá nhân chỉ hiển thị cho người có quyền quản lý." action={<label className="button secondary-button small-button">{importing ? 'Đang nhập…' : '↑ Nhập CSV'}<input type="file" accept=".csv,text/csv" disabled={importing} style={{ display: 'none' }} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>}>
      {error && <Notice tone="error">{error}</Notice>}
      {!items ? <Loading /> : items.some((item) => item.entries.length) ? <div className="table-wrap"><table className="data-table"><thead><tr><th>MÃ</th><th>THÍ SINH / ĐỘI</th><th>ĐƠN VỊ</th><th>TRẠNG THÁI</th><th>PHIẾU</th><th></th></tr></thead><tbody>{items.filter((item) => item.entries.length).map((item) => { const entry = item.entries[0]; return <tr key={item.id}><td><strong>{entry.entryCode}</strong></td><td><strong>{item.displayName}</strong>{entry.title && <div className="field-help">{entry.title}</div>}</td><td>{item.organization || '—'}</td><td><StatusPill value={entry.status} /></td><td>{entry._count.scoreSheets}</td><td><div className="table-actions"><button className="button secondary-button small-button" onClick={() => setEditing(item)}>Sửa</button><button className="button danger-button small-button" onClick={async () => { if (!window.confirm(`Rút ${item.displayName} khỏi cuộc thi? Lịch sử điểm được giữ lại.`)) return; try { await api(`/api/competitions/${id}/contestants/${item.id}`, { method: 'DELETE' }); setNotice('Đã rút thí sinh; lịch sử điểm được giữ lại.'); await load(); } catch (reason) { setError(errorText(reason)); } }}>Rút</button></div></td></tr>; })}</tbody></table></div> : <EmptyState title="Chưa có thí sinh trong vòng này" description="Thêm thí sinh bằng biểu mẫu hoặc nhập danh sách CSV." />}
    </SectionCard>
    <SectionCard title={editing ? 'Chỉnh sửa hồ sơ' : 'Thêm thí sinh'} subtitle={editing ? 'Cập nhật thông tin liên hệ và đơn vị.' : `Lượt thi mới sẽ được tạo trong vòng “${round.name}”.`}>
      {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
      <form className="form-stack" key={editing?.id ?? 'new'} onSubmit={add}>
        <label className="field-label">Tên thí sinh hoặc đội *<input className="field-input" name="displayName" required minLength={2} maxLength={180} defaultValue={editing?.displayName ?? ''} placeholder="Nguyễn Văn A / Đội Innovate" /></label>
        {!editing && <label className="field-label">Tên đề tài / sản phẩm<input className="field-input" name="title" maxLength={180} placeholder="Tên đề tài dự thi" /></label>}
        <label className="field-label">Trường / đơn vị<input className="field-input" name="organization" maxLength={180} defaultValue={editing?.organization ?? ''} placeholder="Khoa Công nghệ thông tin" /></label>
        <div className="form-grid"><label className="field-label">Email<input className="field-input" name="email" type="email" defaultValue={editing?.email ?? ''} /></label><label className="field-label">Điện thoại<input className="field-input" name="phone" inputMode="tel" maxLength={32} defaultValue={editing?.phone ?? ''} /></label></div>
        <div className="table-actions">{editing && <button type="button" className="button secondary-button" onClick={() => setEditing(null)}>Hủy sửa</button>}<button className="button primary-button" disabled={busy}>{busy ? 'Đang lưu…' : editing ? 'Lưu hồ sơ' : '＋ Thêm vào vòng thi'}</button></div>
      </form>
      <div className="notice notice-info">Mã dự thi và thứ tự sẽ được cấp tự động. CSV dùng các cột: Tên, Đơn vị, Email, Điện thoại, Tên đề tài. Tối đa 500 dòng mỗi lần nhập.</div>
      {items?.some((item) => !item.entries.length) && <form className="form-stack" style={{ marginTop: 14 }} onSubmit={registerExisting}><label className="field-label">Thêm hồ sơ cũ vào vòng này<select className="field-select" value={existingId} onChange={(event) => setExistingId(event.target.value)} required><option value="">Chọn thí sinh…</option>{items.filter((item) => !item.entries.length).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><button className="button secondary-button" type="submit">Đăng ký vào vòng</button></form>}
    </SectionCard>
  </div>;
}

type Assignment = { id: string; user: { id: string; fullName: string; username: string | null; email: string | null }; round: { id: string; name: string }; entry: { id: string; entryCode: string } | null };
type JudgeEntryOption = { id: string; entryCode: string; sequence: number; status: string; contestant: { displayName: string } };

function Judges({ id, round }: { id: string; round: Round }) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [entries, setEntries] = useState<JudgeEntryOption[]>([]);
  const [entryId, setEntryId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [assignmentResult, contestantResult] = await Promise.all([
        api<{ assignments: Assignment[] }>(`/api/competitions/${id}/judges`),
        api<{ contestants: { displayName: string; entries: Omit<JudgeEntryOption, 'contestant'>[] }[] }>(`/api/competitions/${id}/contestants?roundId=${round.id}`),
      ]);
      setAssignments(assignmentResult.assignments.filter((item) => item.round.id === round.id));
      setEntries(contestantResult.contestants.flatMap((item) => item.entries.map((entry) => ({ ...entry, contestant: { displayName: item.displayName } }))).filter((entry) => entry.status === 'ACTIVE'));
    } catch (reason) { setError(errorText(reason)); }
  }
  useEffect(() => { setAssignments(null); void load(); }, [id, round.id]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { roundId: round.id, identifier: form.get('identifier') };
    const fullName = String(form.get('fullName') || '').trim(); if (fullName) body.fullName = fullName;
    if (entryId) body.entryId = entryId;
    const password = String(form.get('password') || ''); if (password) body.password = password;
    try { await api(`/api/competitions/${id}/judges`, { method: 'POST', body }); event.currentTarget.reset(); setEntryId(''); setNotice('Đã tạo hoặc cập nhật tài khoản và phân công giám khảo.'); await load(); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function resetPassword(item: Assignment) {
    if (!window.confirm(`Đặt mật khẩu tạm mới cho ${item.user.fullName}? Các phiên đăng nhập hiện tại của tài khoản này sẽ bị kết thúc.`)) return;
    setBusy(true); setError(''); setNotice(''); setTemporaryPassword('');
    try {
      const result = await api<{ temporaryPassword: string }>(`/api/competitions/${id}/judges/${item.id}`, { method: 'PATCH', body: { action: 'reset-password' } });
      setTemporaryPassword(result.temporaryPassword);
      setNotice(`Đã đặt lại mật khẩu cho ${item.user.fullName}. Hãy chuyển mật khẩu này qua kênh riêng.`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <div className="card-grid two-columns">
    <SectionCard title={`Giám khảo · ${round.name}`} subtitle="Phân công hiện tại áp dụng cho toàn bộ lượt thi trong vòng.">
      {error && <Notice tone="error">{error}</Notice>}
      {!assignments ? <Loading /> : assignments.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>GIÁM KHẢO</th><th>USERNAME / EMAIL</th><th>PHẠM VI</th><th></th></tr></thead><tbody>{assignments.map((item) => <tr key={item.id}><td><strong>{item.user.fullName}</strong></td><td>{item.user.email ?? item.user.username ?? '—'}</td><td>{item.entry ? item.entry.entryCode : 'Toàn vòng'}</td><td><div className="table-actions"><button className="button secondary-button small-button" type="button" disabled={busy} onClick={() => void resetPassword(item)}>Đặt lại mật khẩu</button><button className="button danger-button small-button" type="button" disabled={busy} onClick={async () => { if (!window.confirm(`Gỡ phân công của ${item.user.fullName}?`)) return; try { await api(`/api/competitions/${id}/judges/${item.id}`, { method: 'DELETE' }); await load(); } catch (reason) { setError(errorText(reason)); } }}>Gỡ</button></div></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa phân công giám khảo" description="Thêm tài khoản giám khảo để họ đăng nhập và nhận lượt chấm." />}
    </SectionCard>
    <SectionCard title="Thêm giám khảo" subtitle="Nhập username hoặc email để dùng tài khoản đã có, hoặc tạo tài khoản mới.">
      {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
      {temporaryPassword && <div className="notice notice-warning"><div className="form-stack"><strong>Mật khẩu tạm chỉ hiển thị trong phiên này</strong><code>{temporaryPassword}</code><button className="button secondary-button small-button" type="button" onClick={() => { void navigator.clipboard.writeText(temporaryPassword).then(() => setNotice('Đã sao chép mật khẩu tạm.')).catch(() => setError('Không thể truy cập clipboard; hãy chọn và sao chép mật khẩu thủ công.')); }}>Sao chép mật khẩu</button></div></div>}
      <form className="form-stack" onSubmit={add}>
        <label className="field-label">Username hoặc Email đăng nhập *<input className="field-input" name="identifier" required /></label>
        <label className="field-label">Họ tên <span className="field-help">Bắt buộc nếu tạo tài khoản mới.</span><input className="field-input" name="fullName" minLength={2} maxLength={160} /></label>
        <label className="field-label">Mật khẩu ban đầu <span className="field-help">Chỉ bắt buộc nếu chưa có tài khoản. Tối thiểu 12 ký tự.</span><input className="field-input" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <label className="field-label">Phạm vi phân công<select className="field-select" value={entryId} onChange={(event) => setEntryId(event.target.value)}><option value="">Toàn vòng thi</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.sequence}. {entry.entryCode} · {entry.contestant.displayName}</option>)}</select></label>
        <button className="button primary-button" disabled={busy}>{busy ? 'Đang phân công…' : '＋ Phân công vào vòng'}</button>
      </form>
      <div className="notice notice-info">Giám khảo chỉ xem và chấm các lượt thuộc phạm vi được phân công. Mật khẩu ban đầu cần được gửi riêng tới người dùng.</div>
    </SectionCard>
  </div>;
}

function RubricEditor({ id, round }: { id: string; round: Round }) {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [name, setName] = useState('Rubric chấm điểm');
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  useEffect(() => {
    setError(''); setCriteria([]); setVersion(null);
    api<{ rubrics: { name: string; versions: { version: number; name: string; criteria: Criterion[] }[] }[]; activeRubricVersionId: string | null }>(`/api/competitions/${id}/rubric?roundId=${round.id}`).then((result) => {
      const active = result.rubrics.flatMap((rubric) => rubric.versions).find((item) => item.criteria[0]?.id && item.criteria.some((criterion) => criterion.id === (round.activeRubricVersion?.criteria[0]?.id)));
      const selected = active ?? result.rubrics.flatMap((rubric) => rubric.versions).find((item) => item.version === 1) ?? null;
      if (selected) { setCriteria(selected.criteria); setName(selected.name); setVersion(selected.version); }
      else if (round.activeRubricVersion?.criteria) setCriteria(round.activeRubricVersion.criteria);
    }).catch((reason) => setError(errorText(reason)));
  }, [id, round.id, round.activeRubricVersionId]);
  function update(index: number, key: keyof Criterion, value: string | boolean) {
    setCriteria((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }
  function addCriterion() { setCriteria((items) => [...items, { name: '', description: '', minimum: 0, maximum: 10, step: 0.5, weight: 1, commentRequired: false }]); }
  const weightTotal = criteria.reduce((sum, item) => sum + (Number(item.weight) > 0 ? Number(item.weight) : 0), 0);
  const previewRows = criteria.map((item) => {
    const minimum = Number(item.minimum); const maximum = Number(item.maximum); const step = Number(item.step);
    const score = Number.isFinite(step) && step > 0 && maximum > minimum
      ? minimum + Math.round(((maximum - minimum) * 0.75) / step) * step
      : minimum;
    return { item, score, share: weightTotal ? Number(item.weight) / weightTotal : 0 };
  });
  const previewTotal = weightTotal ? previewRows.reduce((sum, row) => sum + row.score * Number(row.item.weight), 0) / weightTotal : 0;
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const result = await api<{ version: { version: number; name: string } }>(`/api/competitions/${id}/rubric`, { method: 'POST', body: { roundId: round.id, name, criteria: criteria.map((item) => ({ name: item.name, description: item.description ?? '', minimum: Number(item.minimum), maximum: Number(item.maximum), step: Number(item.step), weight: Number(item.weight), commentRequired: item.commentRequired })) } });
      setVersion(result.version.version); setNotice(`Đã lưu phiên bản ${result.version.version}. Phiên bản rubric hiện được kích hoạt cho vòng này.`);
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  return <div className="page-section">
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {round._count.scoreSheets > 0 && <Notice tone="warning">Vòng đã có phiếu điểm; rubric được khóa để giữ cùng một thang điểm cho mọi giám khảo.</Notice>}
    <SectionCard title="Rubric chấm điểm" subtitle={`Phiên bản đang xem: ${version ? `v${version}` : 'chưa lưu'} · Tổng trọng số được chuẩn hóa khi tính điểm.`}>
      <form className="form-stack" onSubmit={save}>
        <label className="field-label">Tên rubric<input className="field-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></label>
        {criteria.map((criterion, index) => <div className="round-card" key={criterion.id ?? index}>
          <div className="round-card-head"><strong>Tiêu chí {index + 1}</strong><button className="text-button" type="button" onClick={() => setCriteria((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Xóa</button></div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field-label">Tên tiêu chí<input className="field-input" value={criterion.name} onChange={(event) => update(index, 'name', event.target.value)} minLength={2} maxLength={160} required /></label>
            <label className="field-label">Trọng số<input className="field-input" type="number" min="0.01" step="0.01" value={criterion.weight} onChange={(event) => update(index, 'weight', event.target.value)} required /></label>
            <label className="field-label">Điểm tối thiểu<input className="field-input" type="number" step="0.01" value={criterion.minimum} onChange={(event) => update(index, 'minimum', event.target.value)} required /></label>
            <label className="field-label">Điểm tối đa<input className="field-input" type="number" step="0.01" value={criterion.maximum} onChange={(event) => update(index, 'maximum', event.target.value)} required /></label>
            <label className="field-label">Bước điểm<input className="field-input" type="number" min="0.01" step="0.01" value={criterion.step} onChange={(event) => update(index, 'step', event.target.value)} required /></label>
            <label className="field-label">Mô tả<input className="field-input" value={criterion.description ?? ''} onChange={(event) => update(index, 'description', event.target.value)} maxLength={2000} /></label>
            <label className="field-label"><span>Nhận xét</span><span className="pill-row"><input type="checkbox" checked={criterion.commentRequired} onChange={(event) => update(index, 'commentRequired', event.target.checked)} /> Bắt buộc nhận xét</span></label>
          </div>
        </div>)}
        <div className="toolbar"><button type="button" className="button secondary-button" onClick={addCriterion}>＋ Thêm tiêu chí</button><span className="field-help">Điểm tiêu chí: Σ(điểm × trọng số) / Σ(trọng số)</span></div>
        {weightTotal <= 0 && <Notice tone="error">Tổng trọng số phải lớn hơn 0.</Notice>}
        <div className="form-actions"><button type="button" className="button secondary-button" onClick={() => setPreviewVisible((value) => !value)}>{previewVisible ? 'Ẩn xem trước' : 'Xem trước phiếu'}</button><button className="button primary-button" disabled={busy || round._count.scoreSheets > 0 || criteria.length === 0 || weightTotal <= 0}>{busy ? 'Đang lưu…' : 'Lưu và kích hoạt phiên bản mới'}</button></div>
      </form>
    </SectionCard>
    {previewVisible && <SectionCard title="Xem trước phiếu chấm" subtitle={`Ví dụ minh họa bằng điểm gần 75% thang cho từng tiêu chí. Tổng trọng số hiện tại: ${weightTotal.toFixed(2)}.`}>
      {criteria.length ? <><div className="table-wrap"><table className="data-table"><thead><tr><th>TIÊU CHÍ</th><th>THANG ĐIỂM</th><th>TRỌNG SỐ</th><th>ĐIỂM MẪU</th><th>NHẬN XÉT</th></tr></thead><tbody>{previewRows.map(({ item, score, share }, index) => <tr key={item.id ?? index}><td><strong>{item.name || `Tiêu chí ${index + 1}`}</strong><div className="field-help">{item.description || 'Chưa có hướng dẫn chấm'}</div></td><td>{item.minimum}–{item.maximum}, bước {item.step}</td><td>{(share * 100).toFixed(1)}%</td><td>{Number.isFinite(score) ? score.toFixed(2) : '—'}</td><td>{item.commentRequired ? 'Bắt buộc' : 'Không bắt buộc'}</td></tr>)}</tbody></table></div><div className="score-footer"><span>Điểm tổng mẫu</span><strong>{previewTotal.toFixed(2)}</strong></div></> : <EmptyState title="Chưa có tiêu chí" description="Thêm ít nhất một tiêu chí để xem phiếu mẫu." />}
    </SectionCard>}
  </div>;
}

type EntryOption = { id: string; entryCode: string; sequence: number; status: string; title: string | null; contestant: { displayName: string; organization: string | null } };

function LiveControl({ id, round }: { id: string; round: Round }) {
  const [session, setSession] = useState<{ id: string; state: string; version: number; currentEntry: { id: string; entryCode: string; title: string | null; contestant?: { displayName: string; organization: string | null } } | null } | null>(null);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [selectedEntry, setSelectedEntry] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [live, contestantResult] = await Promise.all([
        api<{ session: NonNullable<typeof session> }>(`/api/competitions/${id}/rounds/${round.id}/session`),
        api<{ contestants: { entries: EntryOption[] }[] }>(`/api/competitions/${id}/contestants?roundId=${round.id}`),
      ]);
      setSession(live.session); setEntries(contestantResult.contestants.flatMap((item) => item.entries));
      setSelectedEntry(live.session.currentEntry?.id ?? '');
    } catch (reason) { setError(errorText(reason)); }
  }
  useEffect(() => { let active = true; setSession(null); void load(); const timer = window.setInterval(() => { if (active) void load(); }, 5000); return () => { active = false; window.clearInterval(timer); }; }, [id, round.id]);
  async function action(actionName: string, entryId?: string) {
    setBusy(true); setError('');
    try { const result = await api<{ session: NonNullable<typeof session> }>(`/api/competitions/${id}/rounds/${round.id}/session`, { method: 'POST', body: { action: actionName, entryId, expectedVersion: session?.version ?? 0 } }); setSession(result.session); setSelectedEntry(result.session.currentEntry?.id ?? ''); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <div className="page-section">
    {error && <Notice tone="error">{error}</Notice>}
    <SectionCard title="Điều phối lượt thi" subtitle="Mọi thay đổi được lưu trên máy chủ và xuất hiện ở khu vực giám khảo.">
      {!session ? <Loading /> : <>
        <div className="live-current"><span className="live-number">{session.currentEntry?.entryCode ?? '—'}</span><div><div className="pill-row"><StatusPill value={session.state} /><span className="metric-chip">Phiên bản trạng thái {session.version}</span></div><h3 style={{ marginTop: 8 }}>{session.currentEntry?.contestant?.displayName ?? (session.currentEntry ? 'Danh tính được ẩn' : 'Chưa chọn thí sinh')}</h3><p>{session.currentEntry?.title || (session.currentEntry ? `Đang ở vòng ${round.name}` : 'Bắt đầu phiên để gửi lượt thi hiện tại cho giám khảo.')}</p></div></div>
        <div className="live-controls" style={{ marginTop: 15 }}>
          {session.state === 'IDLE' && <button className="button primary-button" disabled={busy || entries.length === 0} onClick={() => void action('start')}>▶ Bắt đầu</button>}
          {session.state === 'PAUSED' && <button className="button primary-button" disabled={busy} onClick={() => void action('resume')}>▶ Tiếp tục</button>}
          {session.state === 'LIVE' && <button className="button secondary-button" disabled={busy} onClick={() => void action('pause')}>Ⅱ Tạm dừng</button>}
          <button className="button secondary-button" disabled={busy || entries.length === 0} onClick={() => void action('previous')}>← Lượt trước</button>
          <button className="button secondary-button" disabled={busy || entries.length === 0} onClick={() => void action('next')}>Lượt tiếp →</button>
          <label className="field-label" style={{ minWidth: 220 }}>Chọn trực tiếp<select className="field-select" value={selectedEntry} onChange={(event) => { setSelectedEntry(event.target.value); if (event.target.value) void action('select', event.target.value); }} disabled={busy}><option value="">Chọn thí sinh…</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.sequence}. {entry.entryCode} · {entry.contestant.displayName}</option>)}</select></label>
          <button className="button danger-button" disabled={busy || session.state === 'COMPLETED'} onClick={() => { if (window.confirm('Kết thúc phiên điều phối vòng thi?')) void action('finish'); }}>Kết thúc phiên</button>
        </div>
      </>}
    </SectionCard>
    <SectionCard title="Danh sách lượt thi" subtitle={`${entries.length} lượt thi đang hoạt động`}>
      {entries.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>THỨ TỰ</th><th>MÃ DỰ THI</th><th>THÍ SINH / ĐỘI</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{entry.sequence}</td><td><strong>{entry.entryCode}</strong></td><td><strong>{entry.contestant.displayName}</strong><div className="field-help">{entry.title || entry.contestant.organization || ''}</div></td><td><StatusPill value={session?.currentEntry?.id === entry.id ? 'LIVE' : entry.status} /></td><td><button className="button secondary-button small-button" disabled={busy} onClick={() => void action('select', entry.id)}>Chọn lượt này</button></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có lượt thi" description="Thêm thí sinh vào vòng trước khi bắt đầu." />}
    </SectionCard>
  </div>;
}

type ScoreStatusRow = { entry: { id: string; code: string; name: string }; requiredCount: number; submittedCount: number; judges: { id: string; name: string; email: string; status: string; totalScore: number | null; scoreSheetId: string | null }[] };

function ScoreStatus({ id, round }: { id: string; round: Round }) {
  const [rows, setRows] = useState<ScoreStatusRow[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() { try { setRows((await api<{ rows: ScoreStatusRow[] }>(`/api/competitions/${id}/scores?roundId=${round.id}`)).rows); } catch (reason) { setError(errorText(reason)); } }
  useEffect(() => { setRows(null); void load(); }, [id, round.id]);
  async function reopen(row: ScoreStatusRow, judgeName: string, scoreSheetId: string) {
    const reason = window.prompt(`Nhập lý do mở lại phiếu của ${judgeName} · ${row.entry.code} (tối thiểu 10 ký tự):`);
    if (!reason) return;
    try { await api(`/api/competitions/${id}/results`, { method: 'POST', body: { action: 'reopen-score', roundId: round.id, scoreSheetId, reason } }); setNotice(`Đã mở lại phiếu ${row.entry.code} của ${judgeName}.`); await load(); }
    catch (reasonError) { setError(errorText(reasonError)); }
  }
  const totalSubmitted = rows?.reduce((sum, row) => sum + row.submittedCount, 0) ?? 0;
  const totalNeeded = (rows?.length ?? 0) * round.requiredJudgeCount;
  return <SectionCard title="Trạng thái phiếu điểm" subtitle={`${round.name} · Cần ${round.requiredJudgeCount} giám khảo nộp cho mỗi lượt thi`}>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {rows === null ? <Loading /> : <>
      <div className="pill-row" style={{ marginBottom: 15 }}><span className="metric-chip">Đã nộp {totalSubmitted}/{totalNeeded} phiếu yêu cầu</span><span className="metric-chip">Còn thiếu {Math.max(0, totalNeeded - totalSubmitted)}</span></div>
      {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>LƯỢT THI</th><th>GIÁM KHẢO</th><th>TRẠNG THÁI</th><th>ĐIỂM</th><th>THAO TÁC</th></tr></thead><tbody>{rows.flatMap((row) => row.judges.length ? row.judges.map((judge) => <tr key={`${row.entry.id}-${judge.id}`}><td><strong>{row.entry.code}</strong><div className="field-help">{row.entry.name}</div></td><td>{judge.name}</td><td><StatusPill value={judge.status === 'MISSING' ? 'DRAFT' : judge.status} />{judge.status === 'MISSING' && <span className="field-help"> Chưa có phiếu</span>}</td><td>{judge.totalScore === null ? '—' : judge.totalScore.toFixed(2)}</td><td>{judge.status === 'SUBMITTED' && judge.scoreSheetId ? <button className="button secondary-button small-button" onClick={() => void reopen(row, judge.name, judge.scoreSheetId!)}>Mở lại</button> : '—'}</td></tr>) : [<tr key={`${row.entry.id}-empty`}><td><strong>{row.entry.code}</strong><div className="field-help">{row.entry.name}</div></td><td colSpan={4} className="field-help">Chưa phân công giám khảo</td></tr>])}</tbody></table></div> : <EmptyState title="Chưa có lượt thi" description="Thêm thí sinh và giám khảo trước khi theo dõi phiếu chấm." />}
    </>}
  </SectionCard>;
}

type ResultRow = { entryId: string; entryCode: string; title: string | null; contestant: string; organization: string | null; totalScore: number | null; rank: number | null; submittedCount: number; requiredCount: number; judges: { judge: string; score: number | null }[] };

function Results({ id, round, reload }: { id: string; round: Round; reload: () => void }) {
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [missing, setMissing] = useState<{ entryId: string; entryCode: string; displayName: string; submittedCount: number; requiredCount: number }[]>([]);
  const [snapshot, setSnapshot] = useState<{ id: string; version: number; published: boolean; lockedAt: string; data: ResultRow[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const result = await api<{ rows?: ResultRow[]; missing?: typeof missing; snapshot: typeof snapshot }>(`/api/competitions/${id}/results?roundId=${round.id}`); setRows(result.rows ?? result.snapshot?.data ?? []); setMissing(result.missing ?? []); setSnapshot(result.snapshot); }
    catch (reason) { setError(errorText(reason)); setRows([]); }
  }
  useEffect(() => { setRows(null); setError(''); void load(); }, [id, round.id]);
  async function action(actionName: 'lock' | 'publish') {
    setBusy(true); setNotice(''); setError('');
    try { const result = await api(`/api/competitions/${id}/results`, { method: 'POST', body: { action: actionName, roundId: round.id } }); setNotice(actionName === 'lock' ? 'Đã khóa kết quả và lưu snapshot.' : 'Đã công bố kết quả.'); if (actionName === 'lock') reload(); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <div className="page-section">
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    <SectionCard title={`Kết quả · ${round.name}`} subtitle="Điểm tổng được tính từ các phiếu đã nộp theo công thức của vòng thi." action={rows?.length ? <a className="button secondary-button small-button" href={`/api/competitions/${id}/results?roundId=${round.id}&format=csv`}>↓ Tải CSV</a> : undefined}>
      {rows === null ? <Loading /> : <>
        <div className="toolbar"><div className="pill-row"><span className="metric-chip">{rows.length} lượt thi</span>{snapshot && <span className="metric-chip">Snapshot v{snapshot.version} · khóa {formatDateTime(snapshot.lockedAt)}</span>}<span className="metric-chip">{snapshot?.published ? 'Đã công bố' : snapshot ? 'Chưa công bố' : 'Chưa khóa'}</span></div><div className="toolbar-right">{snapshot ? !snapshot.published && <button className="button primary-button small-button" disabled={busy} onClick={() => void action('publish')}>{busy ? 'Đang xử lý…' : 'Công bố kết quả'}</button> : <button className="button primary-button small-button" disabled={busy || rows.length === 0} onClick={() => void action('lock')}>{busy ? 'Đang khóa…' : 'Khóa kết quả'}</button>}</div></div>
        {missing.length > 0 && <Notice tone="warning">{missing.length} lượt thi chưa đủ phiếu chấm yêu cầu.</Notice>}
        {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>HẠNG</th><th>MÃ</th><th>THÍ SINH / ĐỘI</th><th>ĐIỂM TỔNG</th><th>PHIẾU</th><th>CHI TIẾT GIÁM KHẢO</th></tr></thead><tbody>{rows.map((row) => <tr key={row.entryId}><td><span className="result-rank">{row.rank ?? '—'}</span></td><td><strong>{row.entryCode}</strong></td><td><strong>{row.contestant}</strong><div className="field-help">{row.title || row.organization || ''}</div></td><td><strong>{row.totalScore === null ? '—' : row.totalScore.toFixed(2)}</strong></td><td>{row.submittedCount}/{row.requiredCount}</td><td>{row.judges.map((judge) => `${judge.judge}: ${judge.score?.toFixed(2) ?? '—'}`).join(' · ') || '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có kết quả" description="Cần thêm lượt thi và phiếu chấm trước khi tổng hợp." />}
      </>}
    </SectionCard>
  </div>;
}

function CompetitionActivity({ id }: { id: string }) {
  const [events, setEvents] = useState<{ id: string; action: string; entityType: string; entityId: string | null; createdAt: string; details: unknown; actor: { fullName: string; email: string } | null }[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<{ events: NonNullable<typeof events> }>(`/api/competitions/${id}/audit`).then((result) => setEvents(result.events)).catch((reason) => { setError(errorText(reason)); setEvents([]); }); }, [id]);
  return <SectionCard title="Nhật ký hoạt động" subtitle="Lịch sử phân công, điều phối, chấm điểm, khóa và công bố.">
    {error && <Notice tone="error">{error}</Notice>}
    {events === null ? <Loading /> : events.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>THỜI ĐIỂM</th><th>NGƯỜI THỰC HIỆN</th><th>HÀNH ĐỘNG</th><th>ĐỐI TƯỢNG</th><th>CHI TIẾT</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDateTime(event.createdAt)}</td><td>{event.actor?.fullName ?? 'Hệ thống'}</td><td><strong>{event.action}</strong></td><td>{event.entityType}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</td><td className="field-help">{event.details ? JSON.stringify(event.details) : '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có nhật ký" description="Các hoạt động sẽ xuất hiện sau khi có thay đổi trong cuộc thi." />}
  </SectionCard>;
}

function statusLabel(value: string) { return ({ DRAFT: 'Bản nháp', REGISTRATION: 'Mở đăng ký', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Hoàn tất', ARCHIVED: 'Lưu trữ' } as Record<string, string>)[value] ?? value; }
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Hãy thử lại.'; }
function toDateTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

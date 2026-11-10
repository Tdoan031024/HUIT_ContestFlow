'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Dialog, EmptyState, Loading, Notice, PageHeader, SectionCard, StatusPill, formatDate, formatDateTime, useConfirmDialog, useTextPromptDialog } from '@/components/ui';
import { auditActionLabel, auditDetailRows, auditEntityLabel } from '@/lib/audit-labels';
import { Icon, type IconName } from '@/components/icons';

type Round = { id: string; name: string; sequence: number; status: string; session?: { state: string } | null; anonymous: boolean; requiredJudgeCount: number; allowAdvanceWithGaps: boolean; publishScores: boolean; aggregateMethod: string; tieBreakMethod: string; roundingPrecision: number; activeRubricVersionId: string | null; activeRubricVersion?: { id: string; name: string; criteria: Criterion[] } | null; _count: { entries: number; assignments: number; scoreSheets: number; snapshots: number } };
type Criterion = { id?: string; name: string; description: string | null; minimum: number | string; maximum: number | string; step: number | string; weight: number | string; commentRequired: boolean; sequence?: number };
type Competition = { id: string; name: string; slug: string; description: string | null; organizingUnit: string | null; location: string | null; modality: 'ONSITE' | 'ONLINE' | 'HYBRID'; status: string; startsAt: string | null; endsAt: string | null; rounds: Round[]; _count: { contestants: number; members: number } };
type ApiOptions = { method?: string; body?: unknown };

async function api<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', method: options.method ?? 'GET', headers: options.body ? { 'content-type': 'application/json' } : undefined, body: options.body ? JSON.stringify(options.body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Không thể hoàn tất thao tác.') as Error & { status?: number; data?: unknown };
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result as T;
}

const sections = [
  ['overview', 'Tổng quan'], ['contestants', 'Thí sinh'], ['judges', 'Giám khảo'], ['rubric', 'Tiêu chí chấm'], ['live', 'Điều phối'], ['scores', 'Phiếu điểm'], ['results', 'Kết quả'], ['activity', 'Nhật ký'],
] as const;

export function CompetitionWorkspace({ id, section }: { id: string; section: string }) {
  const router = useRouter();
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
  return <>
    <PageHeader eyebrow={`CUỘC THI · ${competition.slug}`} title={competition.name} description={competition.description || 'Quản lý vòng thi, thí sinh, giám khảo và kết quả.'} action={<Link className="button secondary-button" href="/competitions">← Danh sách</Link>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!canManage && currentSection !== 'results' ? <EmptyState title="Trang quản lý dành cho ban tổ chức" description="Tài khoản này chỉ được xem kết quả đã công bố." action={<Link className="button primary-button" href={`/competitions/${id}/results`}>Xem kết quả</Link>} /> : <>
    <nav className="subnav" aria-label="Quản lý cuộc thi">{visibleSections.map(([key, label]) => <Link key={key} className={key === currentSection ? 'active' : ''} href={key === 'overview' ? `/competitions/${id}` : `/competitions/${id}/${key}`}>{label}</Link>)}</nav>
    {visibleSections.length > 1 && <label className="mobile-subnav-select"><span>Mục cuộc thi</span><select aria-label="Chuyển mục quản lý cuộc thi" value={currentSection === 'overview' ? `/competitions/${id}` : `/competitions/${id}/${currentSection}`} onChange={(event) => router.push(event.currentTarget.value)}>{visibleSections.map(([key, label]) => <option key={key} value={key === 'overview' ? `/competitions/${id}` : `/competitions/${id}/${key}`}>{label}</option>)}</select></label>}
    {currentSection === 'overview' && canManage && <Overview competition={competition} onReload={reload} onRoundChange={setRoundId} />}
    {currentSection !== 'overview' && <>
      {competition.rounds.length > 0 && <div className="toolbar"><div className="toolbar-left"><label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>Vòng thi<select className="field-select" style={{ width: 'min(320px,65vw)' }} value={round?.id ?? ''} onChange={(event) => setRoundId(event.target.value)}>{competition.rounds.map((item) => <option value={item.id} key={item.id}>{item.sequence}. {item.name}</option>)}</select></label></div><StatusPill value={round?.status ?? 'DRAFT'} /></div>}
      {!round ? <EmptyState title="Chưa có vòng thi" description="Thêm vòng thi trong trang tổng quan trước khi thiết lập dữ liệu." action={<Link href={`/competitions/${id}`} className="button primary-button">Quản lý vòng thi</Link>} /> : <SectionContent id={id} round={round} section={currentSection} reload={reload} canManage={canManage} />}
    </>}
    </>}
  </>;
}

function Overview({ competition, onReload, onRoundChange }: { competition: Competition; onReload: () => void; onRoundChange: (id: string) => void }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const { promptText, dialog: textPromptDialog } = useTextPromptDialog();
  const [name, setName] = useState(competition.name);
  const [description, setDescription] = useState(competition.description ?? '');
  const [organizingUnit, setOrganizingUnit] = useState(competition.organizingUnit ?? '');
  const [location, setLocation] = useState(competition.location ?? '');
  const [modality, setModality] = useState(competition.modality);
  const [startsAt, setStartsAt] = useState(toDateTimeInput(competition.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(competition.endsAt));
  const [roundName, setRoundName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(competition.name); setDescription(competition.description ?? ''); setOrganizingUnit(competition.organizingUnit ?? ''); setLocation(competition.location ?? ''); setModality(competition.modality); setStartsAt(toDateTimeInput(competition.startsAt)); setEndsAt(toDateTimeInput(competition.endsAt)); }, [competition]);
  async function saveDetails(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/competitions/${competition.id}`, { method: 'PATCH', body: {
        name, description: description || null, organizingUnit: organizingUnit || null,
        location: location || null, modality,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      } });
      setNotice('Đã lưu thông tin cuộc thi.'); onReload();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được.'); } finally { setBusy(false); }
  }
  async function duplicateCompetition() {
    const copyName = await promptText({ title: 'Nhân bản cấu hình', description: 'Thí sinh, tài khoản, điểm và kết quả sẽ không được sao chép.', label: 'Tên cuộc thi mới', defaultValue: `${competition.name} (bản sao)`, minLength: 3, maxLength: 180, submitLabel: 'Tạo bản sao' });
    if (!copyName?.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ competition: { id: string } }>(`/api/competitions/${competition.id}/duplicate`, { method: 'POST', body: { name: copyName.trim() } });
      window.location.assign(`/competitions/${result.competition.id}`);
    } catch (reason) { setError(errorText(reason)); setBusy(false); }
  }
  async function archiveCompetition() {
    const accepted = await confirm({ title: 'Lưu trữ cuộc thi?', description: `“${competition.name}” sẽ rời khỏi danh sách đang hoạt động. Lịch sử cuộc thi vẫn được giữ lại.`, confirmLabel: 'Lưu trữ', danger: true });
    if (!accepted) return;
    setBusy(true); setError(''); setNotice('');
    try { await api(`/api/competitions/${competition.id}`, { method: 'DELETE' }); window.location.assign('/competitions'); }
    catch (reason) { setError(errorText(reason)); setBusy(false); }
  }
  async function closeEarly() {
    const reason = await promptText({ title: 'Đóng sớm cuộc thi', description: 'Mọi vòng chưa hoàn tất sẽ được đánh dấu kết thúc; phiên live đang chạy sẽ dừng. Điểm đã có vẫn giữ nguyên, nhưng phiếu mới không thể bắt đầu và phiếu đã nộp không thể mở lại.', label: 'Lý do đóng sớm (tối thiểu 10 ký tự)', minLength: 10, maxLength: 2000, submitLabel: 'Tiếp tục' });
    if (!reason) return;
    const accepted = await confirm({ title: 'Xác nhận đóng sớm?', description: `Cuộc thi “${competition.name}” sẽ chuyển sang hoàn tất ngay. Lý do sẽ được lưu vào nhật ký.`, confirmLabel: 'Đóng sớm cuộc thi', danger: true });
    if (!accepted) return;
    setBusy(true); setError(''); setNotice('');
    try { await api(`/api/competitions/${competition.id}/close-early`, { method: 'POST', body: { reason } }); window.location.assign(`/competitions/${competition.id}`); }
    catch (reasonError) { setError(errorText(reasonError)); setBusy(false); }
  }
  async function createRound(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try { const result = await api<{ round: Round }>(`/api/competitions/${competition.id}/rounds`, { method: 'POST', body: { name: roundName } }); setRoundName(''); setNotice('Đã tạo vòng thi và rubric mặc định.'); onRoundChange(result.round.id); onReload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tạo được vòng.'); }
  }
  return <><div className="page-section">
    <div className="stats-grid">
      <MiniStat value={competition.rounds.length} label="Vòng thi" icon="calendar" />
      <MiniStat value={competition._count.contestants} label="Thí sinh" icon="users" />
      <MiniStat value={competition.rounds.reduce((sum, item) => sum + item._count.assignments, 0)} label="Phân công giám khảo" icon="clipboard" />
      <MiniStat value={competition.rounds.reduce((sum, item) => sum + item._count.scoreSheets, 0)} label="Phiếu điểm" icon="check" tone="green" />
    </div>
    <div className="competition-lifecycle"><span>Trạng thái hiện tại</span><StatusPill value={competition.status} /><small>Trạng thái được cập nhật theo hoạt động của các vòng thi.</small></div>
    {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
    <div className="card-grid two-columns">
      <SectionCard title="Thông tin cuộc thi" subtitle={`Ngày bắt đầu: ${formatDate(competition.startsAt)} · Ngày kết thúc: ${formatDate(competition.endsAt)}`}>
        <form className="form-stack" onSubmit={saveDetails}>
          <label className="field-label">Tên cuộc thi<input className="field-input" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={180} /></label>
          <label className="field-label">Mô tả<textarea className="field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} /></label>
          <div className="form-grid"><label className="field-label">Đơn vị tổ chức<input className="field-input" value={organizingUnit} onChange={(event) => setOrganizingUnit(event.target.value)} maxLength={180} /></label><label className="field-label">Địa điểm / đường dẫn<input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={240} /></label></div>
          <label className="field-label">Hình thức<select className="field-select" value={modality} onChange={(event) => setModality(event.target.value as Competition['modality'])}><option value="ONSITE">Trực tiếp</option><option value="ONLINE">Trực tuyến</option><option value="HYBRID">Kết hợp</option></select></label>
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
      <div className="form-actions"><button className="button secondary-button" type="button" disabled={busy} onClick={() => void duplicateCompetition()}>Nhân bản cấu hình</button>{competition.status !== 'ARCHIVED' && competition.status !== 'COMPLETED' && <button className="button danger-button" type="button" disabled={busy} onClick={() => void closeEarly()}>Đóng sớm cuộc thi</button>}{competition.status !== 'ARCHIVED' && <button className="button danger-button" type="button" disabled={busy} onClick={() => void archiveCompetition()}>Lưu trữ cuộc thi</button>}</div>
    </SectionCard>
  </div>{textPromptDialog}{confirmationDialog}</>;
}

function MiniStat({ value, label, icon, tone = '' }: { value: number; label: string; icon: IconName; tone?: string }) {
  return <article className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`} aria-hidden="true"><Icon name={icon} /></span></div><div className="stat-number">{value}</div><div className="stat-label">{label}</div></article>;
}

function RoundSettings({ competitionId, round, onSaved }: { competitionId: string; round: Round; onSaved: () => void }) {
  const [requiredJudgeCount, setRequiredJudgeCount] = useState(round.requiredJudgeCount);
  const [aggregateMethod, setAggregateMethod] = useState(round.aggregateMethod);
  const [tieBreakMethod, setTieBreakMethod] = useState(round.tieBreakMethod);
  const [roundingPrecision, setRoundingPrecision] = useState(round.roundingPrecision);
  const [anonymous, setAnonymous] = useState(round.anonymous);
  const [allowAdvanceWithGaps, setAllowAdvanceWithGaps] = useState(round.allowAdvanceWithGaps);
  const [publishScores, setPublishScores] = useState(round.publishScores);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionStarted = round.session !== null && round.session !== undefined && round.session.state !== 'IDLE';
  const scoringPolicyLocked = round._count.scoreSheets > 0 || round._count.snapshots > 0 || round.status === 'LIVE' || round.status === 'COMPLETED' || sessionStarted;
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      await api(`/api/competitions/${competitionId}/rounds/${round.id}`, { method: 'PATCH', body: { requiredJudgeCount: Number(requiredJudgeCount), aggregateMethod, tieBreakMethod, roundingPrecision: Number(roundingPrecision), anonymous, allowAdvanceWithGaps, publishScores } });
      setMessage('Đã lưu quy tắc.'); onSaved();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <details style={{ marginTop: 12 }}><summary className="text-button" style={{ cursor: 'pointer' }}>Quy tắc vòng thi</summary>
    <form className="form-stack" style={{ marginTop: 12 }} onSubmit={save}>
      {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}
      {scoringPolicyLocked && <Notice tone="info">Cách tổng hợp, làm tròn và xử lý đồng điểm đã khóa để giữ cùng một quy chế cho toàn bộ phiếu trong vòng.</Notice>}
      <div className="form-grid">
        <label className="field-label">Số phiếu yêu cầu / lượt<input className="field-input" type="number" min="1" max="30" value={requiredJudgeCount} onChange={(event) => setRequiredJudgeCount(Number(event.target.value))} disabled={scoringPolicyLocked} /></label>
        <label className="field-label">Cách tổng hợp<select className="field-select" disabled={scoringPolicyLocked} value={aggregateMethod} onChange={(event) => setAggregateMethod(event.target.value)}><option value="AVERAGE">Trung bình cộng</option><option value="MEDIAN">Trung vị</option></select></label>
        <label className="field-label">Làm tròn điểm tổng<select className="field-select" disabled={scoringPolicyLocked} value={roundingPrecision} onChange={(event) => setRoundingPrecision(Number(event.target.value))}>{[0, 1, 2, 3, 4].map((precision) => <option key={precision} value={precision}>{precision} chữ số thập phân</option>)}</select></label>
        <label className="field-label">Xử lý đồng điểm<select className="field-select" disabled={scoringPolicyLocked} value={tieBreakMethod} onChange={(event) => setTieBreakMethod(event.target.value)}><option value="TOTAL_SCORE">Đồng hạng khi bằng điểm tổng</option><option value="CRITERIA_PRIORITY">So tiêu chí theo thứ tự ưu tiên</option></select></label>
      </div>
      <p className="field-help">Nếu chọn ưu tiên tiêu chí, hệ thống so lần lượt theo thứ tự rubric; nếu vẫn bằng nhau, các thí sinh đồng hạng.</p>
      <label className="pill-row field-help"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} disabled={scoringPolicyLocked} /> Ẩn danh thí sinh với giám khảo (mặc định bật cho vòng mới)</label>
      <label className="pill-row field-help"><input type="checkbox" checked={allowAdvanceWithGaps} onChange={(event) => setAllowAdvanceWithGaps(event.target.checked)} disabled={scoringPolicyLocked} /> Cho phép khóa kết quả khi còn thiếu phiếu (yêu cầu lý do ngoại lệ)</label>
      <label className="pill-row field-help"><input type="checkbox" checked={publishScores} onChange={(event) => setPublishScores(event.target.checked)} disabled={scoringPolicyLocked} /> Công khai điểm từng giám khảo khi công bố kết quả</label>
      <div><button className="button secondary-button small-button" disabled={busy || scoringPolicyLocked}>{busy ? 'Đang lưu…' : 'Lưu quy tắc'}</button></div>
    </form>
  </details>;
}

function SectionContent({ id, round, section, reload, canManage }: { id: string; round: Round; section: string; reload: () => void; canManage: boolean }) {
  switch (section) {
    case 'contestants': return <Contestants id={id} round={round} />;
    case 'judges': return <Judges id={id} round={round} />;
    case 'rubric': return <RubricEditor id={id} round={round} />;
    case 'live': return <LiveControl id={id} round={round} />;
    case 'scores': return <ScoreStatus id={id} round={round} />;
    case 'results': return <Results id={id} round={round} reload={reload} canManage={canManage} />;
    case 'activity': return <CompetitionActivity id={id} />;
    default: return <Notice tone="warning">Không tìm thấy mục quản lý.</Notice>;
  }
}

type EntryRow = { id: string; entryCode: string; title: string | null; status: string; sequence: number; _count: { scoreSheets: number } };
type ContestantItem = { id: string; displayName: string; organization: string | null; email: string | null; phone: string | null; entries: EntryRow[] };
type CsvPreview = { rows: { rowNumber: number; displayName: string; organization: string; email: string; phone: string; title: string }[]; issues: { rowNumber: number | null; message: string }[]; totalRows: number };

function Contestants({ id, round }: { id: string; round: Round }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const [items, setItems] = useState<ContestantItem[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [editing, setEditing] = useState<ContestantItem | null>(null);
  const [existingId, setExistingId] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [pendingCsv, setPendingCsv] = useState('');
  async function load() {
    try { const result = await api<{ contestants: ContestantItem[] }>(`/api/competitions/${id}/contestants?roundId=${round.id}`); setItems(result.contestants); }
    catch (reason) { setError(errorText(reason)); }
  }
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
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
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
      const result = await api<{ preview: CsvPreview }>(`/api/competitions/${id}/contestants/import`, { method: 'POST', body: { roundId: round.id, csv, confirm: false } });
      setPendingCsv(csv); setCsvPreview(result.preview);
    } catch (reason) { setError(errorText(reason)); }
    finally { setImporting(false); }
  }
  async function confirmImport() {
    if (!pendingCsv || !csvPreview || csvPreview.issues.length) return;
    setError(''); setImporting(true);
    try {
      const result = await api<{ imported: number }>(`/api/competitions/${id}/contestants/import`, { method: 'POST', body: { roundId: round.id, csv: pendingCsv, confirm: true } });
      setNotice(`Đã nhập ${result.imported} thí sinh sau khi xác nhận.`); setCsvPreview(null); setPendingCsv(''); await load();
    } catch (reason) { setError(errorText(reason)); }
    finally { setImporting(false); }
  }
  async function moveEntry(entryId: string, direction: -1 | 1) {
    const ordered = [...(items ?? []).flatMap((item) => item.entries)].sort((a, b) => a.sequence - b.sequence);
    const index = ordered.findIndex((entry) => entry.id === entryId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= ordered.length) return;
    const entryIds = ordered.map((entry) => entry.id);
    [entryIds[index], entryIds[destination]] = [entryIds[destination], entryIds[index]];
    setError(''); setNotice(''); setReordering(true);
    try { await api(`/api/competitions/${id}/entries`, { method: 'PATCH', body: { roundId: round.id, entryIds } }); setNotice('Đã cập nhật thứ tự thi và ghi nhận vào nhật ký.'); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setReordering(false); }
  }
  const orderedEntries = [...(items ?? []).flatMap((item) => item.entries)].sort((a, b) => a.sequence - b.sequence);
  const contestantByEntry = new Map((items ?? []).flatMap((item) => item.entries.map((entry) => [entry.id, item] as const)));
  const dataLocked = round.status === 'LIVE' || round.status === 'COMPLETED' || round._count.scoreSheets > 0 || round._count.snapshots > 0 || Boolean(round.session && round.session.state !== 'IDLE');
  return <><div className="card-grid two-columns">
    <SectionCard title="Danh sách thí sinh" subtitle="Thông tin hồ sơ chỉ hiển thị cho Admin." action={<label className={`button secondary-button small-button${dataLocked ? ' is-disabled' : ''}`}>{importing ? 'Đang đọc…' : '↑ Nhập CSV'}<input type="file" accept=".csv,text/csv" disabled={importing || dataLocked} style={{ display: 'none' }} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>}>
      {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
      {csvPreview && <div className="csv-preview">
        <div className="surface-heading"><div><h2>Xem trước danh sách nhập</h2><p>{csvPreview.totalRows} dòng · kiểm tra tên, email và dữ liệu trùng trước khi lưu</p></div><button className="text-button" type="button" onClick={() => { setCsvPreview(null); setPendingCsv(''); }}>Hủy</button></div>
        {csvPreview.issues.length > 0 && <div className="csv-preview-errors" role="alert"><strong>Cần sửa {csvPreview.issues.length} lỗi trước khi nhập</strong><ul>{csvPreview.issues.map((issue, index) => <li key={`${issue.rowNumber}-${index}`}>{issue.rowNumber ? `Dòng ${issue.rowNumber}: ` : ''}{issue.message}</li>)}</ul></div>}
        <div className="table-wrap csv-preview-table"><table className="data-table"><thead><tr><th>DÒNG</th><th>TÊN</th><th>ĐƠN VỊ</th><th>EMAIL</th><th>ĐIỆN THOẠI</th><th>ĐỀ TÀI</th></tr></thead><tbody>{csvPreview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.displayName || '—'}</td><td>{row.organization || '—'}</td><td>{row.email || '—'}</td><td>{row.phone || '—'}</td><td>{row.title || '—'}</td></tr>)}</tbody></table></div>
        <div className="form-actions"><button className="button secondary-button" type="button" onClick={() => { setCsvPreview(null); setPendingCsv(''); }}>Hủy nhập</button><button className="button primary-button" type="button" disabled={importing || csvPreview.issues.length > 0} onClick={() => void confirmImport()}>{importing ? 'Đang nhập…' : `Xác nhận nhập ${csvPreview.totalRows} thí sinh`}</button></div>
      </div>}
      {dataLocked && <Notice tone="warning">Hồ sơ và danh sách lượt thi đã khóa vì điều phối hoặc chấm điểm đã bắt đầu. Lịch sử điểm và kết quả không bị thay đổi.</Notice>}
      {!items ? <Loading /> : orderedEntries.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>THỨ TỰ</th><th>MÃ</th><th>THÍ SINH / ĐỘI</th><th>ĐƠN VỊ</th><th>TRẠNG THÁI</th><th>PHIẾU</th><th>THAO TÁC</th></tr></thead><tbody>{orderedEntries.map((entry, index) => { const item = contestantByEntry.get(entry.id)!; return <tr key={entry.id}><td data-label="Thứ tự">{entry.sequence}</td><td data-label="Mã"><strong>{entry.entryCode}</strong></td><td data-label="Thí sinh"><strong>{item.displayName}</strong>{entry.title && <div className="field-help">{entry.title}</div>}</td><td data-label="Đơn vị">{item.organization || '—'}</td><td data-label="Trạng thái"><StatusPill value={entry.status} /></td><td data-label="Phiếu">{entry._count.scoreSheets}</td><td data-label="Thao tác"><div className="table-actions"><button className="button secondary-button small-button" type="button" disabled={dataLocked} onClick={() => setEditing(item)}>Sửa</button><button className="button secondary-button small-button" type="button" aria-label={`Đưa ${item.displayName} lên trên`} title="Đưa lên một vị trí" disabled={reordering || dataLocked || index === 0} onClick={() => void moveEntry(entry.id, -1)}>↑</button><button className="button secondary-button small-button" type="button" aria-label={`Đưa ${item.displayName} xuống dưới`} title="Đưa xuống một vị trí" disabled={reordering || dataLocked || index === orderedEntries.length - 1} onClick={() => void moveEntry(entry.id, 1)}>↓</button><button className="button danger-button small-button" type="button" disabled={dataLocked} onClick={async () => { const accepted = await confirm({ title: 'Rút thí sinh khỏi vòng?', description: `Rút ${item.displayName}? Lịch sử điểm vẫn được giữ lại.`, confirmLabel: 'Rút thí sinh', danger: true }); if (!accepted) return; try { await api(`/api/competitions/${id}/contestants/${item.id}`, { method: 'DELETE' }); setNotice('Đã rút thí sinh; lịch sử điểm được giữ lại.'); await load(); } catch (reason) { setError(errorText(reason)); } }}>Rút</button></div></td></tr>; })}</tbody></table></div> : <EmptyState title="Chưa có thí sinh trong vòng này" description="Thêm thí sinh bằng biểu mẫu hoặc nhập danh sách CSV." />}
    </SectionCard>
    <SectionCard title={editing ? 'Chỉnh sửa hồ sơ' : 'Thêm thí sinh'} subtitle={editing ? 'Cập nhật thông tin liên hệ và đơn vị.' : `Lượt thi mới sẽ được tạo trong vòng “${round.name}”.`}>
      <form className="form-stack" key={editing?.id ?? 'new'} onSubmit={add}>
        <label className="field-label">Tên thí sinh hoặc đội *<input className="field-input" name="displayName" required minLength={2} maxLength={180} defaultValue={editing?.displayName ?? ''} placeholder="Nguyễn Văn A / Đội Innovate" disabled={dataLocked} /></label>
        {!editing && <label className="field-label">Tên đề tài / sản phẩm<input className="field-input" name="title" maxLength={180} placeholder="Tên đề tài dự thi" disabled={dataLocked} /></label>}
        <label className="field-label">Trường / đơn vị<input className="field-input" name="organization" maxLength={180} defaultValue={editing?.organization ?? ''} placeholder="Khoa Công nghệ thông tin" disabled={dataLocked} /></label>
        <div className="form-grid"><label className="field-label">Email<input className="field-input" name="email" type="email" defaultValue={editing?.email ?? ''} disabled={dataLocked} /></label><label className="field-label">Điện thoại<input className="field-input" name="phone" inputMode="tel" maxLength={32} defaultValue={editing?.phone ?? ''} disabled={dataLocked} /></label></div>
        <div className="table-actions">{editing && <button type="button" className="button secondary-button" onClick={() => setEditing(null)}>Hủy sửa</button>}<button className="button primary-button" disabled={busy || dataLocked}>{busy ? 'Đang lưu…' : editing ? 'Lưu hồ sơ' : '＋ Thêm vào vòng thi'}</button></div>
      </form>
      <div className="notice notice-info">Mã dự thi tự cấp; có thể đổi thứ tự trước khi bắt đầu vòng. CSV dùng các cột: Tên, Đơn vị, Email, Điện thoại, Tên đề tài. Tối đa 500 dòng.</div>
      {items?.some((item) => !item.entries.length) && <form className="form-stack" style={{ marginTop: 14 }} onSubmit={registerExisting}><label className="field-label">Thêm hồ sơ cũ vào vòng này<select className="field-select" value={existingId} onChange={(event) => setExistingId(event.target.value)} required disabled={dataLocked}><option value="">Chọn thí sinh…</option>{items.filter((item) => !item.entries.length).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><button className="button secondary-button" type="submit" disabled={dataLocked}>Đăng ký vào vòng</button></form>}
    </SectionCard>
  </div>{confirmationDialog}</>;
}

type Assignment = { id: string; user: { id: string; fullName: string; username: string | null; email: string | null; isActive: boolean }; round: { id: string; name: string }; entry: { id: string; entryCode: string } | null };
type JudgeEntryOption = { id: string; entryCode: string; sequence: number; status: string; contestant: { displayName: string } };

function Judges({ id, round }: { id: string; round: Round }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [entries, setEntries] = useState<JudgeEntryOption[]>([]);
  const [entryId, setEntryId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionStarted = round.session !== null && round.session !== undefined && round.session.state !== 'IDLE';
  const assignmentLocked = round.status === 'LIVE' || round.status === 'COMPLETED' || sessionStarted || round._count.scoreSheets > 0 || round._count.snapshots > 0;
  const coverage = entries.map((entry) => {
    const assigned = new Set((assignments ?? []).filter((item) => item.user.isActive && (!item.entry || item.entry.id === entry.id)).map((item) => item.user.id));
    return { entry, assigned: assigned.size, missing: Math.max(0, round.requiredJudgeCount - assigned.size) };
  });
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
    const accepted = await confirm({ title: 'Đặt lại mật khẩu giám khảo?', description: `Đặt mật khẩu tạm mới cho ${item.user.fullName}. Các phiên đăng nhập hiện tại của tài khoản này sẽ bị kết thúc.`, confirmLabel: 'Đặt lại mật khẩu' });
    if (!accepted) return;
    setBusy(true); setError(''); setNotice(''); setTemporaryPassword('');
    try {
      const result = await api<{ temporaryPassword: string }>(`/api/competitions/${id}/judges/${item.id}`, { method: 'PATCH', body: { action: 'reset-password' } });
      setTemporaryPassword(result.temporaryPassword);
      setNotice(`Đã đặt lại mật khẩu cho ${item.user.fullName}. Hãy chuyển mật khẩu này qua kênh riêng.`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <><div className="card-grid two-columns">
    <SectionCard title={`Giám khảo · ${round.name}`} subtitle="Phân công theo toàn vòng hoặc theo từng lượt thi.">
      {error && <Notice tone="error">{error}</Notice>}
      {!assignments ? <Loading /> : assignments.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>GIÁM KHẢO</th><th>USERNAME / EMAIL</th><th>PHẠM VI</th><th>THAO TÁC</th></tr></thead><tbody>{assignments.map((item) => <tr key={item.id}><td data-label="Giám khảo"><strong>{item.user.fullName}</strong></td><td data-label="Tài khoản">{item.user.email ?? item.user.username ?? '—'}</td><td data-label="Phạm vi">{item.entry ? item.entry.entryCode : 'Toàn vòng'}</td><td data-label="Thao tác"><div className="table-actions"><button className="button secondary-button small-button" type="button" disabled={busy} onClick={() => void resetPassword(item)}>Đặt lại mật khẩu</button><button className="button danger-button small-button" type="button" disabled={busy} onClick={async () => { const accepted = await confirm({ title: 'Gỡ phân công?', description: `Gỡ phân công của ${item.user.fullName}? Lịch sử phiếu đã nộp được giữ nguyên.`, confirmLabel: 'Gỡ phân công', danger: true }); if (!accepted) return; try { await api(`/api/competitions/${id}/judges/${item.id}`, { method: 'DELETE' }); await load(); } catch (reason) { setError(errorText(reason)); } }}>Gỡ</button></div></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa phân công giám khảo" description="Thêm tài khoản giám khảo để họ đăng nhập và nhận lượt chấm." />}
    </SectionCard>
    <SectionCard title="Tài khoản và phân công" subtitle="Chọn tài khoản hiện có hoặc cấp tài khoản mới, rồi phân công vào toàn vòng hay từng lượt thi.">
      {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
      {assignmentLocked && <Notice tone="warning">Phân công đã khóa vì vòng đã bắt đầu hoặc đã có phiếu. Hoàn tất vòng này mà không thay đổi phạm vi giám khảo.</Notice>}
      {temporaryPassword && <div className="notice notice-warning"><div className="form-stack"><strong>Mật khẩu tạm chỉ hiển thị trong phiên này</strong><code>{temporaryPassword}</code><button className="button secondary-button small-button" type="button" onClick={() => { void navigator.clipboard.writeText(temporaryPassword).then(() => setNotice('Đã sao chép mật khẩu tạm.')).catch(() => setError('Không thể truy cập clipboard; hãy chọn và sao chép mật khẩu thủ công.')); }}>Sao chép mật khẩu</button></div></div>}
      <form className="form-stack" onSubmit={add}>
        <label className="field-label">Username hoặc Email đăng nhập *<input className="field-input" name="identifier" required disabled={assignmentLocked} /></label>
        <label className="field-label">Họ tên <span className="field-help">Bắt buộc nếu tạo tài khoản mới.</span><input className="field-input" name="fullName" minLength={2} maxLength={160} disabled={assignmentLocked} /></label>
        <label className="field-label">Mật khẩu ban đầu <span className="field-help">Chỉ bắt buộc nếu chưa có tài khoản. Tối thiểu 12 ký tự.</span><input className="field-input" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={assignmentLocked} /></label>
        <label className="field-label">Phạm vi phân công<select className="field-select" value={entryId} onChange={(event) => setEntryId(event.target.value)} disabled={assignmentLocked}><option value="">Toàn vòng thi</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.sequence}. {entry.entryCode} · {entry.contestant.displayName}</option>)}</select></label>
        <button className="button primary-button" disabled={busy || assignmentLocked}>{busy ? 'Đang phân công…' : '＋ Phân công vào vòng'}</button>
      </form>
      <div className="notice notice-info">Giám khảo chỉ xem và chấm các lượt thuộc phạm vi được phân công. Mật khẩu ban đầu cần được gửi riêng tới người dùng.</div>
    </SectionCard>
  </div>
    <SectionCard title="Độ phủ phân công" subtitle={`Mỗi lượt cần ${round.requiredJudgeCount} giám khảo đang hoạt động. Phân công toàn vòng được tính cho tất cả lượt.`}>
      {coverage.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>MÃ LƯỢT</th><th>THÍ SINH / ĐỘI</th><th>ĐÃ PHÂN CÔNG</th><th>CẦN THÊM</th><th>TRẠNG THÁI</th></tr></thead><tbody>{coverage.map(({ entry, assigned, missing }) => <tr key={entry.id}><td data-label="Mã lượt"><strong>{entry.entryCode}</strong></td><td data-label="Thí sinh / đội">{entry.contestant.displayName}</td><td data-label="Đã phân công">{assigned}/{round.requiredJudgeCount}</td><td data-label="Cần thêm">{missing}</td><td data-label="Trạng thái"><StatusPill value={missing ? 'MISSING' : 'READY'} /></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có lượt thi" description="Thêm thí sinh trước khi phân công giám khảo." />}
    </SectionCard>
    {confirmationDialog}</>;
}

function RubricEditor({ id, round }: { id: string; round: Round }) {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [name, setName] = useState('Rubric chấm điểm');
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const sessionStarted = round.session !== null && round.session !== undefined && round.session.state !== 'IDLE';
  const criterionEditingLocked = round._count.scoreSheets > 0 || round._count.snapshots > 0 || round.status === 'LIVE' || round.status === 'COMPLETED' || sessionStarted;
  const versionCreationLocked = round._count.snapshots > 0 || round.status === 'LIVE' || round.status === 'COMPLETED' || sessionStarted;
  useEffect(() => {
    setError(''); setCriteria([]); setVersion(null);
    api<{ rubrics: { name: string; versions: { id: string; version: number; name: string; criteria: Criterion[] }[] }[]; activeRubricVersionId: string | null }>(`/api/competitions/${id}/rubric?roundId=${round.id}`).then((result) => {
      const active = result.rubrics.flatMap((rubric) => rubric.versions).find((item) => item.id === result.activeRubricVersionId);
      const selected = active ?? result.rubrics.flatMap((rubric) => rubric.versions).find((item) => item.version === 1) ?? null;
      if (selected) { setCriteria(selected.criteria); setName(selected.name); setVersion(selected.version); }
      else if (round.activeRubricVersion?.criteria) setCriteria(round.activeRubricVersion.criteria);
    }).catch((reason) => setError(errorText(reason)));
  }, [id, round.id, round.activeRubricVersionId]);
  function update(index: number, key: keyof Criterion, value: string | boolean) {
    setCriteria((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }
  function addCriterion() { setCriteria((items) => [...items, { name: '', description: '', minimum: 0, maximum: 10, step: 0.5, weight: 1, commentRequired: false }]); }
  function moveCriterion(index: number, direction: -1 | 1) {
    setCriteria((items) => {
      const next = [...items]; const target = index + direction;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
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
    {criterionEditingLocked && <Notice tone="warning">Rubric đã khóa khi vòng bắt đầu điều phối hoặc có phiếu chấm. Có thể tạo phiên bản mới để đổi tên rubric, nhưng nội dung và thứ tự tiêu chí phải giữ nguyên; các lượt đã chấm tiếp tục dùng đúng phiên bản ban đầu.</Notice>}
    <SectionCard title="Rubric chấm điểm" subtitle={`Phiên bản đang xem: ${version ? `v${version}` : 'chưa lưu'} · Tổng trọng số được chuẩn hóa khi tính điểm.`}>
      <form className="form-stack" onSubmit={save}>
        <label className="field-label">Tên rubric<input className="field-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></label>
        {criteria.map((criterion, index) => <div className="round-card" key={criterion.id ?? index}>
          <div className="round-card-head"><strong>Tiêu chí {index + 1}</strong><div className="table-actions"><button className="button secondary-button small-button" type="button" aria-label={`Đưa tiêu chí ${index + 1} lên trước`} title="Ưu tiên cao hơn" disabled={criterionEditingLocked || index === 0} onClick={() => moveCriterion(index, -1)}>↑</button><button className="button secondary-button small-button" type="button" aria-label={`Đưa tiêu chí ${index + 1} xuống sau`} title="Ưu tiên thấp hơn" disabled={criterionEditingLocked || index === criteria.length - 1} onClick={() => moveCriterion(index, 1)}>↓</button><button className="text-button" type="button" disabled={criterionEditingLocked} onClick={() => setCriteria((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Xóa</button></div></div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field-label">Tên tiêu chí<input className="field-input" value={criterion.name} onChange={(event) => update(index, 'name', event.target.value)} minLength={2} maxLength={160} required disabled={criterionEditingLocked} /></label>
            <label className="field-label">Trọng số<input className="field-input" type="number" min="0.01" step="0.01" value={criterion.weight} onChange={(event) => update(index, 'weight', event.target.value)} required disabled={criterionEditingLocked} /></label>
            <label className="field-label">Điểm tối thiểu<input className="field-input" type="number" step="0.01" value={criterion.minimum} onChange={(event) => update(index, 'minimum', event.target.value)} required disabled={criterionEditingLocked} /></label>
            <label className="field-label">Điểm tối đa<input className="field-input" type="number" step="0.01" value={criterion.maximum} onChange={(event) => update(index, 'maximum', event.target.value)} required disabled={criterionEditingLocked} /></label>
            <label className="field-label">Bước điểm<input className="field-input" type="number" min="0.01" step="0.01" value={criterion.step} onChange={(event) => update(index, 'step', event.target.value)} required disabled={criterionEditingLocked} /></label>
            <label className="field-label">Mô tả<input className="field-input" value={criterion.description ?? ''} onChange={(event) => update(index, 'description', event.target.value)} maxLength={2000} disabled={criterionEditingLocked} /></label>
            <label className="field-label"><span>Nhận xét</span><span className="pill-row"><input type="checkbox" checked={criterion.commentRequired} onChange={(event) => update(index, 'commentRequired', event.target.checked)} disabled={criterionEditingLocked} /> Bắt buộc nhận xét</span></label>
          </div>
        </div>)}
        <div className="toolbar"><button type="button" className="button secondary-button" onClick={addCriterion} disabled={criterionEditingLocked}>＋ Thêm tiêu chí</button><span className="field-help">Điểm tiêu chí: Σ(điểm × trọng số) / Σ(trọng số)</span></div>
        {weightTotal <= 0 && <Notice tone="error">Tổng trọng số phải lớn hơn 0.</Notice>}
        <div className="form-actions"><button type="button" className="button secondary-button" onClick={() => setPreviewVisible((value) => !value)}>{previewVisible ? 'Ẩn xem trước' : 'Xem trước phiếu'}</button><button className="button primary-button" disabled={busy || versionCreationLocked || criteria.length === 0 || weightTotal <= 0}>{busy ? 'Đang lưu…' : 'Lưu và kích hoạt phiên bản mới'}</button></div>
      </form>
    </SectionCard>
    {previewVisible && <SectionCard title="Xem trước phiếu chấm" subtitle={`Ví dụ minh họa bằng điểm gần 75% thang cho từng tiêu chí. Tổng trọng số hiện tại: ${weightTotal.toFixed(2)}.`}>
      {criteria.length ? <><div className="table-wrap"><table className="data-table"><thead><tr><th>TIÊU CHÍ</th><th>THANG ĐIỂM</th><th>TRỌNG SỐ</th><th>ĐIỂM MẪU</th><th>NHẬN XÉT</th></tr></thead><tbody>{previewRows.map(({ item, score, share }, index) => <tr key={item.id ?? index}><td><strong>{item.name || `Tiêu chí ${index + 1}`}</strong><div className="field-help">{item.description || 'Chưa có hướng dẫn chấm'}</div></td><td>{item.minimum}–{item.maximum}, bước {item.step}</td><td>{(share * 100).toFixed(1)}%</td><td>{Number.isFinite(score) ? score.toFixed(2) : '—'}</td><td>{item.commentRequired ? 'Bắt buộc' : 'Không bắt buộc'}</td></tr>)}</tbody></table></div><div className="score-footer"><span>Điểm tổng mẫu</span><strong>{previewTotal.toFixed(2)}</strong></div></> : <EmptyState title="Chưa có tiêu chí" description="Thêm ít nhất một tiêu chí để xem phiếu mẫu." />}
    </SectionCard>}
  </div>;
}

type EntryOption = { id: string; entryCode: string; sequence: number; status: string; title: string | null; contestant: { displayName: string; organization: string | null } };

function LiveControl({ id, round }: { id: string; round: Round }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const { promptText, dialog: textPromptDialog } = useTextPromptDialog();
  const [session, setSession] = useState<{ id: string; state: string; version: number; currentEntry: { id: string; entryCode: string; title: string | null; contestant?: { displayName: string; organization: string | null } } | null } | null>(null);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [preflight, setPreflight] = useState<{ entryCount: number; requiredJudgeCount: number; rubricReady: boolean; missingAssignments: { entryId: string; entryCode: string; displayName: string; assignedJudgeCount: number; requiredJudgeCount: number }[]; canStart: boolean } | null>(null);
  const [selectedEntry, setSelectedEntry] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [live, contestantResult] = await Promise.all([
        api<{ session: NonNullable<typeof session> }>(`/api/competitions/${id}/rounds/${round.id}/session`),
        api<{ contestants: { displayName: string; organization: string | null; entries: Omit<EntryOption, 'contestant'>[] }[] }>(`/api/competitions/${id}/contestants?roundId=${round.id}`),
      ]);
      const readiness = await api<{ preflight: NonNullable<typeof preflight> }>(`/api/competitions/${id}/rounds/${round.id}/preflight`);
      setSession(live.session);
      setPreflight(readiness.preflight);
      setEntries(contestantResult.contestants.flatMap((item) => item.entries.map((entry) => ({ ...entry, contestant: { displayName: item.displayName, organization: item.organization } }))));
      setSelectedEntry(live.session.currentEntry?.id ?? '');
    } catch (reason) { setError(errorText(reason)); }
  }
  useEffect(() => { let active = true; setSession(null); void load(); const timer = window.setInterval(() => { if (active) void load(); }, 5000); return () => { active = false; window.clearInterval(timer); }; }, [id, round.id]);
  async function action(actionName: string, entryId?: string, overrideReason?: string) {
    setBusy(true); setError('');
    try { const result = await api<{ session: NonNullable<typeof session> }>(`/api/competitions/${id}/rounds/${round.id}/session`, { method: 'POST', body: { action: actionName, entryId, overrideReason, expectedVersion: session?.version ?? 0 } }); setSession(result.session); setSelectedEntry(result.session.currentEntry?.id ?? ''); void load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  async function startSession() {
    if (!preflight || preflight.entryCount === 0 || !preflight.rubricReady) return;
    if (preflight.missingAssignments.length) {
      const missingList = preflight.missingAssignments.map((entry) => `${entry.entryCode} (${entry.assignedJudgeCount}/${entry.requiredJudgeCount})`).join(', ');
      if (!round.allowAdvanceWithGaps) {
        setError(`Chưa thể bắt đầu: thiếu phân công cho ${missingList}. Hãy bổ sung giám khảo trước.`);
        return;
      }
      const reason = await promptText({ title: 'Bắt đầu với phân công còn thiếu?', description: `Các lượt sau chưa đủ giám khảo: ${missingList}. Ghi lý do ngoại lệ; thao tác sẽ được lưu vào nhật ký.`, label: 'Lý do (tối thiểu 10 ký tự)', minLength: 10, maxLength: 2000, submitLabel: 'Ghi nhận và bắt đầu' });
      if (reason) void action('start', undefined, reason);
      return;
    }
    const accepted = await confirm({ title: 'Bắt đầu điều phối?', description: `${preflight.entryCount} lượt thi, rubric đã sẵn sàng và đủ ${preflight.requiredJudgeCount} giám khảo cho mỗi lượt.`, confirmLabel: 'Bắt đầu' });
    if (accepted) void action('start');
  }
  async function finishSession() {
    const accepted = await confirm({ title: 'Kết thúc điều phối vòng?', description: 'Phiên sẽ dừng và không thể chuyển lượt tiếp. Phiếu nháp đã có vẫn được phép hoàn tất; thao tác này không khóa hay công bố kết quả.', confirmLabel: 'Kết thúc vòng', danger: true });
    if (accepted) void action('finish');
  }
  return <div className="page-section">
    {error && <Notice tone="error">{error}</Notice>}
    <SectionCard title="Điều phối lượt thi" subtitle="Mọi thay đổi được lưu trên máy chủ và xuất hiện ở khu vực giám khảo.">
      {!session ? <Loading /> : <>
        <div className="live-current"><span className="live-number">{session.currentEntry?.entryCode ?? '—'}</span><div><div className="pill-row"><StatusPill value={session.state} /><span className="metric-chip">Phiên bản trạng thái {session.version}</span></div><h3 style={{ marginTop: 8 }}>{session.currentEntry?.contestant?.displayName ?? (session.currentEntry ? 'Danh tính được ẩn' : 'Chưa chọn thí sinh')}</h3><p>{session.currentEntry?.title || (session.currentEntry ? `Đang ở vòng ${round.name}` : 'Bắt đầu phiên để gửi lượt thi hiện tại cho giám khảo.')}</p></div></div>
        {session.state === 'IDLE' && preflight && <div className="preflight-summary" aria-live="polite"><div className="preflight-heading"><strong>Kiểm tra trước khi bắt đầu</strong><span>{preflight.canStart ? 'Đủ điều kiện' : 'Cần xử lý'}</span></div><ul><li>{preflight.entryCount} lượt thi đang hoạt động</li><li>{preflight.rubricReady ? 'Đã có rubric đang kích hoạt' : 'Chưa có rubric hoặc rubric chưa có tiêu chí'}</li><li>{preflight.missingAssignments.length ? `Thiếu phân công ở ${preflight.missingAssignments.length} lượt: ${preflight.missingAssignments.map((entry) => entry.entryCode).join(', ')}` : `Đủ ${preflight.requiredJudgeCount} giám khảo cho mỗi lượt`}</li></ul><Link href={`/competitions/${id}/judges?roundId=${round.id}`} className="text-button">Kiểm tra phân công →</Link></div>}
        <div className="live-controls" style={{ marginTop: 15 }}>
          {session.state === 'IDLE' && <button className="button primary-button" disabled={busy || !preflight || preflight.entryCount === 0 || !preflight.rubricReady || (preflight.missingAssignments.length > 0 && !round.allowAdvanceWithGaps)} onClick={() => void startSession()}>▶ Bắt đầu điều phối</button>}
          {session.state === 'PAUSED' && <button className="button primary-button" disabled={busy} onClick={() => void action('resume')}>▶ Tiếp tục</button>}
          {session.state === 'LIVE' && <button className="button secondary-button" disabled={busy} onClick={() => void action('pause')}>Ⅱ Tạm dừng</button>}
          <button className="button secondary-button" disabled={busy || entries.length === 0} onClick={() => void action('previous')}>← Lượt trước</button>
          <button className="button secondary-button" disabled={busy || entries.length === 0} onClick={() => void action('next')}>Lượt tiếp →</button>
          <label className="field-label" style={{ minWidth: 220 }}>Chọn trực tiếp<select className="field-select" value={selectedEntry} onChange={(event) => { setSelectedEntry(event.target.value); if (event.target.value) void action('select', event.target.value); }} disabled={busy}><option value="">Chọn thí sinh…</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.sequence}. {entry.entryCode} · {entry.contestant.displayName}</option>)}</select></label>
          {session.state !== 'IDLE' && session.state !== 'COMPLETED' && <button className="button danger-button" disabled={busy} onClick={() => void finishSession()}>Kết thúc vòng</button>}
        </div>
      </>}
    </SectionCard>
    <SectionCard title="Danh sách lượt thi" subtitle={`${entries.length} lượt thi đang hoạt động`}>
      {entries.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>THỨ TỰ</th><th>MÃ DỰ THI</th><th>THÍ SINH / ĐỘI</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{entry.sequence}</td><td><strong>{entry.entryCode}</strong></td><td><strong>{entry.contestant.displayName}</strong><div className="field-help">{entry.title || entry.contestant.organization || ''}</div></td><td><StatusPill value={session?.currentEntry?.id === entry.id ? 'LIVE' : entry.status} /></td><td><button className="button secondary-button small-button" disabled={busy} onClick={() => void action('select', entry.id)}>Chọn lượt này</button></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có lượt thi" description="Thêm thí sinh vào vòng trước khi bắt đầu." />}
    </SectionCard>
    {textPromptDialog}{confirmationDialog}
  </div>;
}

type ScoreStatusRow = { entry: { id: string; code: string; name: string }; requiredCount: number; assignedCount: number; submittedCount: number; judges: { id: string; name: string; email: string; status: string; totalScore: number | null; scoreSheetId: string | null }[] };

function ScoreStatus({ id, round }: { id: string; round: Round }) {
  const { promptText, dialog: textPromptDialog } = useTextPromptDialog();
  const [rows, setRows] = useState<ScoreStatusRow[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() { try { setRows((await api<{ rows: ScoreStatusRow[] }>(`/api/competitions/${id}/scores?roundId=${round.id}`)).rows); } catch (reason) { setError(errorText(reason)); } }
  useEffect(() => { setRows(null); void load(); }, [id, round.id]);
  async function reopen(row: ScoreStatusRow, judgeName: string, scoreSheetId: string) {
    const reason = await promptText({ title: 'Mở lại phiếu chấm', description: `${judgeName} · ${row.entry.code}. Bản kết quả hiện tại sẽ được giữ trong lịch sử; giám khảo cần nộp lại để tạo phiên bản mới.`, label: 'Lý do mở lại (tối thiểu 10 ký tự)', minLength: 10, maxLength: 2000, submitLabel: 'Mở lại phiếu' });
    if (!reason) return;
    try { await api(`/api/competitions/${id}/results`, { method: 'POST', body: { action: 'reopen-score', roundId: round.id, scoreSheetId, reason } }); setNotice(`Đã mở lại phiếu ${row.entry.code} của ${judgeName}.`); await load(); }
    catch (reasonError) { setError(errorText(reasonError)); }
  }
  const totalSubmitted = rows?.reduce((sum, row) => sum + row.submittedCount, 0) ?? 0;
  const totalNeeded = (rows?.length ?? 0) * round.requiredJudgeCount;
  const totalAssigned = rows?.reduce((sum, row) => sum + row.assignedCount, 0) ?? 0;
  return <SectionCard title="Trạng thái phiếu điểm" subtitle={`${round.name} · Cần ${round.requiredJudgeCount} giám khảo nộp cho mỗi lượt thi`}>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {rows === null ? <Loading /> : <>
      <div className="pill-row" style={{ marginBottom: 15 }}><span className="metric-chip">Đã phân công {totalAssigned}/{totalNeeded} vị trí</span><span className="metric-chip">Đã nộp {totalSubmitted}/{totalNeeded} phiếu yêu cầu</span><span className="metric-chip">Còn thiếu {Math.max(0, totalNeeded - totalSubmitted)}</span></div>
      {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>LƯỢT THI</th><th>GIÁM KHẢO</th><th>TRẠNG THÁI</th><th>ĐIỂM</th><th>THAO TÁC</th></tr></thead><tbody>{rows.flatMap((row) => {
        const judgeRows = row.judges.map((judge) => <tr key={`${row.entry.id}-${judge.id}`}><td><strong>{row.entry.code}</strong><div className="field-help">{row.entry.name}</div></td><td>{judge.name}</td><td><StatusPill value={judge.status === 'MISSING' ? 'DRAFT' : judge.status} />{judge.status === 'MISSING' && <span className="field-help"> Chưa có phiếu</span>}</td><td>{judge.totalScore === null ? '—' : judge.totalScore.toFixed(round.roundingPrecision)}</td><td>{judge.scoreSheetId && (judge.status === 'SUBMITTED' || (round._count.snapshots > 0 && judge.status === 'DRAFT')) ? <button className="button secondary-button small-button" onClick={() => void reopen(row, judge.name, judge.scoreSheetId!)}>Mở lại</button> : '—'}</td></tr>);
        const emptySlots = Array.from({ length: Math.max(0, row.requiredCount - row.assignedCount) }, (_, index) => <tr key={`${row.entry.id}-missing-${index}`}><td><strong>{row.entry.code}</strong><div className="field-help">{row.entry.name}</div></td><td>Chưa phân công</td><td><StatusPill value="MISSING" /></td><td>—</td><td>—</td></tr>);
        return [...judgeRows, ...emptySlots];
      })}</tbody></table></div> : <EmptyState title="Chưa có lượt thi" description="Thêm thí sinh và giám khảo trước khi theo dõi phiếu chấm." />}
    </>}
    {textPromptDialog}
  </SectionCard>;
}

type ResultRow = { entryId: string; entryCode: string; title: string | null; contestant: string; organization: string | null; totalScore: number | null; rank: number | null; submittedCount: number; requiredCount: number; judges: { judge: string; score: number | null }[] };

function Results({ id, round, reload, canManage }: { id: string; round: Round; reload: () => void; canManage: boolean }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const { promptText, dialog: textPromptDialog } = useTextPromptDialog();
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [missing, setMissing] = useState<{ entryId: string; entryCode: string; displayName: string; submittedCount: number; requiredCount: number }[]>([]);
  const [snapshot, setSnapshot] = useState<{ id: string; version: number; published: boolean; lockedAt: string; lockedByName?: string; policy?: { anonymous: boolean; requiredJudgeCount: number; publishJudgeScores: boolean }; data: ResultRow[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const result = await api<{ rows?: ResultRow[]; missing?: typeof missing; snapshot: typeof snapshot }>(`/api/competitions/${id}/results?roundId=${round.id}`); setRows(result.rows ?? result.snapshot?.data ?? []); setMissing(result.missing ?? []); setSnapshot(result.snapshot); }
    catch (reason) { setError(errorText(reason)); setRows([]); }
  }
  useEffect(() => { setRows(null); setError(''); void load(); }, [id, round.id]);
  async function action(actionName: 'lock' | 'publish') {
    if (actionName === 'publish') {
      const accepted = await confirm({ title: 'Công bố kết quả?', description: `Snapshot v${snapshot?.version ?? '—'} sẽ hiển thị cho người được phép xem. Chính sách hiển thị đã được ghi tại thời điểm khóa.`, confirmLabel: 'Công bố kết quả' });
      if (!accepted) return;
    }
    let reason: string | null = null;
    if (actionName === 'lock' && missing.length) {
      if (!round.allowAdvanceWithGaps) return;
      const missingList = missing.map((item) => `${item.entryCode} (${item.submittedCount}/${item.requiredCount})`).join(', ');
      reason = await promptText({ title: 'Khóa kết quả còn thiếu phiếu?', description: `Thiếu phiếu ở: ${missingList}. Điểm của các lượt này sẽ là một phần kết quả snapshot. Ghi lý do ngoại lệ; lý do sẽ vào nhật ký.`, label: 'Lý do (tối thiểu 10 ký tự)', minLength: 10, maxLength: 2000, submitLabel: 'Ghi nhận và khóa' });
      if (!reason) return;
    } else if (actionName === 'lock') {
      const accepted = await confirm({ title: 'Khóa kết quả vòng thi?', description: 'Hệ thống lưu snapshot bất biến theo rubric, cách tổng hợp, quy tắc đồng điểm và chính sách ẩn danh hiện tại. Sau đó cần mở lại phiếu bằng lý do để tạo phiên bản mới.', confirmLabel: 'Khóa snapshot' });
      if (!accepted) return;
    }
    setBusy(true); setNotice(''); setError('');
    try { const result = await api(`/api/competitions/${id}/results`, { method: 'POST', body: { action: actionName, roundId: round.id, ...(reason ? { reason } : {}) } }); setNotice(actionName === 'lock' ? 'Đã khóa kết quả và lưu snapshot.' : 'Đã công bố kết quả.'); if (actionName === 'lock') reload(); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <div className="page-section">
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    <SectionCard title={canManage ? `Kết quả · ${round.name}` : `Kết quả đã công bố · ${round.name}`} subtitle={canManage ? `Tổng hợp ${round.aggregateMethod === 'MEDIAN' ? 'trung vị' : 'trung bình cộng'} · làm tròn ${round.roundingPrecision} chữ số · ${round.tieBreakMethod === 'CRITERIA_PRIORITY' ? 'so tiêu chí theo thứ tự ưu tiên khi đồng điểm' : 'đồng hạng khi bằng điểm tổng'}.` : 'Bản kết quả chỉ đọc do ban tổ chức công bố.'} action={snapshot?.published && rows?.length ? <a className="button secondary-button small-button" href={`/api/competitions/${id}/results?roundId=${round.id}&format=csv`}>↓ Tải CSV</a> : undefined}>
      {rows === null ? <Loading /> : <>
        <div className="toolbar"><div className="pill-row"><span className="metric-chip">{rows.length} lượt thi</span>{snapshot && <><span className="metric-chip">Snapshot v{snapshot.version}</span><span className="metric-chip">Khóa bởi {snapshot.lockedByName || '—'} · {formatDateTime(snapshot.lockedAt)}</span><span className="metric-chip">{snapshot.policy?.anonymous ? 'Ẩn danh' : 'Hiện danh tính'} · {snapshot.policy?.publishJudgeScores ? 'Công khai điểm giám khảo' : 'Ẩn điểm giám khảo'}</span></>}<span className="metric-chip">{snapshot?.published ? 'Đã công bố' : snapshot ? 'Chưa công bố' : 'Chưa khóa'}</span></div>{canManage && <div className="toolbar-right">{snapshot ? !snapshot.published && <button className="button primary-button small-button" disabled={busy} onClick={() => void action('publish')}>{busy ? 'Đang xử lý…' : 'Công bố kết quả'}</button> : <button className="button primary-button small-button" disabled={busy || rows.length === 0 || (missing.length > 0 && !round.allowAdvanceWithGaps)} onClick={() => void action('lock')}>{busy ? 'Đang khóa…' : 'Khóa kết quả'}</button>}</div>}</div>
        {canManage && missing.length > 0 && <Notice tone="warning">{missing.length} lượt thi chưa đủ phiếu chấm yêu cầu: {missing.map((item) => `${item.entryCode} (${item.submittedCount}/${item.requiredCount})`).join(' · ')}. {round.allowAdvanceWithGaps ? 'Có thể khóa ngoại lệ sau khi ghi lý do.' : 'Hãy chờ đủ phiếu trước khi khóa.'}</Notice>}
        {!canManage && !snapshot?.published && <Notice tone="info">Kết quả chưa được ban tổ chức công bố.</Notice>}
        {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>HẠNG</th><th>MÃ</th><th>THÍ SINH / ĐỘI</th><th>ĐIỂM TỔNG</th><th>PHIẾU</th><th>CHI TIẾT GIÁM KHẢO</th></tr></thead><tbody>{rows.map((row) => <tr key={row.entryId}><td><span className="result-rank">{row.rank ?? '—'}</span></td><td><strong>{row.entryCode}</strong></td><td><strong>{row.contestant}</strong><div className="field-help">{row.title || row.organization || ''}</div></td><td><strong>{row.totalScore === null ? '—' : row.totalScore.toFixed(round.roundingPrecision)}</strong></td><td>{row.submittedCount}/{row.requiredCount}</td><td>{row.judges.map((judge) => `${judge.judge}: ${judge.score?.toFixed(round.roundingPrecision) ?? '—'}`).join(' · ') || '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có kết quả" description="Cần thêm lượt thi và phiếu chấm trước khi tổng hợp." />}
      </>}
    </SectionCard>
    {textPromptDialog}{confirmationDialog}
  </div>;
}

function CompetitionActivity({ id }: { id: string }) {
  const [events, setEvents] = useState<{ id: string; action: string; entityType: string; entityId: string | null; createdAt: string; details: unknown; actor: { fullName: string; email: string } | null }[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setEvents(null);
    api<{ events: NonNullable<typeof events>; total: number }>(`/api/competitions/${id}/audit?page=${page}`).then((result) => { if (active) { setEvents(result.events); setTotal(result.total); setError(''); } }).catch((reason) => { if (active) { setError(errorText(reason)); setEvents([]); } });
    return () => { active = false; };
  }, [id, page]);
  const filtered = (events ?? []).filter((event) => {
    const matchesAction = !actionFilter || event.action === actionFilter;
    const details = JSON.stringify(event.details ?? '').toLocaleLowerCase('vi-VN');
    const haystack = `${event.actor?.fullName ?? ''} ${event.actor?.email ?? ''} ${auditActionLabel(event.action)} ${auditEntityLabel(event.entityType)} ${event.entityId ?? ''} ${details}`.toLocaleLowerCase('vi-VN');
    return matchesAction && haystack.includes(search.trim().toLocaleLowerCase('vi-VN'));
  });
  const pageCount = Math.max(1, Math.ceil(total / 50));
  return <SectionCard title="Nhật ký hoạt động" subtitle="Lịch sử phân công, điều phối, chấm điểm, khóa và công bố.">
    {error && <Notice tone="error">{error}</Notice>}
    {events === null ? <Loading /> : events.length ? <>
      <div className="toolbar audit-filters"><label className="field-label">Tìm actor, hành động, mã vòng hoặc lý do<input className="filter-input" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="field-label">Lọc hành động<select className="field-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="">Tất cả hành động trong trang</option>{[...new Set(events.map((event) => event.action))].map((action) => <option key={action} value={action}>{auditActionLabel(action)}</option>)}</select></label></div>
      {filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>THỜI ĐIỂM</th><th>NGƯỜI THỰC HIỆN</th><th>HÀNH ĐỘNG</th><th>ĐỐI TƯỢNG</th><th>CHI TIẾT</th></tr></thead><tbody>{filtered.map((event) => { const details = auditDetailRows(event.action, event.details); return <tr key={event.id}><td>{formatDateTime(event.createdAt)}</td><td><strong>{event.actor?.fullName ?? 'Hệ thống'}</strong>{event.actor?.email && <div className="field-help">{event.actor.email}</div>}</td><td><strong>{auditActionLabel(event.action)}</strong></td><td>{auditEntityLabel(event.entityType)}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</td><td>{details.length ? <ul className="audit-detail-list">{details.map((detail) => <li key={detail.label}><span>{detail.label}</span><strong>{detail.value}</strong></li>)}</ul> : '—'}</td></tr>; })}</tbody></table></div> : <EmptyState title="Không có hoạt động khớp" description="Xóa bộ lọc hoặc tìm cụm từ khác trong trang hiện tại." />}
      <div className="toolbar audit-pagination"><span className="field-help">Trang {page}/{pageCount} · {total} hoạt động</span><div className="table-actions"><button className="button secondary-button small-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Trang trước</button><button className="button secondary-button small-button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Trang sau →</button></div></div>
    </> : <EmptyState title="Chưa có nhật ký" description="Các hoạt động sẽ xuất hiện sau khi có thay đổi trong cuộc thi." />}
  </SectionCard>;
}

function statusLabel(value: string) { return ({ DRAFT: 'Bản nháp', REGISTRATION: 'Mở đăng ký', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Hoàn tất', ARCHIVED: 'Lưu trữ' } as Record<string, string>)[value] ?? value; }
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Hãy thử lại.'; }
function toDateTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

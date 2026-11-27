'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Dialog, EmptyState, Loading, Notice, PageHeader, SectionCard, StatusPill, formatDate, formatDateTime, useConfirmDialog, useTextPromptDialog } from '@/components/ui';
import { auditActionLabel, auditDetailRows, auditEntityLabel } from '@/lib/audit-labels';
import { Icon } from '@/components/icons';
import { AppSelect } from '@/components/app-select';
import { RubricBuilder } from '@/components/rubric-builder';

type Round = { id: string; name: string; sequence: number; status: string; session?: { state: string } | null; anonymous: boolean; requiredJudgeCount: number; allowAdvanceWithGaps: boolean; publishScores: boolean; aggregateMethod: string; tieBreakMethod: string; roundingPrecision: number; activeRubricVersionId: string | null; activeRubricVersion?: { id: string; name: string; criteria: Criterion[] } | null; _count: { entries: number; assignments: number; scoreSheets: number; snapshots: number } };
type Criterion = { id: string; name: string; description: string | null; type: string; config: unknown; groupId: string | null; required: boolean; minimum: number | string; maximum: number | string; step: number | string; weight: number | string; commentRequired: boolean; sequence?: number };
type Competition = { id: string; name: string; slug: string; description: string | null; organizingUnit: string | null; location: string | null; status: string; startsAt: string | null; endsAt: string | null; workspace: Round | null; _count: { contestants: number; members: number } };
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

const routeSections = [
  ['overview', 'Tổng quan'], ['contestants', 'Thí sinh'], ['judges', 'Giám khảo'], ['rubric', 'Tiêu chí chấm'], ['live', 'Điều phối trực tiếp'], ['scores', 'Phiếu chấm'], ['results', 'Kết quả'], ['activity', 'Nhật ký'],
] as const;
type SectionKey = typeof routeSections[number][0];

export function CompetitionWorkspace({ id, section }: { id: string; section: string }) {
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [rubricGuideOpen, setRubricGuideOpen] = useState(false);
  const currentSection: SectionKey = routeSections.find(([key]) => key === section)?.[0] ?? 'overview';
  const round = useMemo(() => competition?.workspace ?? null, [competition]);

  async function reload(silent = false) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await api<{ competition: Omit<Competition, 'workspace'>; workspace: Round | null; permissions: { manage: boolean } }>(`/api/competitions/${id}`);
      setCompetition({ ...result.competition, workspace: result.workspace });
      setCanManage(result.permissions.manage);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được cuộc thi.'); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void reload(); }, [id]);

  if (loading) return <Loading label="Đang tải thông tin cuộc thi…" />;
  if (error && !competition) return <Notice tone="error">{error}</Notice>;
  if (!competition) return <EmptyState title="Không tìm thấy cuộc thi" description={error} action={<Link className="button secondary-button" href="/competitions">Về danh sách cuộc thi</Link>} />;

  const currentSectionLabel = routeSections.find(([key]) => key === currentSection)?.[1] ?? 'Cuộc thi';
  return <div className={`competition-workspace-page${currentSection === 'overview' ? ' competition-overview-page' : ''}`}>
    <PageHeader className="competition-workspace-heading" title={currentSectionLabel} titleAction={currentSection === 'rubric' && canManage ? <button className="button secondary-button rubric-guide-trigger" type="button" aria-haspopup="dialog" onClick={() => setRubricGuideOpen(true)}>Hướng dẫn</button> : undefined} action={<Link className="button secondary-button competition-back-button" href={currentSection === 'overview' ? '/competitions' : `/competitions/${id}`} aria-label={currentSection === 'overview' ? 'Quay lại danh sách cuộc thi' : 'Quay lại tổng quan cuộc thi'} title={currentSection === 'overview' ? 'Quay lại danh sách cuộc thi' : 'Quay lại tổng quan cuộc thi'}><Icon name="arrow-left" size={19} /></Link>} />
    {currentSection === 'rubric' && <Dialog open={rubricGuideOpen} title="Hướng dẫn tính điểm" description="Cách hệ thống tổng hợp điểm từ các tiêu chí." onClose={() => setRubricGuideOpen(false)} className="rubric-guide-dialog">
      <div className="rubric-guide-content"><p>Điểm cuối là trung bình có tính hệ số của các tiêu chí.</p><div><strong>Ví dụ</strong><p>Tiêu chí có hệ số 2 ảnh hưởng gấp đôi tiêu chí có hệ số 1. Bạn không cần cộng các hệ số thành 100.</p></div></div>
    </Dialog>}
    {error && <Notice tone="error">{error}</Notice>}
    {!canManage && currentSection !== 'results' ? <EmptyState title="Trang quản lý dành cho ban tổ chức" description="Tài khoản này chỉ được xem kết quả đã công bố." action={<Link className="button primary-button" href={`/competitions/${id}/results`}>Xem kết quả</Link>} /> : <>
    {currentSection === 'overview' && canManage && <Overview competition={competition} onReload={reload} />}
    {currentSection !== 'overview' && <>
      {!round ? <EmptyState title="Đang chuẩn bị khu vực chấm" description="Hệ thống chưa khởi tạo được dữ liệu chấm cho cuộc thi này. Hãy tải lại trang; nếu vẫn chưa xuất hiện, kiểm tra cấu hình cuộc thi." action={<Link href={`/competitions/${id}`} className="button secondary-button">Về tổng quan cuộc thi</Link>} /> : <SectionContent id={id} round={round} section={currentSection} reload={reload} canManage={canManage} />}
    </>}
    </>}
  </div>;
}

function Overview({ competition, onReload }: { competition: Competition; onReload: () => void }) {
  const [name, setName] = useState(competition.name);
  const [description, setDescription] = useState(competition.description ?? '');
  const [organizingUnit, setOrganizingUnit] = useState(competition.organizingUnit ?? '');
  const [location, setLocation] = useState(competition.location ?? '');
  const [startsAt, setStartsAt] = useState(toDateTimeInput(competition.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(competition.endsAt));
  const [showCompetitionDetails, setShowCompetitionDetails] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(competition.name); setDescription(competition.description ?? ''); setOrganizingUnit(competition.organizingUnit ?? ''); setLocation(competition.location ?? ''); setStartsAt(toDateTimeInput(competition.startsAt)); setEndsAt(toDateTimeInput(competition.endsAt)); }, [competition]);
  async function saveDetails(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/competitions/${competition.id}`, { method: 'PATCH', body: {
        name, description: description || null, organizingUnit: organizingUnit || null,
        location: location || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      } });
      setNotice('Đã lưu thông tin cuộc thi.'); setShowCompetitionDetails(false); await onReload();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được.'); } finally { setBusy(false); }
  }
  const quickActions: { href: string; title: string; description: string; detail: string; icon: 'clipboard' | 'users' | 'trophy' }[] = [
    { href: `/competitions/${competition.id}/rubric`, title: 'Tiêu chí chấm', description: 'Tạo thang điểm và quy tắc đánh giá.', detail: 'Thiết lập cách chấm', icon: 'clipboard' },
    { href: `/competitions/${competition.id}/judges`, title: 'Giám khảo', description: 'Chọn giám khảo có sẵn và phân công chấm.', detail: 'Quản lý giám khảo', icon: 'users' },
    { href: `/competitions/${competition.id}/contestants`, title: 'Thí sinh', description: 'Thêm hoặc xem danh sách dự thi.', detail: `${competition._count.contestants} thí sinh`, icon: 'trophy' },
  ];
  function cancelDetailsEdit() {
    setName(competition.name); setDescription(competition.description ?? ''); setOrganizingUnit(competition.organizingUnit ?? ''); setLocation(competition.location ?? ''); setStartsAt(toDateTimeInput(competition.startsAt)); setEndsAt(toDateTimeInput(competition.endsAt)); setShowCompetitionDetails(false);
  }
  return <div className="page-section competition-overview-content">
    {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
    <section className="competition-primary-actions" aria-labelledby="competition-primary-actions-title">
      <div className="competition-actions-heading"><h2 id="competition-primary-actions-title">Việc cần làm</h2><p>Chọn nội dung bạn muốn thiết lập hoặc quản lý.</p><Link className="button secondary-button" href={`/competitions/${competition.id}/live`}>Điều phối trực tiếp</Link></div>
      <div className="competition-action-grid">{quickActions.map((item, index) => <Link className="competition-action-card" href={item.href} key={item.href}>
        <span className={`competition-action-icon competition-action-icon-${index + 1}`}><Icon name={item.icon} size={21} /></span>
        <span className="competition-action-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
        <span className="competition-action-detail">{item.detail}</span>
        <Icon className="competition-action-arrow" name="arrow" size={19} />
      </Link>)}</div>
    </section>
    <SectionCard title="Thông tin cuộc thi" subtitle={showCompetitionDetails ? 'Cập nhật thông tin rồi lưu thay đổi.' : 'Thông tin cơ bản của cuộc thi.'} action={<button className="text-button competition-info-toggle" type="button" aria-expanded={showCompetitionDetails} onClick={() => showCompetitionDetails ? cancelDetailsEdit() : setShowCompetitionDetails(true)}>{showCompetitionDetails ? 'Hủy' : 'Chỉnh sửa'}</button>}>
      {showCompetitionDetails ? <form className="form-stack" onSubmit={saveDetails}>
        <label className="field-label">Tên cuộc thi<input className="field-input" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={180} /></label>
        <label className="field-label">Mô tả<textarea className="field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} /></label>
        <div className="form-grid"><label className="field-label">Đơn vị tổ chức<input className="field-input" value={organizingUnit} onChange={(event) => setOrganizingUnit(event.target.value)} maxLength={180} /></label><label className="field-label">Địa điểm / đường dẫn<input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={240} /></label></div>
        <div className="form-grid"><label className="field-label">Ngày bắt đầu<input className="field-input" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="field-label">Ngày kết thúc<input className="field-input" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
        <div className="form-actions"><button className="button primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
      </form> : <dl className="competition-info-readonly">
        <div><dt>Tên cuộc thi</dt><dd>{competition.name}</dd></div>
        <div><dt>Mô tả</dt><dd>{competition.description || 'Chưa có mô tả'}</dd></div>
        <div><dt>Đơn vị tổ chức</dt><dd>{competition.organizingUnit || 'Chưa thiết lập'}</dd></div>
        <div><dt>Địa điểm / đường dẫn</dt><dd>{competition.location || 'Chưa thiết lập'}</dd></div>
        <div><dt>Ngày bắt đầu</dt><dd>{competition.startsAt ? formatDateTime(competition.startsAt) : 'Chưa thiết lập'}</dd></div>
        <div><dt>Ngày kết thúc</dt><dd>{competition.endsAt ? formatDateTime(competition.endsAt) : 'Chưa thiết lập'}</dd></div>
      </dl>}
    </SectionCard>
  </div>;
}

function SectionContent({ id, round, section, reload, canManage }: { id: string; round: Round; section: string; reload: (silent?: boolean) => Promise<void>; canManage: boolean }) {
  switch (section) {
    case 'contestants': return <Contestants id={id} round={round} refreshCompetition={() => reload(true)} />;
    case 'judges': return <Judges id={id} round={round} refreshCompetition={() => reload(true)} />;
    case 'rubric': return <RubricEditor id={id} round={round} refreshCompetition={() => reload(true)} />;
    case 'live': return <LiveControl id={id} round={round} refreshCompetition={() => reload(true)} />;
    case 'scores': return <ScoreStatus id={id} round={round} refreshCompetition={() => reload(true)} />;
    case 'results': return <Results id={id} round={round} reload={reload} canManage={canManage} />;
    case 'activity': return <CompetitionActivity id={id} />;
    default: return <Notice tone="warning">Không tìm thấy mục quản lý.</Notice>;
  }
}

type EntryRow = { id: string; entryCode: string; title: string | null; status: string; sequence: number; _count: { scoreSheets: number } };
type ContestantItem = { id: string; displayName: string; organization: string | null; email: string | null; phone: string | null; entries: EntryRow[] };
type CsvPreview = { rows: { rowNumber: number; displayName: string; organization: string; email: string; phone: string; title: string }[]; issues: { rowNumber: number | null; message: string }[]; totalRows: number };

function Contestants({ id, round, refreshCompetition }: { id: string; round: Round; refreshCompetition: () => Promise<void> }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const [items, setItems] = useState<ContestantItem[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [editing, setEditing] = useState<ContestantItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [existingId, setExistingId] = useState('');
  const [search, setSearch] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [pendingCsv, setPendingCsv] = useState('');
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);
  const csvMenuRef = useRef<HTMLDivElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!csvMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!csvMenuRef.current?.contains(event.target as Node)) setCsvMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCsvMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [csvMenuOpen]);
  async function load() {
    try { const result = await api<{ contestants: ContestantItem[] }>(`/api/competitions/${id}/contestants`); setItems(result.contestants); }
    catch (reason) { setError(errorText(reason)); }
  }
  useEffect(() => { setItems(null); void load(); }, [id, round.id]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    try {
      if (editing) {
        await api(`/api/competitions/${id}/contestants/${editing.id}`, { method: 'PATCH', body: { displayName: form.get('displayName'), organization: form.get('organization'), email: form.get('email'), phone: form.get('phone') } });
        setEditing(null); setFormOpen(false); setNotice('Đã cập nhật hồ sơ thí sinh.');
      } else {
        await api(`/api/competitions/${id}/contestants`, { method: 'POST', body: { displayName: form.get('displayName'), organization: form.get('organization'), email: form.get('email'), phone: form.get('phone'), title: form.get('title') } });
        targetForm.reset(); setFormOpen(false); setNotice('Đã thêm thí sinh vào cuộc thi.');
      }
      await load();
      await refreshCompetition();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function registerExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    try { await api(`/api/competitions/${id}/entries`, { method: 'POST', body: { contestantId: existingId } }); setNotice('Đã thêm hồ sơ vào cuộc thi.'); setExistingId(''); await load(); await refreshCompetition(); }
    catch (reason) { setError(errorText(reason)); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setError(''); setNotice(''); setImporting(true);
    try {
      const csv = await file.text();
      const result = await api<{ preview: CsvPreview }>(`/api/competitions/${id}/contestants/import`, { method: 'POST', body: { csv, confirm: false } });
      setPendingCsv(csv); setCsvPreview(result.preview);
    } catch (reason) { setError(errorText(reason)); }
    finally { setImporting(false); }
  }
  function downloadCsvTemplate() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ['Tên thí sinh', 'Đơn vị', 'Email', 'Điện thoại', 'Tên đề tài'],
      ['Nguyễn Văn A (Ví dụ)', 'Trường Đại học Công Thương TP.HCM', 'nguyenvana@example.com', '0900000000', 'Tên đề tài mẫu'],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau-danh-sach-thi-sinh.csv';
    link.click();
    URL.revokeObjectURL(url);
    setCsvMenuOpen(false);
  }
  async function confirmImport() {
    if (!pendingCsv || !csvPreview || csvPreview.issues.length) return;
    setError(''); setImporting(true);
    try {
      const result = await api<{ imported: number }>(`/api/competitions/${id}/contestants/import`, { method: 'POST', body: { csv: pendingCsv, confirm: true } });
      setNotice(`Đã nhập ${result.imported} thí sinh sau khi xác nhận.`); setCsvPreview(null); setPendingCsv(''); await load(); await refreshCompetition();
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
    try { await api(`/api/competitions/${id}/entries`, { method: 'PATCH', body: { entryIds } }); setNotice('Đã cập nhật thứ tự dự thi và ghi nhận vào nhật ký.'); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setReordering(false); }
  }
  const orderedEntries = [...(items ?? []).flatMap((item) => item.entries)].sort((a, b) => a.sequence - b.sequence);
  const contestantByEntry = new Map((items ?? []).flatMap((item) => item.entries.map((entry) => [entry.id, item] as const)));
  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const filteredEntries = orderedEntries.filter((entry) => {
    const contestant = contestantByEntry.get(entry.id);
    const haystack = `${entry.entryCode} ${entry.title ?? ''} ${contestant?.displayName ?? ''} ${contestant?.organization ?? ''} ${contestant?.email ?? ''}`.toLocaleLowerCase('vi');
    return !normalizedSearch || haystack.includes(normalizedSearch);
  });
  const submittedSheets = orderedEntries.reduce((count, entry) => count + entry._count.scoreSheets, 0);
  const dataLocked = round.status === 'LIVE' || round.status === 'COMPLETED' || round._count.scoreSheets > 0 || round._count.snapshots > 0 || Boolean(round.session && round.session.state !== 'IDLE');
  return <><div className="contestant-page">
    {error && !formOpen && !csvPreview && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {dataLocked && <Notice tone="warning">Danh sách đã khóa vì hoạt động chấm đã bắt đầu. Lịch sử điểm được giữ nguyên.</Notice>}
    <SectionCard title="Danh sách dự thi" subtitle={`${orderedEntries.length} thí sinh · ${submittedSheets} phiếu chấm`} action={<div className="contestant-heading-actions"><button className="button primary-button small-button" type="button" disabled={dataLocked} onClick={() => { setEditing(null); setError(''); setFormOpen(true); }}>＋ Thêm thí sinh</button><div className="contestant-csv-menu" ref={csvMenuRef}><button className="button secondary-button small-button contestant-csv-trigger" type="button" disabled={importing || dataLocked} aria-haspopup="menu" aria-expanded={csvMenuOpen} onClick={() => setCsvMenuOpen((open) => !open)}>CSV <Icon name="chevron-down" size={13} /></button>{csvMenuOpen && <div className="contestant-csv-popover" role="menu" aria-label="Tác vụ CSV"><button type="button" role="menuitem" onClick={downloadCsvTemplate}><span aria-hidden="true">↓</span><span><strong>Tải file mẫu</strong><small>Mẫu 5 cột để nhập thí sinh</small></span></button><button type="button" role="menuitem" disabled={importing} onClick={() => { setCsvMenuOpen(false); csvInputRef.current?.click(); }}><span aria-hidden="true">↑</span><span><strong>{importing ? 'Đang đọc tệp…' : 'Tải danh sách lên'}</strong><small>Chọn CSV, tối đa 500 dòng</small></span></button></div>}<input ref={csvInputRef} className="sr-only" type="file" accept=".csv,text/csv" disabled={importing || dataLocked} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></div></div>}>
      <label className="contestant-search"><Icon name="search" size={18} /><span className="sr-only">Tìm thí sinh</span><input className="field-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, mã dự thi hoặc đơn vị…" /></label>
      {!items ? (error ? <button className="button secondary-button" onClick={() => { setError(''); void load(); }}>Tải lại danh sách</button> : <Loading />) : !orderedEntries.length ? <EmptyState title="Chưa có thí sinh" description="Dùng nút Thêm thí sinh hoặc menu CSV phía trên để bắt đầu." /> : !filteredEntries.length ? <EmptyState title="Không tìm thấy thí sinh" description="Thử tìm theo tên, mã dự thi hoặc đơn vị khác." action={<button className="button secondary-button" type="button" onClick={() => setSearch('')}>Xóa tìm kiếm</button>} /> : <div className="contestant-entry-list">{filteredEntries.map((entry) => {
        const item = contestantByEntry.get(entry.id)!;
        const index = orderedEntries.findIndex((candidate) => candidate.id === entry.id);
        return <article className="contestant-entry-card" key={entry.id}>
          <span className="contestant-entry-order" aria-label={`Thứ tự ${entry.sequence}`}>{entry.sequence}</span>
          <div className="contestant-entry-main"><div className="contestant-entry-title"><strong>{item.displayName}</strong><span className="contestant-entry-code">{entry.entryCode}</span></div>{entry.title && <p className="contestant-entry-project">{entry.title}</p>}<div className="contestant-entry-meta"><span>{item.organization || 'Chưa có đơn vị'}</span><span>{entry._count.scoreSheets} phiếu chấm</span><StatusPill value={entry.status} /></div></div>
          <div className="contestant-entry-actions"><button className="contestant-order-button" type="button" aria-label={`Đưa ${item.displayName} lên trên`} title="Đưa lên" disabled={reordering || dataLocked || index === 0} onClick={() => void moveEntry(entry.id, -1)}>↑</button><button className="contestant-order-button" type="button" aria-label={`Đưa ${item.displayName} xuống dưới`} title="Đưa xuống" disabled={reordering || dataLocked || index === orderedEntries.length - 1} onClick={() => void moveEntry(entry.id, 1)}>↓</button><button className="button secondary-button small-button" type="button" disabled={dataLocked} onClick={() => { setEditing(item); setError(''); setFormOpen(true); }}>Sửa</button><button className="button danger-button small-button" type="button" disabled={dataLocked || busy} onClick={async () => { const accepted = await confirm({ title: 'Rút thí sinh khỏi cuộc thi?', description: `Rút ${item.displayName}? Lịch sử điểm vẫn được giữ lại.`, confirmLabel: 'Rút thí sinh', danger: true }); if (!accepted) return; setError(''); setNotice(''); setBusy(true); try { await api(`/api/competitions/${id}/contestants/${item.id}`, { method: 'DELETE' }); setNotice('Đã rút thí sinh; lịch sử điểm được giữ lại.'); await load(); await refreshCompetition(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); } }}>Rút</button></div>
        </article>;
      })}</div>}
    </SectionCard>
    {items?.some((item) => !item.entries.length) && <SectionCard title="Hồ sơ chưa tham gia" subtitle="Thêm hồ sơ đã có vào danh sách dự thi."><form className="contestant-existing-form" onSubmit={registerExisting}><label className="field-label">Chọn hồ sơ<AppSelect className="field-select" value={existingId} onValueChange={setExistingId} placeholder="Chọn thí sinh…" disabled={dataLocked} options={items.filter((item) => !item.entries.length).map((item) => ({ value: item.id, label: item.displayName }))} /></label><button className="button secondary-button" type="submit" disabled={dataLocked || !existingId}>Thêm vào cuộc thi</button></form></SectionCard>}
    <Dialog open={formOpen} title={editing ? 'Sửa thông tin thí sinh' : 'Thêm thí sinh'} description={editing ? 'Cập nhật hồ sơ thí sinh trong cuộc thi.' : 'Nhập thông tin thí sinh hoặc đội dự thi.'} onClose={() => { setFormOpen(false); setEditing(null); setError(''); }} className="contestant-form-dialog">
      {formOpen && <>{error && <Notice tone="error">{error}</Notice>}<form className="form-stack" key={editing?.id ?? 'new'} onSubmit={add}>
        <label className="field-label">Tên thí sinh hoặc đội *<input className="field-input" name="displayName" required minLength={2} maxLength={180} defaultValue={editing?.displayName ?? ''} placeholder="Nguyễn Văn A / Đội Innovate" disabled={dataLocked} /></label>
        {!editing && <label className="field-label">Tên đề tài / sản phẩm<input className="field-input" name="title" maxLength={180} placeholder="Tên đề tài dự thi" disabled={dataLocked} /></label>}
        <label className="field-label">Trường / đơn vị<input className="field-input" name="organization" maxLength={180} defaultValue={editing?.organization ?? ''} placeholder="Khoa Công nghệ thông tin" disabled={dataLocked} /></label>
        <div className="form-grid"><label className="field-label">Email<input className="field-input" name="email" type="email" defaultValue={editing?.email ?? ''} disabled={dataLocked} /></label><label className="field-label">Điện thoại<input className="field-input" name="phone" inputMode="tel" maxLength={32} defaultValue={editing?.phone ?? ''} disabled={dataLocked} /></label></div>
        <div className="contestant-form-actions"><button type="button" className="button secondary-button" onClick={() => { setFormOpen(false); setEditing(null); setError(''); }}>Hủy</button><button className="button primary-button" disabled={busy || dataLocked}>{busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm thí sinh'}</button></div>
      </form></>}
    </Dialog>
    <Dialog open={Boolean(csvPreview)} title="Xem trước tệp CSV" description={csvPreview ? `${csvPreview.totalRows} dòng · Kiểm tra dữ liệu trước khi thêm.` : undefined} onClose={() => { setCsvPreview(null); setPendingCsv(''); setError(''); }} className="contestant-csv-dialog">
      {error && <Notice tone="error">{error}</Notice>}{csvPreview && <>{csvPreview.issues.length > 0 && <div className="csv-preview-errors" role="alert"><strong>Cần sửa {csvPreview.issues.length} lỗi trước khi nhập</strong><ul>{csvPreview.issues.map((issue, index) => <li key={`${issue.rowNumber}-${index}`}>{issue.rowNumber ? `Dòng ${issue.rowNumber}: ` : ''}{issue.message}</li>)}</ul></div>}<div className="table-wrap csv-preview-table"><table className="data-table"><thead><tr><th>DÒNG</th><th>TÊN</th><th>ĐƠN VỊ</th><th>EMAIL</th><th>ĐIỆN THOẠI</th><th>ĐỀ TÀI</th></tr></thead><tbody>{csvPreview.rows.map((row) => <tr key={row.rowNumber}><td data-label="Dòng">{row.rowNumber}</td><td data-label="Tên">{row.displayName || '—'}</td><td data-label="Đơn vị">{row.organization || '—'}</td><td data-label="Email">{row.email || '—'}</td><td data-label="Điện thoại">{row.phone || '—'}</td><td data-label="Đề tài">{row.title || '—'}</td></tr>)}</tbody></table></div><div className="contestant-form-actions"><button className="button secondary-button" type="button" onClick={() => { setCsvPreview(null); setPendingCsv(''); }}>Hủy</button><button className="button primary-button" type="button" disabled={importing || csvPreview.issues.length > 0} onClick={() => void confirmImport()}>{importing ? 'Đang nhập…' : `Nhập ${csvPreview.totalRows} thí sinh`}</button></div></>}
    </Dialog>
  </div>{confirmationDialog}</>;
}

type Assignment = { id: string; user: { id: string; fullName: string; username: string | null; email: string | null; isActive: boolean } };
type JudgeDirectoryItem = { id: string; fullName: string; username: string | null; email: string | null; isActive: boolean; _count: { assignments: number } };
type CompetitionJudgeProgressRow = { entry: { id: string; code: string; name: string }; judges: { id: string; name: string; status: string; updatedAt: string | null; submittedAt: string | null }[] };

function Judges({ id, round, refreshCompetition }: { id: string; round: Round; refreshCompetition: () => Promise<void> }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [progressRows, setProgressRows] = useState<CompetitionJudgeProgressRow[] | null>(null);
  const [judges, setJudges] = useState<JudgeDirectoryItem[]>([]);
  const [judgePickerOpen, setJudgePickerOpen] = useState(false);
  const [judgeQuery, setJudgeQuery] = useState('');
  const [selectedJudgeIds, setSelectedJudgeIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionStarted = round.session !== null && round.session !== undefined && round.session.state !== 'IDLE';
  const assignmentLocked = round.status === 'LIVE' || round.status === 'COMPLETED' || sessionStarted || round._count.scoreSheets > 0 || round._count.snapshots > 0;
  const assignedJudges = [...new Map((assignments ?? []).map((item) => [item.user.id, item])).values()];
  const assignedJudgeIds = new Set((assignments ?? []).map((item) => item.user.id));
  const availableJudges = judges.filter((judge) => judge.isActive && !assignedJudgeIds.has(judge.id));
  const hasActiveJudges = judges.some((judge) => judge.isActive);
  const filteredJudges = availableJudges.filter((judge) => `${judge.fullName} ${judge.username ?? ''} ${judge.email ?? ''}`.toLocaleLowerCase('vi').includes(judgeQuery.trim().toLocaleLowerCase('vi')));
  function toggleJudge(judgeId: string) {
    setSelectedJudgeIds((selected) => selected.includes(judgeId) ? selected.filter((id) => id !== judgeId) : [...selected, judgeId]);
  }
  async function loadProgress() {
    try { setProgressRows((await api<{ rows: CompetitionJudgeProgressRow[] }>(`/api/competitions/${id}/scores`)).rows); }
    catch (reason) { setError(errorText(reason)); }
  }
  async function load() {
    try {
      const [assignmentResult, judgeResult, scoreResult] = await Promise.all([
        api<{ assignments: Assignment[] }>(`/api/competitions/${id}/judges`),
        api<{ judges: JudgeDirectoryItem[] }>('/api/judges'),
        api<{ rows: CompetitionJudgeProgressRow[] }>(`/api/competitions/${id}/scores`),
      ]);
      setAssignments(assignmentResult.assignments);
      setJudges(judgeResult.judges);
      setProgressRows(scoreResult.rows);
    } catch (reason) { setError(errorText(reason)); }
  }
  useEffect(() => {
    setAssignments(null); setProgressRows(null); void load();
    const timer = window.setInterval(() => { void loadProgress(); }, 15000);
    return () => window.clearInterval(timer);
  }, [id, round.id]);
  async function addSelected() {
    if (!selectedJudgeIds.length) return;
    const selectedCount = selectedJudgeIds.length;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/competitions/${id}/judges`, { method: 'POST', body: { judgeIds: selectedJudgeIds } });
      setNotice(`Đã thêm ${selectedCount} giám khảo vào cuộc thi.`);
      setJudgePickerOpen(false); setJudgeQuery(''); setSelectedJudgeIds([]);
      await load(); await refreshCompetition();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <><div className="judge-assignment-page">
      <SectionCard title="Danh sách đã thêm" subtitle={`${assignedJudges.length} giám khảo`} action={<button className="button primary-button small-button judge-add-trigger" type="button" onClick={() => { setError(''); setJudgeQuery(''); setSelectedJudgeIds([]); setJudgePickerOpen(true); }} disabled={busy || assignmentLocked}>＋ Thêm giám khảo</button>}>
      {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
      {assignmentLocked && <Notice tone="warning">Không thể thay đổi danh sách giám khảo sau khi hoạt động chấm đã bắt đầu hoặc đã có phiếu.</Notice>}
      {!assignments ? (error ? <button className="button secondary-button" onClick={() => { setError(''); void load(); }}>Tải lại danh sách</button> : <Loading />) : assignedJudges.length ? <div className="competition-judge-list">{assignedJudges.map((item) => {
        const judgeEntries = (progressRows ?? []).flatMap((row) => {
          const progress = row.judges.find((judge) => judge.id === item.user.id);
          return progress ? [{ entry: row.entry, ...progress }] : [];
        });
        const submitted = judgeEntries.filter((entry) => entry.status === 'SUBMITTED');
        const drafts = judgeEntries.filter((entry) => entry.status === 'DRAFT' || entry.status === 'REOPENED').sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
        const current = drafts[0] ?? null;
        return <article className="competition-judge-row" key={item.user.id}>
        <span className="judge-directory-avatar" aria-hidden="true">{item.user.fullName.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1).toLocaleUpperCase('vi')}</span>
        <div className="competition-judge-copy"><div className="competition-judge-name"><strong>{item.user.fullName}</strong><span className={`competition-judge-status${item.user.isActive ? ' is-active' : ''}`}><i />{item.user.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span></div><small>{item.user.email ?? item.user.username ?? 'Chưa có tài khoản đăng nhập'}</small></div>
        <div className="competition-judge-progress" aria-live="polite">
          {progressRows === null ? <span className="field-help">Đang tải tiến độ chấm…</span> : <>
            <div className="competition-judge-progress-summary"><span><strong>{submitted.length}</strong>/{judgeEntries.length} thí sinh đã chấm</span><span>{judgeEntries.length - submitted.length} chưa nộp</span></div>
            {current ? <p className="competition-judge-current"><span>Đang làm gần nhất</span><strong>{current.entry.code} · {current.entry.name}</strong><small>{current.status === 'REOPENED' ? 'Phiếu đã mở lại' : 'Bản nháp đã lưu'}{current.updatedAt ? ` · ${formatDateTime(current.updatedAt)}` : ''}</small></p> : <p className="competition-judge-current is-empty">Chưa có phiếu nháp đang làm.</p>}
            <details className="competition-judge-progress-details"><summary>Xem danh sách {judgeEntries.length} thí sinh</summary><div className="competition-judge-progress-list">
              {judgeEntries.map((entry) => <div className="competition-judge-progress-item" key={entry.entry.id}><span><strong>{entry.entry.code} · {entry.entry.name}</strong>{entry.updatedAt && <small>{entry.status === 'SUBMITTED' ? `Nộp ${formatDateTime(entry.submittedAt)}` : `Cập nhật ${formatDateTime(entry.updatedAt)}`}</small>}</span><StatusPill value={entry.status} /></div>)}
            </div></details>
          </>}
        </div>
        <button className="judge-remove-button" type="button" aria-label={`Gỡ ${item.user.fullName} khỏi cuộc thi`} disabled={busy || assignmentLocked} onClick={async () => { const accepted = await confirm({ title: 'Gỡ giám khảo khỏi cuộc thi?', description: `Gỡ ${item.user.fullName} khỏi danh sách giám khảo của cuộc thi? Lịch sử phiếu chấm đã nộp sẽ được giữ nguyên.`, confirmLabel: 'Gỡ khỏi cuộc thi', danger: true }); if (!accepted) return; setBusy(true); setError(''); setNotice(''); try { await api(`/api/competitions/${id}/judges/${item.id}`, { method: 'DELETE' }); setNotice(`Đã gỡ ${item.user.fullName} khỏi cuộc thi.`); await load(); await refreshCompetition(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); } }}>Gỡ</button>
      </article>})}</div> : <EmptyState title="Chưa có giám khảo" description="Thêm giám khảo từ danh sách tài khoản hiện có để bắt đầu phân công chấm." />}
    </SectionCard>
    <Dialog open={judgePickerOpen} title="Thêm giám khảo" description="Chọn một hoặc nhiều tài khoản để thêm vào cuộc thi." onClose={() => { setJudgePickerOpen(false); setJudgeQuery(''); setSelectedJudgeIds([]); }} className="judge-picker-dialog">
      <div className="judge-picker-search"><Icon name="search" /><input className="field-input" type="search" value={judgeQuery} onChange={(event) => setJudgeQuery(event.target.value)} placeholder="Tìm tên hoặc tài khoản" aria-label="Tìm giám khảo" /></div>
      {error && <Notice tone="error">{error}</Notice>}
      {availableJudges.length > 0 && <div className="judge-picker-count" aria-live="polite">{filteredJudges.length} trong {availableJudges.length} có thể thêm{selectedJudgeIds.length > 0 ? ` · ${selectedJudgeIds.length} đã chọn` : ''}</div>}
      <div className="judge-picker-results" role="listbox" aria-label="Danh sách giám khảo chưa tham gia cuộc thi">
        {filteredJudges.length ? filteredJudges.map((judge) => {
          const selected = selectedJudgeIds.includes(judge.id);
          return <button className={`judge-picker-option${selected ? ' is-selected' : ''}`} key={judge.id} type="button" role="option" aria-selected={selected} disabled={busy} onClick={() => toggleJudge(judge.id)}>
          <span className="judge-picker-avatar" aria-hidden="true">{judge.fullName.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1).toLocaleUpperCase('vi')}</span><span className="judge-picker-option-copy"><strong>{judge.fullName}</strong><small>{judge.email ?? judge.username ?? 'Chưa có tài khoản đăng nhập'}</small></span><span className="judge-picker-option-action" aria-hidden="true">{selected ? '✓' : '+'}</span>
        </button>;
        }) : <div className="judge-picker-empty"><strong>{availableJudges.length ? 'Không tìm thấy giám khảo' : hasActiveJudges ? 'Tất cả giám khảo đã có trong cuộc thi' : 'Chưa có giám khảo đang hoạt động'}</strong><span>{availableJudges.length ? 'Thử tên hoặc tài khoản khác.' : 'Có thể tạo hoặc kích hoạt tài khoản tại danh sách giám khảo.'}</span>{!availableJudges.length && <Link className="button secondary-button small-button" href="/judges" onClick={() => { setJudgePickerOpen(false); setSelectedJudgeIds([]); }}>Quản lý danh sách giám khảo</Link>}</div>}
      </div>
      <div className="judge-picker-footer"><span>{selectedJudgeIds.length ? `${selectedJudgeIds.length} đã chọn` : 'Chọn giám khảo trong danh sách'}</span><button className="button primary-button" type="button" onClick={() => void addSelected()} disabled={busy || !selectedJudgeIds.length}>{busy ? 'Đang thêm…' : selectedJudgeIds.length ? `Thêm ${selectedJudgeIds.length} giám khảo` : 'Chọn giám khảo'}</button></div>
    </Dialog>
  </div>
    {confirmationDialog}</>;
}

function RubricEditor({ id, round, refreshCompetition }: { id: string; round: Round; refreshCompetition: () => Promise<void> }) {
  const locked = round._count.snapshots > 0 || round.status === 'LIVE' || round.status === 'COMPLETED' || round.session?.state !== 'IDLE';
  return <RubricBuilder id={id} locked={locked} hasScores={round._count.scoreSheets > 0} refreshCompetition={refreshCompetition} />;
}
type EntryOption = { id: string; entryCode: string; sequence: number; status: string; title: string | null; contestant: { displayName: string; organization: string | null } };

function LiveControl({ id, round, refreshCompetition }: { id: string; round: Round; refreshCompetition: () => Promise<void> }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const { promptText, dialog: textPromptDialog } = useTextPromptDialog();
  const [session, setSession] = useState<{ id: string; state: string; version: number; currentEntry: { id: string; entryCode: string; title: string | null; contestant?: { displayName: string; organization: string | null } } | null } | null>(null);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [preflight, setPreflight] = useState<{ entryCount: number; requiredJudgeCount: number; rubricReady: boolean; missingAssignments: { entryId: string; entryCode: string; displayName: string; assignedJudgeCount: number; requiredJudgeCount: number }[]; canStart: boolean } | null>(null);
  const [selectedEntry, setSelectedEntry] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canSelectEntry = session?.state === 'LIVE' || session?.state === 'PAUSED';
  async function load() {
    try {
      const [live, contestantResult] = await Promise.all([
        api<{ session: NonNullable<typeof session> }>(`/api/competitions/${id}/session`),
        api<{ contestants: { displayName: string; organization: string | null; entries: Omit<EntryOption, 'contestant'>[] }[] }>(`/api/competitions/${id}/contestants`),
      ]);
      const readiness = await api<{ preflight: NonNullable<typeof preflight> }>(`/api/competitions/${id}/preflight`);
      setSession(live.session);
      setPreflight(readiness.preflight);
      setEntries(contestantResult.contestants.flatMap((item) => item.entries.filter((entry) => entry.status === 'ACTIVE').map((entry) => ({ ...entry, contestant: { displayName: item.displayName, organization: item.organization } }))).sort((a, b) => a.sequence - b.sequence));
      setSelectedEntry(live.session.currentEntry?.id ?? '');
      setLoadError('');
    } catch (reason) { setLoadError(errorText(reason)); }
  }
  useEffect(() => { let active = true; setSession(null); void load(); const timer = window.setInterval(() => { if (active) void load(); }, 5000); return () => { active = false; window.clearInterval(timer); }; }, [id, round.id]);
  async function action(actionName: string, entryId?: string, overrideReason?: string) {
    setBusy(true); setError('');
    try { const result = await api<{ session: NonNullable<typeof session> }>(`/api/competitions/${id}/session`, { method: 'POST', body: { action: actionName, entryId, overrideReason, expectedVersion: session?.version ?? 0 } }); setSession(result.session); setSelectedEntry(result.session.currentEntry?.id ?? ''); await Promise.all([load(), refreshCompetition()]); }
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
    const accepted = await confirm({ title: 'Kết thúc phiên chấm?', description: 'Phiên sẽ dừng và không thể chuyển lượt tiếp. Phiếu nháp đã có vẫn được phép hoàn tất; thao tác này không khóa hay công bố kết quả.', confirmLabel: 'Kết thúc phiên chấm', danger: true });
    if (accepted) void action('finish');
  }
  return <div className="page-section">
    {error && <Notice tone="error">{error}</Notice>}
    {loadError && <Notice tone="error">{loadError}</Notice>}
    <SectionCard title="Điều phối lượt thi" subtitle="Mọi thay đổi được lưu trên máy chủ và xuất hiện ở khu vực giám khảo.">
      {!session ? (loadError ? <button className="button secondary-button" onClick={() => { setLoadError(''); void load(); }}>Tải lại phiên chấm</button> : <Loading />) : <>
        <div className="live-current"><span className="live-number">{session.currentEntry?.entryCode ?? '—'}</span><div><div className="pill-row"><StatusPill value={session.state} /><span className="metric-chip">Phiên bản trạng thái {session.version}</span></div><h3 style={{ marginTop: 8 }}>{session.currentEntry?.contestant?.displayName ?? (session.currentEntry ? 'Danh tính được ẩn' : 'Chưa chọn thí sinh')}</h3><p>{session.currentEntry?.title || (session.currentEntry ? `Đang chấm cho cuộc thi` : 'Bắt đầu phiên để gửi lượt thi hiện tại cho giám khảo.')}</p></div></div>
        {session.state === 'IDLE' && preflight && <div className="preflight-summary" aria-live="polite"><div className="preflight-heading"><strong>Kiểm tra trước khi bắt đầu</strong><span>{preflight.canStart ? 'Đủ điều kiện' : 'Cần xử lý'}</span></div><ul><li>{preflight.entryCount} lượt thi đang hoạt động</li><li>{preflight.rubricReady ? 'Đã có tiêu chí chấm đang kích hoạt' : 'Chưa thiết lập tiêu chí chấm'}</li><li>{preflight.missingAssignments.length ? `Thiếu phân công ở ${preflight.missingAssignments.length} lượt: ${preflight.missingAssignments.map((entry) => entry.entryCode).join(', ')}` : `Đã phân công đủ ${preflight.requiredJudgeCount} giám khảo cho mỗi lượt`}</li></ul><Link href={`/competitions/${id}/judges`} className="text-button">Kiểm tra phân công →</Link></div>}
        <div className="live-controls" style={{ marginTop: 15 }}>
          {session.state === 'IDLE' && <button className="button primary-button" disabled={busy || !preflight || preflight.entryCount === 0 || !preflight.rubricReady || (preflight.missingAssignments.length > 0 && !round.allowAdvanceWithGaps)} onClick={() => void startSession()}>▶ Bắt đầu điều phối</button>}
          {session.state === 'PAUSED' && <button className="button primary-button" disabled={busy} onClick={() => void action('resume')}>▶ Tiếp tục</button>}
          {session.state === 'LIVE' && <button className="button secondary-button" disabled={busy} onClick={() => void action('pause')}>Ⅱ Tạm dừng</button>}
          <button className="button secondary-button" disabled={busy || !canSelectEntry || entries.length === 0} onClick={() => void action('previous')}>← Lượt trước</button>
          <button className="button secondary-button" disabled={busy || !canSelectEntry || entries.length === 0} onClick={() => void action('next')}>Lượt tiếp →</button>
          <label className="field-label" style={{ minWidth: 220 }}>Chọn trực tiếp<AppSelect className="field-select" value={selectedEntry} onValueChange={(next) => { if (next) void action('select', next); }} disabled={busy || !canSelectEntry || entries.length === 0} placeholder="Chọn thí sinh…" options={entries.map((entry) => ({ value: entry.id, label: `${entry.sequence}. ${entry.entryCode} · ${entry.contestant.displayName}` }))} /></label>
          {session.state !== 'IDLE' && session.state !== 'COMPLETED' && <button className="button danger-button" disabled={busy} onClick={() => void finishSession()}>Kết thúc phiên chấm</button>}
        </div>
      </>}
    </SectionCard>
    <SectionCard title="Danh sách lượt thi" subtitle={`${entries.length} lượt thi đang hoạt động`}>
      {entries.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>THỨ TỰ</th><th>MÃ DỰ THI</th><th>THÍ SINH / ĐỘI</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td data-label="Thứ tự">{entry.sequence}</td><td data-label="Mã dự thi"><strong>{entry.entryCode}</strong></td><td data-label="Thí sinh / đội"><strong>{entry.contestant.displayName}</strong><div className="field-help">{entry.title || entry.contestant.organization || ''}</div></td><td data-label="Trạng thái"><StatusPill value={session?.currentEntry?.id === entry.id ? 'LIVE' : entry.status} /></td><td data-label="Thao tác"><button className="button secondary-button small-button" disabled={busy || !canSelectEntry} onClick={() => void action('select', entry.id)}>Chọn lượt này</button></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có thí sinh" description="Thêm thí sinh vào cuộc thi trước khi bắt đầu." />}
    </SectionCard>
    {textPromptDialog}{confirmationDialog}
  </div>;
}

type ScoreStatusRow = { entry: { id: string; code: string; name: string }; requiredCount: number; assignedCount: number; submittedCount: number; judges: { id: string; name: string; email: string; status: string; totalScore: number | null; scoreSheetId: string | null }[] };

function ScoreStatus({ id, round, refreshCompetition }: { id: string; round: Round; refreshCompetition: () => Promise<void> }) {
  const { promptText, dialog: textPromptDialog } = useTextPromptDialog();
  const [rows, setRows] = useState<ScoreStatusRow[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() { try { setRows((await api<{ rows: ScoreStatusRow[] }>(`/api/competitions/${id}/scores`)).rows); } catch (reason) { setError(errorText(reason)); } }
  useEffect(() => { setRows(null); void load(); }, [id, round.id]);
  async function reopen(row: ScoreStatusRow, judgeName: string, scoreSheetId: string) {
    const reason = await promptText({ title: 'Mở lại phiếu chấm', description: `${judgeName} · ${row.entry.code}. Bản kết quả hiện tại sẽ được giữ trong lịch sử; giám khảo cần nộp lại để tạo phiên bản mới.`, label: 'Lý do mở lại (tối thiểu 10 ký tự)', minLength: 10, maxLength: 2000, submitLabel: 'Mở lại phiếu' });
    if (!reason) return;
    try { await api(`/api/competitions/${id}/results`, { method: 'POST', body: { action: 'reopen-score', scoreSheetId, reason } }); setNotice(`Đã mở lại phiếu ${row.entry.code} của ${judgeName}.`); await load(); await refreshCompetition(); }
    catch (reasonError) { setError(errorText(reasonError)); }
  }
  const totalSubmitted = rows?.reduce((sum, row) => sum + row.submittedCount, 0) ?? 0;
  const totalNeeded = (rows?.length ?? 0) * round.requiredJudgeCount;
  const totalAssigned = rows?.reduce((sum, row) => sum + row.assignedCount, 0) ?? 0;
  return <SectionCard title="Trạng thái phiếu điểm" subtitle={`Cần ${round.requiredJudgeCount} giám khảo nộp cho mỗi lượt thi`}>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {rows === null ? (error ? <button className="button secondary-button" onClick={() => { setError(''); void load(); }}>Tải lại phiếu điểm</button> : <Loading />) : <>
      <div className="pill-row" style={{ marginBottom: 15 }}><span className="metric-chip">Đã phân công {totalAssigned}/{totalNeeded} vị trí</span><span className="metric-chip">Đã nộp {totalSubmitted}/{totalNeeded} phiếu yêu cầu</span><span className="metric-chip">Còn thiếu {Math.max(0, totalNeeded - totalSubmitted)}</span></div>
      {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>LƯỢT THI</th><th>GIÁM KHẢO</th><th>TRẠNG THÁI</th><th>ĐIỂM</th><th>THAO TÁC</th></tr></thead><tbody>{rows.flatMap((row) => {
        const judgeRows = row.judges.map((judge) => <tr key={`${row.entry.id}-${judge.id}`}><td data-label="Lượt thi"><strong>{row.entry.code}</strong><div className="field-help">{row.entry.name}</div></td><td data-label="Giám khảo">{judge.name}</td><td data-label="Trạng thái"><StatusPill value={judge.status === 'MISSING' ? 'DRAFT' : judge.status} />{judge.status === 'MISSING' && <span className="field-help"> Chưa có phiếu</span>}</td><td data-label="Điểm">{judge.totalScore === null ? '—' : judge.totalScore.toFixed(round.roundingPrecision)}</td><td data-label="Thao tác">{judge.scoreSheetId && (judge.status === 'SUBMITTED' || (round._count.snapshots > 0 && judge.status === 'DRAFT')) ? <button className="button secondary-button small-button" onClick={() => void reopen(row, judge.name, judge.scoreSheetId!)}>Mở lại</button> : '—'}</td></tr>);
        const emptySlots = Array.from({ length: Math.max(0, row.requiredCount - row.assignedCount) }, (_, index) => <tr key={`${row.entry.id}-missing-${index}`}><td data-label="Lượt thi"><strong>{row.entry.code}</strong><div className="field-help">{row.entry.name}</div></td><td data-label="Giám khảo">Chưa phân công</td><td data-label="Trạng thái"><StatusPill value="MISSING" /></td><td data-label="Điểm">—</td><td data-label="Thao tác">—</td></tr>);
        return [...judgeRows, ...emptySlots];
      })}</tbody></table></div> : <EmptyState title="Chưa có thí sinh" description="Thêm thí sinh và giám khảo trước khi theo dõi phiếu chấm." />}
    </>}
    {textPromptDialog}
  </SectionCard>;
}

type ResultRow = { entryId: string; entryCode: string; title: string | null; contestant: string; organization: string | null; totalScore: number | null; rank: number | null; outcome: 'PASS' | 'FAIL'; submittedCount: number; requiredCount: number; judges: { judge: string; score: number | null; outcome?: string | null; details?: { criterionId: string; criterion: string; score: number | null; displayValue: string }[] }[] };

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
    try { const result = await api<{ rows?: ResultRow[]; missing?: typeof missing; snapshot: typeof snapshot }>(`/api/competitions/${id}/results`); setRows(result.rows ?? result.snapshot?.data ?? []); setMissing(result.missing ?? []); setSnapshot(result.snapshot); }
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
      const accepted = await confirm({ title: 'Khóa kết quả cuộc thi?', description: 'Hệ thống lưu snapshot bất biến theo rubric, cách tổng hợp, quy tắc đồng điểm và chính sách ẩn danh hiện tại. Sau đó cần mở lại phiếu bằng lý do để tạo phiên bản mới.', confirmLabel: 'Khóa snapshot' });
      if (!accepted) return;
    }
    setBusy(true); setNotice(''); setError('');
    try { const result = await api(`/api/competitions/${id}/results`, { method: 'POST', body: { action: actionName, ...(reason ? { reason } : {}) } }); setNotice(actionName === 'lock' ? 'Đã khóa kết quả và lưu snapshot.' : 'Đã công bố kết quả.'); if (actionName === 'lock') reload(); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <div className="page-section">
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    <SectionCard title={canManage ? `Kết quả` : `Kết quả đã công bố`} subtitle={canManage ? `Tổng hợp ${round.aggregateMethod === 'MEDIAN' ? 'trung vị' : 'trung bình cộng'} · làm tròn ${round.roundingPrecision} chữ số · ${round.tieBreakMethod === 'CRITERIA_PRIORITY' ? 'so tiêu chí theo thứ tự ưu tiên khi đồng điểm' : 'đồng hạng khi bằng điểm tổng'}.` : 'Bản kết quả chỉ đọc do ban tổ chức công bố.'} action={snapshot?.published && rows?.length ? <a className="button secondary-button small-button" href={`/api/competitions/${id}/results?format=csv`}>↓ Tải CSV</a> : undefined}>
      {rows === null ? <Loading /> : <>
        <div className="toolbar"><div className="pill-row"><span className="metric-chip">{rows.length} lượt thi</span>{snapshot && <><span className="metric-chip">Phiên bản {snapshot.version}</span><span className="metric-chip">Khóa bởi {snapshot.lockedByName || '—'} · {formatDateTime(snapshot.lockedAt)}</span><span className="metric-chip">{snapshot.policy?.anonymous ? 'Ẩn danh' : 'Hiện danh tính'} · {snapshot.policy?.publishJudgeScores ? 'Công khai điểm giám khảo' : 'Ẩn điểm giám khảo'}</span></>}<span className="metric-chip">{snapshot?.published ? 'Đã công bố' : snapshot ? 'Chưa công bố' : 'Chưa khóa'}</span></div>{canManage && <div className="toolbar-right">{snapshot ? !snapshot.published && <button className="button primary-button small-button" disabled={busy} onClick={() => void action('publish')}>{busy ? 'Đang xử lý…' : 'Công bố kết quả'}</button> : <button className="button primary-button small-button" disabled={busy || rows.length === 0 || (missing.length > 0 && !round.allowAdvanceWithGaps)} onClick={() => void action('lock')}>{busy ? 'Đang khóa…' : 'Khóa kết quả'}</button>}</div>}</div>
        {canManage && missing.length > 0 && <Notice tone="warning">{missing.length} lượt thi chưa đủ phiếu chấm yêu cầu: {missing.map((item) => `${item.entryCode} (${item.submittedCount}/${item.requiredCount})`).join(' · ')}. {round.allowAdvanceWithGaps ? 'Có thể khóa ngoại lệ sau khi ghi lý do.' : 'Hãy chờ đủ phiếu trước khi khóa.'}</Notice>}
        {!canManage && !snapshot?.published && <Notice tone="info">Kết quả chưa được ban tổ chức công bố.</Notice>}
        {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>HẠNG</th><th>MÃ</th><th>THÍ SINH / ĐỘI</th><th>ĐIỀU KIỆN</th><th>ĐIỂM TỔNG</th><th>PHIẾU</th><th>CHI TIẾT GIÁM KHẢO</th></tr></thead><tbody>{rows.map((row) => <tr key={row.entryId}><td data-label="Hạng"><span className="result-rank">{row.rank ?? '—'}</span></td><td data-label="Mã"><strong>{row.entryCode}</strong></td><td data-label="Thí sinh / đội"><strong>{row.contestant}</strong><div className="field-help">{row.title || row.organization || ''}</div></td><td data-label="Điều kiện"><span className={`result-outcome ${row.outcome === 'FAIL' ? 'is-fail' : 'is-pass'}`}>{row.outcome === 'FAIL' ? 'Không đạt' : 'Đạt'}</span></td><td data-label="Điểm tổng"><strong>{row.totalScore === null ? '—' : row.totalScore.toFixed(round.roundingPrecision)}</strong></td><td data-label="Phiếu">{row.submittedCount}/{row.requiredCount}</td><td data-label="Chi tiết giám khảo"><div className="result-judge-breakdown">{row.judges.map((judge) => <details key={judge.judge}><summary><strong>{judge.judge}</strong><span>{judge.score?.toFixed(round.roundingPrecision) ?? '—'} điểm{judge.outcome === 'FAIL' ? ' · Không đạt' : ''}</span></summary>{judge.details?.length ? <ul>{judge.details.map((detail) => <li key={detail.criterionId}><span>{detail.criterion}</span><strong>{detail.displayValue}</strong></li>)}</ul> : null}</details>)}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có kết quả" description="Cần thêm lượt thi và phiếu chấm trước khi tổng hợp." />}
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
      <div className="toolbar audit-filters"><label className="field-label">Tìm trong trang hiện tại<input className="filter-input" placeholder="Người thực hiện, hành động, mã hoặc lý do" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="field-label">Lọc hành động<AppSelect className="field-select" value={actionFilter} onValueChange={setActionFilter} options={[{ value: '', label: 'Tất cả hành động trong trang' }, ...[...new Set(events.map((event) => event.action))].map((action) => ({ value: action, label: auditActionLabel(action) }))]} /></label></div>
      {filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>THỜI ĐIỂM</th><th>NGƯỜI THỰC HIỆN</th><th>HÀNH ĐỘNG</th><th>ĐỐI TƯỢNG</th><th>CHI TIẾT</th></tr></thead><tbody>{filtered.map((event) => { const details = auditDetailRows(event.action, event.details); return <tr key={event.id}><td data-label="Thời điểm">{formatDateTime(event.createdAt)}</td><td data-label="Người thực hiện"><strong>{event.actor?.fullName ?? 'Hệ thống'}</strong>{event.actor?.email && <div className="field-help">{event.actor.email}</div>}</td><td data-label="Hành động"><strong>{auditActionLabel(event.action)}</strong></td><td data-label="Đối tượng">{auditEntityLabel(event.entityType)}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</td><td data-label="Chi tiết">{details.length ? <ul className="audit-detail-list">{details.map((detail) => <li key={detail.label}><span>{detail.label}</span><strong>{detail.value}</strong></li>)}</ul> : '—'}</td></tr>; })}</tbody></table></div> : <EmptyState title="Không có hoạt động khớp" description="Xóa bộ lọc hoặc tìm cụm từ khác trong trang hiện tại." />}
      <div className="toolbar audit-pagination"><span className="field-help">Trang {page}/{pageCount} · {total} hoạt động</span><div className="table-actions"><button className="button secondary-button small-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Trang trước</button><button className="button secondary-button small-button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Trang sau →</button></div></div>
    </> : <EmptyState title="Chưa có nhật ký" description="Các hoạt động sẽ xuất hiện sau khi có thay đổi trong cuộc thi." />}
  </SectionCard>;
}

function errorText(reason: unknown) { return reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Hãy thử lại.'; }
function toDateTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, useConfirmDialog } from '@/components/ui';

type Task = { competition: { id: string; name: string; status: string; startsAt: string | null }; round: { id: string; name: string; sequence: number; status: string; anonymous: boolean; sessionState: string; roundingPrecision: number }; entry: { id: string; code: string; sequence: number; title: string | null; displayName: string; organization: string | null }; rubric: { version: number; name: string; criteria: Criterion[] } | null; scoreSheet: { id: string; status: string; totalScore: number | null; submittedAt: string | null } | null; taskStatus: string; taskMessage: string; canOpen: boolean };
type Criterion = { id: string; name: string; description: string | null; minimum: number | string; maximum: number | string; step: number | string; weight: number | string; commentRequired: boolean };
type ScoreState = { score: string; comment: string };
const taskStatusOptions = [
  { value: 'ALL', label: 'Tất cả' }, { value: 'LIVE', label: 'Đang diễn ra' }, { value: 'READY', label: 'Sẵn sàng' },
  { value: 'DRAFT', label: 'Bản nháp' }, { value: 'REOPENED', label: 'Mở lại' }, { value: 'SUBMITTED', label: 'Đã nộp' },
  { value: 'WAITING', label: 'Chờ điều phối' }, { value: 'LOCKED', label: 'Đã khóa' }, { value: 'UNAVAILABLE', label: 'Không khả dụng' },
];

async function request<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể tải dữ liệu.');
  return result as T;
}

export function JudgeTasks() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [submittedEntryId, setSubmittedEntryId] = useState<string | null>(null);
  const [entrySearch, setEntrySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedCompetitionId(params.get('competitionId'));
      setSelectedRoundId(params.get('roundId'));
      setSubmittedEntryId(params.get('submitted'));
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => request<{ tasks: Task[] }>('/api/judge/tasks').then((result) => { if (active) { setTasks(result.tasks); setError(''); } }).catch((reason) => { if (active) { setError(message(reason)); setTasks([]); } });
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  const competitions = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; status: string; tasks: Task[] }>();
    for (const task of tasks ?? []) {
      const competition = grouped.get(task.competition.id) ?? { id: task.competition.id, name: task.competition.name, status: task.competition.status, tasks: [] };
      competition.tasks.push(task);
      grouped.set(competition.id, competition);
    }
    return [...grouped.values()].map((competition) => ({
      ...competition,
      roundCount: new Set(competition.tasks.map((task) => task.round.id)).size,
      submittedCount: competition.tasks.filter((task) => task.scoreSheet?.status === 'SUBMITTED').length,
    }));
  }, [tasks]);
  const selectedCompetition = competitions.find((competition) => competition.id === selectedCompetitionId) ?? null;
  const activeScopeFilterCount = Number(Boolean(selectedCompetitionId)) + Number(Boolean(selectedRoundId));
  const availableTasks = useMemo(() => {
    const selected = (tasks ?? []).filter((task) => (!selectedCompetitionId || task.competition.id === selectedCompetitionId) && (!selectedRoundId || task.round.id === selectedRoundId));
    return selected;
  }, [tasks, selectedCompetitionId, selectedRoundId]);
  const roundOptions = useMemo(() => {
    const rounds = new Map<string, { id: string; name: string; sequence: number; competitionName: string }>();
    for (const task of (tasks ?? []).filter((item) => !selectedCompetitionId || item.competition.id === selectedCompetitionId)) {
      if (!rounds.has(task.round.id)) rounds.set(task.round.id, { id: task.round.id, name: task.round.name, sequence: task.round.sequence, competitionName: task.competition.name });
    }
    return [...rounds.values()].sort((a, b) => a.competitionName.localeCompare(b.competitionName, 'vi') || a.sequence - b.sequence);
  }, [tasks, selectedCompetitionId]);
  const filteredTasks = useMemo(() => {
    const query = entrySearch.trim().toLocaleLowerCase('vi');
    return availableTasks.filter((task) => {
      const text = `${task.competition.name} ${task.round.name} ${task.entry.code} ${task.entry.displayName} ${task.entry.title ?? ''} ${task.entry.organization ?? ''}`.toLocaleLowerCase('vi');
      return (statusFilter === 'ALL' || task.taskStatus === statusFilter) && (!query || text.includes(query));
    });
  }, [availableTasks, entrySearch, statusFilter]);
  const statusCounts = useMemo(() => Object.fromEntries(taskStatusOptions.map(({ value }) => [value, value === 'ALL' ? availableTasks.length : availableTasks.filter((task) => task.taskStatus === value).length])), [availableTasks]);
  const visibleRounds = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; sequence: number; competition: { id: string; name: string }; tasks: Task[] }>();
    for (const task of filteredTasks) {
      const key = `${task.competition.id}:${task.round.id}`;
      const round = grouped.get(key) ?? { id: task.round.id, name: task.round.name, sequence: task.round.sequence, competition: { id: task.competition.id, name: task.competition.name }, tasks: [] };
      round.tasks.push(task);
      grouped.set(key, round);
    }
    return [...grouped.values()].sort((a, b) => a.competition.name.localeCompare(b.competition.name, 'vi') || a.sequence - b.sequence).map((round) => ({ ...round, tasks: round.tasks.sort((a, b) => a.entry.sequence - b.entry.sequence) }));
  }, [filteredTasks]);

  function updateFilters(nextCompetitionId: string | null, nextRoundId: string | null = null) {
    setSelectedCompetitionId(nextCompetitionId);
    setSelectedRoundId(nextRoundId);
    const params = new URLSearchParams();
    if (nextCompetitionId) params.set('competitionId', nextCompetitionId);
    if (nextRoundId) params.set('roundId', nextRoundId);
    router.replace(`/judge${params.size ? `?${params.toString()}` : ''}`);
  }

  const firstTask = availableTasks[0];
  return <div className="judge-tasks-screen">
    <PageHeader className="judge-page-heading" eyebrow={firstTask ? `${firstTask.round.name} · ${firstTask.competition.name}` : 'GIÁM KHẢO'} title="Danh sách Chấm thi" description="Các lượt được phân công cho bạn" />
    {error && <Notice tone="error">{error}</Notice>}
    {tasks === null ? <Loading /> : !tasks.length ? <EmptyState title="Chưa có lượt chấm được phân công" description="Khi Admin phân công bạn chấm một hoặc nhiều lượt, chúng sẽ xuất hiện ở đây." /> : <>
      <div className="judge-queue-toolbar">
        <label className="judge-mobile-search"><Icon name="search" size={18} /><span className="sr-only">Tìm lượt chấm</span><input className="filter-input" type="search" value={entrySearch} onChange={(event) => setEntrySearch(event.target.value)} placeholder="Tìm theo mã SBD, tên đề án…" />{entrySearch && <button className="judge-search-clear" type="button" aria-label="Xóa nội dung tìm kiếm" onClick={() => setEntrySearch('')}><Icon name="close" size={16} /></button>}</label>
        <button className={`judge-filter-toggle${filtersOpen ? ' is-open' : ''}`} type="button" aria-expanded={filtersOpen} aria-label={activeScopeFilterCount ? `Bộ lọc nâng cao, ${activeScopeFilterCount} điều kiện đang áp dụng` : 'Bộ lọc nâng cao'} onClick={() => setFiltersOpen((open) => !open)}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="8" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/></svg>{activeScopeFilterCount > 0 && <span className="judge-filter-count" aria-hidden="true">{activeScopeFilterCount}</span>}</button>
      </div>
      {filtersOpen && <div className="judge-queue-filter-panel">{competitions.length > 1 && <label className="field-label">Cuộc thi<select className="field-select" value={selectedCompetitionId ?? ''} onChange={(event) => updateFilters(event.target.value || null)}><option value="">Tất cả cuộc thi</option>{competitions.map((competition) => <option value={competition.id} key={competition.id}>{competition.name}</option>)}</select></label>}{roundOptions.length > 1 && <label className="field-label">Vòng thi<select className="field-select" value={selectedRoundId ?? ''} onChange={(event) => updateFilters(selectedCompetitionId, event.target.value || null)}><option value="">Tất cả vòng</option>{roundOptions.map((round) => <option value={round.id} key={round.id}>{selectedCompetition ? round.name : `${round.competitionName} · ${round.name}`}</option>)}</select></label>}<div className="judge-filter-results"><span>{filteredTasks.length}/{availableTasks.length} lượt phù hợp</span>{activeScopeFilterCount > 0 && <button className="judge-clear-filters" type="button" onClick={() => updateFilters(null)}>Xóa bộ lọc</button>}</div></div>}
      <nav className="judge-status-filters" aria-label="Lọc trạng thái lượt chấm">
        <label className="judge-mobile-status-filter"><span>Trạng thái lượt chấm</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{taskStatusOptions.map((option) => <option value={option.value} key={option.value}>{option.label} ({statusCounts[option.value]})</option>)}</select></label>
        <div className="judge-status-filter-buttons">{taskStatusOptions.map((option) => <button type="button" key={option.value} className={statusFilter === option.value ? 'active' : ''} aria-pressed={statusFilter === option.value} onClick={() => setStatusFilter(option.value)}>{option.label}<span>{statusCounts[option.value]}</span></button>)}</div>
      </nav>
      {submittedEntryId && tasks.some((task) => task.entry.id === submittedEntryId) && <Notice tone="success">Phiếu chấm đã được nộp. Danh sách vẫn theo thứ tự Ban tổ chức sắp xếp; bạn có thể mở lượt tiếp theo.</Notice>}
      {visibleRounds.length ? visibleRounds.map((round) => <section className="judge-round-section" key={`${round.competition.id}:${round.id}`}>
        <div className="judge-round-heading"><div>{competitions.length > 1 && !selectedCompetitionId && <span className="eyebrow">{round.competition.name}</span>}<span className="eyebrow">VÒNG {round.sequence}</span><h2>{round.name}</h2></div><span className="judge-round-count">{round.tasks.length} lượt</span></div>
        <div className="judge-queue">{round.tasks.map((task) => <article className="judge-card" data-entry-id={task.entry.id} data-status={task.taskStatus.toLowerCase()} key={`${task.round.id}-${task.entry.id}`}>
        <div className="judge-card-top"><div><StatusPill value={task.taskStatus} /><span className="judge-card-sequence">· Lượt {String(task.entry.sequence).padStart(2, '0')}</span></div><span className="judge-entry-code">{task.entry.code}</span></div>
          <div className="judge-entry"><div><strong>{task.entry.title || task.entry.displayName}</strong><p>{task.entry.title ? task.entry.displayName : task.entry.organization || 'Lượt thi được giao'}{task.entry.title && task.entry.organization ? ` · ${task.entry.organization}` : ''}</p></div></div>
          <div className="judge-task-meta">{task.scoreSheet?.totalScore !== null && task.scoreSheet && <span>Điểm của tôi: {Number(task.scoreSheet.totalScore).toFixed(task.round.roundingPrecision)}</span>}</div>
        <div className="judge-card-bottom">{task.taskStatus !== 'READY' && <p>{task.taskMessage}</p>}{task.canOpen ? <Link className="button primary-button" href={`/judge/${task.entry.id}?competitionId=${encodeURIComponent(task.competition.id)}`}>{task.taskStatus === 'LOCKED' ? 'Xem bản nháp đã khóa' : task.scoreSheet?.status === 'SUBMITTED' ? 'Xem phiếu đã nộp' : task.scoreSheet?.status === 'DRAFT' ? 'Tiếp tục bản nháp' : task.scoreSheet?.status === 'REOPENED' ? 'Sửa phiếu đã mở lại' : task.taskStatus === 'LIVE' ? 'Vào chấm ngay' : 'Mở phiếu chấm'}</Link> : <button className="button secondary-button" type="button" disabled>{task.taskStatus === 'WAITING' ? 'Chờ điều phối' : 'Chưa khả dụng'}</button>}</div>
        </article>)}</div>
      </section>) : <EmptyState title={statusFilter === 'ALL' ? 'Không tìm thấy lượt chấm' : 'Không có lượt ở trạng thái này'} description="Thử đổi bộ lọc hoặc tìm bằng tên cuộc thi, vòng, đội, thí sinh hay mã lượt thi." />}
    </>}
  </div>;
}

export function JudgeScoreForm({ entryId }: { entryId: string }) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [payload, setPayload] = useState<{ entry: { id: string; code: string; title: string | null; displayName: string; organization: string | null }; round: { id: string; name: string; status: string; anonymous: boolean; roundingPrecision: number }; rubric: { version: number; name: string; criteria: Criterion[] }; scoreSheet: { id: string; status: string; totalScore: string | number | null; locked?: boolean; details: { criterionId: string; score: string | number; comment: string | null }[] } | null } | null>(null);
  const [scores, setScores] = useState<Record<string, ScoreState>>({});
  const [loaded, setLoaded] = useState(false);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const readOnly = payload?.scoreSheet?.status === 'SUBMITTED' || payload?.scoreSheet?.locked === true;
  const hasEnteredScore = Object.values(scores).some((value) => value.score !== '');
  const completedCriteria = payload?.rubric.criteria.filter((criterion) => scores[criterion.id ?? '']?.score !== undefined && scores[criterion.id ?? '']?.score !== '').length ?? 0;
  const currentTotal = useMemo(() => {
    if (!payload) return 0;
    let weighted = 0; let weightTotal = 0;
    for (const criterion of payload.rubric.criteria) {
      const current = Number(scores[criterion.id]?.score);
      if (!Number.isFinite(current) || scores[criterion.id]?.score === '') continue;
      weighted += current * Number(criterion.weight); weightTotal += Number(criterion.weight);
    }
    return weightTotal ? weighted / weightTotal : 0;
  }, [payload, scores]);
  const maximumTotal = useMemo(() => {
    if (!payload) return 0;
    let weighted = 0; let weightTotal = 0;
    for (const criterion of payload.rubric.criteria) {
      const weight = Number(criterion.weight);
      weighted += Number(criterion.maximum) * weight;
      weightTotal += weight;
    }
    return weightTotal ? weighted / weightTotal : 0;
  }, [payload]);
  async function load() {
    try {
      const result = await request<NonNullable<typeof payload>>(`/api/scores/${entryId}`);
      setPayload(result);
      const initial: Record<string, ScoreState> = {};
      for (const detail of result.scoreSheet?.details ?? []) initial[detail.criterionId] = { score: String(detail.score), comment: detail.comment ?? '' };
      setScores(initial); setLoaded(true);
    } catch (reason) { setError(message(reason)); setLoaded(true); }
  }
  useEffect(() => {
    setCompetitionId(new URLSearchParams(window.location.search).get('competitionId'));
    void load();
  }, [entryId]);

  async function persist(submit: boolean) {
    if (!payload) return;
    setSaving(true); setSaved(false); setError(''); setNotice('');
    const details = Object.entries(scores).filter(([, value]) => value.score !== '' && Number.isFinite(Number(value.score))).map(([criterionId, value]) => ({ criterionId, score: Number(value.score), comment: value.comment }));
    try {
      const result = await request<{ scoreSheet: { id: string; status: string; totalScore: string | number | null; submittedAt: string | null } }>(`/api/scores/${entryId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ details, submit }) });
      setPayload({ ...payload, scoreSheet: { ...(payload.scoreSheet ?? { id: result.scoreSheet.id, details: [] }), ...result.scoreSheet } as NonNullable<typeof payload>['scoreSheet'] });
      setChanged(false); setSaved(true); setSavedAt(new Date());
      setNotice(submit ? 'Phiếu chấm đã được nộp. Bạn không thể tự sửa sau khi nộp.' : 'Bản nháp đã được lưu.');
      if (submit) {
        const params = new URLSearchParams();
        if (competitionId) params.set('competitionId', competitionId);
        params.set('submitted', entryId);
        router.replace(`/judge?${params.toString()}`);
      }
    } catch (reason) { setError(message(reason)); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (!loaded || !changed || readOnly) return;
    const timer = window.setTimeout(() => { void persist(false); }, 900);
    return () => window.clearTimeout(timer);
  }, [scores, changed, loaded, readOnly]);

  function update(criterionId: string, field: keyof ScoreState, value: string) {
    setScores((current) => ({ ...current, [criterionId]: { score: current[criterionId]?.score ?? '', comment: current[criterionId]?.comment ?? '', [field]: value } }));
    setChanged(true); setSaved(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const accepted = await confirm({ title: 'Nộp phiếu chấm?', description: `Điểm hiện tại là ${hasEnteredScore ? currentTotal.toFixed(payload?.round.roundingPrecision ?? 2) : 'chưa có'}. Sau khi nộp, bạn không thể tự sửa; Admin cần mở lại phiếu nếu cần điều chỉnh.`, confirmLabel: 'Nộp phiếu' });
    if (accepted) void persist(true);
  }

  if (!payload) return <><PageHeader className="score-page-heading" eyebrow="DÀNH CHO GIÁM KHẢO" title="Phiếu chấm" description="Nhập điểm theo tiêu chí và lưu bản nháp." />{error && <Notice tone="error">{error}</Notice>}{!error && <Loading />}</>;
  return <>
    <PageHeader className="score-page-heading" eyebrow={`${payload.entry.code} · ${payload.round.name}`} title={payload.entry.displayName} description={payload.entry.title || payload.entry.organization || 'Phiếu chấm'} action={<Link className="button secondary-button" href={competitionId ? `/judge?competitionId=${encodeURIComponent(competitionId)}` : '/judge'}>← Danh sách</Link>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {payload.scoreSheet?.locked && <Notice tone="warning">Snapshot kết quả đã khóa. Bản nháp được giữ nguyên ở chế độ chỉ đọc; liên hệ Admin nếu cần mở lại và tạo phiên bản kết quả mới.</Notice>}
    {payload.round.status === 'COMPLETED' && !readOnly && <Notice tone="warning">Vòng đã kết thúc. Bạn có thể hoàn tất bản nháp đã tạo; để bắt đầu phiếu mới, hãy liên hệ Admin mở lại vòng.</Notice>}
    <div className="score-workspace">
      <aside className="score-context-panel" aria-label="Thông tin lượt chấm">
        <span className="eyebrow">LƯỢT THI</span>
        <span className="score-context-code">{payload.entry.code}</span>
        <h2>{payload.entry.displayName}</h2>
        <p>{payload.entry.title || payload.entry.organization || 'Phiếu chấm độc lập của giám khảo.'}</p>
        <div className="score-context-divider" />
        <dl className="score-context-details"><div><dt>Vòng thi</dt><dd>{payload.round.name}</dd></div><div><dt>Bộ tiêu chí</dt><dd>{payload.rubric.name} · v{payload.rubric.version}</dd></div><div><dt>Trạng thái</dt><dd>{readOnly ? 'Đã nộp, chỉ xem' : 'Có thể chấm'}</dd></div></dl>
        <div className="score-context-progress"><div><span>Tiêu chí đã nhập</span><strong>{completedCriteria}/{payload.rubric.criteria.length}</strong></div><div className="judge-progress-track" role="progressbar" aria-label="Tiêu chí đã nhập điểm" aria-valuemin={0} aria-valuemax={payload.rubric.criteria.length} aria-valuenow={completedCriteria}><i style={{ width: `${payload.rubric.criteria.length ? completedCriteria / payload.rubric.criteria.length * 100 : 0}%` }} /></div></div>
        <p className="score-anonymity-note">{payload.round.anonymous ? 'Đang áp dụng chế độ chấm ẩn danh.' : 'Thông tin thí sinh được hiển thị theo cấu hình vòng thi.'}</p>
      </aside>
      <section className="score-sheet-panel">
        <div className="score-sheet-heading"><div><span className="eyebrow">PHIẾU CHẤM</span><h2>{payload.rubric.name}</h2><p>Điểm tự lưu sau khi bạn dừng nhập. Bấm “Lưu ngay” để lưu bản nháp trước khi nộp.</p></div><span className="score-criteria-count">{payload.rubric.criteria.length} tiêu chí</span></div>
        <form className="score-form" onSubmit={submit}>
          {payload.rubric.criteria.map((criterion, index) => <div className={`score-criterion${scores[criterion.id]?.score !== undefined && scores[criterion.id]?.score !== '' ? ' score-criterion--complete' : ''}`} key={criterion.id}>
            <div className="score-criterion-heading"><span>{String(index + 1).padStart(2, '0')}</span><div><div className="score-criterion-title"><strong>{criterion.name}{criterion.commentRequired && <span style={{ color: '#bd5555' }}> *</span>}</strong><span className="score-weight-badge">{formatWeight(criterion.weight)}</span></div>{criterion.description && <details className="score-guide"><summary>Xem hướng dẫn chấm</summary><p>{criterion.description}</p></details>}<small>Thang {criterion.minimum}–{criterion.maximum} · bước {criterion.step}</small></div></div>
            <label className="field-label">Điểm<div className="score-input-control"><span className="score-scale-range">Thang điểm ({criterion.minimum}–{criterion.maximum})</span><button className="score-adjust-button" type="button" aria-label={`Giảm điểm: ${criterion.name}`} disabled={readOnly || (scores[criterion.id]?.score !== undefined && scores[criterion.id]?.score !== '' && Number(scores[criterion.id].score) <= Number(criterion.minimum))} onClick={() => stepScore(criterion, -1)}>−</button><input className="field-input score-number" aria-label={`Điểm: ${criterion.name}`} type="number" min={Number(criterion.minimum)} max={Number(criterion.maximum)} step={Number(criterion.step)} value={scores[criterion.id]?.score ?? ''} onChange={(event) => update(criterion.id, 'score', event.target.value)} disabled={readOnly} required /><button className="score-adjust-button" type="button" aria-label={`Tăng điểm: ${criterion.name}`} disabled={readOnly || (scores[criterion.id]?.score !== undefined && scores[criterion.id]?.score !== '' && Number(scores[criterion.id].score) >= Number(criterion.maximum))} onClick={() => stepScore(criterion, 1)}>+</button></div></label>
            <label className="field-label comment-field">Nhận xét{criterion.commentRequired && <span className="field-help">Bắt buộc</span>}<textarea className="field-textarea" style={{ minHeight: 62 }} value={scores[criterion.id]?.comment ?? ''} onChange={(event) => update(criterion.id, 'comment', event.target.value)} maxLength={5000} disabled={readOnly} required={criterion.commentRequired} /></label>
          </div>)}
          <div className={`score-footer${readOnly ? '' : ' score-footer--mobile-dock'}`}><div className="score-total"><span>Điểm hiện tại</span><strong>{hasEnteredScore ? currentTotal.toFixed(payload.round.roundingPrecision) : '—'}</strong><span className="score-total-maximum">/ {maximumTotal.toFixed(payload.round.roundingPrecision)}</span><span className={`score-save-state${saving ? ' is-saving' : saved ? ' is-saved' : changed ? ' is-changed' : ''}`} role="status">{saving ? 'Đang lưu…' : saved ? `Đã lưu lúc ${formatSavedTime(savedAt)}` : changed ? 'Chưa lưu' : readOnly ? 'Đã nộp' : 'Tự lưu đang bật'}</span></div><div className="table-actions">{!readOnly && <><button className="button secondary-button" type="button" onClick={() => void persist(false)} disabled={saving}>Lưu ngay</button><button className="button primary-button" type="submit" disabled={saving}>{saving ? 'Đang gửi…' : 'Nộp phiếu'}</button></>}{readOnly && <StatusPill value="SUBMITTED" />}</div></div>
        </form>
      </section>
    </div>
    {confirmDialog}
  </>;

  function stepScore(criterion: Criterion, direction: -1 | 1) {
    const current = scores[criterion.id]?.score ?? '';
    const minimum = Number(criterion.minimum);
    const maximum = Number(criterion.maximum);
    const step = Number(criterion.step);
    if (!Number.isFinite(step) || step <= 0) return;
    const next = current === '' ? minimum : Math.min(maximum, Math.max(minimum, Number(current) + direction * step));
    const precision = Math.min(8, Math.max(decimalPlaces(step), decimalPlaces(minimum), decimalPlaces(maximum)));
    update(criterion.id, 'score', String(Number(next.toFixed(precision))));
  }
}

function message(reason: unknown) { return reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Hãy thử lại.'; }
function decimalPlaces(value: number) { return Math.max(0, (String(value).split('.')[1] ?? '').length); }
function formatSavedTime(value: Date | null) { return value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(value) : 'vừa xong'; }
function formatWeight(value: number | string) {
  const weight = Number(value);
  const percent = weight > 1 ? weight : weight * 100;
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(percent)}%`;
}

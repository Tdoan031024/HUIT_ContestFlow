'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { AppSelect } from '@/components/app-select';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, useConfirmDialog } from '@/components/ui';
import { evaluateScoreSheet, type ConfiguredCriterion, type ScoringConfig } from '@/lib/scoring';

type Task = { competition: { id: string; name: string; status: string; startsAt: string | null }; round: { id: string; name: string; sequence: number; status: string; anonymous: boolean; roundingPrecision: number }; entry: { id: string; code: string; sequence: number; title: string | null; displayName: string; organization: string | null }; rubric: { version: number; name: string; criteria: Criterion[] } | null; scoreSheet: { id: string; status: string; totalScore: number | null; submittedAt: string | null } | null; taskStatus: string; taskMessage: string; canOpen: boolean };
type AssignedCompetition = { id: string; name: string; status: string; startsAt: string | null; contestantCount: number };
type Criterion = { id: string; name: string; description: string | null; type: ConfiguredCriterion['type']; config: unknown; required: boolean; minimum: number | string; maximum: number | string; step: number | string; weight: number | string; commentRequired: boolean };
type ScoreState = { value: unknown; comment: string };
const gradingFilterOptions = [
  { value: 'UNSUBMITTED', label: 'Chưa chấm' },
  { value: 'SUBMITTED', label: 'Đã chấm' },
];

async function request<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể tải dữ liệu.');
  return result as T;
}

export function JudgeTasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignedCompetitions, setAssignedCompetitions] = useState<AssignedCompetition[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [submittedEntryId, setSubmittedEntryId] = useState<string | null>(null);
  const [entrySearch, setEntrySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('UNSUBMITTED');
  const [error, setError] = useState('');
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedCompetitionId(params.get('competitionId'));
      setSubmittedEntryId(params.get('submitted'));
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden || !navigator.onLine) return;
      pending = true;
      try {
        const result = await request<{ tasks: Task[]; competitions: AssignedCompetition[] }>('/api/judge/tasks', { signal: controller.signal });
        if (controller.signal.aborted) return;
        setTasks(result.tasks);
        setAssignedCompetitions(result.competitions);
        setError('');
      } catch (reason) {
        if (!controller.signal.aborted) setError(message(reason));
      } finally {
        pending = false;
      }
    };
    const onOffline = () => setError('Mất kết nối. Danh sách sẽ cập nhật khi có mạng.');
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', onOffline);
    if (!navigator.onLine) onOffline();
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  const availableTasks = useMemo(() => {
    const selected = (tasks ?? []).filter((task) => !selectedCompetitionId || task.competition.id === selectedCompetitionId);
    return selected;
  }, [tasks, selectedCompetitionId]);
  const filteredTasks = useMemo(() => {
    const query = entrySearch.trim().toLocaleLowerCase('vi');
    return availableTasks.filter((task) => {
      const text = `${task.competition.name} ${task.entry.code} ${task.entry.displayName} ${task.entry.title ?? ''} ${task.entry.organization ?? ''}`.toLocaleLowerCase('vi');
      const submitted = task.scoreSheet?.status === 'SUBMITTED';
      return (statusFilter === 'SUBMITTED' ? submitted : !submitted) && (!query || text.includes(query));
    });
  }, [availableTasks, entrySearch, statusFilter]);
  const statusCounts = useMemo(() => Object.fromEntries(gradingFilterOptions.map(({ value }) => [value, availableTasks.filter((task) => value === 'SUBMITTED' ? task.scoreSheet?.status === 'SUBMITTED' : task.scoreSheet?.status !== 'SUBMITTED').length])), [availableTasks]);
  const visibleCompetitions = useMemo(() => {
    const grouped = new Map<string, { competition: { id: string; name: string }; tasks: Task[] }>();
    for (const task of filteredTasks) {
      const key = task.competition.id;
      const competition = grouped.get(key) ?? { competition: { id: task.competition.id, name: task.competition.name }, tasks: [] };
      competition.tasks.push(task);
      grouped.set(key, competition);
    }
    return [...grouped.values()].sort((a, b) => a.competition.name.localeCompare(b.competition.name, 'vi')).map((competition) => ({ ...competition, tasks: competition.tasks.sort((a, b) => a.entry.sequence - b.entry.sequence) }));
  }, [filteredTasks]);

  const competitionName = selectedCompetitionId
    ? assignedCompetitions.find((competition) => competition.id === selectedCompetitionId)?.name
    : assignedCompetitions.length === 1 ? assignedCompetitions[0].name : undefined;
  return <div className="judge-tasks-screen">
    <PageHeader className="judge-page-heading" eyebrow={competitionName ?? 'GIÁM KHẢO'} title="Danh sách lượt chấm" description="Các thí sinh được phân công cho bạn" />
    {error && <Notice tone="error">{error}</Notice>}
    {tasks === null ? !error && <Loading /> : !tasks.length ? assignedCompetitions.length ? <div className="judge-assigned-competitions">
      {assignedCompetitions.map((competition) => <section className="judge-round-section" key={competition.id}>
        <div className="judge-round-heading"><div><span className="eyebrow">CUỘC THI ĐƯỢC PHÂN CÔNG</span><h2>{competition.name}</h2></div><span className="judge-round-count">{competition.contestantCount} thí sinh</span></div>
        <EmptyState title="Chưa có thí sinh để chấm" description="Bạn đã được thêm vào cuộc thi này. Lượt chấm sẽ xuất hiện tại đây sau khi Ban tổ chức thêm thí sinh." />
      </section>)}
    </div> : <EmptyState title="Chưa có cuộc thi được phân công" description="Khi Ban tổ chức thêm bạn vào một cuộc thi, cuộc thi đó sẽ xuất hiện ở đây." /> : <>
      <div className="judge-queue-toolbar">
        <label className="judge-mobile-search"><Icon name="search" size={18} /><span className="sr-only">Tìm lượt chấm</span><input className="filter-input" type="search" value={entrySearch} onChange={(event) => setEntrySearch(event.target.value)} placeholder="Tìm theo mã SBD, tên đề án…" />{entrySearch && <button className="judge-search-clear" type="button" aria-label="Xóa nội dung tìm kiếm" onClick={() => setEntrySearch('')}><Icon name="close" size={16} /></button>}</label>
      </div>
      <nav className="judge-status-filters" aria-label="Lọc lượt đã chấm và chưa chấm">
        <label className="judge-mobile-status-filter"><span>Tình trạng chấm</span><AppSelect value={statusFilter} onValueChange={setStatusFilter} options={gradingFilterOptions.map((option) => ({ value: option.value, label: `${option.label} (${statusCounts[option.value]})` }))} /></label>
        <div className="judge-status-filter-buttons">{gradingFilterOptions.map((option) => <button type="button" key={option.value} className={statusFilter === option.value ? 'active' : ''} aria-pressed={statusFilter === option.value} onClick={() => setStatusFilter(option.value)}>{option.label}<span>{statusCounts[option.value]}</span></button>)}</div>
      </nav>
      {submittedEntryId && tasks.some((task) => task.entry.id === submittedEntryId) && <Notice tone="success">Phiếu chấm đã được nộp thành công.</Notice>}
      {visibleCompetitions.length ? visibleCompetitions.map((competition) => <section className="judge-round-section" key={competition.competition.id}>
        <div className="judge-round-heading"><div><span className="eyebrow">CUỘC THI</span><h2>{competition.competition.name}</h2></div><span className="judge-round-count">{competition.tasks.length} lượt</span></div>
        <div className="judge-queue">{competition.tasks.map((task) => <article className="judge-card" data-entry-id={task.entry.id} data-status={task.taskStatus.toLowerCase()} key={`${task.round.id}-${task.entry.id}`}>
        <div className="judge-card-top"><div><StatusPill value={task.taskStatus} /><span className="judge-card-sequence">· Lượt {String(task.entry.sequence).padStart(2, '0')}</span></div><span className="judge-entry-code">{task.entry.code}</span></div>
          <div className="judge-entry"><div><strong>{task.entry.title || task.entry.displayName}</strong><p>{task.entry.title ? task.entry.displayName : task.entry.organization || 'Lượt thi được giao'}{task.entry.title && task.entry.organization ? ` · ${task.entry.organization}` : ''}</p></div></div>
          <div className="judge-task-meta">{task.scoreSheet?.totalScore !== null && task.scoreSheet && <span>Điểm của tôi: {Number(task.scoreSheet.totalScore).toFixed(task.round.roundingPrecision)}</span>}</div>
        <div className="judge-card-bottom">{task.taskStatus !== 'READY' && <p>{task.taskMessage}</p>}{task.canOpen ? <Link className="button primary-button" href={`/judge/${task.entry.id}?competitionId=${encodeURIComponent(task.competition.id)}`}>{task.taskStatus === 'LOCKED' ? 'Xem bản nháp đã khóa' : task.scoreSheet?.status === 'SUBMITTED' ? 'Xem phiếu đã nộp' : task.scoreSheet?.status === 'DRAFT' ? 'Tiếp tục bản nháp' : task.scoreSheet?.status === 'REOPENED' ? 'Sửa phiếu đã mở lại' : task.taskStatus === 'LIVE' ? 'Vào chấm ngay' : 'Mở phiếu chấm'}</Link> : <button className="button secondary-button" type="button" disabled>{task.taskStatus === 'WAITING' ? 'Chờ điều phối' : 'Chưa khả dụng'}</button>}</div>
        </article>)}</div>
      </section>) : statusCounts[statusFilter] > 0
        ? <EmptyState title="Không tìm thấy lượt chấm" description="Thử tìm bằng tên cuộc thi, tên đề án hoặc mã dự thi." action={<button className="button secondary-button" type="button" onClick={() => setEntrySearch('')}>Xóa tìm kiếm</button>} />
        : <EmptyState title={statusFilter === 'SUBMITTED' ? 'Chưa có lượt đã chấm' : 'Không có lượt chưa chấm'} action={statusFilter === 'UNSUBMITTED' && statusCounts.SUBMITTED > 0 ? <button className="button secondary-button" type="button" onClick={() => { setEntrySearch(''); setStatusFilter('SUBMITTED'); }}>Xem phiếu đã nộp</button> : undefined} />}
    </>}
  </div>;
}

export function JudgeScoreForm({ entryId }: { entryId: string }) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [payload, setPayload] = useState<{ entry: { id: string; code: string; title: string | null; displayName: string; organization: string | null }; round: { id: string; name: string; status: string; anonymous: boolean; roundingPrecision: number }; rubric: { id: string; version: number; name: string; status: string; scoringConfig: ScoringConfig | null; criteria: Criterion[] }; scoreSheet: { id: string; status: string; totalScore: string | number | null; outcome?: string | null; locked?: boolean; details: { criterionId: string; score: string | number | null; value?: unknown; comment: string | null }[] } | null } | null>(null);
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
  const scoreFooter = useRef<HTMLDivElement>(null);
  const hasScoreForm = payload !== null;

  useEffect(() => {
    const footer = scoreFooter.current;
    const viewport = window.visualViewport;
    if (!footer || !viewport || readOnly || !hasScoreForm) return;

    const updateDock = () => {
      const coveredHeight = viewport.scale === 1
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      footer.style.setProperty('--score-dock-offset', `${Math.round(coveredHeight)}px`);
    };

    updateDock();
    viewport.addEventListener('resize', updateDock);
    viewport.addEventListener('scroll', updateDock);
    window.addEventListener('resize', updateDock);
    return () => {
      viewport.removeEventListener('resize', updateDock);
      viewport.removeEventListener('scroll', updateDock);
      window.removeEventListener('resize', updateDock);
      footer.style.removeProperty('--score-dock-offset');
    };
  }, [hasScoreForm, readOnly]);
  const hasEnteredScore = Object.values(scores).some((value) => isAnswered(value.value));
  const completedCriteria = payload?.rubric.criteria.filter((criterion) => isAnswered(scores[criterion.id]?.value)).length ?? 0;
  const configuredCriteria = useMemo<ConfiguredCriterion[]>(() => payload?.rubric.criteria.map((criterion) => ({
    id: criterion.id, name: criterion.name, type: criterion.type ?? 'NUMERIC', config: criterion.config ?? { minimum: Number(criterion.minimum), maximum: Number(criterion.maximum), step: Number(criterion.step) },
    minimum: Number(criterion.minimum), maximum: Number(criterion.maximum), step: Number(criterion.step), weight: Number(criterion.weight), required: criterion.required ?? true, commentRequired: criterion.commentRequired,
  })) ?? [], [payload]);
  const scoringPolicy = payload?.rubric.scoringConfig ?? { resultMinimum: 0, resultMaximum: 10, legacyWeightedAverage: true as const };
  const currentEvaluation = useMemo(() => payload ? evaluateScoreSheet(configuredCriteria, Object.entries(scores).filter(([, state]) => isAnswered(state.value)).map(([criterionId, state]) => ({ criterionId, value: serializeCriterionValue(payload.rubric.criteria.find((criterion) => criterion.id === criterionId)?.type ?? 'NUMERIC', state.value), comment: state.comment })), scoringPolicy, payload.round.roundingPrecision, false) : null, [payload, configuredCriteria, scores, scoringPolicy]);
  const currentTotal = currentEvaluation?.totalScore ?? null;
  const maximumTotal = useMemo(() => {
    if (!payload) return 0;
    if (!scoringPolicy.legacyWeightedAverage) return scoringPolicy.resultMaximum;
    const numeric = payload.rubric.criteria.filter((criterion) => criterion.type === 'NUMERIC');
    const weight = numeric.reduce((sum, criterion) => sum + Number(criterion.weight), 0);
    return weight ? numeric.reduce((sum, criterion) => sum + Number(criterion.maximum) * Number(criterion.weight), 0) / weight : 0;
  }, [payload, scoringPolicy]);
  async function load() {
    try {
      const result = await request<NonNullable<typeof payload>>(`/api/scores/${entryId}`);
      setPayload(result);
      const initial: Record<string, ScoreState> = {};
      for (const detail of result.scoreSheet?.details ?? []) initial[detail.criterionId] = { value: detail.value ?? (detail.score === null ? undefined : String(detail.score)), comment: detail.comment ?? '' };
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
    const details = Object.entries(scores).filter(([, state]) => isAnswered(state.value)).map(([criterionId, state]) => ({ criterionId, value: serializeCriterionValue(payload.rubric.criteria.find((criterion) => criterion.id === criterionId)?.type ?? 'NUMERIC', state.value), comment: state.comment }));
    try {
      const result = await request<{ scoreSheet: { id: string; status: string; totalScore: string | number | null; submittedAt: string | null } }>(`/api/scores/${entryId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ details, submit }) });
      setPayload({ ...payload, scoreSheet: { ...(payload.scoreSheet ?? { id: result.scoreSheet.id, details: [] }), ...result.scoreSheet } as NonNullable<typeof payload>['scoreSheet'] });
      setChanged(false); setSaved(true); setSavedAt(new Date());
      setNotice(submit ? 'Phiếu chấm đã được nộp. Bạn không thể tự sửa sau khi nộp.' : 'Bản nháp đã được lưu.');
      if (submit) {
        let nextEntry: { id: string; competitionId: string } | null = null;
        let destinationCompetitionId = competitionId;
        try {
          const queue = await request<{ tasks: Task[] }>('/api/judge/tasks');
          const currentTask = queue.tasks.find((task) => task.entry.id === entryId);
          destinationCompetitionId = currentTask?.competition.id ?? competitionId;
          if (currentTask) {
            const nextTask = queue.tasks
              .filter((task) => task.competition.id === currentTask.competition.id && task.entry.sequence > currentTask.entry.sequence)
              .sort((a, b) => a.entry.sequence - b.entry.sequence)
              .find((task) => task.scoreSheet?.status !== 'SUBMITTED' && task.canOpen && !['LOCKED', 'UNAVAILABLE'].includes(task.taskStatus));
            if (nextTask) nextEntry = { id: nextTask.entry.id, competitionId: nextTask.competition.id };
          }
        } catch {
          // Submission succeeded; if the queue cannot refresh, return to its list.
        }

        if (nextEntry) {
          router.replace(`/judge/${nextEntry.id}?competitionId=${encodeURIComponent(nextEntry.competitionId)}`);
          return;
        }
        const params = new URLSearchParams();
        if (destinationCompetitionId) params.set('competitionId', destinationCompetitionId);
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

  function updateValue(criterionId: string, value: unknown) {
    setScores((current) => ({ ...current, [criterionId]: { value, comment: current[criterionId]?.comment ?? '' } }));
    setChanged(true); setSaved(false);
  }
  function updateComment(criterionId: string, value: string) {
    setScores((current) => ({ ...current, [criterionId]: { value: current[criterionId]?.value, comment: value } }));
    setChanged(true); setSaved(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const gateNote = currentEvaluation?.outcome === 'FAIL' ? ' Có điều kiện bắt buộc đang không đạt.' : '';
    const accepted = await confirm({ title: 'Nộp phiếu chấm?', description: `Điểm hiện tại là ${currentTotal === null ? 'chưa có điểm số' : currentTotal.toFixed(payload?.round.roundingPrecision ?? 2)}.${gateNote} Sau khi nộp, bạn không thể tự sửa; Admin cần mở lại phiếu nếu cần điều chỉnh.`, confirmLabel: 'Nộp phiếu' });
    if (accepted) void persist(true);
  }

  if (!payload) return <><PageHeader className="score-page-heading" title="Chấm điểm" />{error && <Notice tone="error">{error}</Notice>}{!error && <Loading />}</>;
  return <>
    <PageHeader className="score-page-heading" title="Chấm điểm" action={<Link className="button secondary-button score-back-button" href={competitionId ? `/judge?competitionId=${encodeURIComponent(competitionId)}` : '/judge'} aria-label="Quay lại danh sách chấm thi" title="Quay lại danh sách chấm thi"><Icon name="arrow-left" size={18} /><span className="score-back-label">Danh sách</span></Link>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {payload.scoreSheet?.locked && <Notice tone="warning">Snapshot kết quả đã khóa. Bản nháp được giữ nguyên ở chế độ chỉ đọc; liên hệ Admin nếu cần mở lại và tạo phiên bản kết quả mới.</Notice>}
    {payload.round.status === 'COMPLETED' && !readOnly && <Notice tone="warning">Cuộc thi đã kết thúc. Bạn có thể hoàn tất bản nháp đã tạo; để tiếp tục chấm, hãy liên hệ Admin mở lại phiếu.</Notice>}
    <div className="score-workspace">
      <aside className="score-context-panel" aria-label="Thông tin lượt chấm">
        <div className="score-context-topline"><span className="score-context-code">{payload.entry.code}</span><span className={`score-context-status${payload.scoreSheet?.status === 'SUBMITTED' ? ' is-submitted' : ''}`}>{payload.scoreSheet?.status === 'SUBMITTED' ? 'Đã nộp' : payload.scoreSheet?.locked ? 'Chỉ xem' : 'Chưa nộp'}</span></div>
        <h2>{payload.entry.displayName}</h2>
        <p>{payload.round.anonymous ? 'Thông tin thí sinh đang được ẩn.' : payload.entry.title || payload.entry.organization || 'Chấm theo bộ tiêu chí của cuộc thi.'}</p>
        <div className="score-context-divider" />
        <dl className="score-context-details"><div><dt>Bộ tiêu chí</dt><dd>{payload.rubric.name} · v{payload.rubric.version}</dd></div><div><dt>Trạng thái</dt><dd>{readOnly ? 'Đã nộp, chỉ xem' : 'Có thể chấm'}</dd></div></dl>
        <div className="score-context-progress"><div><span>Tiến độ chấm</span><strong>{completedCriteria}/{payload.rubric.criteria.length} tiêu chí</strong></div><div className="judge-progress-track" role="progressbar" aria-label="Tiêu chí đã hoàn thành" aria-valuemin={0} aria-valuemax={payload.rubric.criteria.length} aria-valuenow={completedCriteria}><i style={{ width: `${payload.rubric.criteria.length ? completedCriteria / payload.rubric.criteria.length * 100 : 0}%` }} /></div></div>
        <p className="score-anonymity-note">{payload.round.anonymous ? 'Cuộc thi đang áp dụng chế độ chấm ẩn danh.' : 'Thông tin thí sinh hiển thị theo cài đặt cuộc thi.'}</p>
      </aside>
      <section className="score-sheet-panel">
        <div className="score-sheet-heading"><div><span className="eyebrow">ĐÁNH GIÁ</span><h2>Tiêu chí chấm</h2></div><span className="score-criteria-count">{payload.rubric.criteria.length} mục</span></div>
        <form className="score-form" onSubmit={submit}>
          {payload.rubric.criteria.map((criterion, index) => <JudgeCriterion key={criterion.id} criterion={criterion} index={index} state={scores[criterion.id]} readOnly={readOnly} onValue={(value) => updateValue(criterion.id, value)} onComment={(value) => updateComment(criterion.id, value)} />)}
          <div ref={scoreFooter} className={`score-footer${readOnly ? '' : ' score-footer--mobile-dock'}`}><div className="score-total"><span>{payload.scoreSheet?.status === 'SUBMITTED' ? 'Điểm đã nộp' : 'Điểm tạm tính'}</span><strong>{currentTotal === null ? '—' : currentTotal.toFixed(payload.round.roundingPrecision)}</strong>{currentTotal !== null && <span className="score-total-maximum">/ {maximumTotal.toFixed(payload.round.roundingPrecision)}</span>}{currentEvaluation?.outcome === 'FAIL' && <span className="score-outcome-fail">Không đạt điều kiện bắt buộc</span>}{!readOnly && <span className={`score-save-state${saving ? ' is-saving' : saved ? ' is-saved' : changed ? ' is-changed' : ''}`} role="status">{saving ? 'Đang lưu…' : saved ? `Đã lưu lúc ${formatSavedTime(savedAt)}` : changed ? 'Đang lưu thay đổi…' : 'Tự động lưu'}</span>}</div><div className="table-actions">{!readOnly && <><button className="button secondary-button score-save-button" type="button" onClick={() => void persist(false)} disabled={saving}>Lưu</button><button className="button primary-button" type="submit" disabled={saving}>{saving ? 'Đang gửi…' : 'Nộp phiếu'}</button></>}{readOnly && <StatusPill value={payload.scoreSheet?.status === 'SUBMITTED' ? 'SUBMITTED' : 'LOCKED'} />}</div></div>
        </form>
      </section>
    </div>
    {confirmDialog}
  </>;

}

function JudgeCriterion({ criterion, index, state, readOnly, onValue, onComment }: { criterion: Criterion; index: number; state?: ScoreState; readOnly: boolean; onValue: (value: unknown) => void; onComment: (value: string) => void }) {
  const config = criterion.config as any;
  const value = state?.value;
  const numeric = criterion.type === 'NUMERIC' || criterion.type === 'BONUS_PENALTY';
  const weighted = ['NUMERIC', 'RATING'].includes(criterion.type) || (criterion.type === 'CHECKLIST' && config?.mode === 'POINTS');
  let control;
  if (numeric) {
    const minimum = Number(config?.minimum ?? criterion.minimum); const maximum = Number(config?.maximum ?? criterion.maximum); const step = Number(config?.step ?? criterion.step);
    const current = value === undefined || value === null ? '' : String(value);
    const setStep = (direction: -1 | 1) => { const next = current === '' ? minimum : Math.min(maximum, Math.max(minimum, Number(current) + direction * step)); onValue(String(Number(next.toFixed(Math.min(8, Math.max(decimalPlaces(step), decimalPlaces(minimum), decimalPlaces(maximum))))))); };
    control = <label className="field-label">{criterion.type === 'NUMERIC' ? 'Điểm' : 'Điểm cộng hoặc trừ'}<div className="score-input-control"><span className="score-scale-range">{minimum} đến {maximum}</span><button className="score-adjust-button" type="button" aria-label={`Giảm: ${criterion.name}`} disabled={readOnly || (current !== '' && Number(current) <= minimum)} onClick={() => setStep(-1)}>−</button><input className="field-input score-number" aria-label={`${criterion.name} · giá trị`} type="number" inputMode={Number.isInteger(minimum) && Number.isInteger(maximum) && Number.isInteger(step) ? 'numeric' : 'decimal'} enterKeyHint="done" min={minimum} max={maximum} step={step} value={current} onChange={(event) => onValue(event.target.value)} disabled={readOnly} required={criterion.required} /><button className="score-adjust-button" type="button" aria-label={`Tăng: ${criterion.name}`} disabled={readOnly || (current !== '' && Number(current) >= maximum)} onClick={() => setStep(1)}>+</button></div></label>;
  } else if (criterion.type === 'RATING') {
    control = <label className="field-label">Mức đánh giá<select className="field-input" value={typeof value === 'string' ? value : ''} onChange={(event) => onValue(event.target.value || undefined)} disabled={readOnly} required={criterion.required}><option value="">Chọn mức đánh giá</option>{(config?.options ?? []).map((option: any) => <option value={option.id} key={option.id}>{option.label} · {option.value} điểm</option>)}</select></label>;
  } else if (criterion.type === 'PASS_FAIL') {
    const selected = value === undefined ? '' : String(value);
    control = <fieldset className="judge-value-fieldset"><legend>Kết quả{config?.requiredGate ? ' · Điều kiện bắt buộc' : ''}</legend><div className="judge-pass-fail-options">{[[true, config?.passLabel ?? 'Đạt'], [false, config?.failLabel ?? 'Không đạt']].map(([answer, label]) => <label className={selected === String(answer) ? 'is-selected' : ''} key={String(answer)}><input type="radio" name={`criterion-${criterion.id}`} value={String(answer)} checked={selected === String(answer)} onChange={() => onValue(answer as boolean)} disabled={readOnly} required={criterion.required} /><span>{String(label)}</span></label>)}</div></fieldset>;
  } else {
    const selected = Array.isArray(value) ? value as string[] : [];
    control = <fieldset className="judge-value-fieldset"><legend>{config?.mode === 'POINTS' ? 'Chọn các mục đạt' : 'Đánh dấu mục đã hoàn thành'}</legend><div className="judge-checklist-options">{(config?.items ?? []).map((option: any) => <label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => onValue(event.target.checked ? [...selected, option.id] : selected.filter((value) => value !== option.id))} disabled={readOnly} /><span>{option.label}{config?.mode === 'POINTS' ? <small>+{option.points} điểm</small> : null}</span></label>)}</div></fieldset>;
  }
  const weight = Number(criterion.weight);
  const showWeight = weighted && Math.abs(weight - 1) > 0.000001;
  return <div className={`score-criterion${isAnswered(value) ? ' score-criterion--complete' : ''}`}>
    <div className="score-criterion-heading"><span>{String(index + 1).padStart(2, '0')}</span><div><div className="score-criterion-title"><strong>{criterion.name}{criterion.required && <span className="score-required-mark"> *</span>}</strong>{showWeight && <span className="score-weight-badge" title="Hệ số tiêu chí">×{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(weight)}</span>}</div>{criterion.description && <details className="score-guide"><summary>Hướng dẫn chấm</summary><p>{criterion.description}</p></details>}</div></div>
    {control}
    <div className="score-comment-area">
      <label className="field-label comment-field">Nhận xét{criterion.commentRequired && <span className="field-help">Bắt buộc</span>}<textarea className="field-textarea" style={{ minHeight: 62 }} value={state?.comment ?? ''} onChange={(event) => onComment(event.target.value)} maxLength={5000} disabled={readOnly} required={criterion.commentRequired} /></label>
    </div>
  </div>;
}

function isAnswered(value: unknown) { return value !== undefined && value !== null && value !== ''; }
function serializeCriterionValue(type: Criterion['type'], value: unknown) {
  if (type === 'NUMERIC' || type === 'BONUS_PENALTY') return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (type === 'PASS_FAIL') return value === 'true' ? true : value === 'false' ? false : value;
  return value;
}
function message(reason: unknown) { return reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Hãy thử lại.'; }
function decimalPlaces(value: number) { return Math.max(0, (String(value).split('.')[1] ?? '').length); }
function formatSavedTime(value: Date | null) { return value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(value) : 'vừa xong'; }

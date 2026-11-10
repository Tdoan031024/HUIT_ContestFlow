'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, useConfirmDialog } from '@/components/ui';

type Task = { competition: { id: string; name: string; status: string; startsAt: string | null }; round: { id: string; name: string; sequence: number; status: string; anonymous: boolean; sessionState: string; roundingPrecision: number }; entry: { id: string; code: string; sequence: number; title: string | null; displayName: string; organization: string | null }; rubric: { version: number; name: string; criteria: Criterion[] } | null; scoreSheet: { id: string; status: string; totalScore: number | null; submittedAt: string | null } | null; taskStatus: string; taskMessage: string; canOpen: boolean };
type Criterion = { id: string; name: string; description: string | null; minimum: number | string; maximum: number | string; step: number | string; weight: number | string; commentRequired: boolean };
type ScoreState = { score: string; comment: string };

async function request<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể tải dữ liệu.');
  return result as T;
}

export function JudgeTasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [error, setError] = useState('');
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
    return [...grouped.values()].map((competition) => ({ ...competition, roundCount: new Set(competition.tasks.map((task) => task.round.id)).size }));
  }, [tasks]);
  const selectedCompetition = competitions.find((competition) => competition.id === selectedCompetitionId) ?? null;
  const rounds = useMemo(() => {
    if (!selectedCompetition) return [];
    const grouped = new Map<string, { id: string; name: string; sequence: number; tasks: Task[] }>();
    for (const task of selectedCompetition.tasks) {
      const round = grouped.get(task.round.id) ?? { id: task.round.id, name: task.round.name, sequence: task.round.sequence, tasks: [] };
      round.tasks.push(task);
      grouped.set(round.id, round);
    }
    return [...grouped.values()].sort((a, b) => a.sequence - b.sequence);
  }, [selectedCompetition]);
  return <>
    <PageHeader eyebrow="GIÁM KHẢO" title="Chấm thi" description={selectedCompetition ? 'Chọn đội được phân công để mở phiếu chấm theo thứ tự Admin đã thiết lập.' : 'Chọn cuộc thi được Admin phân công để xem các lượt chấm của bạn.'} />
    {error && <Notice tone="error">{error}</Notice>}
    {tasks === null ? <Loading /> : !tasks.length ? <EmptyState title="Chưa có cuộc thi được phân công" description="Khi Admin phân công bạn chấm một hoặc nhiều đội, cuộc thi sẽ xuất hiện ở đây." /> : !selectedCompetition ? <section className="judge-competition-list" aria-label="Cuộc thi được phân công">{competitions.map((competition) => <button className="judge-competition-card" key={competition.id} type="button" onClick={() => setSelectedCompetitionId(competition.id)}>
      <span className="judge-competition-copy"><strong>{competition.name}</strong><span>{competition.roundCount} vòng thi · {competition.tasks.length} lượt được phân công</span></span>
      <span className="judge-competition-end"><StatusPill value={competition.status} /><span aria-hidden="true">→</span></span>
    </button>)}</section> : <>
      <button className="judge-back-button" type="button" onClick={() => setSelectedCompetitionId(null)}>← Danh sách cuộc thi</button>
      <div className="judge-selected-heading"><div><span className="eyebrow">CUỘC THI</span><h2>{selectedCompetition.name}</h2></div><span className="judge-assignment-count">{selectedCompetition.tasks.length} lượt được phân công</span></div>
      {rounds.map((round) => <section className="judge-round-section" key={round.id}>
        <div className="judge-round-heading"><div><span className="eyebrow">VÒNG {round.sequence}</span><h2>{round.name}</h2></div><span className="judge-round-count">{round.tasks.length} lượt</span></div>
        <div className="judge-queue">{round.tasks.map((task) => <article className="judge-card" key={`${task.round.id}-${task.entry.id}`}>
          <div className="judge-card-top"><span className="judge-entry-order">Thứ tự {task.entry.sequence}</span><StatusPill value={task.taskStatus} /></div>
          <div className="judge-entry"><span className="judge-entry-code">{task.entry.code}</span><div><strong>{task.entry.displayName}</strong><p>{task.entry.title || task.entry.organization || 'Lượt thi được giao'}</p></div></div>
          <div className="judge-task-meta"><span>{task.rubric?.criteria.length ?? 0} tiêu chí · Rubric v{task.rubric?.version ?? '—'}</span>{task.scoreSheet?.totalScore !== null && task.scoreSheet && <span>Điểm của tôi: {Number(task.scoreSheet.totalScore).toFixed(task.round.roundingPrecision)}</span>}</div>
          <div className="judge-card-bottom"><p>{task.taskMessage}</p>{task.canOpen ? <Link className="button primary-button" href={`/judge/${task.entry.id}`}>{task.taskStatus === 'LOCKED' ? 'Xem bản nháp đã khóa' : task.scoreSheet?.status === 'SUBMITTED' ? 'Xem phiếu đã nộp' : task.scoreSheet?.status === 'DRAFT' ? 'Tiếp tục bản nháp' : task.scoreSheet?.status === 'REOPENED' ? 'Sửa phiếu đã mở lại' : 'Mở phiếu chấm'}</Link> : <button className="button secondary-button" type="button" disabled>Xem phiếu khi được mở</button>}</div>
        </article>)}</div>
      </section>)}
    </>}
  </>;
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const readOnly = payload?.scoreSheet?.status === 'SUBMITTED' || payload?.scoreSheet?.locked === true;
  const hasEnteredScore = Object.values(scores).some((value) => value.score !== '');
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

  async function load() {
    try {
      const result = await request<NonNullable<typeof payload>>(`/api/scores/${entryId}`);
      setPayload(result);
      const initial: Record<string, ScoreState> = {};
      for (const detail of result.scoreSheet?.details ?? []) initial[detail.criterionId] = { score: String(detail.score), comment: detail.comment ?? '' };
      setScores(initial); setLoaded(true);
    } catch (reason) { setError(message(reason)); setLoaded(true); }
  }
  useEffect(() => { void load(); }, [entryId]);

  async function persist(submit: boolean) {
    if (!payload) return;
    setSaving(true); setSaved(false); setError(''); setNotice('');
    const details = Object.entries(scores).filter(([, value]) => value.score !== '' && Number.isFinite(Number(value.score))).map(([criterionId, value]) => ({ criterionId, score: Number(value.score), comment: value.comment }));
    try {
      const result = await request<{ scoreSheet: { id: string; status: string; totalScore: string | number | null; submittedAt: string | null } }>(`/api/scores/${entryId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ details, submit }) });
      setPayload({ ...payload, scoreSheet: { ...(payload.scoreSheet ?? { id: result.scoreSheet.id, details: [] }), ...result.scoreSheet } as NonNullable<typeof payload>['scoreSheet'] });
      setChanged(false); setSaved(true);
      setNotice(submit ? 'Phiếu chấm đã được nộp. Bạn không thể tự sửa sau khi nộp.' : 'Bản nháp đã được lưu.');
      if (submit) { window.setTimeout(() => { router.push('/judge'); router.refresh(); }, 700); }
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

  if (!payload) return <><PageHeader eyebrow="DÀNH CHO GIÁM KHẢO" title="Phiếu chấm" description="Nhập điểm theo tiêu chí và lưu bản nháp." />{error && <Notice tone="error">{error}</Notice>}{!error && <Loading />}</>;
  return <>
    <PageHeader eyebrow={`${payload.round.name} · ${payload.entry.code}`} title={payload.entry.displayName} description={payload.entry.title || payload.entry.organization || 'Phiếu chấm độc lập của giám khảo.'} action={<Link className="button secondary-button" href="/judge">← Các lượt thi</Link>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {payload.scoreSheet?.locked && <Notice tone="warning">Snapshot kết quả đã khóa. Bản nháp được giữ nguyên ở chế độ chỉ đọc; liên hệ Admin nếu cần mở lại và tạo phiên bản kết quả mới.</Notice>}
    {payload.round.status === 'COMPLETED' && !readOnly && <Notice tone="warning">Vòng đã kết thúc. Bạn có thể hoàn tất bản nháp đã tạo; để bắt đầu phiếu mới, hãy liên hệ Admin mở lại vòng.</Notice>}
    <SectionCard title={payload.rubric.name} subtitle={`Rubric phiên bản ${payload.rubric.version} · Điểm được lưu riêng cho giám khảo.`}>
      <form className="score-form" onSubmit={submit}>
        {payload.rubric.criteria.map((criterion) => <div className="score-criterion" key={criterion.id}>
          <div><strong>{criterion.name}{criterion.commentRequired && <span style={{ color: '#bd5555' }}> *</span>}</strong>{criterion.description && <small>{criterion.description}</small>}<small>Thang {criterion.minimum}–{criterion.maximum} · bước {criterion.step} · trọng số {criterion.weight}</small></div>
          <label className="field-label">Điểm<input className="field-input score-number" type="number" min={Number(criterion.minimum)} max={Number(criterion.maximum)} step={Number(criterion.step)} value={scores[criterion.id]?.score ?? ''} onChange={(event) => update(criterion.id, 'score', event.target.value)} disabled={readOnly} required /></label>
          <label className="field-label comment-field">Nhận xét{criterion.commentRequired && <span className="field-help">Bắt buộc</span>}<textarea className="field-textarea" style={{ minHeight: 62 }} value={scores[criterion.id]?.comment ?? ''} onChange={(event) => update(criterion.id, 'comment', event.target.value)} maxLength={5000} disabled={readOnly} required={criterion.commentRequired} /></label>
        </div>)}
        <div className={`score-footer${readOnly ? '' : ' score-footer--mobile-dock'}`}><div className="score-total">Điểm hiện tại <strong>{hasEnteredScore ? currentTotal.toFixed(payload.round.roundingPrecision) : '—'}</strong>{saving ? <span className="field-help"> · Đang lưu…</span> : saved ? <span className="field-help"> · Đã lưu</span> : changed ? <span className="field-help"> · Chưa lưu</span> : null}</div><div className="table-actions">{!readOnly && <><button className="button secondary-button" type="button" onClick={() => void persist(false)} disabled={saving}>Lưu bản nháp</button><button className="button primary-button" type="submit" disabled={saving}>{saving ? 'Đang gửi…' : 'Nộp phiếu chấm'}</button></>}{readOnly && <StatusPill value="SUBMITTED" />}</div></div>
      </form>
    </SectionCard>
    {confirmDialog}
  </>;
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="surface-card"><div className="surface-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

function message(reason: unknown) { return reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Hãy thử lại.'; }

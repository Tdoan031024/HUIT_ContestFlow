'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState, Loading, Notice, PageHeader, StatusPill } from '@/components/ui';

type Task = { competition: { id: string; name: string; status: string }; round: { id: string; name: string; sequence: number; status: string; anonymous: boolean; sessionState: string; roundingPrecision: number }; entry: { id: string; code: string; title: string | null; displayName: string; organization: string | null }; rubric: { version: number; name: string; criteria: Criterion[] } | null; scoreSheet: { id: string; status: string; totalScore: number | null; submittedAt: string | null } | null };
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
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => request<{ tasks: Task[] }>('/api/judge/tasks').then((result) => { if (active) { setTasks(result.tasks); setError(''); } }).catch((reason) => { if (active) { setError(message(reason)); setTasks([]); } });
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  return <>
    <PageHeader eyebrow="DÀNH CHO GIÁM KHẢO" title="Khu vực giám khảo" description="Xem lượt thi được phân công, nhập điểm và nộp phiếu chấm." />
    {error && <Notice tone="error">{error}</Notice>}
    {tasks === null ? <Loading /> : tasks.length ? <div className="card-grid two-columns">{tasks.map((task) => <article className="judge-card" key={`${task.round.id}-${task.entry.id}`}>
      <div className="round-card-head"><div><h3>{task.competition.name}</h3><p>{task.round.sequence}. {task.round.name}</p></div><StatusPill value={task.scoreSheet?.status ?? task.round.sessionState} /></div>
      <div className="live-current" style={{ marginTop: 14, padding: 13 }}><span className="live-number" style={{ width: 40, height: 40 }}>{task.entry.code}</span><div><strong>{task.entry.displayName}</strong><p>{task.entry.title || task.entry.organization || 'Lượt thi được phân công'}</p></div></div>
      <div className="judge-card-meta"><span className="metric-chip">{task.rubric?.criteria.length ?? 0} tiêu chí · Rubric v{task.rubric?.version ?? '—'}</span>{task.scoreSheet?.totalScore !== null && task.scoreSheet && <span className="metric-chip">Điểm của tôi: {Number(task.scoreSheet.totalScore).toFixed(task.round.roundingPrecision)}</span>}</div>
      <div className="form-actions" style={{ marginTop: 13 }}><Link className="button primary-button" href={`/judge/${task.entry.id}`}>{task.scoreSheet?.status === 'SUBMITTED' ? 'Xem phiếu đã nộp' : 'Mở phiếu chấm →'}</Link></div>
    </article>)}</div> : <EmptyState title="Chưa có lượt thi được phân công" description="Khi Admin phân công bạn vào vòng thi, lượt chấm sẽ xuất hiện ở đây." />}
  </>;
}

export function JudgeScoreForm({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<{ entry: { id: string; code: string; title: string | null; displayName: string; organization: string | null }; round: { id: string; name: string; status: string; anonymous: boolean; roundingPrecision: number }; rubric: { version: number; name: string; criteria: Criterion[] }; scoreSheet: { id: string; status: string; totalScore: string | number | null; details: { criterionId: string; score: string | number; comment: string | null }[] } | null } | null>(null);
  const [scores, setScores] = useState<Record<string, ScoreState>>({});
  const [loaded, setLoaded] = useState(false);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const readOnly = payload?.scoreSheet?.status === 'SUBMITTED';
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
  function submit(event: FormEvent) { event.preventDefault(); if (window.confirm('Nộp phiếu chấm? Sau khi nộp, chỉ Admin mới có thể mở lại để chỉnh sửa.')) void persist(true); }

  if (!payload) return <><PageHeader eyebrow="DÀNH CHO GIÁM KHẢO" title="Phiếu chấm" description="Nhập điểm theo tiêu chí và lưu bản nháp." />{error && <Notice tone="error">{error}</Notice>}{!error && <Loading />}</>;
  return <>
    <PageHeader eyebrow={`${payload.round.name} · ${payload.entry.code}`} title={payload.entry.displayName} description={payload.entry.title || payload.entry.organization || 'Phiếu chấm độc lập của giám khảo.'} action={<Link className="button secondary-button" href="/judge">← Các lượt thi</Link>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {payload.round.status === 'COMPLETED' && !readOnly && <Notice tone="warning">Vòng thi đã khóa. Bạn không thể thay đổi điểm.</Notice>}
    <SectionCard title={payload.rubric.name} subtitle={`Rubric phiên bản ${payload.rubric.version} · Chấm độc lập; các giám khảo khác không xem được phiếu này.`}>
      <form onSubmit={submit}>
        {payload.rubric.criteria.map((criterion) => <div className="score-criterion" key={criterion.id}>
          <div><strong>{criterion.name}{criterion.commentRequired && <span style={{ color: '#bd5555' }}> *</span>}</strong>{criterion.description && <small>{criterion.description}</small>}<small>Thang {criterion.minimum}–{criterion.maximum} · bước {criterion.step} · trọng số {criterion.weight}</small></div>
          <label className="field-label">Điểm<input className="field-input score-number" type="number" min={Number(criterion.minimum)} max={Number(criterion.maximum)} step={Number(criterion.step)} value={scores[criterion.id]?.score ?? ''} onChange={(event) => update(criterion.id, 'score', event.target.value)} disabled={readOnly} required /></label>
          <label className="field-label comment-field">Nhận xét{criterion.commentRequired && <span className="field-help">Bắt buộc</span>}<textarea className="field-textarea" style={{ minHeight: 62 }} value={scores[criterion.id]?.comment ?? ''} onChange={(event) => update(criterion.id, 'comment', event.target.value)} maxLength={5000} disabled={readOnly} required={criterion.commentRequired} /></label>
        </div>)}
        <div className="score-footer"><div className="score-total">Điểm hiện tại <strong>{hasEnteredScore ? currentTotal.toFixed(payload.round.roundingPrecision) : '—'}</strong>{saving ? <span className="field-help"> · Đang lưu…</span> : saved ? <span className="field-help"> · Đã lưu</span> : changed ? <span className="field-help"> · Chưa lưu</span> : null}</div><div className="table-actions">{!readOnly && <><button className="button secondary-button" type="button" onClick={() => void persist(false)} disabled={saving}>Lưu bản nháp</button><button className="button primary-button" type="submit" disabled={saving || payload.round.status === 'COMPLETED'}>{saving ? 'Đang gửi…' : 'Nộp phiếu chấm'}</button></>}{readOnly && <StatusPill value="SUBMITTED" />}</div></div>
      </form>
    </SectionCard>
  </>;
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="surface-card"><div className="surface-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

function message(reason: unknown) { return reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Hãy thử lại.'; }

'use client';

import { useEffect, useState, type DragEvent } from 'react';
import { AppSelect } from '@/components/app-select';
import { Icon } from '@/components/icons';
import { Notice, SectionCard } from '@/components/ui';
import { useAlertNotification } from '@/components/notification-provider';

type Type = 'NUMERIC' | 'RATING' | 'PASS_FAIL' | 'CHECKLIST' | 'BONUS_PENALTY';
type Criterion = { clientKey: string; name: string; description: string; type: Type; config: any; required: boolean; weight: number; commentRequired: boolean };
type Props = { id: string; locked: boolean; hasScores: boolean; refreshCompetition: () => Promise<void> };
const typeNames: Record<Type, string> = { NUMERIC: 'Nhập điểm', RATING: 'Chọn mức đánh giá', PASS_FAIL: 'Đạt / Không đạt', CHECKLIST: 'Checklist', BONUS_PENALTY: 'Điểm cộng / trừ' };

async function readApiResponse(response: Response, action: 'load' | 'save') {
  const body = await response.text();
  let data: any = null;
  if (body.trim()) {
    try { data = JSON.parse(body); } catch { /* Use a friendly message instead of exposing a server response. */ }
  }
  if (!response.ok) {
    if (response.status >= 500) throw new Error(action === 'load'
      ? 'Chưa thể tải bộ tiêu chí lúc này. Hãy tải lại trang sau ít phút.'
      : 'Chưa lưu được bộ tiêu chí lúc này. Hãy thử lại sau ít phút; nếu lỗi vẫn còn, hãy báo người hỗ trợ.');
    throw new Error(data?.error || 'Thông tin chưa hợp lệ. Hãy kiểm tra lại rồi thử lần nữa.');
  }
  if (!data) throw new Error(action === 'load'
    ? 'Chưa thể tải bộ tiêu chí lúc này. Hãy tải lại trang để thử lần nữa.'
    : 'Chưa xác nhận được việc lưu. Hãy tải lại trang trước khi thử lại.');
  return data;
}

function newCriterion(): Criterion {
  return { clientKey: crypto.randomUUID(), name: '', description: '', type: 'NUMERIC', config: { minimum: 0, maximum: 10, step: 0.5 }, required: true, weight: 1, commentRequired: false };
}

export function RubricBuilder({ id, locked, hasScores, refreshCompetition }: Props) {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { showAlert } = useAlertNotification();
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/competitions/${id}/rubric`, { cache: 'no-store' }).then(async (response) => {
      const data = await readApiResponse(response, 'load');
      const versions = (data.rubrics ?? []).flatMap((rubric: any) => rubric.versions ?? []);
      const selected = versions.find((item: any) => item.id === data.activeRubricVersionId)
        ?? versions.find((item: any) => item.status === 'DRAFT')
        ?? versions[0];
      if (!mounted || !selected) return;
      const nextCriteria: Criterion[] = (selected.criteria ?? []).map((item: any) => ({
        clientKey: `criterion-${item.id}`, name: item.name, description: item.description ?? '', type: item.type ?? 'NUMERIC',
        config: item.config ?? { minimum: Number(item.minimum), maximum: Number(item.maximum), step: Number(item.step) },
        required: item.required ?? true, weight: Number(item.weight ?? 1), commentRequired: item.commentRequired,
      }));
      setVersion(selected.version); setStatus(selected.status);
      setCriteria(nextCriteria);
      setSavedFingerprint(JSON.stringify(nextCriteria));
      setExpanded(null);
    }).catch((reason) => {
      if (mounted) showAlert({ title: 'Không tải được bộ tiêu chí', description: reason instanceof Error ? reason.message : 'Hãy tải lại trang sau ít phút.', tone: 'error' });
    });
    return () => { mounted = false; };
  }, [id, showAlert]);

  const activeCount = criteria.length;
  const fingerprint = JSON.stringify(criteria);
  const dirty = savedFingerprint !== null && fingerprint !== savedFingerprint;
  const alreadyApplied = status === 'PUBLISHED' && !dirty;

  function patchCriterion(key: string, patch: Partial<Criterion>) { setCriteria((items) => items.map((item) => item.clientKey === key ? { ...item, ...patch } : item)); }
  function patchConfig(key: string, patch: Record<string, unknown>) { setCriteria((items) => items.map((item) => item.clientKey === key ? { ...item, config: { ...item.config, ...patch } } : item)); }
  function changeType(key: string, type: Type) {
    const defaults: Record<Type, unknown> = {
      NUMERIC: { minimum: 0, maximum: 10, step: 0.5 },
      RATING: { options: [{ id: crypto.randomUUID(), label: 'Chưa đạt', value: 0 }, { id: crypto.randomUUID(), label: 'Đạt', value: 5 }, { id: crypto.randomUUID(), label: 'Tốt', value: 8 }, { id: crypto.randomUUID(), label: 'Xuất sắc', value: 10 }] },
      PASS_FAIL: { passLabel: 'Đạt', failLabel: 'Không đạt', requiredGate: false },
      CHECKLIST: { mode: 'POINTS', items: [{ id: crypto.randomUUID(), label: 'Yêu cầu 1', points: 1 }] },
      BONUS_PENALTY: { minimum: -2, maximum: 2, step: 0.5 },
    };
    patchCriterion(key, { type, config: defaults[type], weight: 1 });
  }
  function moveCriterion(from: number, to: number) {
    if (to < 0 || to >= criteria.length || from === to) return;
    setCriteria((items) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  }
  function onCriterionDrop(event: DragEvent, target: number) {
    event.preventDefault(); if (!dragging) return;
    moveCriterion(criteria.findIndex((item) => item.clientKey === dragging), target); setDragging(null);
  }
  function copyCriterion(item: Criterion) {
    const copy = structuredClone(item); copy.clientKey = crypto.randomUUID(); copy.name = `${item.name || 'Tiêu chí'} (bản sao)`;
    setCriteria((items) => { const index = items.findIndex((candidate) => candidate.clientKey === item.clientKey); const next = [...items]; next.splice(index + 1, 0, copy); return next; }); setExpanded(copy.clientKey);
  }

  async function publish() {
    if (!criteria.length || locked || hasScores || (status === 'PUBLISHED' && !dirty)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/competitions/${id}/rubric`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        criteria: criteria.map((item) => ({ clientKey: item.clientKey, name: item.name, description: item.description, type: item.type, config: item.config, required: item.required, weight: item.weight, commentRequired: item.commentRequired })),
      }) });
      const data = await readApiResponse(response, 'save');
      const savedCriteria = criteria.map((item, index) => ({ ...item, clientKey: `criterion-${data.version.criteria[index]?.id}` }));
      setCriteria(savedCriteria); setVersion(data.version.version); setStatus('PUBLISHED');
      setSavedFingerprint(JSON.stringify(savedCriteria));
      await refreshCompetition();
      showAlert({ title: 'Đã áp dụng bộ tiêu chí', description: `Bộ tiêu chí phiên bản ${data.version.version} đã sẵn sàng cho giám khảo chấm.`, tone: 'success' });
    } catch (reason) { showAlert({ title: 'Chưa áp dụng được bộ tiêu chí', description: reason instanceof Error ? reason.message : 'Hãy thử lại sau ít phút.', tone: 'error' }); }
    finally { setBusy(false); }
  }

  return <div className="rubric-builder">
    {locked && <Notice tone="warning">Tiêu chí đang được sử dụng hoặc kết quả đã khóa. Phiên bản đã công bố được giữ nguyên để bảo toàn dữ liệu chấm.</Notice>}
    <div className="rubric-builder-grid">
      <div className="rubric-builder-main">
        <SectionCard title="Tiêu chí chấm" subtitle={`${activeCount} mục · Kéo thả để sắp xếp.`} action={<button type="button" className="button secondary-button small-button" onClick={() => { const item = newCriterion(); setCriteria((items) => [...items, item]); setExpanded(item.clientKey); }} disabled={locked}><Icon name="plus" size={15} /> Tiêu chí</button>}>
          {criteria.length === 0 ? <div className="rubric-empty"><strong>Chưa có tiêu chí chấm</strong><span>Chọn “＋ Tiêu chí” để bắt đầu tạo phiếu chấm.</span></div> : <div className="rubric-criteria-list">{criteria.map((item, index) => <article key={item.clientKey} className={`rubric-criterion-card${expanded === item.clientKey ? ' is-expanded' : ''}`} draggable={!locked} onDragStart={() => setDragging(item.clientKey)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onCriterionDrop(event, index)}>
            <div className="rubric-criterion-top"><span className="rubric-drag-handle" aria-label="Kéo để sắp xếp"><Icon name="grip" size={16} /></span><button type="button" className="rubric-criterion-summary" aria-expanded={expanded === item.clientKey} onClick={() => setExpanded(expanded === item.clientKey ? null : item.clientKey)}><span className="rubric-criterion-number">{index + 1}</span><span><strong>{item.name || `Tiêu chí ${index + 1}`}</strong><small>{typeNames[item.type]}</small></span><span className="rubric-edit-label">{expanded === item.clientKey ? 'Đóng' : 'Sửa'}</span></button><div className="rubric-quick-actions"><button type="button" aria-label="Đưa tiêu chí lên" title="Đưa lên" onClick={() => moveCriterion(index, index - 1)} disabled={locked || index === 0}><Icon name="arrow-up" size={15} /></button><button type="button" aria-label="Đưa tiêu chí xuống" title="Đưa xuống" onClick={() => moveCriterion(index, index + 1)} disabled={locked || index === criteria.length - 1}><Icon name="arrow-down" size={15} /></button><button type="button" aria-label="Sao chép tiêu chí" title="Sao chép" onClick={() => copyCriterion(item)} disabled={locked}><Icon name="copy" size={15} /></button><button type="button" className="rubric-delete-button" aria-label="Xóa tiêu chí" title="Xóa tiêu chí" onClick={() => { setCriteria((items) => items.filter((candidate) => candidate.clientKey !== item.clientKey)); if (expanded === item.clientKey) setExpanded(null); }} disabled={locked}><Icon name="trash" size={15} /></button></div></div>
            {expanded === item.clientKey && <div className="rubric-editor-fields">
              <label className="field-label">Tên tiêu chí<input className="field-input" value={item.name} onChange={(event) => patchCriterion(item.clientKey, { name: event.target.value })} maxLength={160} required disabled={locked} /><span className="field-help">Ví dụ: Tính sáng tạo.</span></label>
              <label className="field-label">Hình thức chấm<AppSelect className="field-input rubric-app-select" aria-label="Hình thức chấm" value={item.type} options={Object.entries(typeNames).map(([value, label]) => ({ value, label }))} onValueChange={(value) => changeType(item.clientKey, value as Type)} disabled={locked} /></label>
              <TypeFields item={item} locked={locked} patchConfig={(patch) => patchConfig(item.clientKey, patch)} />
              {['NUMERIC', 'RATING'].includes(item.type) || (item.type === 'CHECKLIST' && item.config.mode === 'POINTS') ? <label className="field-label">Trọng số<input className="field-input" type="number" min="0.01" step="0.01" value={item.weight} onChange={(event) => patchCriterion(item.clientKey, { weight: Number(event.target.value) })} disabled={locked} /><span className="field-help">Tỷ lệ ảnh hưởng trong điểm nền của toàn cuộc thi.</span></label> : null}
              <label className="rubric-comment-option"><input type="checkbox" checked={item.commentRequired} onChange={(event) => patchCriterion(item.clientKey, { commentRequired: event.target.checked })} disabled={locked} /><span><strong>Bắt buộc nhận xét</strong><small>Giám khảo cần giải thích kết quả đã chọn.</small></span></label>
              <label className="rubric-comment-option"><input type="checkbox" checked={item.required} onChange={(event) => patchCriterion(item.clientKey, { required: event.target.checked })} disabled={locked} /><span><strong>Bắt buộc hoàn thành</strong><small>Bỏ chọn nếu giám khảo được phép để trống.</small></span></label>
              <label className="field-label">Hướng dẫn chấm<textarea className="field-textarea" value={item.description} onChange={(event) => patchCriterion(item.clientKey, { description: event.target.value })} maxLength={2000} disabled={locked} /></label>
            </div>}
          </article>)}</div>}
        </SectionCard>
      </div>
      <aside className="rubric-builder-side">
        <section className="surface-card rubric-apply-panel">
          <button type="button" className="button primary-button rubric-publish-button" onClick={() => void publish()} disabled={busy || locked || !criteria.length || hasScores || alreadyApplied}>{alreadyApplied ? 'Đã áp dụng' : busy ? 'Đang áp dụng…' : 'Áp dụng'}</button>
        </section>
      </aside>
    </div>
  </div>;
}

function TypeFields({ item, locked, patchConfig }: { item: Criterion; locked: boolean; patchConfig: (patch: Record<string, unknown>) => void }) {
  if (item.type === 'NUMERIC' || item.type === 'BONUS_PENALTY') return <div className="rubric-type-config"><div className="rubric-criterion-range"><label className="field-label">Điểm thấp nhất<input className="field-input" type="number" step="0.01" value={item.config.minimum} onChange={(event) => patchConfig({ minimum: Number(event.target.value) })} disabled={locked} /></label><label className="field-label">Điểm cao nhất<input className="field-input" type="number" step="0.01" value={item.config.maximum} onChange={(event) => patchConfig({ maximum: Number(event.target.value) })} disabled={locked} /></label></div><label className="field-label">Bước điểm<input className="field-input" type="number" min="0.01" step="0.01" value={item.config.step} onChange={(event) => patchConfig({ step: Number(event.target.value) })} disabled={locked} /></label>{item.type === 'BONUS_PENALTY' && <p className="rubric-helper-note">Điểm này được cộng trực tiếp sau điểm nền và giới hạn trong thang tổng kết.</p>}</div>;
  if (item.type === 'RATING') return <div className="rubric-type-config"><strong>Các mức đánh giá</strong><div className="rubric-rating-head" aria-hidden="true"><span>Mức đánh giá</span><span>Điểm quy đổi</span><span /></div>{item.config.options.map((option: any, index: number) => <div className="rubric-option-row" key={option.id}><input className="field-input" aria-label="Tên mức" value={option.label} onChange={(event) => patchConfig({ options: item.config.options.map((value: any, i: number) => i === index ? { ...value, label: event.target.value } : value) })} disabled={locked} /><input className="field-input" aria-label="Điểm quy đổi" type="number" step="0.01" value={option.value} onChange={(event) => patchConfig({ options: item.config.options.map((value: any, i: number) => i === index ? { ...value, value: Number(event.target.value) } : value) })} disabled={locked} /><button type="button" className="text-button" onClick={() => patchConfig({ options: item.config.options.filter((_: any, i: number) => i !== index) })} disabled={locked || item.config.options.length <= 2}>Xóa</button></div>)}<button type="button" className="button secondary-button small-button" onClick={() => patchConfig({ options: [...item.config.options, { id: crypto.randomUUID(), label: `Mức ${item.config.options.length + 1}`, value: item.config.options.length }] })} disabled={locked}><Icon name="plus" size={14} /> Thêm mức</button><p className="rubric-helper-note">Giám khảo chọn một mức; hệ thống dùng điểm quy đổi để tính kết quả. Điểm được chuẩn hóa theo mức thấp nhất và cao nhất.</p></div>;
  if (item.type === 'PASS_FAIL') return <div className="rubric-type-config"><div className="form-grid"><label className="field-label">Nhãn đạt<input className="field-input" value={item.config.passLabel} onChange={(event) => patchConfig({ passLabel: event.target.value })} disabled={locked} /></label><label className="field-label">Nhãn không đạt<input className="field-input" value={item.config.failLabel} onChange={(event) => patchConfig({ failLabel: event.target.value })} disabled={locked} /></label></div><label className="rubric-comment-option"><input type="checkbox" checked={item.config.requiredGate} onChange={(event) => patchConfig({ requiredGate: event.target.checked })} disabled={locked} /><span><strong>Điều kiện bắt buộc</strong><small>Không đạt sẽ đánh dấu kết quả thí sinh là không đạt; không quy đổi thành điểm.</small></span></label></div>;
  return <div className="rubric-type-config"><label className="field-label">Cách tính<AppSelect className="field-input rubric-app-select" aria-label="Cách tính checklist" value={item.config.mode} options={[{ value: 'POINTS', label: 'Tính điểm theo mục đã chọn' }, { value: 'COMPLETION', label: 'Chỉ ghi nhận hoàn thành' }]} onValueChange={(value) => patchConfig({ mode: value })} disabled={locked} /></label>{item.config.items.map((option: any, index: number) => <div className="rubric-option-row rubric-check-item" key={option.id}><input className="field-input" aria-label="Yêu cầu checklist" value={option.label} onChange={(event) => patchConfig({ items: item.config.items.map((value: any, i: number) => i === index ? { ...value, label: event.target.value } : value) })} disabled={locked} />{item.config.mode === 'POINTS' && <input className="field-input" aria-label="Điểm checklist" type="number" min="0" step="0.1" value={option.points} onChange={(event) => patchConfig({ items: item.config.items.map((value: any, i: number) => i === index ? { ...value, points: Number(event.target.value) } : value) })} disabled={locked} />}<button type="button" className="text-button" onClick={() => patchConfig({ items: item.config.items.filter((_: any, i: number) => i !== index) })} disabled={locked || item.config.items.length <= 1}>Xóa</button></div>)}<button type="button" className="button secondary-button small-button" onClick={() => patchConfig({ items: [...item.config.items, { id: crypto.randomUUID(), label: `Yêu cầu ${item.config.items.length + 1}`, points: 1 }] })} disabled={locked}><Icon name="plus" size={14} /> Thêm yêu cầu</button></div>;
}


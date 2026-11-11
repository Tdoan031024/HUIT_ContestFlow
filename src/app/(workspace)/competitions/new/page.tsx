'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Notice, PageHeader, SectionCard } from '@/components/ui';

export default function NewCompetitionPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const start = String(form.get('startsAt') || '');
    const end = String(form.get('endsAt') || '');
    const body = { name: form.get('name'), description: form.get('description'), organizingUnit: form.get('organizingUnit'), location: form.get('location'), modality: form.get('modality'), firstRoundName: form.get('firstRoundName'), startsAt: start ? new Date(start).toISOString() : '', endsAt: end ? new Date(end).toISOString() : '' };
    try {
      const response = await fetch('/api/competitions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không tạo được cuộc thi.');
      router.push(`/competitions/${result.competition.id}`); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Có lỗi xảy ra.'); } finally { setBusy(false); }
  }
  return <>
    <PageHeader eyebrow="THIẾT LẬP" title="Tạo cuộc thi mới" description="Thông tin cơ bản và vòng đầu tiên." action={<Link href="/competitions" className="button secondary-button">← Danh sách</Link>} />
    <div className="card-grid creation-workspace">
      <SectionCard title="Thông tin cuộc thi" subtitle="Có thể chỉnh sửa sau.">
        {error && <Notice tone="error">{error}</Notice>}
        <form className="form-stack" onSubmit={submit}>
          <label className="field-label">Tên cuộc thi *<input className="field-input" name="name" required minLength={3} maxLength={180} placeholder="Ví dụ: HUIT Startup 2026" /></label>
          <label className="field-label">Mô tả<textarea className="field-textarea" name="description" maxLength={5000} placeholder="Mục tiêu, đối tượng tham gia và thông tin giới thiệu…" /></label>
          <div className="form-grid"><label className="field-label">Đơn vị tổ chức<input className="field-input" name="organizingUnit" maxLength={180} placeholder="Trường / khoa / đơn vị" /></label><label className="field-label">Địa điểm<input className="field-input" name="location" maxLength={240} placeholder="Địa điểm hoặc đường dẫn trực tuyến" /></label></div>
          <label className="field-label">Hình thức<select className="field-select" name="modality" defaultValue="ONSITE"><option value="ONSITE">Trực tiếp</option><option value="ONLINE">Trực tuyến</option><option value="HYBRID">Kết hợp</option></select></label>
          <label className="field-label">Vòng thi đầu tiên *<input className="field-input" name="firstRoundName" required defaultValue="Vòng sơ khảo" maxLength={160} /></label>
          <div className="form-grid"><label className="field-label">Ngày bắt đầu<input className="field-input" name="startsAt" type="datetime-local" /></label><label className="field-label">Ngày kết thúc<input className="field-input" name="endsAt" type="datetime-local" /></label></div>
          <div className="notice notice-info">Tạo sẵn rubric 3 tiêu chí; có thể chỉnh trước khi chấm.</div>
          <div className="form-actions"><Link className="button secondary-button" href="/competitions">Hủy</Link><button className="button primary-button" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo cuộc thi'}</button></div>
        </form>
      </SectionCard>
      <SectionCard title="Tiếp theo">
        <div className="quick-links"><div className="quick-link"><span className="quick-icon">1</span><span className="quick-link-copy"><strong>Thêm thí sinh</strong><small>Nhập danh sách dự thi</small></span></div><div className="quick-link"><span className="quick-icon">2</span><span className="quick-link-copy"><strong>Phân công giám khảo</strong><small>Gán theo từng vòng</small></span></div><div className="quick-link"><span className="quick-icon">3</span><span className="quick-link-copy"><strong>Rà soát rubric</strong><small>Tiêu chí và trọng số</small></span></div><div className="quick-link"><span className="quick-icon">4</span><span className="quick-link-copy"><strong>Điều phối</strong><small>Bắt đầu vòng thi</small></span></div></div>
      </SectionCard>
    </div>
  </>;
}

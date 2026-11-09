'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, formatDate } from '@/components/ui';

type Competition = { id: string; name: string; description: string | null; status: string; startsAt: string | null; endsAt: string | null; _count: { contestants: number; rounds: number; scoreSheets: number }; rounds: { id: string; name: string; _count: { entries: number; scoreSheets: number } }[] };

export function CompetitionsList() {
  const [items, setItems] = useState<Competition[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/competitions', { cache: 'no-store' })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setItems(body.competitions); })
      .catch((reason) => setError(reason.message || 'Không tải được danh sách cuộc thi.'));
  }, []);
  const filtered = useMemo(() => items?.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [items, query]);

  return <>
    <PageHeader eyebrow="WORKSPACE" title="Cuộc thi" description="Cấu hình vòng thi và theo dõi tiến độ vận hành." action={<Link className="button primary-button" href="/competitions/new">Tạo cuộc thi</Link>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!items ? <Loading /> : <section className="surface-card">
      <div className="toolbar"><div><strong>{items.length} cuộc thi</strong><span className="field-help"> · Lưu trữ cuộc thi cũ để giữ nguyên lịch sử</span></div><label className="search-field"><span className="sr-only">Tìm cuộc thi</span><input className="filter-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên cuộc thi…" /></label></div>
      {filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>TÊN CUỘC THI</th><th>TRẠNG THÁI</th><th>THỜI GIAN</th><th>VÒNG THI</th><th>THÍ SINH</th><th>THAO TÁC</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td data-label="Cuộc thi"><strong>{item.name}</strong><div className="field-help">{item.description || 'Chưa có mô tả'}</div></td><td data-label="Trạng thái"><StatusPill value={item.status} /></td><td data-label="Thời gian">{formatDate(item.startsAt)}{item.endsAt ? ` – ${formatDate(item.endsAt)}` : ''}</td><td data-label="Vòng thi">{item._count.rounds}</td><td data-label="Thí sinh">{item._count.contestants}</td><td data-label="Thao tác"><Link className="button secondary-button small-button" href={`/competitions/${item.id}`}>Mở <span aria-hidden="true">→</span></Link></td></tr>)}</tbody></table></div> : <EmptyState title={query ? 'Không tìm thấy cuộc thi' : 'Chưa có cuộc thi'} description={query ? 'Thử tìm với tên khác.' : 'Tạo cuộc thi đầu tiên để bắt đầu cấu hình.'} action={!query && <Link className="button primary-button" href="/competitions/new">Tạo cuộc thi</Link>} />}
    </section>}
  </>;
}

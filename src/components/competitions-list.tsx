'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeader, formatDate } from '@/components/ui';

type Competition = { id: string; name: string; description: string | null; startsAt: string | null; endsAt: string | null; _count: { contestants: number; rounds: number; scoreSheets: number } };

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
  const contestantTotal = useMemo(() => (items ?? []).reduce((sum, item) => sum + item._count.contestants, 0), [items]);

  return <>
    <PageHeader className="competition-page-heading" eyebrow="BAN TỔ CHỨC" title="Cuộc thi" description="Quản lý danh sách và tiến độ." action={<Link className="button primary-button" href="/competitions/new"><span className="competition-create-full">＋ Tạo cuộc thi</span><span className="competition-create-compact">＋ Tạo</span></Link>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!items ? <Loading /> : <>
      <section className="competition-summary" aria-label="Tóm tắt danh sách cuộc thi">
        <div className="competition-summary-title"><span>KHÔNG GIAN ĐIỀU HÀNH</span><strong>{items.length.toLocaleString('vi-VN')} <small>cuộc thi</small></strong></div>
        <div className="competition-summary-stat"><span>Thí sinh</span><strong>{contestantTotal.toLocaleString('vi-VN')}</strong></div>
      </section>
      <p className="competition-summary-compact" aria-label={`Tổng cộng ${items.length} cuộc thi, ${contestantTotal} thí sinh`}>
        <strong>{items.length.toLocaleString('vi-VN')}</strong> cuộc thi <span aria-hidden="true">·</span> <strong>{contestantTotal.toLocaleString('vi-VN')}</strong> thí sinh
      </p>
      <section className="competition-index">
      <div className="competition-index-heading"><div><h2>Danh sách cuộc thi</h2></div><span>{filtered.length} kết quả</span></div>
      <div className="competition-index-toolbar">
        <label className="search-field"><span className="sr-only">Tìm cuộc thi</span><input className="filter-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên cuộc thi…" /></label>
      </div>
      {filtered.length ? <>
        <div className="table-wrap competition-table-wrap"><table className="data-table"><thead><tr><th>TÊN CUỘC THI</th><th>THỜI GIAN</th><th>THÍ SINH</th><th>THAO TÁC</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td data-label="Cuộc thi"><strong>{item.name}</strong><div className="field-help">{item.description || 'Chưa có mô tả'}</div></td><td data-label="Thời gian">{formatDate(item.startsAt)}{item.endsAt ? ` – ${formatDate(item.endsAt)}` : ''}</td><td data-label="Thí sinh">{item._count.contestants}</td><td data-label="Thao tác"><Link className="button secondary-button small-button" href={`/competitions/${item.id}`}>Mở <span aria-hidden="true">→</span></Link></td></tr>)}</tbody></table></div>
        <div className="competition-mobile-list" aria-label="Danh sách cuộc thi">
          {filtered.map((item) => <article className="competition-mobile-item" key={item.id}>
            <Link className="competition-mobile-link" href={`/competitions/${item.id}`} aria-label={`Mở cuộc thi ${item.name}`}>
              <div className="competition-mobile-heading"><h3>{item.name}</h3></div>
              <div className="competition-mobile-meta"><span><strong>{item._count.contestants}</strong> thí sinh</span></div>
              {item.description && <p>{item.description}</p>}
              <div className="competition-mobile-footer"><span>{formatDate(item.startsAt)}{item.endsAt ? ` – ${formatDate(item.endsAt)}` : ''}</span><span className="competition-mobile-arrow" aria-hidden="true">→</span></div>
            </Link>
          </article>)}
        </div>
      </> : <EmptyState title={query ? 'Không tìm thấy cuộc thi' : 'Chưa có cuộc thi'} description={query ? 'Thử từ khóa khác.' : 'Tạo cuộc thi đầu tiên để bắt đầu cấu hình.'} action={!query && <Link className="button primary-button" href="/competitions/new">Tạo cuộc thi</Link>} />}
      </section>
    </>}
  </>;
}

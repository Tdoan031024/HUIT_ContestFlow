'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, formatDate } from '@/components/ui';

type Competition = { id: string; name: string; description: string | null; status: string; startsAt: string | null; endsAt: string | null; _count: { contestants: number; rounds: number; scoreSheets: number }; rounds: { id: string; name: string; _count: { entries: number; scoreSheets: number } }[] };
type CompetitionFilter = 'ALL' | 'PREPARING' | 'OPEN' | 'LIVE' | 'CLOSED';

const filterOptions: { key: CompetitionFilter; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'PREPARING', label: 'Đang chuẩn bị' },
  { key: 'OPEN', label: 'Mở đăng ký' },
  { key: 'LIVE', label: 'Đang diễn ra' },
  { key: 'CLOSED', label: 'Đã kết thúc' },
];

function matchesFilter(status: string, filter: CompetitionFilter) {
  if (filter === 'ALL') return true;
  if (filter === 'PREPARING') return status === 'DRAFT';
  if (filter === 'OPEN') return status === 'REGISTRATION' || status === 'READY';
  if (filter === 'LIVE') return status === 'LIVE';
  return status === 'COMPLETED' || status === 'ARCHIVED';
}

export function CompetitionsList() {
  const [items, setItems] = useState<Competition[] | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CompetitionFilter>('ALL');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/competitions', { cache: 'no-store' })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setItems(body.competitions); })
      .catch((reason) => setError(reason.message || 'Không tải được danh sách cuộc thi.'));
  }, []);
  const counts = useMemo(() => filterOptions.reduce((result, option) => {
    result[option.key] = (items ?? []).filter((item) => matchesFilter(item.status, option.key)).length;
    return result;
  }, {} as Record<CompetitionFilter, number>), [items]);
  const filtered = useMemo(() => items?.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()) && matchesFilter(item.status, statusFilter)) ?? [], [items, query, statusFilter]);
  const contestantTotal = useMemo(() => (items ?? []).reduce((sum, item) => sum + item._count.contestants, 0), [items]);
  const liveTotal = counts.LIVE;

  return <>
    <PageHeader eyebrow="BAN TỔ CHỨC" title="Cuộc thi" description="Thiết lập vòng thi, quản lý thí sinh và theo dõi tiến độ." action={<Link className="button primary-button" href="/competitions/new">＋ Tạo cuộc thi</Link>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!items ? <Loading /> : <>
      <section className="competition-summary" aria-label="Tóm tắt danh sách cuộc thi">
        <div className="competition-summary-title"><span>KHÔNG GIAN ĐIỀU HÀNH</span><strong>{items.length.toLocaleString('vi-VN')} <small>cuộc thi</small></strong></div>
        <div className="competition-summary-stat"><span>Đang diễn ra</span><strong>{liveTotal.toLocaleString('vi-VN')}</strong></div>
        <div className="competition-summary-stat"><span>Thí sinh</span><strong>{contestantTotal.toLocaleString('vi-VN')}</strong></div>
        <p>Chọn một cuộc thi để cấu hình vòng, tiêu chí, thí sinh và phân công giám khảo.</p>
      </section>
      <section className="competition-index">
      <div className="competition-index-heading"><div><span className="eyebrow">DANH MỤC</span><h2>Danh sách cuộc thi</h2></div><span>{filtered.length} kết quả</span></div>
      <div className="competition-index-toolbar">
        <div className="competition-filters" role="group" aria-label="Lọc cuộc thi theo trạng thái">
          {filterOptions.map((option) => <button key={option.key} className={statusFilter === option.key ? 'active' : ''} type="button" aria-pressed={statusFilter === option.key} onClick={() => setStatusFilter(option.key)}>{option.label}<span>{counts[option.key]}</span></button>)}
        </div>
        <label className="search-field"><span className="sr-only">Tìm cuộc thi</span><input className="filter-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên cuộc thi…" /></label>
      </div>
      {filtered.length ? <>
        <div className="table-wrap competition-table-wrap"><table className="data-table"><thead><tr><th>TÊN CUỘC THI</th><th>TRẠNG THÁI</th><th>THỜI GIAN</th><th>VÒNG THI</th><th>THÍ SINH</th><th>THAO TÁC</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td data-label="Cuộc thi"><strong>{item.name}</strong><div className="field-help">{item.description || 'Chưa có mô tả'}</div></td><td data-label="Trạng thái"><StatusPill value={item.status} /></td><td data-label="Thời gian">{formatDate(item.startsAt)}{item.endsAt ? ` – ${formatDate(item.endsAt)}` : ''}</td><td data-label="Vòng thi">{item._count.rounds}</td><td data-label="Thí sinh">{item._count.contestants}</td><td data-label="Thao tác"><Link className="button secondary-button small-button" href={`/competitions/${item.id}`}>Mở <span aria-hidden="true">→</span></Link></td></tr>)}</tbody></table></div>
        <div className="competition-mobile-list" aria-label="Danh sách cuộc thi">
          {filtered.map((item) => <article className="competition-mobile-item" key={item.id}>
            <div className="competition-mobile-heading"><h3>{item.name}</h3><StatusPill value={item.status} /></div>
            <p>{item.description || 'Chưa có mô tả'}</p>
            <div className="competition-mobile-meta">
              <span><strong>{item._count.rounds}</strong> vòng thi</span>
              <span><strong>{item._count.contestants}</strong> thí sinh</span>
            </div>
            <div className="competition-mobile-footer"><span>{formatDate(item.startsAt)}{item.endsAt ? ` – ${formatDate(item.endsAt)}` : ''}</span><Link className="button secondary-button small-button" href={`/competitions/${item.id}`}>Mở cuộc thi <span aria-hidden="true">→</span></Link></div>
          </article>)}
        </div>
      </> : <EmptyState title={query || statusFilter !== 'ALL' ? 'Không tìm thấy cuộc thi' : 'Chưa có cuộc thi'} description={query || statusFilter !== 'ALL' ? 'Thử đổi từ khóa hoặc trạng thái đang lọc.' : 'Tạo cuộc thi đầu tiên để bắt đầu cấu hình.'} action={!query && statusFilter === 'ALL' && <Link className="button primary-button" href="/competitions/new">Tạo cuộc thi</Link>} />}
      </section>
    </>}
  </>;
}

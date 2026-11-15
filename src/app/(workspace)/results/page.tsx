'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, formatDateTime } from '@/components/ui';

type Round = { id: string; name: string; sequence: number; status: string; competition: { id: string; name: string; status: string }; _count: { entries: number; scoreSheets: number }; snapshots: { id: string; version: number; published: boolean; lockedAt: string }[] };

export default function ResultsPage() {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [systemRole, setSystemRole] = useState<'ADMIN' | 'JUDGE' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/results', { cache: 'no-store' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setRounds(body.rounds); setSystemRole(body.systemRole); }).catch((reason) => { setError(reason.message || 'Không thể tải kết quả.'); setRounds([]); }); }, []);
  const workspaces = rounds?.filter((round) => round.sequence === 1) ?? [];
  const publishedCount = workspaces.filter((round) => round.snapshots.some((snapshot) => snapshot.published)).length;
  const entryCount = workspaces.reduce((total, round) => total + round._count.entries, 0);
  return <>
    <PageHeader eyebrow={systemRole === 'JUDGE' ? 'GIÁM KHẢO' : 'BAN TỔ CHỨC'} title="Kết quả" description={systemRole === 'JUDGE' ? 'Kết quả đã được công bố.' : 'Theo dõi tiến độ và công bố kết quả cuộc thi.'} />
    {error && <Notice tone="error">{error}</Notice>}
    {rounds === null ? <Loading /> : workspaces.length ? <>
      <section className="results-summary" aria-label="Tóm tắt kết quả">
        <div><span>CUỘC THI</span><strong>{new Set(workspaces.map((round) => round.competition.id)).size}</strong></div>
        <div><span>ĐÃ CÔNG BỐ</span><strong>{publishedCount}</strong></div>
        <div><span>LƯỢT THI</span><strong>{entryCount}</strong></div>
        <p>{systemRole === 'JUDGE' ? 'Chỉ hiển thị kết quả đã công bố.' : 'Mở cuộc thi để xử lý và công bố kết quả.'}</p>
      </section>
      <section className="results-workbench" aria-label="Kết quả cuộc thi">
        <div className="results-workbench-heading"><div><span className="eyebrow">KẾT QUẢ</span><h2>Cuộc thi</h2></div><span>{workspaces.length} cuộc thi</span></div>
        <div className="results-list">{workspaces.map((round, index) => <article className="results-row" key={round.id}>
          <span className="results-row-index">{String(index + 1).padStart(2, '0')}</span>
          <div className="results-row-main"><h3>{round.competition.name}</h3><div className="results-row-meta"><span>{round._count.entries} thí sinh</span>{systemRole === 'ADMIN' && <span>{round._count.scoreSheets} phiếu</span>}{round.snapshots[0] && <span>Snapshot v{round.snapshots[0].version} · {formatDateTime(round.snapshots[0].lockedAt)}</span>}</div></div>
          <StatusPill value={round.status} />
          <Link className="results-row-action" href={`/competitions/${round.competition.id}/results`} aria-label={`${systemRole === 'JUDGE' ? 'Xem kết quả đã công bố' : 'Mở tiến độ và kết quả'}: ${round.competition.name}`}><span>{systemRole === 'JUDGE' ? 'Xem kết quả' : 'Mở kết quả'}</span><b aria-hidden="true">→</b></Link>
        </article>)}</div>
      </section>
    </> : <EmptyState title="Chưa có kết quả để xem" description={systemRole === 'JUDGE' ? 'Kết quả sẽ xuất hiện sau khi ban tổ chức công bố.' : 'Kết quả đã công bố hoặc cần xử lý sẽ xuất hiện tại đây.'} action={systemRole === 'ADMIN' ? <Link className="button secondary-button" href="/competitions">Mở danh sách cuộc thi</Link> : undefined} />}
  </>;
}

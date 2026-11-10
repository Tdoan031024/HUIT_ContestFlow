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
  const publishedCount = rounds?.filter((round) => round.snapshots.some((snapshot) => snapshot.published)).length ?? 0;
  const entryCount = rounds?.reduce((total, round) => total + round._count.entries, 0) ?? 0;
  return <>
    <PageHeader eyebrow={systemRole === 'JUDGE' ? 'DÀNH CHO GIÁM KHẢO' : 'TỔNG HỢP KẾT QUẢ'} title="Kết quả cuộc thi" description={systemRole === 'JUDGE' ? 'Chỉ các snapshot do ban tổ chức công bố mới xuất hiện tại đây.' : 'Theo dõi tiến độ, khóa snapshot và công bố kết quả.'} />
    {error && <Notice tone="error">{error}</Notice>}
    {rounds === null ? <Loading /> : rounds.length ? <>
      <section className="results-summary" aria-label="Tóm tắt kết quả">
        <div><span>VÒNG THI</span><strong>{rounds.length}</strong></div>
        <div><span>ĐÃ CÔNG BỐ</span><strong>{publishedCount}</strong></div>
        <div><span>LƯỢT THI</span><strong>{entryCount}</strong></div>
        <p>{systemRole === 'JUDGE' ? 'Chỉ xem các kết quả được Ban tổ chức công bố.' : 'Mở từng vòng để rà soát phiếu, khóa snapshot và công bố.'}</p>
      </section>
      <section className="results-workbench" aria-label="Các vòng thi có kết quả">
        <div className="results-workbench-heading"><div><span className="eyebrow">KẾT QUẢ</span><h2>Vòng thi</h2></div><span>{rounds.length} vòng</span></div>
        <div className="results-list">{rounds.map((round, index) => <article className="results-row" key={round.id}>
          <span className="results-row-index">{String(index + 1).padStart(2, '0')}</span>
          <div className="results-row-main"><span>{round.competition.name}</span><h3>{round.sequence}. {round.name}</h3><div className="results-row-meta"><span>{round._count.entries} lượt thi</span>{systemRole === 'ADMIN' && <span>{round._count.scoreSheets} phiếu</span>}{round.snapshots[0] && <span>Snapshot v{round.snapshots[0].version} · {formatDateTime(round.snapshots[0].lockedAt)}</span>}</div></div>
          <StatusPill value={round.status} />
          <Link className="results-row-action" href={`/competitions/${round.competition.id}/results?roundId=${round.id}`} aria-label={`${systemRole === 'JUDGE' ? 'Xem kết quả đã công bố' : 'Mở tiến độ và kết quả'}: ${round.competition.name}, ${round.name}`}><span>{systemRole === 'JUDGE' ? 'Xem kết quả' : 'Mở vòng'}</span><b aria-hidden="true">→</b></Link>
        </article>)}</div>
      </section>
    </> : <EmptyState title="Chưa có kết quả để xem" description={systemRole === 'JUDGE' ? 'Kết quả sẽ xuất hiện sau khi ban tổ chức công bố snapshot.' : 'Kết quả đã công bố hoặc các vòng thi cần xử lý sẽ xuất hiện tại đây.'} action={systemRole === 'ADMIN' ? <Link className="button secondary-button" href="/competitions">Mở danh sách cuộc thi</Link> : undefined} />}
  </>;
}

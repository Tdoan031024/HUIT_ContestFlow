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
  return <>
    <PageHeader eyebrow={systemRole === 'JUDGE' ? 'DÀNH CHO GIÁM KHẢO' : 'TỔNG HỢP KẾT QUẢ'} title="Kết quả cuộc thi" description={systemRole === 'JUDGE' ? 'Chỉ các snapshot do ban tổ chức công bố mới xuất hiện tại đây.' : 'Theo dõi tiến độ, khóa snapshot và công bố kết quả.'} />
    {error && <Notice tone="error">{error}</Notice>}
    {rounds === null ? <Loading /> : rounds.length ? <div className="card-grid two-columns">{rounds.map((round) => <section className="surface-card" key={round.id}>
      <div className="surface-heading"><div><h2>{round.competition.name}</h2><p>{round.sequence}. {round.name}</p></div><StatusPill value={round.status} /></div>
      <div className="pill-row"><span className="metric-chip">{round._count.entries} lượt thi</span>{systemRole === 'ADMIN' && <span className="metric-chip">{round._count.scoreSheets} phiếu</span>}{round.snapshots[0] && <span className="metric-chip">Snapshot v{round.snapshots[0].version} · {formatDateTime(round.snapshots[0].lockedAt)}</span>}</div>
      <div className="form-actions" style={{ marginTop: 15 }}><Link className="button primary-button" href={`/competitions/${round.competition.id}/results?roundId=${round.id}`}>{systemRole === 'JUDGE' ? 'Xem kết quả đã công bố →' : 'Mở tiến độ & kết quả →'}</Link></div>
    </section>)}</div> : <EmptyState title="Chưa có kết quả để xem" description={systemRole === 'JUDGE' ? 'Kết quả sẽ xuất hiện sau khi ban tổ chức công bố snapshot.' : 'Kết quả đã công bố hoặc các vòng thi cần xử lý sẽ xuất hiện tại đây.'} action={systemRole === 'ADMIN' ? <Link className="button secondary-button" href="/competitions">Mở danh sách cuộc thi</Link> : undefined} />}
  </>;
}

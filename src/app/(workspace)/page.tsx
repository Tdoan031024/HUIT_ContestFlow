'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, formatDate } from '@/components/ui';

type Data = {
  systemRole: 'ADMIN' | 'JUDGE';
  stats: { competitionCount: number; contestantCount: number; judgeCount: number; scoreCompletion: number; submittedScores: number; expectedScores: number };
  competitions: { id: string; name: string; status: string; startsAt: string | null; _count: { contestants: number }; rounds: { _count: { entries: number; scoreSheets: number; assignments: number } }[] }[];
  activities: { id: string; action: string; createdAt: string; actor: { fullName: string } | null; competition: { name: string } | null }[];
};

const actionLabels: Record<string, string> = { COMPETITION_CREATED: 'tạo cuộc thi', COMPETITION_UPDATED: 'cập nhật cuộc thi', ROUND_CREATED: 'thêm vòng thi', JUDGE_ASSIGNED: 'phân công giám khảo', SCORE_SUBMITTED: 'nộp phiếu điểm', RESULTS_LOCKED: 'khóa kết quả', RESULTS_PUBLISHED: 'công bố kết quả', SCORE_REOPENED: 'mở lại phiếu điểm', CONTESTANT_CREATED: 'thêm thí sinh' };

export default function DashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/dashboard', { cache: 'no-store' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }).catch((reason) => setError(reason.message || 'Không tải được dữ liệu.')); }, []);

  return <>
    <PageHeader eyebrow="WORKSPACE OVERVIEW" title="Tổng quan" description="Theo dõi cuộc thi, tiến độ chấm và hoạt động gần đây." action={data?.systemRole === 'ADMIN' ? <Link className="button primary-button" href="/competitions/new">＋ Tạo cuộc thi</Link> : data?.systemRole === 'JUDGE' ? <Link className="button primary-button" href="/judge">Mở lượt chấm →</Link> : undefined} />
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <Loading /> : <>
      <section className="stats-grid" aria-label="Tổng quan số liệu">
        <Stat label="Cuộc thi đang quản lý" value={data.stats.competitionCount} icon="▦" foot="Không tính cuộc thi đã lưu trữ" />
        <Stat label="Thí sinh" value={data.stats.contestantCount} icon="♙" tone="purple" foot="Trong các cuộc thi của bạn" />
        <Stat label="Giám khảo được phân công" value={data.stats.judgeCount} icon="◉" tone="amber" foot="Tài khoản có ít nhất một phân công" />
        <Stat label="Phiếu điểm đã hoàn tất" value={`${data.stats.scoreCompletion}%`} icon="✓" tone="green" foot={`${data.stats.submittedScores} / ${data.stats.expectedScores} phiếu yêu cầu`} />
      </section>
      <div className="dashboard-grid">
        <section className="surface-card">
          <div className="surface-heading"><div><h2>Cuộc thi của bạn</h2><p>Tiến độ và trạng thái mới nhất</p></div><Link className="text-button" href="/competitions">Xem tất cả →</Link></div>
          {data.competitions.length ? <div className="competition-list">{data.competitions.map((competition) => {
            const entryTotal = competition.rounds.reduce((sum, round) => sum + round._count.entries, 0);
            const sheetTotal = competition.rounds.reduce((sum, round) => sum + round._count.scoreSheets, 0);
            const expected = competition.rounds.reduce((sum, round) => sum + round._count.entries * Math.max(1, round._count.assignments), 0);
            const progress = expected ? Math.min(100, Math.round(sheetTotal / expected * 100)) : 0;
            return <Link className="competition-row" href={`/competitions/${competition.id}`} key={competition.id}>
              <span className="competition-symbol">✦</span><span className="competition-copy"><h3>{competition.name}</h3><p>{formatDate(competition.startsAt)} · {competition._count.contestants} thí sinh · {competition.rounds.length} vòng thi</p><span className="progress-line"><span className="progress-track"><span style={{ width: `${progress}%` }} /></span><span>{entryTotal} lượt thi · {progress}% phiếu</span></span></span><span className="row-end"><StatusPill value={competition.status} /><span className="nav-arrow">→</span></span>
            </Link>;
          })}</div> : <EmptyState title="Chưa có cuộc thi" description="Tạo cuộc thi đầu tiên để bắt đầu cấu hình vòng thi, thí sinh và giám khảo." action={<Link className="button primary-button" href="/competitions/new">Tạo cuộc thi</Link>} />}
        </section>
        <section className="surface-card">
          <div className="surface-heading"><div><h2>Hoạt động gần đây</h2><p>Các thay đổi mới nhất trong workspace</p></div></div>
          {data.activities.length ? <div className="quick-links">{data.activities.map((event) => <div className="quick-link" key={event.id}><span className="quick-icon">{event.action.includes('SCORE') ? '✓' : '↗'}</span><span className="quick-link-copy"><strong>{event.actor?.fullName ?? 'Hệ thống'} {actionLabels[event.action] ?? event.action.toLowerCase().replaceAll('_', ' ')}</strong><small>{event.competition?.name ?? 'Workspace'} · {new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.createdAt))}</small></span></div>)}</div> : <EmptyState title="Chưa có hoạt động" description="Hoạt động sẽ xuất hiện ở đây khi bạn bắt đầu thao tác." />}
          <div className="quick-links" style={{ marginTop: 14 }}>
            {data.systemRole === 'JUDGE' && <Link className="quick-link" href="/judge"><span className="quick-icon">◉</span><span className="quick-link-copy"><strong>Mở khu vực giám khảo</strong><small>Xem các lượt thi đang được phân công</small></span><b>→</b></Link>}
            <Link className="quick-link" href="/results"><span className="quick-icon">↗</span><span className="quick-link-copy"><strong>Xem bảng kết quả</strong><small>Tổng hợp điểm và trạng thái công bố</small></span><b>→</b></Link>
          </div>
        </section>
      </div>
    </>}
  </>;
}

function Stat({ label, value, icon, tone = '', foot }: { label: string; value: string | number; icon: string; tone?: string; foot: string }) {
  return <article className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-number">{value}</div><div className="stat-label">{label}</div><div className="stat-foot">{foot}</div></article>;
}

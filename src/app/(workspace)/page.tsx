'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeader, StatusPill, formatDate } from '@/components/ui';
import { auditActionLabel } from '@/lib/audit-labels';
import { Icon, type IconName } from '@/components/icons';

type Data = {
  systemRole: 'ADMIN' | 'JUDGE';
  stats: { competitionCount: number; contestantCount: number; judgeCount: number; percent: number; submittedScores: number; expectedScores: number };
  competitions: { id: string; name: string; status: string; startsAt: string | null; _count: { contestants: number }; rounds: { _count: { entries: number; scoreSheets: number; assignments: number } }[]; progress: { submitted: number; expected: number; percent: number } }[];
  activities: { id: string; action: string; createdAt: string; actor: { fullName: string } | null; competition: { name: string } | null }[];
  actionItems?: { id: string; kind: string; title: string; detail: string; href: string }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/dashboard', { cache: 'no-store' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }).catch((reason) => setError(reason.message || 'Không tải được dữ liệu.')); }, []);

  return <>
    <PageHeader eyebrow="TỔNG QUAN" title="Tổng quan" description="Theo dõi cuộc thi, tiến độ chấm và hoạt động gần đây." action={data?.systemRole === 'ADMIN' ? <Link className="button primary-button" href="/competitions/new">＋ Tạo cuộc thi</Link> : data?.systemRole === 'JUDGE' ? <Link className="button primary-button" href="/judge">Mở lượt chấm →</Link> : undefined} />
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <Loading /> : <>
      <section className="stats-grid" aria-label="Tổng quan số liệu">
        <Stat label={data.systemRole === 'ADMIN' ? 'Cuộc thi đang quản lý' : 'Cuộc thi được phân công'} value={data.stats.competitionCount} icon="trophy" foot="Không tính cuộc thi đã lưu trữ" />
        <Stat label={data.systemRole === 'ADMIN' ? 'Thí sinh' : 'Lượt thi được giao'} value={data.stats.contestantCount} icon="users" foot={data.systemRole === 'ADMIN' ? 'Trong các cuộc thi của bạn' : 'Theo phân công của bạn'} />
        <Stat label={data.systemRole === 'ADMIN' ? 'Giám khảo được phân công' : 'Phiếu của tôi đã nộp'} value={data.systemRole === 'ADMIN' ? data.stats.judgeCount : data.stats.submittedScores} icon={data.systemRole === 'ADMIN' ? 'clipboard' : 'check'} foot={data.systemRole === 'ADMIN' ? 'Tài khoản có ít nhất một phân công' : `Trong ${data.stats.expectedScores} lượt được giao`} />
        <Stat label={data.systemRole === 'ADMIN' ? 'Phiếu điểm đã hoàn tất' : 'Tiến độ chấm của tôi'} value={`${data.stats.percent}%`} icon="check" tone="green" foot={`${data.stats.submittedScores} / ${data.stats.expectedScores} phiếu yêu cầu`} />
      </section>
      {data.systemRole === 'ADMIN' && <section className="dashboard-actions" aria-labelledby="dashboard-actions-title">
        <div className="dashboard-section-heading"><div><span className="eyebrow">ĐIỀU HÀNH</span><h2 id="dashboard-actions-title">Việc cần xử lý</h2></div><span className="dashboard-count">{data.actionItems?.length ?? 0}</span></div>
        {data.actionItems?.length ? <div className="action-list">{data.actionItems.map((item) => <Link className={`action-row action-${item.kind}`} href={item.href} key={item.id}>
          <span className="action-mark" aria-hidden="true"><Icon name={item.kind === 'live' ? 'clock' : item.kind === 'publish' ? 'chart' : 'alert'} /></span>
          <span className="action-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
          <span className="action-open">Mở <span aria-hidden="true">→</span></span>
        </Link>)}</div> : <div className="action-empty"><span aria-hidden="true">✓</span><div><strong>Không có việc cần xử lý</strong><p>Các vòng thi đang đủ điều kiện theo dõi.</p></div></div>}
      </section>}
      <div className="dashboard-grid">
        <section className="surface-card">
          <div className="surface-heading"><div><h2>{data.systemRole === 'ADMIN' ? 'Cuộc thi của bạn' : 'Cuộc thi được phân công'}</h2><p>{data.systemRole === 'ADMIN' ? 'Tiến độ và trạng thái mới nhất' : 'Tiến độ phiếu của riêng bạn'}</p></div><Link className="text-button" href={data.systemRole === 'ADMIN' ? '/competitions' : '/judge'}>{data.systemRole === 'ADMIN' ? 'Xem tất cả →' : 'Mở lượt chấm →'}</Link></div>
          {data.competitions.length ? <div className="competition-list">{data.competitions.map((competition) => {
            const entryTotal = competition.rounds.reduce((sum, round) => sum + round._count.entries, 0);
            return <Link className="competition-row" href={data.systemRole === 'ADMIN' ? `/competitions/${competition.id}` : '/judge'} key={competition.id}>
            <span className="competition-symbol" aria-hidden="true"><Icon name="trophy" /></span><span className="competition-copy"><h3>{competition.name}</h3><p>{formatDate(competition.startsAt)} · {data.systemRole === 'ADMIN' ? `${competition._count.contestants} thí sinh` : `${entryTotal} lượt thi được giao`} · {competition.rounds.length} vòng thi</p><span className="progress-line"><span className="progress-track"><span style={{ width: `${competition.progress.percent}%` }} /></span><span>{competition.progress.submitted}/{competition.progress.expected} phiếu · {competition.progress.percent}%</span></span></span><span className="row-end"><StatusPill value={competition.status} /><span className="nav-arrow" aria-hidden="true"><Icon name="arrow" size={16} /></span></span>
            </Link>;
          })}</div> : <EmptyState title={data.systemRole === 'ADMIN' ? 'Chưa có cuộc thi' : 'Chưa có lượt thi được giao'} description={data.systemRole === 'ADMIN' ? 'Tạo cuộc thi đầu tiên để bắt đầu cấu hình vòng thi, thí sinh và giám khảo.' : 'Khi Admin phân công bạn vào lượt thi, tiến độ sẽ xuất hiện ở đây.'} action={data.systemRole === 'ADMIN' ? <Link className="button primary-button" href="/competitions/new">Tạo cuộc thi</Link> : undefined} />}
        </section>
        <section className="surface-card">
          <div className="surface-heading"><div><h2>Hoạt động gần đây</h2><p>{data.systemRole === 'ADMIN' ? 'Các thay đổi mới nhất trong cuộc thi' : 'Chỉ các thao tác của bạn'}</p></div></div>
          {data.activities.length ? <div className="quick-links">{data.activities.map((event) => <div className="quick-link" key={event.id}><span className="quick-icon" aria-hidden="true"><Icon name={event.action.includes('SCORE') ? 'check' : 'chart'} /></span><span className="quick-link-copy"><strong>{event.actor?.fullName ?? 'Hệ thống'} {auditActionLabel(event.action).toLocaleLowerCase('vi-VN')}</strong><small>{event.competition?.name ?? 'Không gian làm việc'} · {new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.createdAt))}</small></span></div>)}</div> : <EmptyState title="Chưa có hoạt động" description="Hoạt động sẽ xuất hiện ở đây khi bạn bắt đầu thao tác." />}
          <div className="quick-links" style={{ marginTop: 14 }}>
            {data.systemRole === 'JUDGE' && <Link className="quick-link" href="/judge"><span className="quick-icon" aria-hidden="true"><Icon name="clipboard" /></span><span className="quick-link-copy"><strong>Mở khu vực giám khảo</strong><small>Xem các lượt thi đang được phân công</small></span><Icon name="arrow" /></Link>}
            <Link className="quick-link" href="/results"><span className="quick-icon" aria-hidden="true"><Icon name="chart" /></span><span className="quick-link-copy"><strong>{data.systemRole === 'JUDGE' ? 'Xem kết quả đã công bố' : 'Xem bảng kết quả'}</strong><small>{data.systemRole === 'JUDGE' ? 'Chỉ xem snapshot được phép công khai' : 'Tổng hợp điểm và trạng thái công bố'}</small></span><Icon name="arrow" /></Link>
          </div>
        </section>
      </div>
    </>}
  </>;
}

function Stat({ label, value, icon, tone = '', foot }: { label: string; value: string | number; icon: IconName; tone?: string; foot: string }) {
  return <article className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`} aria-hidden="true"><Icon name={icon} /></span></div><div className="stat-number">{value}</div><div className="stat-label">{label}</div><div className="stat-foot">{foot}</div></article>;
}

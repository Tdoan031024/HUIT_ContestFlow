import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'error' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Loading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark">✦</div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function StatusPill({ value }: { value: string }) {
  const map: Record<string, string> = { DRAFT: 'Nháp', REGISTRATION: 'Mở đăng ký', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Đã hoàn tất', ARCHIVED: 'Đã lưu trữ', ACTIVE: 'Đang hoạt động', WITHDRAWN: 'Đã rút', DISQUALIFIED: 'Bị loại', ADVANCED: 'Vào vòng sau', ELIMINATED: 'Dừng cuộc thi', SUBMITTED: 'Đã nộp', REOPENED: 'Đã mở lại', PAUSED: 'Tạm dừng', IDLE: 'Chưa bắt đầu' };
  return <span className={`status-pill status-${value.toLowerCase()}`}><i />{map[value] ?? value}</span>;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return 'Chưa thiết lập';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="surface-card"><div className="surface-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

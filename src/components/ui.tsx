import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { Notification, type NotificationTone } from '@/components/notification-provider';

export function PageHeader({ eyebrow, title, description, action, titleAction, className }: { eyebrow?: string; title: string; description?: string; action?: ReactNode; titleAction?: ReactNode; className?: string }) {
  return <div className={`page-heading${className ? ` ${className}` : ''}`}><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}{titleAction ? <div className="page-heading-title-row"><h1>{title}</h1>{titleAction}</div> : <h1>{title}</h1>}{description && <p>{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: NotificationTone }) {
  return <Notification tone={tone}>{children}</Notification>;
}

export function Loading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite">
    <div className="loading-copy"><span className="spinner" aria-hidden="true" /><span>{label}</span></div>
    <div className="loading-skeleton" aria-hidden="true"><i /><i /><i /></div>
  </div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark" aria-hidden="true"><Icon name="clipboard" /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function StatusPill({ value }: { value: string }) {
  const map: Record<string, string> = { DRAFT: 'Nháp', REGISTRATION: 'Mở đăng ký', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Đã hoàn tất', ARCHIVED: 'Đã lưu trữ', ACTIVE: 'Đang hoạt động', WITHDRAWN: 'Đã rút', DISQUALIFIED: 'Bị loại', ADVANCED: 'Được chọn', ELIMINATED: 'Dừng cuộc thi', SUBMITTED: 'Đã nộp', REOPENED: 'Đã mở lại', PAUSED: 'Tạm dừng', IDLE: 'Chưa bắt đầu', WAITING: 'Đang chờ', UNAVAILABLE: 'Chưa khả dụng', MISSING: 'Chưa có phiếu', LOCKED: 'Đã khóa' };
  return <span className={`status-pill status-${value.toLowerCase()}`}><i />{map[value] ?? value}</span>;
}

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(value?: string | Date | null) {
  if (!value) return 'Chưa thiết lập';
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return dateTimeFormatter.format(new Date(value));
}

export function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="surface-card"><div className="surface-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function Dialog({ open, title, description, onClose, children, className = '' }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog
    ref={ref}
    className={`app-dialog ${className}`}
    aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClose={() => { if (open) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className="dialog-heading"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button className="icon-button dialog-close" type="button" aria-label="Đóng hộp thoại" onClick={onClose}>×</button></div>
    <div className="dialog-content">{children}</div>
  </dialog>;
}

type ConfirmOptions = { title: string; description: string; confirmLabel?: string; danger?: boolean };

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirm = useCallback((next: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOptions(next);
  }), []);
  const finish = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);
  const dialog = <Dialog open={Boolean(options)} title={options?.title ?? ''} description={options?.description} onClose={() => finish(false)}>
    {options && <div className="dialog-actions"><button className="button secondary-button" type="button" onClick={() => finish(false)}>Hủy</button><button className={`button ${options.danger ? 'danger-button' : 'primary-button'}`} type="button" onClick={() => finish(true)}>{options.confirmLabel ?? 'Xác nhận'}</button></div>}
  </Dialog>;
  return { confirm, dialog };
}

type TextPromptOptions = { title: string; description?: string; defaultValue?: string; label: string; placeholder?: string; submitLabel?: string; minLength?: number; maxLength?: number };

export function useTextPromptDialog() {
  const [options, setOptions] = useState<TextPromptOptions | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((value: string | null) => void) | null>(null);
  const promptText = useCallback((next: TextPromptOptions) => new Promise<string | null>((resolve) => {
    resolver.current = resolve;
    setValue(next.defaultValue ?? '');
    setOptions(next);
  }), []);
  const finish = useCallback((result: string | null) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
    setValue('');
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (options?.minLength && trimmed.length < options.minLength) return;
    finish(trimmed);
  }
  const dialog = <Dialog open={Boolean(options)} title={options?.title ?? ''} description={options?.description} onClose={() => finish(null)}>
    {options && <form className="dialog-form" onSubmit={submit}>
      <label className="field-label">{options.label}<input className="field-input" autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={options.placeholder} minLength={options.minLength} maxLength={options.maxLength} required /></label>
      <div className="dialog-actions"><button className="button secondary-button" type="button" onClick={() => finish(null)}>Hủy</button><button className="button primary-button" type="submit">{options.submitLabel ?? 'Tiếp tục'}</button></div>
    </form>}
  </Dialog>;
  return { promptText, dialog };
}

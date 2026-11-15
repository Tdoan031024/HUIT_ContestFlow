'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';
type NotificationOptions = { title: string; description: string; tone?: NotificationTone };
type NotificationViewProps = { title?: string; description?: string; tone?: NotificationTone; variant?: 'inline' | 'toast'; children?: ReactNode; onDismiss?: () => void };
type NotificationContextValue = { showNotification: (next: NotificationOptions) => void };
const NotificationContext = createContext<NotificationContextValue | null>(null);

export function Notification({ tone = 'info', variant = 'inline', title, description, children, onDismiss }: NotificationViewProps) {
  const touchStartX = useRef<number | null>(null);
  if (variant === 'inline') {
    return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children ?? <><strong>{title}</strong>{description && <p>{description}</p>}</>}</div>;
  }

  return <div className={`alert-toast alert-toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const endX = event.changedTouches[0]?.clientX; if (touchStartX.current !== null && endX !== undefined && Math.abs(endX - touchStartX.current) > 55) onDismiss?.(); touchStartX.current = null; }} onTouchCancel={() => { touchStartX.current = null; }}>
    <span className="alert-toast-icon" aria-hidden="true">{tone === 'error' ? '!' : tone === 'success' ? '✓' : tone === 'warning' ? '!' : 'i'}</span>
    <div className="alert-toast-copy"><strong>{title}</strong><p>{description}</p></div>
    <button className="alert-toast-close" type="button" aria-label="Đóng thông báo" onClick={onDismiss}>×</button>
  </div>;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<(NotificationOptions & { key: number }) | null>(null);
  const nextKey = useRef(0);
  const showNotification = useCallback((next: NotificationOptions) => setActive({ ...next, key: ++nextKey.current }), []);
  const dismiss = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (!active) return;
    const timeout = window.setTimeout(dismiss, active.tone === 'error' ? 8000 : 5000);
    return () => window.clearTimeout(timeout);
  }, [active, dismiss]);

  return <NotificationContext.Provider value={{ showNotification }}>
    {children}
    {active && <Notification key={active.key} variant="toast" title={active.title} description={active.description} tone={active.tone} onDismiss={dismiss} />}
  </NotificationContext.Provider>;
}

export function useAlertNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useAlertNotification cần được dùng bên trong NotificationProvider.');
  return { showAlert: context.showNotification };
}

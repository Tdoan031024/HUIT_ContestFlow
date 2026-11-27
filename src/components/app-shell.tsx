'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SessionUser } from '@/lib/auth';
import { Icon, type IconName } from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';

const links: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Tổng quan', icon: 'home' },
  { href: '/competitions', label: 'Cuộc thi', icon: 'trophy' },
  { href: '/judges', label: 'Giám khảo', icon: 'users' },
  { href: '/attendance', label: 'Điểm danh', icon: 'calendar' },
  { href: '/judge', label: 'Chấm thi', icon: 'clipboard' },
  { href: '/results', label: 'Kết quả', icon: 'chart' },
];

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [renderPathname, setRenderPathname] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const visibleLinks = links.filter((item) => item.href === '/judge' ? user.systemRole === 'JUDGE' : item.href === '/competitions' || item.href === '/judges' || item.href === '/attendance' ? user.systemRole === 'ADMIN' : true);
  const section = renderPathname === '/competitions/new' ? 'new' : renderPathname.startsWith('/competitions/') ? renderPathname.split('/')[3] ?? 'overview' : '';
  const currentLabel = links.find((item) => item.href === renderPathname)?.label
    ?? (renderPathname.startsWith('/judge/') ? 'Chấm điểm'
      : renderPathname.startsWith('/attendance/') ? 'Chi tiết sự kiện'
      : section ? sectionLabel(section) : 'Tổng quan');
  const isActive = (href: string) => href === '/' ? renderPathname === '/' : renderPathname === href || renderPathname.startsWith(`${href}/`);
  const mobileMode = renderPathname.startsWith('/judge/') ? 'score' : renderPathname.startsWith('/competitions/') && renderPathname !== '/competitions/new' ? 'detail' : 'workspace';

  useEffect(() => { setRenderPathname(pathname); }, [pathname]);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 680px)').matches) return;
    const content = document.getElementById('main-content');
    if (content) content.scrollTop = 0;
  }, [pathname]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        sidebarToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [sidebarOpen]);

  async function logout() {
    if (busy) return;
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className={`app-shell${sidebarOpen ? ' has-sidebar-open' : ''}`} data-mobile-mode={mobileMode}>
      <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
      {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Đóng menu điều hướng" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`} id="app-sidebar">
        <Link className="brand" href="/" aria-label="HUIT ContestFlow trang chủ" onClick={() => setSidebarOpen(false)}>
          <Image className="brand-school-logo" src="/brand/huit-logo.jpg" width={2048} height={2048} alt="HUIT Media" priority />
          <span className="brand-name">ContestFlow</span>
        </Link>
        <button className="sidebar-mobile-close" type="button" aria-label="Đóng menu" onClick={() => { setSidebarOpen(false); sidebarToggleRef.current?.focus(); }}><Icon name="close" size={20} /></button>
        <div className="workspace-caption">{user.systemRole === 'ADMIN' ? 'BAN TỔ CHỨC' : 'HỘI ĐỒNG GIÁM KHẢO'}</div>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {visibleLinks.map((item) => {
            const active = isActive(item.href);
            return <Link key={item.href} className={`nav-link${active ? ' active' : ''}`} href={item.href} title={item.label} aria-current={active ? 'page' : undefined} onClick={() => setSidebarOpen(false)}><span className="nav-icon"><Icon name={item.icon} /></span><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><div className="note-mark" aria-hidden="true"><Icon name="help" size={16} /></div><div><strong>{user.systemRole === 'ADMIN' ? 'Trợ giúp vận hành' : 'Hướng dẫn chấm thi'}</strong><p>{user.systemRole === 'ADMIN' ? 'Thiết lập cuộc thi, quy tắc và phân công.' : 'Chấm theo thứ tự, lưu nháp hoặc nộp phiếu.'}</p></div></div>
        <div className="account-card">
          <span className="user-avatar">{initials(user.fullName)}</span>
          <span className="account-copy"><strong>{user.fullName}</strong><small>{user.systemRole === 'ADMIN' ? 'Quản trị viên' : 'Giám khảo'}</small></span>
          <button className="logout-button" type="button" aria-label="Đăng xuất" title="Đăng xuất" onClick={logout} disabled={busy}><Icon name="logout" /></button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button ref={sidebarToggleRef} className="sidebar-toggle" type="button" aria-label={sidebarOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'} aria-expanded={sidebarOpen} aria-controls="app-sidebar" onClick={() => setSidebarOpen((open) => !open)}><Icon name={sidebarOpen ? 'close' : 'menu'} size={21} /></button>
          <Link className="mobile-media-brand" href="/" aria-label="HUIT Media, về trang tổng quan">
            <Image src="/brand/huit-media-logo.png" width={676} height={187} sizes="124px" alt="HUIT Media" priority />
          </Link>
          <ThemeToggle className="topbar-theme-toggle" />
          <div className="breadcrumbs"><span>HUIT ContestFlow</span><b>/</b><strong>{currentLabel}</strong></div>
          <div className="topbar-right"><span className="live-indicator"><i /> Hệ thống quản lý</span><span className="topbar-role">{user.systemRole === 'ADMIN' ? 'BAN TỔ CHỨC' : 'GIÁM KHẢO'}</span><ThemeToggle /><span className="top-avatar" aria-label={user.fullName}>{initials(user.fullName)}</span><button className="mobile-logout" type="button" aria-label="Đăng xuất" title="Đăng xuất" onClick={logout} disabled={busy}><Icon name="logout" /> <span>Đăng xuất</span></button></div>
        </header>
        <main className="page-content" id="main-content" tabIndex={-1}>{children}</main>
        <footer className="app-footer"><span>© {new Date().getFullYear()} HUIT ContestFlow · Trường Đại học Công Thương TP. Hồ Chí Minh</span><a className="app-media-credit" href="https://huitmedia.edu.vn" target="_blank" rel="noreferrer"><Image src="/brand/huit-media-logo.png" width={676} height={187} sizes="64px" alt="HUIT Media" /><span>Kênh thông tin và truyền thông HUIT</span></a></footer>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('') || 'CF';
}

function sectionLabel(section: string) {
  const labels: Record<string, string> = { new: 'Tạo cuộc thi mới', overview: 'Tổng quan', contestants: 'Thí sinh', judges: 'Giám khảo', rubric: 'Tiêu chí chấm', live: 'Điều phối trực tiếp', scores: 'Phiếu chấm', results: 'Kết quả', activity: 'Nhật ký hoạt động' };
  return labels[section] ?? 'Chi tiết cuộc thi';
}

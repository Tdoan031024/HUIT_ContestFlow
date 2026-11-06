'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { SessionUser } from '@/lib/auth';

const links = [
  { href: '/', label: 'Tổng quan', icon: '⌂' },
  { href: '/competitions', label: 'Cuộc thi', icon: '▦' },
  { href: '/judge', label: 'Khu vực giám khảo', icon: '◉' },
  { href: '/results', label: 'Kết quả', icon: '↗' },
];

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const section = pathname.startsWith('/competitions/') ? pathname.split('/')[3] ?? 'Tổng quan' : '';
  const currentLabel = links.find((item) => item.href === pathname)?.label ?? (section ? sectionLabel(section) : 'Tổng quan');

  async function logout() {
    if (busy) return;
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="HUIT ContestFlow trang chủ">
          <Image className="brand-school-logo" src="/brand/huit-logo.svg" width={1600} height={350} alt="Trường Đại học Công Thương TP. Hồ Chí Minh" priority />
          <span className="brand-name">ContestFlow</span>
        </Link>
        <div className="workspace-caption">QUẢN LÝ CUỘC THI</div>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {links.filter((item) => item.href === '/judge' ? user.systemRole === 'JUDGE' : item.href === '/competitions' ? user.systemRole === 'ADMIN' : true).map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} className={`nav-link${active ? ' active' : ''}`} href={item.href}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.href === '/judge' && <span className="nav-arrow">→</span>}</Link>;
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><div className="note-mark">?</div><div><strong>Hỗ trợ vận hành</strong><p>Quản lý vòng thi và phiếu chấm trong một nơi.</p></div></div>
        <div className="account-card">
          <span className="user-avatar">{initials(user.fullName)}</span>
          <span className="account-copy"><strong>{user.fullName}</strong><small>{user.systemRole === 'ADMIN' ? 'Quản trị viên' : 'Giám khảo'}</small></span>
          <button className="logout-button" type="button" title="Đăng xuất" onClick={logout} disabled={busy}>↪</button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>HUIT ContestFlow</span><b>/</b><strong>{currentLabel}</strong></div>
          <div className="topbar-right"><span className="live-indicator"><i /> Hệ thống quản lý</span><span className="top-avatar">{initials(user.fullName)}</span><button className="mobile-logout" type="button" onClick={logout} disabled={busy}>Đăng xuất</button></div>
        </header>
        <main className="page-content">{children}</main>
        <footer className="app-footer"><span>© {new Date().getFullYear()} HUIT ContestFlow · Trường Đại học Công Thương TP. Hồ Chí Minh</span><a className="app-media-credit" href="https://huitmedia.edu.vn" target="_blank" rel="noreferrer"><Image src="/brand/huit-media-logo.png" width={676} height={187} sizes="64px" alt="HUIT Media" /><span>Kênh thông tin và truyền thông HUIT</span></a></footer>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('') || 'CF';
}

function sectionLabel(section: string) {
  const labels: Record<string, string> = { contestants: 'Thí sinh', judges: 'Giám khảo', rubric: 'Tiêu chí chấm', live: 'Điều phối trực tiếp', scores: 'Phiếu chấm', results: 'Kết quả', activity: 'Nhật ký hoạt động' };
  return labels[section] ?? 'Chi tiết cuộc thi';
}

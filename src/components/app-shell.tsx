'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { SessionUser } from '@/lib/auth';
import { Icon, type IconName } from '@/components/icons';

const links: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Tổng quan', icon: 'home' },
  { href: '/competitions', label: 'Cuộc thi', icon: 'trophy' },
  { href: '/judge', label: 'Chấm thi', icon: 'clipboard' },
  { href: '/results', label: 'Kết quả', icon: 'chart' },
];

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const visibleLinks = links.filter((item) => item.href === '/judge' ? user.systemRole === 'JUDGE' : item.href === '/competitions' ? user.systemRole === 'ADMIN' : true);
  const section = pathname === '/competitions/new' ? 'new' : pathname.startsWith('/competitions/') ? pathname.split('/')[3] ?? 'overview' : '';
  const currentLabel = links.find((item) => item.href === pathname)?.label ?? (pathname.startsWith('/judge/') ? 'Chấm điểm' : section ? sectionLabel(section) : 'Tổng quan');
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    if (busy) return;
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="HUIT ContestFlow trang chủ">
          <span className="brand-mini-mark" aria-hidden="true">CF</span>
          <Image className="brand-school-logo" src="/brand/huit-logo.svg" width={1600} height={350} alt="Trường Đại học Công Thương TP. Hồ Chí Minh" priority />
          <span className="brand-name">ContestFlow</span>
        </Link>
        <div className="workspace-caption">{user.systemRole === 'ADMIN' ? 'BAN TỔ CHỨC' : 'HỘI ĐỒNG GIÁM KHẢO'}</div>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {visibleLinks.map((item) => {
            const active = isActive(item.href);
            return <Link key={item.href} className={`nav-link${active ? ' active' : ''}`} href={item.href} title={item.label} aria-current={active ? 'page' : undefined}><span className="nav-icon"><Icon name={item.icon} /></span><span>{item.label}</span></Link>;
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
          <Link className="mobile-brand" href="/" aria-label="HUIT ContestFlow, trang chủ">
            <span className="mobile-brand-mark" aria-hidden="true">CF</span>
            <span>ContestFlow</span>
          </Link>
          <div className="breadcrumbs"><span>HUIT ContestFlow</span><b>/</b><strong>{currentLabel}</strong></div>
          <div className="topbar-right"><span className="live-indicator"><i /> Hệ thống quản lý</span><span className="topbar-role">{user.systemRole === 'ADMIN' ? 'BAN TỔ CHỨC' : 'GIÁM KHẢO'}</span><span className="top-avatar" aria-label={user.fullName}>{initials(user.fullName)}</span><button className="mobile-logout" type="button" onClick={logout} disabled={busy}><Icon name="logout" /> <span>Đăng xuất</span></button></div>
        </header>
        <main className="page-content" id="main-content" tabIndex={-1}>{children}</main>
        <footer className="app-footer"><span>© {new Date().getFullYear()} HUIT ContestFlow · Trường Đại học Công Thương TP. Hồ Chí Minh</span><a className="app-media-credit" href="https://huitmedia.edu.vn" target="_blank" rel="noreferrer"><Image src="/brand/huit-media-logo.png" width={676} height={187} sizes="64px" alt="HUIT Media" /><span>Kênh thông tin và truyền thông HUIT</span></a></footer>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Điều hướng chính trên điện thoại">
        {visibleLinks.map((item) => {
          const active = isActive(item.href);
          return <Link key={item.href} className={`mobile-nav-link${active ? ' active' : ''}`} href={item.href} aria-current={active ? 'page' : undefined}>
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>;
        })}
      </nav>
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

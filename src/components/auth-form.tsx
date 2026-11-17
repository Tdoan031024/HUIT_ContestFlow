'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { Notice } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';

export function AuthForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const payload = { ...values, rememberMe: form.get('rememberMe') === 'on' };
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể thực hiện thao tác.');
      const destination = data.user?.systemRole === 'JUDGE' ? '/judge' : '/';
      router.replace(destination);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể kết nối máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <ThemeToggle className="auth-theme-toggle" />
      <div className="auth-shell">
        <section className="auth-brand-panel" aria-label="Giới thiệu HUIT ContestFlow">
          <div className="auth-brand" aria-label="HUIT ContestFlow">
            <Image className="auth-university-logo" src="/brand/huit-logo.svg" width={1600} height={350} alt="Trường Đại học Công Thương Thành phố Hồ Chí Minh (HUIT)" priority />
            <span className="auth-brand-divider" aria-hidden="true" />
            <span className="auth-brand-copy"><strong>HUIT ContestFlow</strong><small>Quản lý cuộc thi</small></span>
          </div>

          <div className="auth-brand-body">
            <div className="auth-brand-copy-block">
              <p className="auth-kicker">Hệ thống quản lý cuộc thi</p>
              <h1>Quản lý cuộc thi<br /><em>và chấm điểm.</em></h1>
              <p>Admin quản lý cuộc thi. Giám khảo chấm và nộp phiếu theo phân công.</p>
            </div>
            <AuthProductPreview />
          </div>
          <footer className="auth-brand-footer"><span>Trường Đại học Công Thương TP. Hồ Chí Minh</span></footer>
        </section>

        <section className="auth-form-panel">
          <div className="auth-card">
            <div className="auth-step-label">Chào mừng trở lại</div>
            <h2>Đăng nhập</h2>
            <p className="auth-description">Dành cho Admin và Giám khảo.</p>
            {error && <Notice tone="error">{error}</Notice>}
            <form className="auth-form" onSubmit={submit}>
              <label className="auth-field"><span>Tên đăng nhập hoặc email</span><div className="auth-input-wrap"><AuthIcon name="user" /><input name="identifier" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Tên đăng nhập / email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></div></label>
              <div className="auth-field"><label htmlFor="auth-password">Mật khẩu</label><div className="auth-input-wrap"><AuthIcon name="lock" /><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} required maxLength={128} autoComplete="current-password" placeholder="Nhập mật khẩu" /><button className="password-toggle" type="button" aria-pressed={showPassword} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div></div>
              <div className="auth-remember-row"><label className="auth-remember"><input name="rememberMe" type="checkbox" /><span>Giữ đăng nhập trong 30 ngày</span></label><Link className="auth-recovery-link" href="/forgot-password" onClick={() => { const account = identifier.trim(); if (account) sessionStorage.setItem('hcf-recovery-identifier', account); else sessionStorage.removeItem('hcf-recovery-identifier'); }}>Lấy lại mật khẩu</Link></div>
              <div className="auth-form-hint"><span className="auth-hint-dot" /> Tài khoản Giám khảo do Ban tổ chức cấp.</div>
              <button className="auth-submit" type="submit" disabled={busy}><span>{busy ? 'Đang xử lý…' : 'Đăng nhập'}</span><span className="auth-submit-arrow">→</span></button>
            </form>
          </div>
          <footer className="auth-panel-footer"><a href="https://huitmedia.edu.vn" target="_blank" rel="noreferrer" aria-label="HUIT Media"><Image src="/brand/huit-media-logo.png" width={676} height={187} sizes="108px" alt="HUIT Media" /></a></footer>
        </section>
      </div>
    </main>
  );
}

function AuthProductPreview() {
  return (
    <div className="auth-product-preview" aria-hidden="true">
      <div className="preview-window-head">
        <span className="preview-app-name">HUIT ContestFlow</span>
        <span className="preview-head-divider" />
        <span>Giám khảo</span>
      </div>
      <div className="preview-score-form">
        <div className="preview-form-heading">
          <strong>Phiếu chấm</strong>
          <span>Chấm độc lập theo tiêu chí</span>
        </div>
        <div className="preview-criterion-row">
          <div className="preview-criterion-name"><span>Tiêu chí</span><i /><i /></div>
          <div className="preview-score-field"><span>Điểm</span><i /></div>
        </div>
        <div className="preview-comment-field"><span>Nhận xét</span><i /><i /></div>
        <div className="preview-form-actions"><span>Lưu bản nháp</span><strong>Nộp phiếu chấm</strong></div>
      </div>
    </div>
  );
}

function AuthIcon({ name }: { name: 'user' | 'lock' }) {
  const paths = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" /></>,
  };
  return <svg className="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

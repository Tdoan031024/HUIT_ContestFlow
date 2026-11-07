'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState, type FormEvent } from 'react';
import { Notice } from '@/components/ui';

type Mode = 'login' | 'setup';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetch('/api/auth/status', { cache: 'no-store' }).then(async (response) => {
      const data = await response.json();
      if (response.ok) setSetupRequired(data.setupRequired);
      else setError(data.error || 'Không thể kiểm tra trạng thái hệ thống.');
    }).catch(() => setError('Không thể kết nối máy chủ.'));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const payload = isSetup ? values : { ...values, rememberMe: form.get('rememberMe') === 'on' };
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/setup', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể thực hiện thao tác.');
      router.replace('/');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể kết nối máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  const isSetup = mode === 'setup';
  return (
    <main className="auth-page">
      <div className={`auth-shell${isSetup ? ' is-setup' : ''}`}>
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
              <p>Admin điều phối vòng thi. Giám khảo chấm, lưu và nộp phiếu theo phân công.</p>
            </div>
            <AuthProductPreview />
          </div>
          <footer className="auth-brand-footer"><span>Trường Đại học Công Thương TP. Hồ Chí Minh</span></footer>
        </section>

        <section className="auth-form-panel">
          {isSetup && <div className="auth-form-top">Thiết lập hệ thống</div>}
          <div className="auth-card">
            <div className="auth-step-label">{isSetup ? 'Tạo tài khoản quản trị đầu tiên' : 'Chào mừng trở lại'}</div>
            <h2>{isSetup ? 'Khởi tạo tài khoản Admin' : 'Đăng nhập'}</h2>
            <p className="auth-description">{isSetup ? 'Tạo tài khoản quản trị đầu tiên để thiết lập cuộc thi.' : 'Dành cho Admin và Giám khảo.'}</p>
            {error && <Notice tone="error">{error}</Notice>}
            {isSetup && setupRequired === false && <Notice tone="warning">Hệ thống đã có Admin. Hãy đăng nhập bằng tài khoản hiện có.</Notice>}
            <form className="auth-form" onSubmit={submit}>
              {isSetup && <label className="auth-field"><span>Mã khởi tạo Admin</span><div className="auth-input-wrap"><AuthIcon name="key" /><input name="setupKey" type="password" autoComplete="off" required placeholder="Nhập mã từ cấu hình máy chủ" /></div></label>}
              {isSetup && <label className="auth-field"><span>Họ và tên</span><div className="auth-input-wrap"><AuthIcon name="user" /><input name="fullName" required minLength={2} maxLength={160} autoComplete="name" placeholder="Nhập họ và tên" /></div></label>}
              <label className="auth-field"><span>{isSetup ? 'Email' : 'Tên đăng nhập hoặc email'}</span><div className="auth-input-wrap"><AuthIcon name={isSetup ? 'mail' : 'user'} /><input name={isSetup ? 'email' : 'identifier'} type={isSetup ? 'email' : 'text'} required autoComplete={isSetup ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} placeholder={isSetup ? 'ten@huit.edu.vn' : 'Nhập tên đăng nhập hoặc email'} /></div></label>
              <label className="auth-field"><span>Mật khẩu</span><div className="auth-input-wrap"><AuthIcon name="lock" /><input name="password" type={showPassword ? 'text' : 'password'} required minLength={isSetup ? 12 : 1} maxLength={128} autoComplete={isSetup ? 'new-password' : 'current-password'} placeholder={isSetup ? 'Tối thiểu 12 ký tự' : 'Nhập mật khẩu'} /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div></label>
              {!isSetup && <label className="auth-remember"><input name="rememberMe" type="checkbox" /><span>Giữ đăng nhập trong 30 ngày</span></label>}
              {!isSetup && <div className="auth-form-hint"><span className="auth-hint-dot" /> Tài khoản Giám khảo do Ban tổ chức cấp.</div>}
              {isSetup && <div className="auth-form-hint"><span className="auth-hint-dot" /> Mã khởi tạo chỉ sử dụng một lần.</div>}
              <button className="auth-submit" type="submit" disabled={busy || (isSetup && setupRequired === false)}><span>{busy ? 'Đang xử lý…' : isSetup ? 'Tạo Admin và tiếp tục' : 'Đăng nhập'}</span><span className="auth-submit-arrow">→</span></button>
            </form>
            {isSetup && <div className="auth-switch-row"><span>Đã có tài khoản?</span><Link href="/login">Đăng nhập <b>→</b></Link></div>}
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

function AuthIcon({ name }: { name: 'key' | 'user' | 'mail' | 'lock' }) {
  const paths = {
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" /></>,
  };
  return <svg className="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

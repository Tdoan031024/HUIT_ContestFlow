'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Notice } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';

export function PasswordRecoveryForm({ mode }: { mode: 'request' | 'reset' }) {
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'reset') setToken(new URLSearchParams(window.location.search).get('token') ?? '');
    else setIdentifier(window.sessionStorage.getItem('hcf-recovery-identifier')?.trim() ?? '');
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSentTo('');
    if (mode === 'reset' && password !== confirmation) {
      setError('Hai lần nhập mật khẩu chưa khớp. Vui lòng kiểm tra lại.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode === 'request' ? 'forgot-password' : 'reset-password'}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'request' ? { identifier } : { token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chưa thể thực hiện yêu cầu. Vui lòng thử lại.');
      setMessage(data.message || 'Yêu cầu đã được ghi nhận.');
      if (mode === 'request' && typeof data.sentTo === 'string') setSentTo(data.sentTo);
      if (mode === 'request') window.sessionStorage.removeItem('hcf-recovery-identifier');
      if (mode === 'reset') {
        setPassword('');
        setConfirmation('');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === 'request' ? 'Khôi phục mật khẩu' : 'Tạo mật khẩu mới';

  return (
    <main className="auth-page auth-recovery-page">
      <ThemeToggle className="auth-theme-toggle" />
      <section className="auth-recovery-card" aria-labelledby="recovery-heading">
        <Link className="auth-recovery-back" href="/login">← <span>Quay lại đăng nhập</span></Link>
        <Image className="auth-recovery-logo" src="/brand/huit-media-logo.png" width={676} height={187} alt="HUIT Media" priority />
        <div className="auth-step-label">HUIT ContestFlow</div>
        <h1 id="recovery-heading">{heading}</h1>
        <p className="auth-recovery-description">
          {mode === 'request'
            ? 'Hướng dẫn sẽ được gửi đến email đã liên kết với tài khoản của bạn.'
            : 'Liên kết chỉ dùng một lần và có hiệu lực trong 30 phút.'}
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}

        {!(mode === 'request' && message) && !(mode === 'reset' && message) && (
          <form className="auth-recovery-form" onSubmit={submit}>
            {mode === 'request' ? (
              identifier ? <div className="auth-recovery-account"><span>Tài khoản</span><strong>{identifier}</strong></div> : <Notice tone="info">Hãy nhập tên đăng nhập hoặc email tại trang Đăng nhập trước khi yêu cầu khôi phục.</Notice>
            ) : (
              <>
                {!token && <Notice tone="error">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.</Notice>}
                <label className="auth-field"><span>Mật khẩu mới</span><input className="auth-recovery-input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={!token} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ít nhất 8 ký tự" /></label>
                <label className="auth-field"><span>Nhập lại mật khẩu</span><input className="auth-recovery-input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={!token} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Nhập lại mật khẩu mới" /></label>
              </>
            )}
            <button className="auth-submit" type="submit" disabled={busy || (mode === 'request' && !identifier) || (mode === 'reset' && !token)}><span>{busy ? 'Đang xử lý…' : mode === 'request' ? 'Gửi liên kết khôi phục' : 'Cập nhật mật khẩu'}</span><span className="auth-submit-arrow" aria-hidden="true">→</span></button>
          </form>
        )}
        {mode === 'request' && message && <p className="auth-recovery-footnote">Nếu chưa thấy email sau vài phút, hãy kiểm tra thư mục thư rác hoặc liên hệ Ban tổ chức.</p>}
        {mode === 'request' && sentTo && <div className="auth-recovery-destination"><span>Email nhận hướng dẫn</span><strong>{sentTo}</strong></div>}
        {mode === 'reset' && message && <Link className="button primary-button auth-recovery-login" href="/login">Đăng nhập</Link>}
      </section>
    </main>
  );
}

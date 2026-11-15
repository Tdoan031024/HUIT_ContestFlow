'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Dialog, EmptyState, Loading, Notice, PageHeader, SectionCard, StatusPill, formatDate, useConfirmDialog } from '@/components/ui';
import { Icon } from '@/components/icons';

type Judge = {
  id: string;
  fullName: string;
  username: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { assignments: number; scoreSheets: number; memberships: number };
};
type JudgeDetail = Omit<Judge, '_count'> & { _count: Judge['_count']; competitions: { id: string; name: string }[] };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    ...(init?.body ? { headers: { 'content-type': 'application/json', ...init.headers } } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Không thể hoàn tất thao tác.');
  return body as T;
}

export function JudgeDirectory() {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const [judges, setJudges] = useState<Judge[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [viewingJudge, setViewingJudge] = useState<JudgeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [editingJudge, setEditingJudge] = useState<Judge | null>(null);
  const [editError, setEditError] = useState('');

  async function load() {
    setError('');
    try { const result = await request<{ judges: Judge[] }>('/api/judges'); setJudges(result.judges); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được danh sách giám khảo.'); }
  }

  useEffect(() => { void load(); }, []);

  async function createJudge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const identifier = String(values.get('identifier') ?? '').trim();
    setBusy(true); setError(''); setCreateError(''); setNotice('');
    try {
      await request('/api/judges', {
        method: 'POST',
        body: JSON.stringify({
          fullName: values.get('fullName'),
          ...(identifier.includes('@') ? { email: identifier } : { username: identifier }),
          password: values.get('password'),
        }),
      });
      form.reset();
      setShowCreate(false);
      setNotice('Đã tạo tài khoản giám khảo. Tài khoản này có thể được phân công vào các cuộc thi.');
      await load();
    } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Không thể tạo tài khoản.'); }
    finally { setBusy(false); }
  }

  async function viewJudge(judge: Judge) {
    setViewingJudge({ ...judge, competitions: [] });
    setDetailLoading(true); setDetailError('');
    try {
      const result = await request<{ judge: JudgeDetail }>(`/api/judges/${judge.id}`);
      setViewingJudge(result.judge);
    } catch (reason) { setDetailError(reason instanceof Error ? reason.message : 'Không tải được thông tin giám khảo.'); }
    finally { setDetailLoading(false); }
  }

  async function updateJudge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingJudge) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    setBusy(true); setEditError(''); setError(''); setNotice('');
    try {
      await request(`/api/judges/${editingJudge.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: form.get('fullName'), identifier: form.get('identifier'), ...(password ? { password } : {}) }),
      });
      setEditingJudge(null);
      setNotice('Đã cập nhật tài khoản giám khảo.');
      await load();
    } catch (reason) { setEditError(reason instanceof Error ? reason.message : 'Không thể cập nhật tài khoản.'); }
    finally { setBusy(false); }
  }

  async function changeJudgeAvailability(judge: Judge) {
    const hasHistory = judge._count.assignments > 0 || judge._count.scoreSheets > 0 || judge._count.memberships > 0;
    const nextActive = !judge.isActive;
    const accepted = await confirm({
      title: nextActive ? 'Kích hoạt lại tài khoản?' : hasHistory ? 'Ngừng hoạt động tài khoản?' : 'Xóa tài khoản giám khảo?',
      description: nextActive
        ? `Cho phép ${judge.fullName} đăng nhập và tiếp tục được phân công.`
        : hasHistory
          ? `${judge.fullName} có dữ liệu phân công hoặc chấm thi. Tài khoản sẽ bị khóa đăng nhập; lịch sử được giữ nguyên.`
          : `Xóa vĩnh viễn tài khoản của ${judge.fullName}? Tài khoản này chưa có lịch sử phân công hoặc chấm thi.`,
      confirmLabel: nextActive ? 'Kích hoạt' : hasHistory ? 'Ngừng hoạt động' : 'Xóa tài khoản',
      danger: !nextActive,
    });
    if (!accepted) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (hasHistory) {
        await request(`/api/judges/${judge.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: nextActive }) });
        setNotice(nextActive ? `Đã kích hoạt lại ${judge.fullName}.` : `Đã ngừng hoạt động ${judge.fullName}; lịch sử được giữ nguyên.`);
      } else {
        await request(`/api/judges/${judge.id}`, { method: 'DELETE' });
        setNotice(`Đã xóa tài khoản ${judge.fullName}.`);
      }
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật tài khoản.'); }
    finally { setBusy(false); }
  }

  const filteredJudges = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    return (judges ?? []).filter((judge) => !normalized || [judge.fullName, judge.username, judge.email].some((value) => value?.toLocaleLowerCase('vi').includes(normalized)));
  }, [judges, query]);

  return <div className="page-section judge-directory-page">
    <PageHeader eyebrow="TỔ CHỨC" title="Danh sách giám khảo" description="Tài khoản dùng chung, có thể phân công vào nhiều cuộc thi." action={<button className="button primary-button" type="button" onClick={() => { setCreateError(''); setShowCreate(true); }}>＋ Thêm giám khảo</button>} />
    {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}
    <div className="judge-directory-layout">
      <SectionCard title="Tài khoản giám khảo" subtitle="Mỗi người chỉ cần một tài khoản cho toàn hệ thống.">
        <label className="judge-directory-search"><Icon name="search" size={18} /><input className="field-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên, username hoặc email" aria-label="Tìm giám khảo" /></label>
        {!judges ? <Loading label="Đang tải danh sách giám khảo…" /> : filteredJudges.length ? <div className="judge-directory-list">
          {filteredJudges.map((judge) => <article className="judge-directory-item" key={judge.id}>
            <div className="judge-directory-avatar" aria-hidden="true">{judge.fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('')}</div>
            <div className="judge-directory-copy"><strong>{judge.fullName}</strong><span>{judge.email ?? judge.username ?? 'Chưa có thông tin đăng nhập'}</span></div>
            <div className="judge-directory-tools"><StatusPill value={judge.isActive ? 'ACTIVE' : 'LOCKED'} /><details className="judge-directory-menu"><summary aria-label={`Thao tác với ${judge.fullName}`} title="Thao tác">⋯</summary><div className="judge-directory-menu-popover"><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void viewJudge(judge); }}>Xem chi tiết</button><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditError(''); setEditingJudge(judge); }}>Sửa tài khoản</button><span className="judge-directory-menu-divider" /><button className={judge._count.assignments || judge._count.scoreSheets || judge._count.memberships ? '' : 'is-danger'} type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void changeJudgeAvailability(judge); }}>{judge._count.assignments || judge._count.scoreSheets || judge._count.memberships ? judge.isActive ? 'Ngừng hoạt động' : 'Kích hoạt lại' : 'Xóa tài khoản'}</button></div></details></div>
            <small>{judge._count.assignments} lượt phân công</small>
          </article>)}
        </div> : <EmptyState title={query ? 'Không tìm thấy giám khảo' : 'Chưa có tài khoản giám khảo'} description={query ? 'Thử tên hoặc thông tin đăng nhập khác.' : 'Thêm tài khoản giám khảo để có thể phân công vào cuộc thi.'} action={!query ? <button className="button secondary-button" type="button" onClick={() => { setCreateError(''); setShowCreate(true); }}>＋ Thêm giám khảo</button> : undefined} />}
      </SectionCard>
    </div>
    <Dialog open={showCreate} title="Thêm giám khảo" description="Tạo tài khoản dùng chung, sau đó chọn người này trong trang Giám khảo của cuộc thi." onClose={() => setShowCreate(false)} className="judge-create-dialog">
      {createError && <Notice tone="error">{createError}</Notice>}
        <form className="form-stack" onSubmit={createJudge}>
          <label className="field-label">Họ và tên *<input className="field-input" name="fullName" required minLength={2} maxLength={160} autoComplete="name" placeholder="Nguyễn Văn A" /></label>
          <label className="field-label">Username hoặc email đăng nhập *<input className="field-input" name="identifier" required minLength={3} maxLength={255} autoComplete="username" placeholder="nguyenvana hoặc email@huit.edu.vn" /></label>
          <label className="field-label">Mật khẩu ban đầu *<input className="field-input" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
          <p className="field-help">Mật khẩu cần ít nhất 8 ký tự. Gửi thông tin đăng nhập trực tiếp cho giám khảo.</p>
          <div className="form-actions"><button className="button secondary-button" type="button" disabled={busy} onClick={() => setShowCreate(false)}>Hủy</button><button className="button primary-button" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button></div>
        </form>
    </Dialog>
    <Dialog open={Boolean(viewingJudge)} title="Thông tin giám khảo" description="Tài khoản dùng chung trong hệ thống ContestFlow." onClose={() => { setViewingJudge(null); setDetailError(''); }} className="judge-detail-dialog">
      {detailError && <Notice tone="error">{detailError}</Notice>}
      {detailLoading ? <Loading label="Đang tải thông tin giám khảo…" /> : viewingJudge && <div className="judge-detail-content">
        <div className="judge-detail-person"><div className="judge-directory-avatar" aria-hidden="true">{viewingJudge.fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('')}</div><div><strong>{viewingJudge.fullName}</strong><span>{viewingJudge.email ?? viewingJudge.username ?? 'Chưa có thông tin đăng nhập'}</span></div><StatusPill value={viewingJudge.isActive ? 'ACTIVE' : 'LOCKED'} /></div>
        <div className="judge-detail-facts"><div><span>Lượt phân công</span><strong>{viewingJudge._count.assignments}</strong></div><div><span>Phiếu chấm</span><strong>{viewingJudge._count.scoreSheets}</strong></div><div><span>Tạo tài khoản</span><strong>{formatDate(viewingJudge.createdAt)}</strong></div></div>
        <section className="judge-detail-competitions"><h3>Cuộc thi được phân công</h3>{viewingJudge.competitions.length ? <ul>{viewingJudge.competitions.map((competition) => <li key={competition.id}>{competition.name}</li>)}</ul> : <p>Chưa được phân công vào cuộc thi nào.</p>}</section>
      </div>}
    </Dialog>
    <Dialog open={Boolean(editingJudge)} title="Sửa tài khoản giám khảo" description="Cập nhật thông tin đăng nhập và hồ sơ." onClose={() => { setEditingJudge(null); setEditError(''); }} className="judge-edit-dialog">
      {editingJudge && <>{editError && <Notice tone="error">{editError}</Notice>}<form className="form-stack" onSubmit={updateJudge} key={editingJudge.id}>
        <label className="field-label">Họ và tên *<input className="field-input" name="fullName" required minLength={2} maxLength={160} defaultValue={editingJudge.fullName} autoComplete="name" /></label>
        <label className="field-label">Username hoặc email đăng nhập *<input className="field-input" name="identifier" required minLength={3} maxLength={255} defaultValue={editingJudge.email ?? editingJudge.username ?? ''} autoComplete="username" /></label>
        <label className="field-label">Mật khẩu mới<input className="field-input" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" placeholder="Để trống nếu không đổi" /></label>
        <p className="field-help">Mật khẩu mới cần ít nhất 8 ký tự. Khi đổi mật khẩu, các phiên đăng nhập cũ sẽ bị thu hồi.</p>
        <div className="form-actions"><button className="button secondary-button" type="button" disabled={busy} onClick={() => { setEditingJudge(null); setEditError(''); }}>Hủy</button><button className="button primary-button" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
      </form></>}
    </Dialog>
    {confirmationDialog}
  </div>;
}

import { useState, type ReactNode } from 'react';
import { ApiProblem, api, fmtDateTime, type AdminUser } from '@vala/ui/api';
import { useAdminEnv } from './env';
import { useAsync } from '@vala/ui/hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '@vala/ui/TableTools';
import { Empty, ErrorBox, Loading } from '@vala/ui/States';
import { Badge, Banner, Button, Field, Input, Menu, Muted, PageTitle, Select, Table, Td, Th } from '@vala/ui/ui';

import { messages, tr, useT } from '@vala/ui/i18n';

const M = messages({
  error: 'Lỗi',
  filter: { '': 'Tất cả', active: 'Đang hoạt động', admin: 'Quản trị', locked: 'Đang tạm khoá', inactive: 'Đã vô hiệu hoá' },
  title: 'Người dùng',
  summary: (active: number, admins: number) => `${active} tài khoản đang hoạt động · ${admins} quản trị`,
  subtitle: 'Tài khoản đăng nhập cổng Vala.',
  search: 'Tìm theo tên, tên đăng nhập, email…', filterStatus: 'Lọc trạng thái', addUser: 'Thêm người dùng',
  empty: 'Chưa có người dùng nào.', currentFilter: 'bộ lọc hiện tại',
  thUser: 'Người dùng', thRole: 'Vai trò', thStatus: 'Trạng thái', thConns: 'Kết nối nguồn', thSchedules: 'Lịch đang bật', thLastLogin: 'Đăng nhập gần nhất',
  you: '(bạn)', admin: 'Quản trị', user: 'Người dùng',
  deactivated: 'Đã vô hiệu hoá', locked: 'Tạm khoá', active: 'Hoạt động', mustChange: 'Phải đổi mật khẩu', ssoOnly: 'Chỉ đăng nhập SSO',
  edit: 'Sửa', resetPassword: 'Đặt lại mật khẩu', moreFor: (name: string) => `Thêm thao tác cho ${name}`,
  unlock: 'Mở khoá đăng nhập', unlocked: (name: string) => `Đã mở khoá ${name}.`,
  deactivate: 'Vô hiệu hoá tài khoản',
  confirmDeactivate: (name: string) => `Vô hiệu hoá ${name}?\n\nNgười này bị đăng xuất ngay, không đăng nhập được nữa, Vala Desktop ngừng gửi phiên và lịch chạy ngừng. Dữ liệu đã lấy về vẫn giữ. Có thể kích hoạt lại.`,
  deactivatedMsg: (name: string) => `Đã vô hiệu hoá ${name}.`,
  reactivate: 'Kích hoạt lại', reactivatedMsg: (name: string) => `Đã kích hoạt lại ${name}.`,
  unit: 'người dùng',
  tempPassword: 'Mật khẩu tạm (người dùng phải đổi khi đăng nhập lần đầu)', generate: 'Tạo ngẫu nhiên', copied: 'Đã chép', copy: 'Chép',
  created: (u: string) => `Đã tạo tài khoản ${u}. Gửi mật khẩu tạm cho người dùng — họ sẽ phải đổi khi đăng nhập lần đầu.`,
  saved: (name: string) => `Đã lưu ${name}.`,
  editTitle: (name: string) => `Sửa ${name}`, newSub: 'Tài khoản đăng nhập cổng bằng tên đăng nhập + mật khẩu.',
  username: 'Tên đăng nhập (chữ thường, số, . _ -)', usernamePh: 'vd nguyenvana', fullName: 'Họ tên', email: 'Email',
  adminRight: 'Quyền quản trị', adminHint: '— cấu hình hệ thống nguồn, báo cáo, script crawl, người dùng.', noSelfDemote: ' Không tự bỏ quyền của chính mình.',
  cancel: 'Huỷ', saving: 'Đang lưu…', create: 'Tạo tài khoản', save: 'Lưu',
  resetDone: (name: string) => `Đã đặt mật khẩu tạm cho ${name} và mở khoá tài khoản. Họ sẽ phải đổi mật khẩu khi đăng nhập.`,
  resetTitle: (name: string) => `Đặt lại mật khẩu — ${name}`,
  resetSub: 'Chép mật khẩu tạm và gửi cho người dùng qua kênh riêng. Hệ thống không hiện lại mật khẩu này.',
  setPassword: 'Đặt mật khẩu',
}, {
  error: 'Error',
  filter: { '': 'All', active: 'Active', admin: 'Admins', locked: 'Temporarily locked', inactive: 'Deactivated' },
  title: 'Users',
  summary: (active: number, admins: number) => `${active} active account(s) · ${admins} admin(s)`,
  subtitle: 'Accounts that sign in to the Vala portal.',
  search: 'Search by name, username, email…', filterStatus: 'Filter by status', addUser: 'Add user',
  empty: 'No users yet.', currentFilter: 'current filter',
  thUser: 'User', thRole: 'Role', thStatus: 'Status', thConns: 'Source connections', thSchedules: 'Active schedules', thLastLogin: 'Last sign-in',
  you: '(you)', admin: 'Admin', user: 'User',
  deactivated: 'Deactivated', locked: 'Locked', active: 'Active', mustChange: 'Must change password', ssoOnly: 'SSO sign-in only',
  edit: 'Edit', resetPassword: 'Reset password', moreFor: (name: string) => `More actions for ${name}`,
  unlock: 'Unlock sign-in', unlocked: (name: string) => `${name} unlocked.`,
  deactivate: 'Deactivate account',
  confirmDeactivate: (name: string) => `Deactivate ${name}?\n\nThey will be signed out immediately and can no longer sign in; Vala Desktop stops sending sessions and their schedules stop. Data already fetched is kept. You can reactivate the account later.`,
  deactivatedMsg: (name: string) => `${name} deactivated.`,
  reactivate: 'Reactivate', reactivatedMsg: (name: string) => `${name} reactivated.`,
  unit: 'users',
  tempPassword: 'Temporary password (the user must change it at first sign-in)', generate: 'Generate', copied: 'Copied', copy: 'Copy',
  created: (u: string) => `Account ${u} created. Send the temporary password to the user — they will have to change it at first sign-in.`,
  saved: (name: string) => `${name} saved.`,
  editTitle: (name: string) => `Edit ${name}`, newSub: 'Portal account that signs in with username + password.',
  username: 'Username (lowercase letters, digits, . _ -)', usernamePh: 'e.g. jsmith', fullName: 'Full name', email: 'Email',
  adminRight: 'Admin rights', adminHint: '— configure source systems, reports, crawl scripts, users.', noSelfDemote: ' You cannot remove your own admin rights.',
  cancel: 'Cancel', saving: 'Saving…', create: 'Create account', save: 'Save',
  resetDone: (name: string) => `Temporary password set for ${name} and the account unlocked. They will have to change the password at sign-in.`,
  resetTitle: (name: string) => `Reset password — ${name}`,
  resetSub: 'Copy the temporary password and send it to the user through a private channel. The system will not show this password again.',
  setPassword: 'Set password',
});

const ERR = (e: unknown) => (e instanceof ApiProblem ? `${e.title}${e.detail ? ` — ${e.detail}` : ''}` : tr(M).error);
type Filter = '' | 'active' | 'admin' | 'inactive' | 'locked';
const FILTERS: Filter[] = ['', 'active', 'admin', 'locked', 'inactive'];

/** Mật khẩu tạm ngẫu nhiên: 12 ký tự, bỏ ký tự dễ nhầm (0/O, 1/l/I), luôn có chữ và số. */
function randomPassword(): string {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  const out = Array.from(buf, (n) => all[n % all.length]!);
  out[buf[0]! % 12] = letters[buf[1]! % letters.length]!;
  out[(buf[0]! + 5) % 12] = digits[buf[2]! % digits.length]!;
  return out.join('');
}

/**
 * Quản trị — Người dùng cổng: thêm tài khoản, sửa thông tin, cấp/bỏ quyền quản trị, đặt lại mật khẩu, mở khoá,
 * vô hiệu hoá / kích hoạt. Không xoá hẳn (dữ liệu và nhật ký tham chiếu tới người dùng). Phòng ban chưa quản lý ở đây.
 */
export function AdminUsersPage() {
  const t = useT(M);
  const { me } = useAdminEnv();
  const list = useAsync(() => api.get<AdminUser[]>('/admin/users'), []);
  const [filter, setFilter] = useState<Filter>('');
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const rows = (list.data ?? []).filter((u) => !filter
    || (filter === 'active' && u.is_active) || (filter === 'admin' && u.is_ops_admin && u.is_active)
    || (filter === 'inactive' && !u.is_active) || (filter === 'locked' && u.locked));
  const tv = useTableView(rows, (u) => `${u.ho_ten} ${u.username ?? ''} ${u.email}`);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setNote(null);
    try { await fn(); setNote({ tone: 'ok', text: msg }); list.reload(); } catch (e) { setNote({ tone: 'err', text: ERR(e) }); }
  };
  const active = (list.data ?? []).filter((u) => u.is_active).length;

  return (
    <>
      <PageTitle title={t.title}
        subtitle={list.data ? t.summary(active, (list.data ?? []).filter((u) => u.is_ops_admin && u.is_active).length) : t.subtitle} />
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder={t.search} />
        <Select aria-label={t.filterStatus} value={filter} onChange={(e) => { setFilter(e.target.value as Filter); tv.setPage(1); }}>
          {FILTERS.map((v) => <option key={v} value={v}>{t.filter[v]}</option>)}
        </Select>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setEditing('new'); setNote(null); }}>{t.addUser}</Button>
      </div>
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>{t.empty}</Empty>}
      {!!list.data?.length && !tv.total && <NoMatch q={tv.q || t.currentFilter} onClear={() => { tv.setQ(''); setFilter(''); }} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>{t.thUser}</Th><Th>{t.thRole}</Th><Th>{t.thStatus}</Th><Th num>{t.thConns}</Th><Th num>{t.thSchedules}</Th><Th num>{t.thLastLogin}</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className={u.is_active ? '' : '[&>td:not(:last-child)]:opacity-60'}>
                  <Td>
                    <div className="font-medium">{u.ho_ten}{self && <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">{t.you}</span>}</div>
                    <Muted className="text-xs">{u.username ? `@${u.username} · ` : ''}{u.email}</Muted>
                  </Td>
                  <Td>{u.is_ops_admin ? <Badge tone="info">{t.admin}</Badge> : <Badge tone="neutral">{t.user}</Badge>}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {!u.is_active ? <Badge tone="neutral">{t.deactivated}</Badge> : u.locked ? <Badge tone="err">{t.locked}</Badge> : <Badge tone="ok">{t.active}</Badge>}
                      {u.is_active && u.must_change_password && <Badge tone="warn">{t.mustChange}</Badge>}
                      {!u.has_password && <Badge tone="neutral">{t.ssoOnly}</Badge>}
                    </div>
                  </Td>
                  <Td num>{u.ket_noi}</Td>
                  <Td num>{u.lich}</Td>
                  <Td num>{fmtDateTime(u.last_login_at)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => { setEditing(u); setNote(null); }}>{t.edit}</Button>
                      <Button onClick={() => { setResetting(u); setNote(null); }}>{t.resetPassword}</Button>
                      <Menu label={t.moreFor(u.ho_ten)} items={[
                        ...(u.locked ? [{ label: t.unlock, onClick: () => void act(() => api.post(`/admin/users/${u.id}/unlock`), t.unlocked(u.ho_ten)) }] : []),
                        u.is_active
                          ? { label: t.deactivate, danger: true, disabled: self,
                              onClick: () => confirm(t.confirmDeactivate(u.ho_ten))
                                && void act(() => api.patch(`/admin/users/${u.id}`, { is_active: false }), t.deactivatedMsg(u.ho_ten)) }
                          : { label: t.reactivate, onClick: () => void act(() => api.patch(`/admin/users/${u.id}`, { is_active: true }), t.reactivatedMsg(u.ho_ten)) },
                      ]} />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit={t.unit} />
      </>)}

      {editing && <UserDialog user={editing === 'new' ? null : editing} self={editing !== 'new' && editing.id === me.id} onClose={() => setEditing(null)}
        onSaved={(m) => { setEditing(null); setNote({ tone: 'ok', text: m }); list.reload(); }} />}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)}
        onSaved={(m) => { setResetting(null); setNote({ tone: 'ok', text: m }); list.reload(); }} />}
    </>
  );
}

function Dialog({ title, sub, children, onClose }: { title: string; sub?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="dlg-title"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="mx-auto mt-12 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <h2 id="dlg-title" className="text-base font-semibold">{title}</h2>
        {sub && <Muted className="text-sm">{sub}</Muted>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/** Ô mật khẩu tạm: nút tạo ngẫu nhiên + chép; quản trị gửi cho người dùng, lần đăng nhập đầu họ phải đổi. */
function TempPassword({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT(M);
  const [copied, setCopied] = useState(false);
  return (
    <Field label={t.tempPassword}>
      <div className="flex gap-2">
        <Input className="w-full !min-w-0 font-mono" value={value} onChange={(e) => { onChange(e.target.value); setCopied(false); }} autoComplete="new-password" spellCheck={false} />
        <Button onClick={() => { onChange(randomPassword()); setCopied(false); }}>{t.generate}</Button>
        <Button disabled={!value} onClick={() => { void navigator.clipboard?.writeText(value).then(() => setCopied(true)); }}>{copied ? t.copied : t.copy}</Button>
      </div>
    </Field>
  );
}

function UserDialog({ user, self, onClose, onSaved }: { user: AdminUser | null; self: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const t = useT(M);
  const isNew = !user;
  const [f, setF] = useState({ username: '', ho_ten: user?.ho_ten ?? '', email: user?.email ?? '', is_ops_admin: user?.is_ops_admin ?? false, password: isNew ? randomPassword() : '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (isNew) {
        await api.post('/admin/users', { username: f.username.trim().toLowerCase(), ho_ten: f.ho_ten.trim(), email: f.email.trim(), password: f.password, is_ops_admin: f.is_ops_admin });
        onSaved(t.created(f.username));
      } else {
        await api.patch(`/admin/users/${user.id}`, { ho_ten: f.ho_ten.trim(), email: f.email.trim(), ...(self ? {} : { is_ops_admin: f.is_ops_admin }) });
        onSaved(t.saved(f.ho_ten));
      }
    } catch (e) { setErr(ERR(e)); setBusy(false); }
  };
  const ok = f.ho_ten.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())
    && (!isNew || (/^[a-z0-9][a-z0-9._-]{2,39}$/.test(f.username.trim().toLowerCase()) && f.password.length >= 8));
  return (
    <Dialog title={isNew ? t.addUser : t.editTitle(user.ho_ten)} sub={isNew ? t.newSub : user.username ? `@${user.username}` : undefined} onClose={onClose}>
      <div className="grid gap-3">
        {isNew && (
          <Field label={t.username}>
            <Input className="w-full !min-w-0" value={f.username} onChange={(e) => set({ username: e.target.value.toLowerCase() })} placeholder={t.usernamePh} autoComplete="off" />
          </Field>
        )}
        <Field label={t.fullName}><Input className="w-full !min-w-0" value={f.ho_ten} onChange={(e) => set({ ho_ten: e.target.value })} /></Field>
        <Field label={t.email}><Input className="w-full !min-w-0" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        {isNew && <TempPassword value={f.password} onChange={(password) => set({ password })} />}
        <label className={`flex items-start gap-2 text-sm ${self ? 'opacity-60' : ''}`}>
          <input type="checkbox" className="mt-0.5" checked={f.is_ops_admin} disabled={self} onChange={(e) => set({ is_ops_admin: e.target.checked })} />
          <span>{t.adminRight} <Muted className="text-xs">{t.adminHint}{self ? t.noSelfDemote : ''}</Muted></span>
        </label>
      </div>
      {err && <div className="mt-3"><Banner tone="err">{err}</Banner></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>{t.cancel}</Button>
        <Button variant="primary" disabled={busy || !ok} onClick={() => void save()}>{busy ? t.saving : isNew ? t.create : t.save}</Button>
      </div>
    </Dialog>
  );
}

function ResetDialog({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (m: string) => void }) {
  const t = useT(M);
  const [password, setPassword] = useState(randomPassword());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.post(`/admin/users/${user.id}/password`, { password }); onSaved(t.resetDone(user.ho_ten)); }
    catch (e) { setErr(ERR(e)); setBusy(false); }
  };
  return (
    <Dialog title={t.resetTitle(user.ho_ten)} sub={t.resetSub} onClose={onClose}>
      <TempPassword value={password} onChange={setPassword} />
      {err && <div className="mt-3"><Banner tone="err">{err}</Banner></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>{t.cancel}</Button>
        <Button variant="primary" disabled={busy || password.length < 8} onClick={() => void save()}>{busy ? t.saving : t.setPassword}</Button>
      </div>
    </Dialog>
  );
}

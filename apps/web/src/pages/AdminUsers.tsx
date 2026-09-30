import { useState, type ReactNode } from 'react';
import { ApiProblem, api, fmtDateTime, type AdminUser } from '../api';
import { useMe } from '../App';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Field, Input, Menu, Muted, PageTitle, Select, Table, Td, Th } from '../components/ui';

const ERR = (e: unknown) => (e instanceof ApiProblem ? `${e.title}${e.detail ? ` — ${e.detail}` : ''}` : 'Lỗi');
type Filter = '' | 'active' | 'admin' | 'inactive' | 'locked';
const FILTERS: Array<[Filter, string]> = [['', 'Tất cả'], ['active', 'Đang hoạt động'], ['admin', 'Quản trị'], ['locked', 'Đang tạm khoá'], ['inactive', 'Đã vô hiệu hoá']];

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
  const me = useMe();
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
      <PageTitle title="Người dùng"
        subtitle={list.data ? `${active} tài khoản đang hoạt động · ${(list.data ?? []).filter((u) => u.is_ops_admin && u.is_active).length} quản trị` : 'Tài khoản đăng nhập cổng Vala.'} />
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder="Tìm theo tên, tên đăng nhập, email…" />
        <Select aria-label="Lọc trạng thái" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); tv.setPage(1); }}>
          {FILTERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Select>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setEditing('new'); setNote(null); }}>Thêm người dùng</Button>
      </div>
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>Chưa có người dùng nào.</Empty>}
      {!!list.data?.length && !tv.total && <NoMatch q={tv.q || 'bộ lọc hiện tại'} onClear={() => { tv.setQ(''); setFilter(''); }} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>Người dùng</Th><Th>Vai trò</Th><Th>Trạng thái</Th><Th num>Kết nối nguồn</Th><Th num>Lịch đang bật</Th><Th num>Đăng nhập gần nhất</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-60'}>
                  <Td>
                    <div className="font-medium">{u.ho_ten}{self && <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">(bạn)</span>}</div>
                    <Muted className="text-xs">{u.username ? `@${u.username} · ` : ''}{u.email}</Muted>
                  </Td>
                  <Td>{u.is_ops_admin ? <Badge tone="info">Quản trị</Badge> : <Badge tone="neutral">Người dùng</Badge>}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {!u.is_active ? <Badge tone="neutral">Đã vô hiệu hoá</Badge> : u.locked ? <Badge tone="err">Tạm khoá</Badge> : <Badge tone="ok">Hoạt động</Badge>}
                      {u.is_active && u.must_change_password && <Badge tone="warn">Phải đổi mật khẩu</Badge>}
                      {!u.has_password && <Badge tone="neutral">Chỉ đăng nhập SSO</Badge>}
                    </div>
                  </Td>
                  <Td num>{u.ket_noi}</Td>
                  <Td num>{u.lich}</Td>
                  <Td num>{fmtDateTime(u.last_login_at)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => { setEditing(u); setNote(null); }}>Sửa</Button>
                      <Button onClick={() => { setResetting(u); setNote(null); }}>Đặt lại mật khẩu</Button>
                      <Menu label={`Thêm thao tác cho ${u.ho_ten}`} items={[
                        ...(u.locked ? [{ label: 'Mở khoá đăng nhập', onClick: () => void act(() => api.post(`/admin/users/${u.id}/unlock`), `Đã mở khoá ${u.ho_ten}.`) }] : []),
                        u.is_active
                          ? { label: 'Vô hiệu hoá tài khoản', danger: true, disabled: self,
                              onClick: () => confirm(`Vô hiệu hoá ${u.ho_ten}?\n\nNgười này bị đăng xuất ngay, không đăng nhập được nữa, tiện ích ngừng gửi phiên và lịch chạy ngừng. Dữ liệu đã lấy về vẫn giữ. Có thể kích hoạt lại.`)
                                && void act(() => api.patch(`/admin/users/${u.id}`, { is_active: false }), `Đã vô hiệu hoá ${u.ho_ten}.`) }
                          : { label: 'Kích hoạt lại', onClick: () => void act(() => api.patch(`/admin/users/${u.id}`, { is_active: true }), `Đã kích hoạt lại ${u.ho_ten}.`) },
                      ]} />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit="người dùng" />
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
  const [copied, setCopied] = useState(false);
  return (
    <Field label="Mật khẩu tạm (người dùng phải đổi khi đăng nhập lần đầu)">
      <div className="flex gap-2">
        <Input className="w-full !min-w-0 font-mono" value={value} onChange={(e) => { onChange(e.target.value); setCopied(false); }} autoComplete="new-password" spellCheck={false} />
        <Button onClick={() => { onChange(randomPassword()); setCopied(false); }}>Tạo ngẫu nhiên</Button>
        <Button disabled={!value} onClick={() => { void navigator.clipboard?.writeText(value).then(() => setCopied(true)); }}>{copied ? 'Đã chép' : 'Chép'}</Button>
      </div>
    </Field>
  );
}

function UserDialog({ user, self, onClose, onSaved }: { user: AdminUser | null; self: boolean; onClose: () => void; onSaved: (m: string) => void }) {
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
        onSaved(`Đã tạo tài khoản ${f.username}. Gửi mật khẩu tạm cho người dùng — họ sẽ phải đổi khi đăng nhập lần đầu.`);
      } else {
        await api.patch(`/admin/users/${user.id}`, { ho_ten: f.ho_ten.trim(), email: f.email.trim(), ...(self ? {} : { is_ops_admin: f.is_ops_admin }) });
        onSaved(`Đã lưu ${f.ho_ten}.`);
      }
    } catch (e) { setErr(ERR(e)); setBusy(false); }
  };
  const ok = f.ho_ten.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())
    && (!isNew || (/^[a-z0-9][a-z0-9._-]{2,39}$/.test(f.username.trim().toLowerCase()) && f.password.length >= 8));
  return (
    <Dialog title={isNew ? 'Thêm người dùng' : `Sửa ${user.ho_ten}`} sub={isNew ? 'Tài khoản đăng nhập cổng bằng tên đăng nhập + mật khẩu.' : user.username ? `@${user.username}` : undefined} onClose={onClose}>
      <div className="grid gap-3">
        {isNew && (
          <Field label="Tên đăng nhập (chữ thường, số, . _ -)">
            <Input className="w-full !min-w-0" value={f.username} onChange={(e) => set({ username: e.target.value.toLowerCase() })} placeholder="vd nguyenvana" autoComplete="off" />
          </Field>
        )}
        <Field label="Họ tên"><Input className="w-full !min-w-0" value={f.ho_ten} onChange={(e) => set({ ho_ten: e.target.value })} /></Field>
        <Field label="Email"><Input className="w-full !min-w-0" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        {isNew && <TempPassword value={f.password} onChange={(password) => set({ password })} />}
        <label className={`flex items-start gap-2 text-sm ${self ? 'opacity-60' : ''}`}>
          <input type="checkbox" className="mt-0.5" checked={f.is_ops_admin} disabled={self} onChange={(e) => set({ is_ops_admin: e.target.checked })} />
          <span>Quyền quản trị <Muted className="text-xs">— cấu hình hệ thống nguồn, báo cáo, script crawl, người dùng.{self ? ' Không tự bỏ quyền của chính mình.' : ''}</Muted></span>
        </label>
      </div>
      {err && <div className="mt-3"><Banner tone="err">{err}</Banner></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="primary" disabled={busy || !ok} onClick={() => void save()}>{busy ? 'Đang lưu…' : isNew ? 'Tạo tài khoản' : 'Lưu'}</Button>
      </div>
    </Dialog>
  );
}

function ResetDialog({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (m: string) => void }) {
  const [password, setPassword] = useState(randomPassword());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.post(`/admin/users/${user.id}/password`, { password }); onSaved(`Đã đặt mật khẩu tạm cho ${user.ho_ten} và mở khoá tài khoản. Họ sẽ phải đổi mật khẩu khi đăng nhập.`); }
    catch (e) { setErr(ERR(e)); setBusy(false); }
  };
  return (
    <Dialog title={`Đặt lại mật khẩu — ${user.ho_ten}`} sub="Chép mật khẩu tạm và gửi cho người dùng qua kênh riêng. Hệ thống không hiện lại mật khẩu này." onClose={onClose}>
      <TempPassword value={password} onChange={setPassword} />
      {err && <div className="mt-3"><Banner tone="err">{err}</Banner></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="primary" disabled={busy || password.length < 8} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Đặt mật khẩu'}</Button>
      </div>
    </Dialog>
  );
}

import { useState } from 'react';
import { api, ApiProblem, type AuthMethod, type Connection } from '../api';
import { ErrorBox } from './States';
import { Button, Card, Field, Input, Muted, Select } from './ui';

/**
 * Hộp cấu hình một kết nối. `self` = người dùng tự cấp tài khoản của mình (/me/connections);
 * ngược lại quản trị cấu hình hộ (/admin/connections). Mật khẩu/cookie chỉ gửi đi, không bao giờ hiện lại.
 */
export function ConnectionEditor({ conn, self = false, onClose, onSaved }: {
  conn: Connection; self?: boolean; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const base = self ? `/me/connections/${conn.source_system}` : `/admin/connections/${conn.app_user_id}/${conn.source_system}`;
  const who = self ? 'bạn' : conn.ho_ten;
  // 'extension' không cấu hình qua form (do tiện ích tạo) ⇒ đổi sang cách khác thì mặc định mật khẩu.
  // Chỉ các cách hệ thống này cho phép (quản trị đặt ở "Hệ thống nguồn"); 'sso' chỉ quản trị đặt hộ.
  const allowed = (conn.connection_methods ?? ['password', 'cookie', 'sso'])
    .filter((m): m is AuthMethod => m === 'password' || m === 'cookie' || (m === 'sso' && !self));
  const [method, setMethod] = useState<AuthMethod>(conn.auth_method && allowed.includes(conn.auth_method) ? conn.auth_method : allowed[0] ?? 'cookie');
  const [username, setUsername] = useState(conn.source_username ?? '');
  const [password, setPassword] = useState('');
  const [cookie, setCookie] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = { auth_method: method };
    if (method === 'password') { body.source_username = username.trim(); body.password = password; }
    if (method === 'cookie') body.cookie = cookie;
    try {
      const r = await api.put<{ state: string }>(base, body);
      onSaved(r.state === 'active'
        ? `Đã cấu hình và đăng nhập thử thành công cho ${who}.`
        : `Đã lưu cấu hình cho ${who}. ${method === 'sso' ? 'Người dùng cần tự uỷ quyền qua Bkav SSO.' : 'Sẽ thử lại khi chạy.'}`);
    } catch (e) { setErr(e); setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ ok: boolean; message?: string }>(`${base}/test`);
      if (r.ok) onSaved(`Kết nối của ${who} hoạt động tốt.`);
      else { setErr(new ApiProblem('test', 400, r.message ?? 'Kết nối lỗi')); setBusy(false); }
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true">
      <Card className="w-full max-w-lg">
        <h2 className="text-lg font-semibold">{self ? `Cấp tài khoản ${conn.source_ten}` : `Kết nối: ${conn.ho_ten} → ${conn.source_ten}`}</h2>
        <Muted className="mt-1">{self
          ? `Hệ thống dùng tài khoản này để lấy dữ liệu ${conn.source_ten} thay bạn theo lịch, bạn không phải đăng nhập mỗi lần.`
          : 'Chọn cách hệ thống lấy dữ liệu thay người dùng này.'}</Muted>
        {err ? <ErrorBox error={err} /> : null}
        <div className="mt-4 grid gap-4">
          <Field label="Cách lấy dữ liệu">
            <Select value={method} onChange={(e) => setMethod(e.target.value as AuthMethod)} disabled={!allowed.length}>
              {allowed.includes('password') && <option value="password">Tài khoản/mật khẩu — hệ thống tự đăng nhập</option>}
              {allowed.includes('cookie') && <option value="cookie">Dán cookie từ trình duyệt</option>}
              {allowed.includes('sso') && <option value="sso">Người dùng tự uỷ quyền qua Bkav SSO</option>}
            </Select>
            {!allowed.length && <Muted className="mt-1">{conn.source_ten} chỉ kết nối qua tiện ích trình duyệt Vala.</Muted>}
          </Field>

          {method === 'password' && (
            <>
              <Field label={`Tài khoản trên ${conn.source_ten}`}>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" placeholder="Tên đăng nhập hệ thống nguồn" />
              </Field>
              <Field label="Mật khẩu">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={conn.state === 'chua_cau_hinh' ? '' : 'Nhập lại để đổi'} />
              </Field>
              <Muted>Hệ thống thử đăng nhập ngay khi lưu. Mật khẩu chỉ lưu trong vault, không hiển thị lại. Tài khoản bật OTP sẽ không tự đăng nhập được — dùng cách dán cookie.</Muted>
            </>
          )}

          {method === 'cookie' && (
            <>
              <Field label="Chuỗi cookie">
                <textarea value={cookie} onChange={(e) => setCookie(e.target.value)} rows={4}
                  className="min-w-[160px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="egov_sid=…; bkavAuthen=…; BkavSSOv2=…" />
              </Field>
              <Muted>Copy từ DevTools → Application → Cookies của hệ thống nguồn. Cookie hết hạn thì cần dán lại (hệ thống không tự làm mới được).</Muted>
            </>
          )}

          {method === 'sso' && <Muted>Không nhập hộ được. Người dùng đăng nhập cổng rồi tự uỷ quyền qua Bkav SSO ở màn hình “Uỷ quyền dữ liệu”.</Muted>}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void save()}>Lưu</Button>
          {conn.auth_method && conn.state !== 'chua_cau_hinh' && <Button disabled={busy} onClick={() => void test()}>Thử kết nối</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </Card>
    </div>
  );
}

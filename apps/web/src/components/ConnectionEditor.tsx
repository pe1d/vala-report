import { useState } from 'react';
import { api, ApiProblem, type AuthMethod, type Connection } from '../api';
import { ErrorBox } from './States';
import { Button, Card, Field, Input, Muted, Select } from './ui';
import { useBranding } from '../branding';
import { messages, useT } from '../i18n';

const M = messages({
  you: 'bạn',
  savedOk: (who: string) => `Đã cấu hình và đăng nhập thử thành công cho ${who}.`,
  saved: (who: string) => `Đã lưu cấu hình cho ${who}.`,
  ssoNeeded: (sso: string) => `Người dùng cần tự uỷ quyền qua ${sso}.`,
  retryLater: 'Sẽ thử lại khi chạy.',
  testOk: (who: string) => `Kết nối của ${who} hoạt động tốt.`,
  testFailed: 'Kết nối lỗi',
  titleSelf: (src: string) => `Cấp tài khoản ${src}`,
  titleAdmin: (user: string, src: string) => `Kết nối: ${user} → ${src}`,
  introSelf: (src: string) => `Hệ thống dùng tài khoản này để lấy dữ liệu ${src} thay bạn theo lịch, bạn không phải đăng nhập mỗi lần.`,
  introAdmin: 'Chọn cách hệ thống lấy dữ liệu thay người dùng này.',
  method: 'Cách lấy dữ liệu',
  optPassword: 'Tài khoản/mật khẩu — hệ thống tự đăng nhập',
  optCookie: 'Dán cookie từ trình duyệt',
  optSso: (sso: string) => `Người dùng tự uỷ quyền qua ${sso}`,
  extensionOnly: (src: string) => `${src} chỉ kết nối qua tiện ích trình duyệt Vala.`,
  account: (src: string) => `Tài khoản trên ${src}`,
  usernamePh: 'Tên đăng nhập hệ thống nguồn',
  password: 'Mật khẩu',
  passwordPh: 'Nhập lại để đổi',
  passwordHint: 'Hệ thống thử đăng nhập ngay khi lưu. Mật khẩu chỉ lưu trong vault, không hiển thị lại. Tài khoản bật OTP sẽ không tự đăng nhập được — dùng cách dán cookie.',
  cookie: 'Chuỗi cookie',
  cookiePh: 'ten_cookie_phien=…; ten_cookie_khac=…',
  cookieHint: 'Copy từ DevTools → Application → Cookies của hệ thống nguồn. Cookie hết hạn thì cần dán lại (hệ thống không tự làm mới được).',
  ssoHint: (sso: string) => `Không nhập hộ được. Người dùng đăng nhập cổng rồi tự uỷ quyền qua ${sso} ở màn hình “Uỷ quyền dữ liệu”.`,
  save: 'Lưu', test: 'Thử kết nối', close: 'Đóng',
}, {
  you: 'you',
  savedOk: (who: string) => `Configured and test sign-in succeeded for ${who}.`,
  saved: (who: string) => `Configuration saved for ${who}.`,
  ssoNeeded: (sso: string) => `The user needs to authorize via ${sso}.`,
  retryLater: 'It will be retried on the next run.',
  testOk: (who: string) => `The connection for ${who} is working.`,
  testFailed: 'Connection failed',
  titleSelf: (src: string) => `Provide your ${src} account`,
  titleAdmin: (user: string, src: string) => `Connection: ${user} → ${src}`,
  introSelf: (src: string) => `The system uses this account to fetch your ${src} data on schedule, so you don't have to sign in each time.`,
  introAdmin: 'Choose how the system fetches data on behalf of this user.',
  method: 'Fetch method',
  optPassword: 'Username/password — the system signs in automatically',
  optCookie: 'Paste a cookie from the browser',
  optSso: (sso: string) => `User authorizes via ${sso}`,
  extensionOnly: (src: string) => `${src} can only be connected through the Vala browser extension.`,
  account: (src: string) => `Account on ${src}`,
  usernamePh: 'Source system username',
  password: 'Password',
  passwordPh: 'Re-enter to change',
  passwordHint: 'The system tries to sign in as soon as you save. The password is stored only in the vault and never shown again. Accounts with OTP enabled cannot sign in automatically — paste a cookie instead.',
  cookie: 'Cookie string',
  cookiePh: 'session_cookie_name=…; other_cookie=…',
  cookieHint: 'Copy it from DevTools → Application → Cookies on the source system. When the cookie expires you need to paste it again (the system cannot refresh it).',
  ssoHint: (sso: string) => `This can't be entered on the user's behalf. The user signs in to the portal and authorizes via ${sso} on the “Data authorization” screen.`,
  save: 'Save', test: 'Test connection', close: 'Close',
});

/**
 * Hộp cấu hình một kết nối. `self` = người dùng tự cấp tài khoản của mình (/me/connections);
 * ngược lại quản trị cấu hình hộ (/admin/connections). Mật khẩu/cookie chỉ gửi đi, không bao giờ hiện lại.
 */
export function ConnectionEditor({ conn, self = false, onClose, onSaved }: {
  conn: Connection; self?: boolean; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const t = useT(M);
  const ssoName = useBranding().ten_sso;
  const base = self ? `/me/connections/${conn.source_system}` : `/admin/connections/${conn.app_user_id}/${conn.source_system}`;
  const who = self ? t.you : conn.ho_ten;
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
        ? t.savedOk(who)
        : `${t.saved(who)} ${method === 'sso' ? t.ssoNeeded(ssoName) : t.retryLater}`);
    } catch (e) { setErr(e); setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ ok: boolean; message?: string }>(`${base}/test`);
      if (r.ok) onSaved(t.testOk(who));
      else { setErr(new ApiProblem('test', 400, r.message ?? t.testFailed)); setBusy(false); }
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true">
      <Card className="w-full max-w-lg">
        <h2 className="text-lg font-semibold">{self ? t.titleSelf(conn.source_ten) : t.titleAdmin(conn.ho_ten, conn.source_ten)}</h2>
        <Muted className="mt-1">{self
          ? t.introSelf(conn.source_ten)
          : t.introAdmin}</Muted>
        {err ? <ErrorBox error={err} /> : null}
        <div className="mt-4 grid gap-4">
          <Field label={t.method}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as AuthMethod)} disabled={!allowed.length}>
              {allowed.includes('password') && <option value="password">{t.optPassword}</option>}
              {allowed.includes('cookie') && <option value="cookie">{t.optCookie}</option>}
              {allowed.includes('sso') && <option value="sso">{t.optSso(ssoName)}</option>}
            </Select>
            {!allowed.length && <Muted className="mt-1">{t.extensionOnly(conn.source_ten)}</Muted>}
          </Field>

          {method === 'password' && (
            <>
              <Field label={t.account(conn.source_ten)}>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" placeholder={t.usernamePh} />
              </Field>
              <Field label={t.password}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={conn.state === 'chua_cau_hinh' ? '' : t.passwordPh} />
              </Field>
              <Muted>{t.passwordHint}</Muted>
            </>
          )}

          {method === 'cookie' && (
            <>
              <Field label={t.cookie}>
                <textarea value={cookie} onChange={(e) => setCookie(e.target.value)} rows={4}
                  className="min-w-[160px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder={t.cookiePh} />
              </Field>
              <Muted>{t.cookieHint}</Muted>
            </>
          )}

          {method === 'sso' && <Muted>{t.ssoHint(ssoName)}</Muted>}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void save()}>{t.save}</Button>
          {conn.auth_method && conn.state !== 'chua_cau_hinh' && <Button disabled={busy} onClick={() => void test()}>{t.test}</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>{t.close}</Button>
        </div>
      </Card>
    </div>
  );
}

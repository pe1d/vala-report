import { useEffect, useRef, useState } from 'react';
import { ApiProblem, api } from '../api';
import { useAsync } from '../hooks';
import { startLogin } from '../reauth';
import { useValaExtension } from '../extension';
import { useInDesktop } from '../desktopPrefs';
import { ErrorBox, Loading } from '../components/States';
import { Banner, Button, Field, Input, LangToggle, ThemeToggle } from '../components/ui';
import { BrandMark, useBranding } from '../branding';
import { BASE } from '../base';
import { messages, useT } from '../i18n';

/**
 * Màn hình 1 — Đăng nhập cổng bằng tài khoản/mật khẩu (chuẩn).
 * Nếu quản trị bật thêm SSO thì hiện nút đăng nhập SSO bên dưới (tên SSO lấy từ Cấu hình chung).
 */
const M = messages({
  /** Lý do SSO trả người dùng về trang đăng nhập (?loi=… do máy chủ đặt). */
  ssoErrors: (sso: string): Record<string, string> => ({
    chua_co_tai_khoan: `Tài khoản ${sso} của bạn chưa có trên cổng. Nhờ quản trị tạo tài khoản (cùng email hoặc tên đăng nhập) rồi thử lại.`,
    tai_khoan_da_lien_ket: `Tài khoản cổng cùng email / tên đăng nhập đã liên kết với một tài khoản ${sso} khác. Liên hệ quản trị.`,
    tai_khoan_bi_khoa: 'Tài khoản cổng của bạn đang bị vô hiệu hoá. Liên hệ quản trị.',
    sso_thieu_email: `${sso} không cung cấp email nên không tự tạo được tài khoản. Liên hệ quản trị.`,
    sso_tu_choi: `Bạn đã huỷ đăng nhập trên ${sso}.`,
    sso_loi: `Không đăng nhập được qua ${sso} (lỗi kết nối hoặc cấu hình). Thử lại sau hoặc đăng nhập bằng mật khẩu.`,
    state_khong_hop_le: 'Phiên đăng nhập đã quá hạn — bấm đăng nhập lại.',
  }),
  ssoFailed: (sso: string) => `Đăng nhập ${sso} không thành công.`,
  defaultTagline: 'Cổng báo cáo theo lịch từ các hệ thống nguồn của đơn vị.',
  badCredentials: 'Sai tài khoản hoặc mật khẩu.',
  downloadDesktop: 'Tải ứng dụng Vala Desktop',
  toSso: (sso: string) => `Đang chuyển sang ${sso}…`,
  account: 'Tài khoản', usernamePh: 'Tên đăng nhập', password: 'Mật khẩu',
  signingIn: 'Đang đăng nhập…', signIn: 'Đăng nhập',
  orSso: (sso: string) => `Hoặc đăng nhập bằng ${sso}`,
}, {
  ssoErrors: (sso: string): Record<string, string> => ({
    chua_co_tai_khoan: `Your ${sso} account doesn't exist on the portal yet. Ask an administrator to create one (same email or username), then try again.`,
    tai_khoan_da_lien_ket: `The portal account with this email / username is already linked to a different ${sso} account. Contact an administrator.`,
    tai_khoan_bi_khoa: 'Your portal account is disabled. Contact an administrator.',
    sso_thieu_email: `${sso} didn't provide an email address, so an account couldn't be created automatically. Contact an administrator.`,
    sso_tu_choi: `You cancelled sign-in on ${sso}.`,
    sso_loi: `Couldn't sign in with ${sso} (connection or configuration error). Try again later or sign in with your password.`,
    state_khong_hop_le: 'Your sign-in session has expired. Please sign in again.',
  }),
  ssoFailed: (sso: string) => `${sso} sign-in failed.`,
  defaultTagline: "Scheduled reports from your organization's source systems.",
  badCredentials: 'Incorrect username or password.',
  downloadDesktop: 'Download the Vala Desktop app',
  toSso: (sso: string) => `Redirecting to ${sso}…`,
  account: 'Username', usernamePh: 'Username', password: 'Password',
  signingIn: 'Signing in…', signIn: 'Sign in',
  orSso: (sso: string) => `Or sign in with ${sso}`,
});

export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const inDesktop = useInDesktop();
  const t = useT(M);
  const brand = useBranding();
  const ssoErr = new URLSearchParams(window.location.search).get('loi');
  const cfg = useAsync(() => api.get<{ login_methods: Array<'password' | 'sso'> }>('/auth/config'), []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // Trong Vala Desktop + máy chủ bật SSO ⇒ không hiện form mật khẩu, chuyển thẳng sang SSO (đã đăng nhập SSO ở tab Vala thì
  // vào luôn). Không tự chuyển khi: SSO vừa báo lỗi (?loi=…), hoặc ứng dụng vừa đăng xuất (đánh dấu vala.noAutoSso — không
  // thì phiên SSO còn sống sẽ đăng nhập lại ngay và người dùng không đăng xuất được).
  const ext = useValaExtension(() => {});
  const [autoSso, setAutoSso] = useState(false);
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || ssoErr || !ext.info?.desktop || !cfg.data?.login_methods.includes('sso')) return;
    autoTried.current = true;
    let justLoggedOut = false;
    try { justLoggedOut = sessionStorage.getItem('vala.noAutoSso') === '1'; sessionStorage.removeItem('vala.noAutoSso'); } catch { /* bỏ qua */ }
    if (justLoggedOut) return;
    setAutoSso(true);
    startLogin('/');
  }, [ext.info, cfg.data, ssoErr]);
  if (autoSso) return <div className="flex min-h-screen items-center justify-center text-slate-500 dark:text-slate-400">{t.toSso(brand.ten_sso)}</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ access_token: string }>('/auth/login', { username: username.trim(), password });
      onLogin(r.access_token);
    } catch (e2) {
      setErr(e2); setBusy(false);
    }
  };

  const methods = cfg.data?.login_methods ?? [];
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark b={brand} size={44} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{brand.ten_ung_dung}</h1>
            {brand.ten_don_vi && <div className="text-sm text-slate-600 dark:text-slate-300">{brand.ten_don_vi}</div>}
          </div>
        </div>
        {/* Trong Vala Desktop thanh tab của app đã có ngôn ngữ / sáng-tối (đồng bộ với cổng). */}
        {!inDesktop && <div className="flex shrink-0 items-center gap-2"><LangToggle /><ThemeToggle /></div>}
      </div>
      <p className="mb-6 text-slate-500 dark:text-slate-400">{brand.mo_ta ?? t.defaultTagline}</p>

      {ssoErr && <Banner tone="err" role="alert">{t.ssoErrors(brand.ten_sso)[ssoErr] ?? t.ssoFailed(brand.ten_sso)}</Banner>}
      {cfg.loading && <Loading rows={2} />}
      {cfg.error ? <ErrorBox error={cfg.error} onRetry={cfg.reload} /> : null}

      {methods.includes('password') && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {err instanceof ApiProblem && err.type === 'rate_limited'
            ? <Banner tone="warn" role="alert">{err.detail ?? err.title}</Banner>
            : err ? <Banner tone="err" role="alert">{t.badCredentials}</Banner> : null}
          <div className="grid gap-4">
            <Field label={t.account}>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder={t.usernamePh} required />
            </Field>
            <Field label={t.password}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Button type="submit" variant="primary" className="w-full py-2.5" disabled={busy || !username || !password}>
              {busy ? t.signingIn : t.signIn}
            </Button>
          </div>
        </form>
      )}

      {methods.includes('sso') && (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => startLogin('/')}
            className="text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
            {t.orSso(brand.ten_sso)}
          </button>
        </div>
      )}

      <div className="mt-6 text-center">
        <a href={`${BASE}/desktop`} className="text-sm text-slate-600 underline-offset-2 hover:underline dark:text-slate-300">{t.downloadDesktop}</a>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ApiProblem, api } from '../api';
import { startLogin } from '../reauth';
import { useValaExtension } from '../extension';
import { useInDesktop } from '../desktopPrefs';
import { Banner, Button, Field, Input, LangToggle, ThemeToggle } from '../components/ui';
import { BrandMark, useBranding } from '../branding';
import { BASE } from '../base';
import { messages, useT } from '../i18n';

/**
 * Màn hình 1 — Đăng nhập 2 bước (nhiều đơn vị, họp 07/10/2026):
 *   1. tài khoản dạng `tên@đơn vị` ⇒ /auth/lookup: tên miền cho biết đơn vị, kiểm tài khoản có trong đơn vị;
 *   2. tài khoản khoá lại; mật khẩu Vala và/hoặc SSO của đơn vị (chỉ SSO ⇒ chuyển thẳng sang trang SSO của đơn vị).
 * Nhớ tài khoản lần trước ⇒ lần sau vào thẳng bước 2. Trong Vala Desktop: app cấp phiên cho cổng qua cầu nối
 * (portal_token) ⇒ không hiện màn hình này.
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
  account: 'Tài khoản', accountPh: 'tên@đơn vị, vd nguyenvana@bkav.com', password: 'Mật khẩu',
  next: 'Tiếp tục', checking: 'Đang kiểm tra…', changeAccount: 'Đổi tài khoản',
  signingIn: 'Đang đăng nhập…', signIn: 'Đăng nhập',
  orSso: (sso: string) => `Hoặc đăng nhập bằng ${sso}`,
  ssoOnly: (sso: string) => `Đơn vị của bạn đăng nhập qua ${sso}.`,
  ssoButton: (sso: string) => `Đăng nhập bằng ${sso}`,
  ssoName: 'SSO của đơn vị',
  noMethod: 'Đơn vị này chưa bật cách đăng nhập nào. Liên hệ quản trị.',
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
  account: 'Account', accountPh: 'name@organization, e.g. nguyenvana@bkav.com', password: 'Password',
  next: 'Continue', checking: 'Checking…', changeAccount: 'Change account',
  signingIn: 'Signing in…', signIn: 'Sign in',
  orSso: (sso: string) => `Or sign in with ${sso}`,
  ssoOnly: (sso: string) => `Your organization signs in with ${sso}.`,
  ssoButton: (sso: string) => `Sign in with ${sso}`,
  ssoName: "your organization's SSO",
  noMethod: 'This organization has no sign-in method enabled yet. Contact an administrator.',
});

interface Target {
  login: string;
  tenant: { ma: string; ten: string };
  account: string;
  methods: Array<'password' | 'sso'>;
  fill: string;
}

const LAST = 'vala.lastLogin';
const readLast = (): Target | null => { try { const v = JSON.parse(localStorage.getItem(LAST) ?? 'null') as Target | null; return v?.tenant?.ma ? v : null; } catch { return null; } };
const writeLast = (t: Target | null) => { try { if (t) localStorage.setItem(LAST, JSON.stringify(t)); else localStorage.removeItem(LAST); } catch { /* bỏ qua */ } };

export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const inDesktop = useInDesktop();
  const t = useT(M);
  const brand = useBranding();
  const ssoErr = new URLSearchParams(window.location.search).get('loi');
  const [target, setTarget] = useState<Target | null>(readLast);
  const [login, setLogin] = useState(target?.login ?? '');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // Tên SSO: Bkav dùng tên trong Cấu hình chung; đơn vị khác gọi chung "SSO của đơn vị".
  const ssoName = !target || target.tenant.ma === 'bkav' ? brand.ten_sso : t.ssoName;

  // Vala Desktop đã đăng nhập ở màn hình đăng nhập của ứng dụng ⇒ cầu nối đưa sẵn phiên cổng.
  const ext = useValaExtension(() => {});
  const used = useRef(false);
  useEffect(() => {
    const tok = ext.info?.portal_token;
    if (tok && !used.current) { used.current = true; onLogin(tok); }
  }, [ext.info, onLogin]);

  const sso = (tg: Target) => startLogin('/', { tenant: tg.tenant.ma, hint: tg.fill });

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post<Omit<Target, 'login'>>('/auth/lookup', { login: login.trim() });
      const tg = { ...r, login: login.trim().toLowerCase() };
      setTarget(tg); writeLast(tg); setBusy(false);
      // Đơn vị chỉ đăng nhập qua SSO ⇒ sang luôn trang SSO của đơn vị.
      if (!tg.methods.includes('password') && tg.methods.includes('sso')) sso(tg);
    } catch (e2) { setErr(e2); setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ access_token: string }>('/auth/login', { username: target.account, password, tenant: target.tenant.ma });
      onLogin(r.access_token);
    } catch (e2) { setErr(e2); setBusy(false); }
  };

  const change = () => { setTarget(null); writeLast(null); setPassword(''); setErr(null); };
  const problem = err instanceof ApiProblem ? err : null;

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
        {/* Trong Vala Desktop thanh của app đã có ngôn ngữ / sáng-tối (đồng bộ với cổng). */}
        {!inDesktop && <div className="flex shrink-0 items-center gap-2"><LangToggle /><ThemeToggle /></div>}
      </div>
      <p className="mb-6 text-slate-500 dark:text-slate-400">{brand.mo_ta ?? t.defaultTagline}</p>

      {ssoErr && <Banner tone="err" role="alert">{t.ssoErrors(ssoName)[ssoErr] ?? t.ssoFailed(ssoName)}</Banner>}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {problem && (
          <Banner tone={problem.type === 'rate_limited' ? 'warn' : 'err'} role="alert">
            {problem.type === 'invalid_credentials' ? t.badCredentials : <span><b>{problem.title}</b>{problem.detail ? ` — ${problem.detail}` : ''}</span>}
          </Banner>
        )}
        {err && !problem ? <Banner tone="err" role="alert">{t.badCredentials}</Banner> : null}

        {!target ? (
          <form onSubmit={lookup} className="grid gap-4">
            <Field label={t.account}>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} autoFocus autoComplete="username" placeholder={t.accountPh}
                inputMode="email" required className="rounded-lg py-2" />
            </Field>
            <Button type="submit" variant="primary" className="w-full rounded-lg py-2.5" disabled={busy || !login.trim()}>
              {busy ? t.checking : t.next}
            </Button>
          </form>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                {(target.account[0] ?? '?').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={target.login}>{target.login}</div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{target.tenant.ten}</div>
              </div>
              <button type="button" onClick={change} className="shrink-0 rounded-lg px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-700">
                {t.changeAccount}
              </button>
            </div>

            {target.methods.includes('password') && (
              <form onSubmit={submit} className="grid gap-4">
                {/* Ô tài khoản ẩn cho trình quản lý mật khẩu của trình duyệt. */}
                <input type="text" name="username" autoComplete="username" value={target.login} readOnly hidden />
                <Field label={t.password}>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" required className="rounded-lg py-2" />
                </Field>
                <Button type="submit" variant="primary" className="w-full rounded-lg py-2.5" disabled={busy || !password}>
                  {busy ? t.signingIn : t.signIn}
                </Button>
              </form>
            )}
            {!target.methods.includes('password') && target.methods.includes('sso') && (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300">{t.ssoOnly(ssoName)}</p>
                <Button type="button" variant="primary" className="w-full rounded-lg py-2.5" onClick={() => sso(target)}>{t.ssoButton(ssoName)}</Button>
              </>
            )}
            {target.methods.includes('password') && target.methods.includes('sso') && (
              <button type="button" onClick={() => sso(target)} className="text-center text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                {t.orSso(ssoName)}
              </button>
            )}
            {!target.methods.length && <p className="text-sm text-amber-700 dark:text-amber-400">{t.noMethod}</p>}
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <a href={`${BASE}/desktop`} className="text-sm text-slate-600 underline-offset-2 hover:underline dark:text-slate-300">{t.downloadDesktop}</a>
      </div>
    </div>
  );
}

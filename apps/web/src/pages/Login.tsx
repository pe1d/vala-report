import { useState } from 'react';
import { ApiProblem, api } from '../api';
import { useAsync } from '../hooks';
import { startLogin } from '../reauth';
import { ErrorBox, Loading } from '../components/States';
import { Banner, Button, Field, Input, ThemeToggle } from '../components/ui';
import { BrandMark, useBranding } from '../branding';

/**
 * Màn hình 1 — Đăng nhập cổng bằng tài khoản/mật khẩu (chuẩn).
 * Nếu quản trị bật thêm SSO thì hiện nút đăng nhập SSO bên dưới (tên SSO lấy từ Cấu hình chung).
 */
/** Lý do SSO trả người dùng về trang đăng nhập (?loi=… do máy chủ đặt). */
const SSO_ERRORS = (sso: string): Record<string, string> => ({
  chua_co_tai_khoan: `Tài khoản ${sso} của bạn chưa có trên cổng. Nhờ quản trị tạo tài khoản (cùng email hoặc tên đăng nhập) rồi thử lại.`,
  tai_khoan_da_lien_ket: `Tài khoản cổng cùng email / tên đăng nhập đã liên kết với một tài khoản ${sso} khác. Liên hệ quản trị.`,
  tai_khoan_bi_khoa: 'Tài khoản cổng của bạn đang bị vô hiệu hoá. Liên hệ quản trị.',
  sso_thieu_email: `${sso} không cung cấp email nên không tự tạo được tài khoản. Liên hệ quản trị.`,
  sso_tu_choi: `Bạn đã huỷ đăng nhập trên ${sso}.`,
  sso_loi: `Không đăng nhập được qua ${sso} (lỗi kết nối hoặc cấu hình). Thử lại sau hoặc đăng nhập bằng mật khẩu.`,
  state_khong_hop_le: 'Phiên đăng nhập đã quá hạn — bấm đăng nhập lại.',
});

export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const brand = useBranding();
  const ssoErr = new URLSearchParams(window.location.search).get('loi');
  const cfg = useAsync(() => api.get<{ login_methods: Array<'password' | 'sso'> }>('/auth/config'), []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

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
        <ThemeToggle />
      </div>
      <p className="mb-6 text-slate-500 dark:text-slate-400">{brand.mo_ta ?? 'Cổng báo cáo theo lịch từ các hệ thống nguồn của đơn vị.'}</p>

      {ssoErr && <Banner tone="err" role="alert">{SSO_ERRORS(brand.ten_sso)[ssoErr] ?? `Đăng nhập ${brand.ten_sso} không thành công.`}</Banner>}
      {cfg.loading && <Loading rows={2} />}
      {cfg.error ? <ErrorBox error={cfg.error} onRetry={cfg.reload} /> : null}

      {methods.includes('password') && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {err instanceof ApiProblem && err.type === 'rate_limited'
            ? <Banner tone="warn" role="alert">{err.detail ?? err.title}</Banner>
            : err ? <Banner tone="err" role="alert">Sai tài khoản hoặc mật khẩu.</Banner> : null}
          <div className="grid gap-4">
            <Field label="Tài khoản">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder="Tên đăng nhập" required />
            </Field>
            <Field label="Mật khẩu">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Button type="submit" variant="primary" className="w-full py-2.5" disabled={busy || !username || !password}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </div>
        </form>
      )}

      {methods.includes('sso') && (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => startLogin('/')}
            className="text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
            Hoặc đăng nhập bằng {brand.ten_sso}
          </button>
        </div>
      )}
    </div>
  );
}

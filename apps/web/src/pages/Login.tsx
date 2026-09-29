import { useState } from 'react';
import { ApiProblem, api } from '../api';
import { useAsync } from '../hooks';
import { startLogin } from '../reauth';
import { ErrorBox, Loading } from '../components/States';
import { Banner, Button, Field, Input, ThemeToggle } from '../components/ui';

/**
 * Màn hình 1 — Đăng nhập cổng bằng tài khoản/mật khẩu (chuẩn).
 * Nếu quản trị bật thêm Bkav SSO thì hiện nút đăng nhập SSO bên dưới.
 */
export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vala Reporting</h1>
        <ThemeToggle />
      </div>
      <p className="mb-6 text-slate-500 dark:text-slate-400">Cổng báo cáo theo lịch từ các hệ thống nguồn của đơn vị.</p>

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
            Hoặc đăng nhập bằng Bkav SSO
          </button>
        </div>
      )}
    </div>
  );
}

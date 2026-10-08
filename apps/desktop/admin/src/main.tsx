/**
 * Trang Quản trị đơn vị của Vala Desktop: các trang @vala/admin (người dùng, ứng dụng, kịch bản, hệ thống nguồn, cấu hình
 * chung). Không phụ thuộc cổng web: API đi qua tiến trình chính (preload `valaAdmin`) bằng phiên của ứng dụng; ngôn ngữ +
 * sáng/tối theo lựa chọn của app; chạy thử thao tác kịch bản gọi thẳng app.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, configureApi, type Me, type RawResponse } from '@vala/ui/api';
import { BrandingProvider } from '@vala/ui/branding';
import { ErrorBox, Loading } from '@vala/ui/States';
import { messages, setLang, useT, type Lang } from '@vala/ui/i18n';
import { setTheme, type ThemeMode } from '@vala/ui/theme';
import { AdminEnvProvider, type AdminEnv, type DesktopActionResult } from '@vala/admin/env';
import { AdminUsersPage } from '@vala/admin/AdminUsers';
import { AdminDesktopAppsPage } from '@vala/admin/AdminDesktopApps';
import { AdminDesktopScriptsPage } from '@vala/admin/AdminDesktopScripts';
import { AdminSourcesPage } from '@vala/admin/AdminSources';
import { AdminSettingsPage } from '@vala/admin/AdminSettings';
import './index.css';

interface ValaAdminApi {
  request(method: string, path: string, body: unknown, lang: string): Promise<RawResponse>;
  prefs(): Promise<{ lang: Lang; theme: ThemeMode }>;
  listActions(source: string): Promise<DesktopActionResult>;
  runAction(source: string, name: string, args: Record<string, unknown>): Promise<DesktopActionResult>;
  onPrefs(cb: (p: { lang: Lang; theme: ThemeMode }) => void): void;
}
const bridge = (window as unknown as { valaAdmin: ValaAdminApi }).valaAdmin;

configureApi((method, path, body, lang) => bridge.request(method, path, body, lang));
const applyPrefs = (p: { lang: Lang; theme: ThemeMode }) => { setLang(p.lang, true); setTheme(p.theme, true); };
bridge.onPrefs(applyPrefs);

const M = messages({
  title: 'Quản trị đơn vị', subtitle: 'Người dùng, ứng dụng, kịch bản và hệ thống nguồn của đơn vị',
  users: 'Người dùng', apps: 'Ứng dụng Desktop', scripts: 'Kịch bản Desktop', sources: 'Hệ thống nguồn', settings: 'Cấu hình chung',
  notAdmin: 'Chỉ quản trị của đơn vị mới dùng được trang này.',
}, {
  title: 'Organization admin', subtitle: "Your organization's users, apps, scripts and source systems",
  users: 'Users', apps: 'Desktop apps', scripts: 'Desktop scripts', sources: 'Source systems', settings: 'General settings',
  notAdmin: 'Only your organization’s administrators can use this page.',
});

const NAV: Array<{ to: string; key: 'users' | 'apps' | 'scripts' | 'sources' | 'settings'; icon: string }> = [
  { to: '/nguoi-dung', key: 'users', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6' },
  { to: '/ung-dung', key: 'apps', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { to: '/kich-ban', key: 'scripts', icon: 'M2 4h20v13H2zM8 21h8M12 17v4M9 9l-2 2 2 2M15 9l2 2-2 2' },
  { to: '/he-thong-nguon', key: 'sources', icon: 'M2 4h20v6H2zM2 14h20v6H2zM6 7h.01M6 17h.01' },
  { to: '/cau-hinh', key: 'settings', icon: 'M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.3L12 14.1 7.2 16.6l.9-5.3L4.3 7.6l5.3-.8z' },
];

function AdminApp() {
  const t = useT(M);
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const load = () => { setErr(null); api.get<Me>('/me').then(setMe, setErr); };
  useEffect(load, []);
  if (err) return <div className="p-6"><ErrorBox error={err} onRetry={load} /></div>;
  if (!me) return <div className="p-6"><Loading /></div>;
  if (!me.is_ops_admin) return <div className="p-6 text-slate-600 dark:text-slate-300">{t.notAdmin}</div>;
  const env: AdminEnv = {
    me: { id: me.id, email: me.email },
    desktop: { listActions: (s) => bridge.listActions(s), runAction: (s, n, a) => bridge.runAction(s, n, a) },
  };
  return (
    <AdminEnvProvider value={env}>
      <div className="grid h-screen grid-cols-[232px_minmax(0,1fr)]">
        <aside className="flex flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="px-2 pb-4">
            <div className="text-base font-semibold">{t.title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t.subtitle}</div>
          </div>
          <nav className="grid gap-0.5">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm no-underline ${isActive
                ? 'bg-blue-50 font-medium text-blue-700 dark:bg-slate-800 dark:text-blue-300'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
                {t[n.key]}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 overflow-y-auto p-4 md:px-8 md:py-6">
          <Routes>
            <Route path="/nguoi-dung" element={<AdminUsersPage />} />
            <Route path="/ung-dung" element={<AdminDesktopAppsPage />} />
            <Route path="/kich-ban" element={<AdminDesktopScriptsPage />} />
            <Route path="/he-thong-nguon" element={<AdminSourcesPage />} />
            <Route path="/cau-hinh" element={<AdminSettingsPage />} />
            <Route path="*" element={<Navigate to="/nguoi-dung" replace />} />
          </Routes>
        </main>
      </div>
    </AdminEnvProvider>
  );
}

void bridge.prefs().then((p) => {
  applyPrefs(p);
  // Mục mở đầu: #ung-dung, #kich-ban… (vd mở từ thông báo) — không có ⇒ Người dùng.
  const start = `/${location.hash.slice(1) || 'nguoi-dung'}`;
  createRoot(document.getElementById('root')!).render(
    <StrictMode><BrandingProvider><MemoryRouter initialEntries={[start]}><AdminApp /></MemoryRouter></BrandingProvider></StrictMode>,
  );
});

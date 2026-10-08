/**
 * Trang Quản trị đơn vị của Vala Desktop: các trang @vala/admin (người dùng, ứng dụng, kịch bản, hệ thống nguồn). Cấu hình
 * chung chỉ ảnh hưởng Báo cáo ⇒ ở lại cổng Báo cáo (người dùng 08/10/2026). Không phụ thuộc cổng web: API đi qua tiến trình chính (preload `valaAdmin`) bằng phiên của ứng dụng; ngôn ngữ +
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
import { AdminTenantsPage } from '@vala/admin/AdminTenants';
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
  title: 'Quản trị', subtitle: 'Người dùng, ứng dụng, kịch bản và hệ thống nguồn của đơn vị',
  users: 'Người dùng', apps: 'Ứng dụng Desktop', scripts: 'Kịch bản Desktop', sources: 'Hệ thống nguồn',
  system: 'Quản trị hệ thống', tenants: 'Đơn vị',
  notAdmin: 'Chỉ quản trị của đơn vị mới dùng được trang này.',
}, {
  title: 'Administration', subtitle: "Your organization's users, apps, scripts and source systems",
  users: 'Users', apps: 'Desktop apps', scripts: 'Desktop scripts', sources: 'Source systems',
  system: 'System administration', tenants: 'Organizations',
  notAdmin: 'Only your organization’s administrators can use this page.',
});

type NavKey = 'users' | 'apps' | 'scripts' | 'sources' | 'tenants';
/** Quản trị đơn vị (is_ops_admin). */
const NAV: Array<{ to: string; key: NavKey; icon: string }> = [
  { to: '/nguoi-dung', key: 'users', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6' },
  { to: '/ung-dung', key: 'apps', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { to: '/kich-ban', key: 'scripts', icon: 'M2 4h20v13H2zM8 21h8M12 17v4M9 9l-2 2 2 2M15 9l2 2-2 2' },
  { to: '/he-thong-nguon', key: 'sources', icon: 'M2 4h20v6H2zM2 14h20v6H2zM6 7h.01M6 17h.01' },
];
/** Quản trị hệ thống (core.system_admins): các đơn vị dùng chung máy chủ. */
const SYSTEM_NAV: Array<{ to: string; key: NavKey; icon: string }> = [
  { to: '/don-vi', key: 'tenants', icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4' },
];

function AdminApp() {
  const t = useT(M);
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const load = () => { setErr(null); api.get<Me>('/me').then(setMe, setErr); };
  useEffect(load, []);
  if (err) return <div className="p-6"><ErrorBox error={err} onRetry={load} /></div>;
  if (!me) return <div className="p-6"><Loading /></div>;
  if (!me.is_ops_admin && !me.is_system_admin) return <div className="p-6 text-slate-600 dark:text-slate-300">{t.notAdmin}</div>;
  const nav = me.is_ops_admin ? NAV : [];
  const system = me.is_system_admin ? SYSTEM_NAV : [];
  const link = (n: { to: string; key: NavKey; icon: string }) => (
    <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm no-underline ${isActive
      ? 'bg-blue-50 font-medium text-blue-700 dark:bg-slate-800 dark:text-blue-300'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
      {t[n.key]}
    </NavLink>
  );
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
            {nav.map(link)}
            {system.length > 0 && (
              <div className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.system}</div>
            )}
            {system.map(link)}
          </nav>
        </aside>
        <main className="min-w-0 overflow-y-auto p-4 md:px-8 md:py-6">
          <Routes>
            {me.is_ops_admin && <>
              <Route path="/nguoi-dung" element={<AdminUsersPage />} />
              <Route path="/ung-dung" element={<AdminDesktopAppsPage />} />
              <Route path="/kich-ban" element={<AdminDesktopScriptsPage />} />
              <Route path="/he-thong-nguon" element={<AdminSourcesPage />} />
            </>}
            {me.is_system_admin && <Route path="/don-vi" element={<AdminTenantsPage />} />}
            <Route path="*" element={<Navigate to={(nav[0] ?? system[0])!.to} replace />} />
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

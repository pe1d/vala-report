/**
 * Khung ứng dụng: header chung (thương hiệu, sáng/tối, người dùng + đăng xuất) và sidebar chia nhóm cha–con.
 * Nhóm bấm để thu gọn/mở, nhớ theo trình duyệt; nhóm chứa trang đang mở luôn mở. Màn hình hẹp: sidebar thành
 * ngăn kéo mở bằng nút ☰ trên header.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import type { Me } from '../api';
import { ThemeToggle } from './ui';
import { ChangePasswordForm } from './ChangePassword';

interface NavItem { to: string; label: string; icon: ReactNode; end?: boolean; admin?: boolean }
interface NavGroup { id: string; label: string; icon: ReactNode; items: NavItem[] }

const I = (d: string) => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const GROUPS: NavGroup[] = [
  { id: 'bao-cao', label: 'Báo cáo', icon: I('M4 19V5M10 19v-8M16 19v-4M22 19H2'), items: [
    { to: '/tong-quan', label: 'Tổng quan', icon: I('M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z') },
    { to: '/bao-cao', label: 'Danh mục báo cáo', end: false, icon: I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5') },
    { to: '/lich-chay', label: 'Lịch cập nhật', icon: I('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z') },
  ] },
  { id: 'ket-noi', label: 'Kết nối', icon: I('M9 15l6-6M11 6l1-1a4 4 0 0 1 6 6l-1 1M13 18l-1 1a4 4 0 0 1-6-6l1-1'), items: [
    { to: '/uy-quyen', label: 'Tài khoản nguồn', icon: I('M15 7a2 2 0 1 1 0 .01M21 2l-9.6 9.6M15.5 7.5 19 4l3 3-3.5 3.5M7.5 22a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z') },
    { to: '/ket-noi', label: 'Kết nối dữ liệu', admin: true, icon: I('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8') },
  ] },
  { id: 'quan-tri', label: 'Quản trị', icon: I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'), items: [
    { to: '/he-thong-nguon', label: 'Hệ thống nguồn', admin: true, icon: I('M2 4h20v6H2zM2 14h20v6H2zM6 7h.01M6 17h.01') },
    { to: '/script-crawl', label: 'Script crawl', admin: true, icon: I('M16 18l6-6-6-6M8 6l-6 6 6 6') },
    { to: '/nguoi-dung', label: 'Người dùng', admin: true, icon: I('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6') },
    { to: '/cau-hinh-bao-cao', label: 'Cấu hình báo cáo', admin: true, icon: I('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6') },
    { to: '/van-hanh', label: 'Vận hành', admin: true, icon: I('M22 12h-4l-3 9L9 3l-3 9H2') },
  ] },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const orgText = (me: Me) => me.org_units.map((o) => o.ten + (o.vai_tro === 'truong_don_vi' ? ' (trưởng)' : '')).join(', ');

const COLLAPSE_KEY = 'vala.sidebar.thu-gon';

export function Shell({ me, onLogout, children }: { me: Me; onLogout: () => void; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  // Máy tính: thu gọn sidebar thành dải biểu tượng; nhớ theo trình duyệt. Ctrl+B để bật/tắt nhanh.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* bỏ qua */ }
    return !c;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleCollapsed(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);
  const rail = collapsed && !drawer;   // ngăn kéo trên điện thoại luôn hiện đủ chữ
  return (
    <div className="min-h-screen">
      <Header me={me} onLogout={onLogout} onMenu={() => setDrawer(!drawer)} drawer={drawer} collapsed={collapsed} onCollapse={toggleCollapsed} />
      <div className={`md:grid md:transition-[grid-template-columns] md:duration-200 ${collapsed ? 'md:grid-cols-[64px_minmax(0,1fr)]' : 'md:grid-cols-[240px_minmax(0,1fr)]'}`}>
        {drawer && <div className="fixed inset-0 top-14 z-30 bg-slate-900/40 md:hidden" onClick={() => setDrawer(false)} aria-hidden />}
        <aside id="sidebar"
          className={`${drawer ? 'fixed inset-y-0 left-0 top-14 z-40 w-64 shadow-xl' : 'hidden'} flex-col overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900
            md:sticky md:top-14 md:flex md:h-[calc(100vh-3.5rem)] md:w-auto md:shadow-none ${drawer ? 'flex' : ''}`}>
          <Sidebar isAdmin={me.is_ops_admin} rail={rail} />
          <button type="button" onClick={toggleCollapsed} title={collapsed ? 'Mở rộng menu (Ctrl+B)' : 'Thu gọn menu (Ctrl+B)'}
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'} aria-expanded={!collapsed}
            className={`mt-auto hidden items-center gap-2.5 border-t border-slate-200 px-5 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900 md:flex dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${rail ? 'justify-center px-0' : ''}`}>
            {I(collapsed ? 'm13 17 5-5-5-5M6 17l5-5-5-5' : 'm11 17-5-5 5-5M18 17l-5-5 5-5')}
            {!rail && <span>Thu gọn</span>}
          </button>
        </aside>
        <main className="w-full min-w-0 p-4 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  );
}

function Header({ me, onLogout, onMenu, drawer, collapsed, onCollapse }: {
  me: Me; onLogout: () => void; onMenu: () => void; drawer: boolean; collapsed: boolean; onCollapse: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur md:px-5 dark:border-slate-800 dark:bg-slate-900/95">
      <button type="button" onClick={onMenu} aria-label="Mở menu" aria-expanded={drawer} aria-controls="sidebar"
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800">
        {I(drawer ? 'M6 6l12 12M18 6 6 18' : 'M4 6h16M4 12h16M4 18h16')}
      </button>
      <button type="button" onClick={onCollapse} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'} aria-expanded={!collapsed} aria-controls="sidebar"
        title={collapsed ? 'Mở rộng menu (Ctrl+B)' : 'Thu gọn menu (Ctrl+B)'}
        className="hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 md:inline-flex dark:text-slate-300 dark:hover:bg-slate-800">
        {I(collapsed ? 'M3 3h18v18H3zM9 3v18M13 9l3 3-3 3' : 'M3 3h18v18H3zM9 3v18M16 9l-3 3 3 3')}
      </button>
      <NavLink to="/tong-quan" className="flex items-center gap-2.5 text-slate-900 no-underline dark:text-slate-50">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm dark:bg-blue-500">V</span>
        <span className="leading-tight">
          <span className="block whitespace-nowrap font-semibold">Vala Reporting</span>
          <span className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">Báo cáo tự động từ các hệ thống Bkav</span>
        </span>
      </NavLink>
      <span className="flex-1" />
      {/* Màn hình hẹp: nút sáng/tối nằm trong menu người dùng cho header đỡ chật. */}
      <div className="hidden sm:block"><ThemeToggle /></div>
      <UserMenu me={me} onLogout={onLogout} />
    </header>
  );
}

function UserMenu({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState<'form' | 'done' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const org = orgText(me);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{initials(me.ho_ten)}</span>
        <span className="hidden leading-tight sm:block">
          <span className="block max-w-[180px] truncate text-sm font-medium text-slate-900 dark:text-slate-100">{me.ho_ten}</span>
          {org && <span className="block max-w-[180px] truncate text-[11px] text-slate-500 dark:text-slate-400">{org}</span>}
        </span>
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{me.ho_ten}</div>
            {org && <div className="text-xs text-slate-500 dark:text-slate-400">{org}</div>}
            {me.is_ops_admin && <div className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">Quản trị hệ thống</div>}
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm text-slate-600 sm:hidden dark:border-slate-800 dark:text-slate-300">
            Giao diện <ThemeToggle />
          </div>
          <NavLink role="menuitem" to="/uy-quyen" onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 no-underline hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Tài khoản nguồn của tôi</NavLink>
          {me.has_password && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setPw('form'); }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Đổi mật khẩu</button>
          )}
          <button type="button" role="menuitem" onClick={onLogout}
            className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">Đăng xuất</button>
        </div>
      )}
      {/* Portal ra body: header có backdrop-blur nên mọi phần tử fixed bên trong bị giới hạn theo khung header. */}
      {pw && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="doi-mk"
          onKeyDown={(e) => e.key === 'Escape' && setPw(null)}>
          <div className="mx-auto mt-16 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <h2 id="doi-mk" className="mb-4 text-base font-semibold">Đổi mật khẩu</h2>
            {pw === 'form'
              ? <ChangePasswordForm onDone={() => setPw('done')} onCancel={() => setPw(null)} />
              : (
                <div className="grid gap-4">
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">Đã đổi mật khẩu. Lần đăng nhập sau (cả trên tiện ích) dùng mật khẩu mới.</p>
                  <div className="flex justify-end"><button type="button" onClick={() => setPw(null)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">Đóng</button></div>
                </div>
              )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const itemCls = ({ isActive }: { isActive: boolean }) =>
  'relative flex items-center gap-2.5 rounded-md py-1.5 pl-8 pr-2.5 text-sm no-underline transition-colors ' + (isActive
    ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100');

const railCls = ({ isActive }: { isActive: boolean }) =>
  'mx-auto grid h-10 w-10 place-items-center rounded-md transition-colors ' + (isActive
    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100');

function Sidebar({ isAdmin, rail }: { isAdmin: boolean; rail: boolean }) {
  const { pathname } = useLocation();
  const KEY = 'vala.sidebar.dong';
  const [closed, setClosed] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } });
  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id];
    setClosed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  };
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.admin || isAdmin) })).filter((g) => g.items.length);
  if (rail) {
    // Thu gọn: chỉ biểu tượng, nhóm ngăn bằng vạch; rê chuột thấy tên trang.
    return (
      <nav aria-label="Điều hướng chính" className="flex flex-col gap-1 py-3">
        {groups.map((g, gi) => (
          <div key={g.id} role="group" aria-label={g.label} className={`flex flex-col gap-1 ${gi ? 'mt-1 border-t border-slate-200 pt-2 dark:border-slate-800' : ''}`}>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end ?? true} className={railCls} title={`${g.label} › ${i.label}`} aria-label={i.label}>{i.icon}</NavLink>
            ))}
          </div>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Điều hướng chính" className="flex flex-col gap-1 p-3">
      {groups.map((g) => {
        const active = g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
        const open = active || !closed.includes(g.id);
        return (
          <div key={g.id}>
            <button type="button" aria-expanded={open} aria-controls={`nav-${g.id}`} onClick={() => toggle(g.id)} disabled={active}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold uppercase tracking-wide transition-colors
                ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}>
              <span className={active ? 'text-blue-600 dark:text-blue-400' : ''}>{g.icon}</span>
              <span className="flex-1">{g.label}</span>
              {!active && (
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${open ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
              )}
            </button>
            {open && (
              <div id={`nav-${g.id}`} className="relative mb-1 mt-0.5 flex flex-col gap-0.5 before:absolute before:bottom-1 before:left-[1.05rem] before:top-1 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
                {g.items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end ?? true} className={itemCls}>
                    <span className="shrink-0 opacity-80">{i.icon}</span><span className="truncate">{i.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

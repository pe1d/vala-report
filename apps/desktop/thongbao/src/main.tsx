/**
 * Trung tâm thông báo của Vala Desktop (09/10/2026): thông báo gom từ Vala và các ứng dụng tích hợp — lọc theo ứng dụng /
 * trạng thái, tìm, chọn nhiều để xử lý hàng loạt (đã đọc, đã xử lý, xoá); bấm ⇒ mở chi tiết trong đúng ứng dụng.
 * Dữ liệu qua thongbao-page.ts (kho thông báo trên máy chủ).
 */
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { messages, setLang, useT, type Lang } from '@vala/ui/i18n';
import { setTheme, type ThemeMode } from '@vala/ui/theme';
import { Banner, Button, Skeleton } from '@vala/ui/ui';
import './index.css';

interface ThongBao { id: string; ung_dung: string; tieu_de: string; noi_dung: string | null; link: string | null; quan_trong: boolean; da_doc: boolean; da_xu_ly: boolean; luc: string }
interface Dem { cho_xu_ly: number; chua_doc: number; da_xu_ly: number; theo_ung_dung: Record<string, { cho: number; chua_doc: number }> }
type Apps = Record<string, { ten: string; icon: string | null }>;
type ListRes = { ok: true; items: ThongBao[]; dem: Dem; apps: Apps } | { ok: false; error: string };
interface Bridge {
  state(): Promise<{ lang: Lang; theme: ThemeMode; dev: boolean; apps: Apps }>;
  list(q: { trang_thai: 'cho_xu_ly' | 'tat_ca'; ung_dung: string | null }): Promise<ListRes>;
  act(a: { act: string; ids?: string[] }): Promise<{ ok: boolean }>;
  onChanged(cb: () => void): void;
  onPrefs(cb: (p: { lang: Lang; theme: ThemeMode }) => void): void;
}
const bridge = (window as unknown as { valaThongBao: Bridge }).valaThongBao;
const applyPrefs = (p: { lang: Lang; theme: ThemeMode }) => { setLang(p.lang, true); setTheme(p.theme, true); document.documentElement.lang = p.lang; };
bridge.onPrefs(applyPrefs);

const M = messages({
  title: 'Trung tâm thông báo', subtitle: 'Thông báo từ Vala và các ứng dụng của đơn vị. Bấm một thông báo để mở chi tiết trong đúng ứng dụng.',
  apps: 'Ứng dụng', allApps: 'Tất cả ứng dụng',
  pending: 'Chờ xử lý', done: 'Đã xử lý', all: 'Tất cả', unread: 'Chưa đọc',
  search: 'Tìm trong thông báo…', selected: (n: number) => `Đã chọn ${n}`, selectAll: 'Chọn tất cả',
  markRead: 'Đánh dấu đã đọc', markUnread: 'Đánh dấu chưa đọc', markDone: 'Đã xử lý', markPending: 'Đưa lại chờ xử lý', remove: 'Xoá',
  clearDone: (n: number) => `Xoá tất cả đã xử lý (${n})`, sample: 'Tạo thông báo mẫu (bản dev)', refresh: 'Làm mới',
  open: 'Mở chi tiết', important: 'Quan trọng', emptyPending: 'Không còn thông báo nào chờ xử lý.', empty: 'Không có thông báo.',
  emptyDone: 'Chưa có thông báo nào đã xử lý.', noMatch: 'Không có thông báo khớp.',
  failed: 'Không tải được thông báo', retry: 'Thử lại',
  justNow: 'vừa xong', minutes: (n: number) => `${n} phút trước`, hours: (n: number) => `${n} giờ trước`, yesterday: 'hôm qua',
  removeConfirm: (n: number) => `Xoá ${n} thông báo khỏi danh sách?`,
}, {
  title: 'Notification center', subtitle: "Notifications from Vala and your organization's apps. Click one to open its details in the right app.",
  apps: 'Apps', allApps: 'All apps',
  pending: 'Pending', done: 'Done', all: 'All', unread: 'Unread',
  search: 'Search notifications…', selected: (n: number) => `${n} selected`, selectAll: 'Select all',
  markRead: 'Mark as read', markUnread: 'Mark as unread', markDone: 'Mark as done', markPending: 'Mark as pending', remove: 'Remove',
  clearDone: (n: number) => `Clear all done (${n})`, sample: 'Create sample notifications (dev)', refresh: 'Refresh',
  open: 'Open details', important: 'Important', emptyPending: 'Nothing pending.', empty: 'No notifications.',
  emptyDone: 'No notifications marked as done yet.', noMatch: 'No matching notifications.',
  failed: 'Could not load notifications', retry: 'Try again',
  justNow: 'just now', minutes: (n: number) => `${n} min ago`, hours: (n: number) => `${n} h ago`, yesterday: 'yesterday',
  removeConfirm: (n: number) => `Remove ${n} notifications from the list?`,
});
type T = (typeof M)['vi'];

type Tab = 'cho_xu_ly' | 'da_xu_ly' | 'tat_ca';

function ago(iso: string, t: T): string {
  const d = new Date(iso);
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 1) return t.justNow;
  if (m < 60) return t.minutes(m);
  if (m < 24 * 60) return t.hours(Math.floor(m / 60));
  if (m < 48 * 60) return t.yesterday;
  return d.toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function AppIcon({ apps, ma, size = 'h-9 w-9' }: { apps: Apps; ma: string; size?: string }) {
  const [bad, setBad] = useState(false);
  const a = apps[ma];
  if (a?.icon && !bad) return <img src={a.icon} alt="" className={`${size} shrink-0 rounded-[22%]`} onError={() => setBad(true)} />;
  return <span className={`${size} flex shrink-0 items-center justify-center rounded-[22%] bg-slate-400 text-xs font-semibold text-white`}>{((a?.ten ?? ma).trim()[0] ?? '•').toUpperCase()}</span>;
}

function App({ dev }: { dev: boolean }) {
  const t = useT(M);
  const [tab, setTab] = useState<Tab>('cho_xu_ly');
  const [app, setApp] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ items: ThongBao[]; dem: Dem; apps: Apps } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await bridge.list({ trang_thai: tab === 'cho_xu_ly' ? 'cho_xu_ly' : 'tat_ca', ung_dung: app });
    if (r.ok) { setData({ items: r.items, dem: r.dem, apps: r.apps }); setErr(null); } else setErr(r.error);
  }, [tab, app]);
  useEffect(() => { void load(); setSel(new Set()); }, [load]);
  useEffect(() => bridge.onChanged(() => void load()), [load]);

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (tab === 'da_xu_ly') list = list.filter((x) => x.da_xu_ly);
    const w = q.trim().toLowerCase();
    if (w) list = list.filter((x) => `${x.tieu_de} ${x.noi_dung ?? ''} ${data?.apps[x.ung_dung]?.ten ?? ''}`.toLowerCase().includes(w));
    return list;
  }, [data, tab, q]);

  const act = async (a: string, ids: string[]) => {
    if (a === 'xoa' && ids.length > 1 && !window.confirm(t.removeConfirm(ids.length))) return;
    setBusy(true);
    await bridge.act({ act: a, ids });
    setSel(new Set());
    await load();
    setBusy(false);
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSel = items.length > 0 && items.every((x) => sel.has(x.id));
  const selIds = [...sel];
  const selItems = items.filter((x) => sel.has(x.id));

  const apps = data?.apps ?? {};
  const counts = data?.dem.theo_ung_dung ?? {};
  // Ứng dụng có thông báo (đầu), rồi các ứng dụng còn lại của danh mục.
  const appList = useMemo(() => [...new Set([...Object.keys(counts), ...Object.keys(apps)])], [counts, apps]);

  const tabBtn = (k: Tab, label: string, n?: number) => (
    <button type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? 'bg-white font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`}>
      {label}{n ? <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{n}</span> : null}
    </button>
  );

  return (
    <div className="flex h-screen min-h-0 bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {/* Cột lọc theo ứng dụng */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 p-3 dark:border-slate-800">
        <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.apps}</div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {[null, ...appList].map((ma) => {
            const c = ma ? counts[ma]?.cho ?? 0 : data?.dem.cho_xu_ly ?? 0;
            const on = app === ma;
            return (
              <button key={ma ?? '*'} type="button" onClick={() => setApp(ma)} aria-pressed={on}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm ${on ? 'bg-blue-50 font-medium text-blue-800 dark:bg-slate-800 dark:text-blue-300' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
                {ma ? <AppIcon apps={apps} ma={ma} size="h-6 w-6" /> : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-[22%] bg-slate-700 text-white dark:bg-slate-600">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{ma ? apps[ma]?.ten ?? ma : t.allApps}</span>
                {c > 0 && <span className="text-xs tabular-nums text-slate-500">{c}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 px-6 pb-3 pt-5 dark:border-slate-800">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold">{t.title}</h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t.subtitle}</p>
            </div>
            {dev && <Button onClick={() => void act('mau', [])}>{t.sample}</Button>}
            <Button onClick={() => void load()}>{t.refresh}</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="group">
              {tabBtn('cho_xu_ly', t.pending, data?.dem.chua_doc)}{tabBtn('da_xu_ly', t.done)}{tabBtn('tat_ca', t.all)}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search}
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
            {!!data?.dem.da_xu_ly && <button type="button" onClick={() => void act('xoa_da_xu_ly', [])} className="text-sm text-slate-500 hover:text-red-600 hover:underline dark:text-slate-400">{t.clearDone(data.dem.da_xu_ly)}</button>}
          </div>
          {/* Thanh xử lý hàng loạt */}
          <div className="mt-3 flex min-h-[34px] flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(items.map((x) => x.id)))} />
              {sel.size ? t.selected(sel.size) : t.selectAll}
            </label>
            {sel.size > 0 && <>
              <Button disabled={busy} onClick={() => void act(selItems.every((x) => x.da_doc) ? 'chua_doc' : 'doc', selIds)}>{selItems.every((x) => x.da_doc) ? t.markUnread : t.markRead}</Button>
              <Button variant="primary" disabled={busy} onClick={() => void act(selItems.every((x) => x.da_xu_ly) ? 'chua_xu_ly' : 'xu_ly', selIds)}>{selItems.every((x) => x.da_xu_ly) ? t.markPending : t.markDone}</Button>
              <Button disabled={busy} onClick={() => void act('xoa', selIds)}>{t.remove}</Button>
            </>}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {err && <Banner tone="err" role="alert">{t.failed}: {err} <button type="button" className="ml-2 underline" onClick={() => void load()}>{t.retry}</button></Banner>}
          {!data && !err && <div className="space-y-3 p-2">{[90, 70, 85, 60].map((w) => <Skeleton key={w} width={`${w}%`} />)}</div>}
          {data && !items.length && (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              {q ? t.noMatch : tab === 'cho_xu_ly' ? t.emptyPending : tab === 'da_xu_ly' ? t.emptyDone : t.empty}
            </div>
          )}
          <ul className="space-y-1">
            {items.map((x) => (
              <li key={x.id} className={`group flex items-start gap-3 rounded-xl px-3 py-3 ${sel.has(x.id) ? 'bg-blue-50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'} ${x.da_xu_ly ? 'opacity-70' : ''}`}>
                <input type="checkbox" className="mt-3" checked={sel.has(x.id)} onChange={() => toggle(x.id)} aria-label={x.tieu_de} />
                <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => void act('open', [x.id])} title={t.open}>
                  <AppIcon apps={apps} ma={x.ung_dung} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className={`min-w-0 flex-1 text-[14px] ${x.da_doc ? 'text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-white'}`}>{x.tieu_de}</span>
                      {!x.da_doc && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" aria-label={t.unread} />}
                    </span>
                    {x.noi_dung && <span className="mt-0.5 block text-[13px] text-slate-600 dark:text-slate-400">{x.noi_dung}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      {x.quan_trong && <span className="rounded bg-red-100 px-1.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{t.important}</span>}
                      {x.da_xu_ly && <span className="rounded bg-emerald-100 px-1.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{t.done}</span>}
                      <span>{apps[x.ung_dung]?.ten ?? x.ung_dung} · {ago(x.luc, t)}</span>
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                  <Button className="px-2 py-1 text-xs" disabled={busy} onClick={() => void act(x.da_xu_ly ? 'chua_xu_ly' : 'xu_ly', [x.id])}>{x.da_xu_ly ? t.markPending : t.markDone}</Button>
                  <Button className="px-2 py-1 text-xs" disabled={busy} onClick={() => void act('xoa', [x.id])}>{t.remove}</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}

void bridge.state().then((s) => {
  applyPrefs(s);
  createRoot(document.getElementById('root')!).render(<StrictMode><App dev={s.dev} /></StrictMode>);
});

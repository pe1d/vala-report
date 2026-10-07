/**
 * Cửa sổ tab: một BrowserWindow, phần trên chỉ là thanh tab (resources/tabs.html), mỗi tab là một WebContentsView đặt bên
 * dưới, chỉ tab đang chọn hiện. Cố ý KHÔNG có ô địa chỉ, nút điều hướng, nút tab mới: đây là ứng dụng làm việc, không phải
 * trình duyệt — người dùng không thấy và không gõ địa chỉ trang.
 *
 * Tab ghim (không đóng được): Vala (trang chính) · Báo cáo (cổng Vala Reporting), nạp trang khi được bấm lần đầu.
 * Tab hệ thống nguồn (eGov, eTask…): mở khi cần (menu ⋯, luồng kết nối), đóng được — đóng tab không mất kết nối, phiên
 * vẫn nằm trong ứng dụng và Vala vẫn lấy dữ liệu theo lịch. Tab thường: link target=_blank, window.open trong trang. Popup có kích thước và form POST vẫn mở cửa sổ thật (xem tabs-model.ts openTarget).
 *
 * Mọi tab dùng portal-preload.js (cầu nối với cổng) — tiến trình chính tự kiểm origin trước khi trả lời, nên tab của
 * trang khác không gọi được gì.
 */
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, session, shell, WebContentsView, type HandlerDetails, type Input, type IpcMainInvokeEvent, type Menu, type WebContents } from 'electron';
import { APP_NAME, ICON, IS_DEV } from './channel';
import { messages, normLang } from './i18n';
import { attachAutofill } from './autofill';
import { attachPackages, injectAll, packageEvents } from './scripts';
import { isPortalUrl, mapToUi, UI_ORIGIN, uiEvents, uiPortalUrl } from './ui-cache';
import { currentPrefs, prefsEvents, setPrefs } from './prefs';
import { getSettings } from './settings';
import { cachedSources, events, statusOf, type SourceFull } from './sync';
import { openTarget, tabStatus, type TabStatus } from './tabs-model';
import { pendingUpdate, promptInstall } from './updater';

const M = messages({
  home: 'Vala', reports: 'Báo cáo', newTab: 'Trang',
  close: 'Đóng tab (Ctrl+W)', menu: 'Hệ thống nguồn',
  signIn: 'Đăng nhập', signInTitle: 'Đăng nhập Vala Reporting ở tab Báo cáo', account: 'Tài khoản',
  lightMode: 'Chế độ sáng', darkMode: 'Chế độ tối',
  updateTitle: 'Cài bản mới: ứng dụng đóng lại, cài xong tự mở lại',
  updateLabel: (v: string) => `Đã có bản ${v} — Cập nhật`,
  status: { ok: 'Đã kết nối', warn: 'Cần đăng nhập lại', off: 'Chưa kết nối' } as Record<TabStatus, string>,
}, {
  home: 'Vala', reports: 'Reports', newTab: 'Page',
  close: 'Close tab (Ctrl+W)', menu: 'Source systems',
  signIn: 'Sign in', signInTitle: 'Sign in to Vala Reporting on the Reports tab', account: 'Account',
  lightMode: 'Light mode', darkMode: 'Dark mode',
  updateTitle: 'Install the new version: the app closes, installs and reopens',
  updateLabel: (v: string) => `Version ${v} available — Update`,
  status: { ok: 'Connected', warn: 'Needs signing in again', off: 'Not connected' } as Record<TabStatus, string>,
});

/** Chiều cao thanh tab — phải khớp resources/tabs.html (40px). */
const TOOLBAR_H = 40;
const TAB_PRELOAD = join(__dirname, 'portal-preload.js');

interface PinnedDef { key: string; label: string; url: string }
interface Tab {
  key: string;
  pinned: boolean;
  url: string;
  view: WebContentsView | null;
  favicon?: string;
  /** Lúc tab được chọn gần nhất (tính thời gian làm việc trên tab). */
  since?: number;
}

export interface BrowserHooks {
  /** Rời một tab sau `ms` mili-giây đang xem (vd rời tab eGov ⇒ báo lấy dữ liệu ngay). */
  onLeave: (key: string, ms: number) => void;
  /** Menu "⋯" ở góc phải thanh tab. */
  menu: () => Menu;
  /** Menu hồ sơ (bấm tên / ảnh đại diện). */
  profileMenu: () => Menu;
  /** Nút "Đăng nhập" (chưa đăng nhập): đưa sang tab Báo cáo. */
  signIn: () => void;
  /** Menu chuột phải trên một tab (tab nguồn / trang khác: mật khẩu); null ⇒ không có menu. */
  tabMenu: (key: string, url: string) => Menu | null;
}

let hooks: BrowserHooks;
let win: BrowserWindow | null = null;
const tabs = new Map<string, Tab>();
/** Thứ tự các tab đóng được — tab hệ thống nguồn đứng đầu nhóm (tab ghim luôn đứng trước, theo pinnedDefs). */
let order: string[] = [];
let active: string | null = null;
let nextId = 1;
let quitting = false;
app.on('before-quit', () => { quitting = true; });

export const sourceTabKey = (code: string) => `src:${code}`;

function pinnedDefs(): PinnedDef[] {
  const s = getSettings();
  const t = M[s.lang];
  const defs: PinnedDef[] = [{ key: 'home', label: t.home, url: s.homeUrl }];
  // Tab Báo cáo luôn có — kể cả khi chưa đăng nhập: đó là nơi đăng nhập (cổng cấp quyền cho ứng dụng qua cầu nối).
  // Giao diện cổng chạy từ bản trong máy khi đã tải được (ui-cache.ts), không thì nạp thẳng từ máy chủ.
  if (s.serverUrl) defs.push({ key: 'portal', label: t.reports, url: uiPortalUrl() ?? s.serverUrl });
  return defs;
}

/** Nguồn của một tab hệ thống nguồn (null nếu không phải tab nguồn hoặc nguồn không còn). */
const sourceOf = (key: string): SourceFull | null =>
  (key.startsWith('src:') && getSettings().deviceToken ? cachedSources().find((s) => sourceTabKey(s.code) === key) : undefined) ?? null;

/**
 * Khớp tab với cấu hình hiện tại: thêm tab ghim mới có, bỏ tab không còn (đăng xuất ⇒ đóng cả Báo cáo lẫn các tab nguồn),
 * đổi trang chính ⇒ nạp lại.
 */
function syncPinned(): void {
  const defs = pinnedDefs();
  const keep = new Set(defs.map((d) => d.key));
  for (const t of [...tabs.values()]) {
    if (t.pinned && !keep.has(t.key)) destroyTab(t.key);
    // Danh sách nguồn chưa tải xong lúc khởi động thì chưa kết luận — chỉ đóng khi đã đăng xuất.
    else if (t.key.startsWith('src:') && !getSettings().deviceToken) destroyTab(t.key);
  }
  for (const d of defs) {
    const t = tabs.get(d.key);
    if (!t) { tabs.set(d.key, { key: d.key, pinned: true, url: d.url, view: null }); continue; }
    if (d.key === 'home' && t.url !== d.url) {
      t.url = d.url;
      if (t.view) void t.view.webContents.loadURL(d.url);
    }
  }
}

/** Tab Báo cáo chưa nạp trang: cập nhật địa chỉ sẽ nạp (bản trong máy vừa có / vừa đổi). */
function syncPinnedPortalUrl(): void {
  const t = tabs.get('portal');
  const def = pinnedDefs().find((d) => d.key === 'portal');
  if (t && def && !t.view) t.url = def.url;
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  const w = new BrowserWindow({
    width: 1280, height: 860, minWidth: 720, minHeight: 480, icon: ICON, title: APP_NAME, show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'tabs-preload.js') },
  });
  win = w;
  // Tiêu đề cửa sổ luôn là tên ứng dụng (bản dev: "Vala Desktop (dev)"), không theo tiêu đề trang thanh tab.
  w.on('page-title-updated', (e) => e.preventDefault());
  w.once('ready-to-show', () => w.show());
  // Đóng cửa sổ chỉ ẩn xuống khay hệ thống (các tab, phiên vẫn giữ); "Thoát" mới đóng thật.
  w.on('close', (e) => { if (!quitting) { e.preventDefault(); w.hide(); } });
  w.on('closed', () => { win = null; tabs.clear(); order = []; active = null; });
  // Trên Linux, sự kiện phóng to/đổi cỡ đến TRƯỚC khi cửa sổ đổi kích thước thật ⇒ canh ngay và canh lại sau một nhịp.
  // Tín hiệu chính xác nhất là trang thanh tab báo khung nhìn đổi cỡ ('tabs:resized').
  const relayout = () => { layout(); setTimeout(layout, 100); };
  for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'] as const) w.on(ev as 'resize', relayout);
  w.webContents.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  void w.loadFile(join(__dirname, '../resources/tabs.html'));
  syncPinned();
  return w;
}

function layout(): void {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  const bounds = { x: 0, y: TOOLBAR_H, width: width!, height: Math.max(0, height! - TOOLBAR_H) };
  for (const t of tabs.values()) t.view?.setBounds(bounds);
}

// ---- tab Cài đặt (như chrome://settings): trang cục bộ, preload riêng, không điều hướng đi đâu ----
const SETTINGS = 'settings';
let settingsSection = '';

function createSettingsView(t: Tab): WebContentsView {
  const view = new WebContentsView({ webPreferences: { preload: join(__dirname, 'settings-preload.js') } });
  t.view = view;
  win!.contentView.addChildView(view);
  view.setVisible(false);
  const wc = view.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('page-title-updated', () => pushState());
  wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  void wc.loadFile(join(__dirname, '../resources/settings.html'), settingsSection ? { hash: settingsSection } : undefined);
  layout();
  return view;
}

/** Mở (hoặc chuyển tới) tab Cài đặt; `section` (vd 'mat-khau') ⇒ nhảy tới mục đó. */
export function openSettingsTab(section = ''): void {
  ensureWindow();
  settingsSection = section;
  if (!tabs.has(SETTINGS)) {
    tabs.set(SETTINGS, { key: SETTINGS, pinned: false, url: '', view: null });
    order.push(SETTINGS);
  } else if (section) {
    tabs.get(SETTINGS)!.view?.webContents.send('vala:settings-section', section);
  }
  showTab(SETTINGS);
}

export const isSettingsContents = (wc: WebContents): boolean => tabs.get(SETTINGS)?.view?.webContents === wc;

/** Báo tab Cài đặt (nếu đang mở) vẽ lại. */
export function pushSettings(): void {
  const wc = tabs.get(SETTINGS)?.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.send('vala:settings-changed');
}

function createView(t: Tab): WebContentsView {
  if (t.key === SETTINGS) return createSettingsView(t);
  const view = new WebContentsView({ webPreferences: { preload: TAB_PRELOAD } });
  t.view = view;
  win!.contentView.addChildView(view);
  view.setVisible(false);
  const wc = view.webContents;
  wc.setWindowOpenHandler((d: HandlerDetails) => {
    const target = openTarget({ url: d.url, disposition: d.disposition, hasPostBody: !!d.postBody });
    if (target.kind === 'window') return { action: 'allow', overrideBrowserWindowOptions: { icon: ICON, autoHideMenuBar: true } };
    if (target.kind === 'external') void shell.openExternal(d.url);
    if (target.kind === 'tab') openTab(d.url, target.foreground, t.key);
    return { action: 'deny' };
  });
  const push = () => pushState();
  // Chỉ vẽ lại thanh tab khi tiêu đề đổi / trang chính điều hướng — không theo sự kiện tải khung con (trang như vala.bkav.com,
  // eGov tải ngầm liên tục).
  for (const ev of ['page-title-updated', 'did-navigate'] as const) wc.on(ev as 'did-navigate', push);
  // Trang có thể tự đổi favicon (vd vala.bkav.com vẽ số thông báo ⇒ data:image/...): nhận cả data:image; lần cập nhật không
  // có ảnh dùng được thì GIỮ favicon cũ, không xoá.
  wc.on('page-favicon-updated', (_e, favicons) => {
    const f = favicons.find((u) => /^(https?:|data:image\/)/.test(u));
    if (f && f !== t.favicon) { t.favicon = f; push(); }
  });
  wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  // Gói kịch bản của quản trị (sửa giao diện, thao tác có tên) — chèn vào trang khớp mẫu địa chỉ (scripts.ts).
  attachPackages(wc);
  // Trang đăng nhập của hệ thống nguồn có mật khẩu đã lưu ⇒ tự đăng nhập (autofill.ts, T08).
  attachAutofill(wc);
  // Tab Báo cáo chạy bản giao diện trong máy: trang của cổng trên máy chủ (vd SSO đăng nhập xong chuyển về
  // https://<máy chủ>/#token…) ⇒ mở cùng đường dẫn trong bản trong máy, giữ nguyên query và #.
  if (t.key === 'portal') {
    const toUi = (e: { preventDefault(): void }, url: string) => {
      const m = mapToUi(url);
      if (!m) return;
      e.preventDefault();
      void wc.loadURL(m);
    };
    wc.on('will-redirect', (e, url) => toUi(e, url));
    wc.on('will-navigate', (e, url) => toUi(e, url));
  }
  void wc.loadURL(t.url);
  layout();
  return view;
}

function destroyTab(key: string): void {
  const t = tabs.get(key);
  if (!t) return;
  if (t.view && win && !win.isDestroyed()) {
    win.contentView.removeChildView(t.view);
    t.view.webContents.close();
  }
  tabs.delete(key);
  order = order.filter((k) => k !== key);
  if (active === key) active = null;
}

/** Đưa cửa sổ lên — chỉ khi đang ẩn/thu nhỏ/không được chọn (gọi show/focus thừa làm cửa sổ giật trên vài trình quản lý cửa sổ). */
function reveal(w: BrowserWindow, force = false) {
  if (w.isMinimized()) w.restore();
  if (!w.isVisible()) w.show();
  if (force && process.platform === 'linux') {
    // Bấm thông báo: trình quản lý cửa sổ (GNOME…) chặn ứng dụng tự giành focus ⇒ đưa tạm lên trên cùng rồi trả lại.
    w.setAlwaysOnTop(true);
    w.focus();
    w.setAlwaysOnTop(false);
  } else if (!w.isFocused()) w.focus();
  if (force) w.moveTop();
}

/** Bấm thông báo: hiện cửa sổ ở tab đang chọn (chưa có tab nào ⇒ tab Vala), kể cả khi ứng dụng đang ẩn ở khay. */
export function revealWindow(): void {
  showTab(active ?? 'home');
  if (win && !win.isDestroyed()) reveal(win, true);
}

/** Chọn một tab (tạo cửa sổ / nạp trang nếu cần) và đưa cửa sổ lên trước. */
export function showTab(key: string, opts: { reloadTo?: string } = {}): boolean {
  const w = ensureWindow();
  syncPinned();
  const t = tabs.get(key);
  if (!t) return false;
  const prev = active ? tabs.get(active) : undefined;
  if (!t.view) createView(t);
  else if (opts.reloadTo) void t.view.webContents.loadURL(opts.reloadTo);
  // Hiện tab mới TRƯỚC rồi mới ẩn tab cũ: làm ngược lại sẽ lộ nền cửa sổ trong một khung hình (nháy khi chuyển tab).
  t.view!.setVisible(true);
  if (prev && prev.key !== key) {
    prev.view?.setVisible(false);
    if (prev.since) hooks.onLeave(prev.key, Date.now() - prev.since);
    prev.since = undefined;
  }
  t.since = t.since ?? Date.now();
  active = key;
  reveal(w);
  t.view!.webContents.focus();
  pushState();
  return true;
}

/** Mở (hoặc chuyển tới) tab của một hệ thống nguồn; `reloadTo` ⇒ đưa về trang đó (vd trang đăng nhập khi kết nối). */
export function showSourceTab(src: SourceFull, opts: { reloadTo?: string } = {}): void {
  ensureWindow();
  const key = sourceTabKey(src.code);
  if (!tabs.has(key)) {
    tabs.set(key, { key, pinned: false, url: opts.reloadTo ?? src.login_url, view: null });
    // Gom các tab nguồn ở đầu nhóm tab đóng được, theo thứ tự mở.
    const lastSrc = order.reduce((i, k, idx) => (k.startsWith('src:') ? idx : i), -1);
    order.splice(lastSrc + 1, 0, key);
    showTab(key);
    return;
  }
  showTab(key, opts);
}

/**
 * Tab của một hệ thống nguồn để chạy thao tác: đang mở thì dùng luôn, chưa thì mở NỀN (không chuyển tab người dùng đang xem).
 * Trả webContents của tab.
 */
export function backgroundSourceTab(src: SourceFull): WebContents {
  ensureWindow();
  const key = sourceTabKey(src.code);
  let t = tabs.get(key);
  if (!t) {
    t = { key, pinned: false, url: src.login_url, view: null };
    tabs.set(key, t);
    const lastSrc = order.reduce((i, k, idx) => (k.startsWith('src:') ? idx : i), -1);
    order.splice(lastSrc + 1, 0, key);
  }
  if (!t.view) { createView(t); pushState(); }
  return t.view!.webContents;
}

export function openTab(url: string, foreground = true, after?: string): string {
  ensureWindow();
  const key = `t:${nextId++}`;
  tabs.set(key, { key, pinned: false, url, view: null });
  // Như Edge: tab mở từ một tab thường nằm ngay sau tab đó; còn lại thêm cuối.
  const i = after ? order.indexOf(after) : -1;
  if (i >= 0) order.splice(i + 1, 0, key); else order.push(key);
  if (foreground) showTab(key);
  else { createView(tabs.get(key)!); pushState(); }
  return key;
}

export function closeTab(key: string): void {
  const t = tabs.get(key);
  if (!t || t.pinned) return;
  const keys = visibleKeys();
  const idx = keys.indexOf(key);
  const wasActive = active === key;
  if (t.since) hooks.onLeave(key, Date.now() - t.since);
  destroyTab(key);
  if (wasActive) {
    const rest = visibleKeys();
    showTab(rest[Math.min(idx, rest.length - 1)] ?? 'home');
  } else {
    pushState();
  }
}

/** Đưa tab chứa trang này lên (vd quay về cổng báo cáo sau khi kết nối xong). */
export function showWebContents(wc: WebContents): boolean {
  for (const t of tabs.values()) if (t.view?.webContents === wc) return showTab(t.key);
  return false;
}

const visibleKeys = () => [...pinnedDefs().map((d) => d.key).filter((k) => tabs.has(k)), ...order];
const activeWc = () => (active ? tabs.get(active)?.view?.webContents : undefined);

/** Cấu hình đổi (đăng nhập/đăng xuất, trang chính, ngôn ngữ) hoặc trạng thái nguồn đổi ⇒ cập nhật tab ghim và thanh tab. */
export function refreshBrowser(): void {
  if (!win || win.isDestroyed()) return;
  syncPinned();
  if (active && !tabs.has(active)) { showTab('home'); return; }
  pushState();
}

function pushState(): void {
  if (!win || win.isDestroyed()) return;
  const s = getSettings();
  const t = M[s.lang];
  const defs = new Map(pinnedDefs().map((d) => [d.key, d]));
  const list = visibleKeys().map((key) => {
    const tab = tabs.get(key)!;
    const wc = tab.view?.webContents;
    const def = defs.get(key);
    const src = sourceOf(key);
    const title = wc?.getTitle() || '';
    return {
      key,
      pinned: tab.pinned,
      label: def?.label ?? src?.ten ?? (title || t.newTab),
      title: title || def?.label || src?.ten || '',
      favicon: tab.favicon ?? null,
      status: src ? tabStatus(statusOf(src.code)?.result, src.state) : null,
    };
  });
  // Hàm (chữ có tham số) không gửi qua IPC được ⇒ tách ra, gửi chữ đã ghép.
  const { updateLabel, ...plain } = t;
  const up = pendingUpdate();
  const name = s.user?.ho_ten || s.user?.email || '';
  win.webContents.send('tabs:state', {
    lang: s.lang, t: plain, active, tabs: list, dev: IS_DEV,
    // Hồ sơ trên thanh tab: tên + chữ cái đầu (họ + tên) khi đã đăng nhập; chưa thì nút "Đăng nhập".
    profile: s.deviceToken && name ? { name, email: s.user?.email ?? '', initials: initialsOf(name) } : null,
    update: up ? { label: updateLabel(up.version), title: t.updateTitle } : null,
  });
}

/** Phím tắt chuyển/đóng tab, tải lại, quay lại — bắt ở cả thanh tab lẫn trong trang. Trả true nếu đã xử lý. */
function shortcut(input: Input): boolean {
  if (input.type !== 'keyDown') return false;
  const ctrl = input.control || input.meta;
  const key = input.key;
  const keys = visibleKeys();
  if (ctrl && key.toLowerCase() === 'w') { if (active) closeTab(active); return true; }
  if (ctrl && key === 'Tab') {
    const i = active ? keys.indexOf(active) : 0;
    const next = keys[(i + (input.shift ? -1 : 1) + keys.length) % keys.length];
    if (next) showTab(next);
    return true;
  }
  if (ctrl && /^[1-9]$/.test(key)) {
    const k = key === '9' ? keys[keys.length - 1] : keys[Number(key) - 1];
    if (k) showTab(k);
    return true;
  }
  if (key === 'F5' || (ctrl && key.toLowerCase() === 'r')) { activeWc()?.reload(); return true; }
  if (input.alt && key === 'ArrowLeft') { const h = activeWc()?.navigationHistory; if (h?.canGoBack()) h.goBack(); return true; }
  if (input.alt && key === 'ArrowRight') { const h = activeWc()?.navigationHistory; if (h?.canGoForward()) h.goForward(); return true; }
  return false;
}

/** IPC của thanh tab — chỉ nhận từ chính trang thanh tab của cửa sổ này. */
function registerIpc(): void {
  const own = (e: IpcMainInvokeEvent) => { if (!win || e.sender !== win.webContents) throw new Error('forbidden'); };
  ipcMain.handle('tabs:ready', (e) => { own(e); if (!active) showTab('home'); else pushState(); });
  ipcMain.handle('tabs:activate', (e, key: unknown) => { own(e); if (typeof key === 'string') showTab(key); });
  ipcMain.handle('tabs:close', (e, key: unknown) => { own(e); if (typeof key === 'string') closeTab(key); });
  ipcMain.handle('tabs:menu', (e, pos: { x?: unknown; y?: unknown }) => {
    own(e);
    hooks.menu().popup({ window: win!, x: Math.round(Number(pos?.x) || 0), y: Math.round(Number(pos?.y) || 0) });
  });
  ipcMain.handle('tabs:profile', (e, pos: { x?: unknown; y?: unknown }) => {
    own(e);
    hooks.profileMenu().popup({ window: win!, x: Math.round(Number(pos?.x) || 0), y: Math.round(Number(pos?.y) || 0) });
  });
  ipcMain.handle('tabs:sign-in', (e) => { own(e); hooks.signIn(); });
  ipcMain.handle('tabs:context', (e, a: { key?: unknown; x?: unknown; y?: unknown }) => {
    own(e);
    if (typeof a?.key !== 'string') return;
    const url = tabs.get(a.key)?.view?.webContents.getURL() ?? '';
    hooks.tabMenu(a.key, url)?.popup({ window: win!, x: Math.round(Number(a.x) || 0), y: Math.round(Number(a.y) || 0) });
  });
  ipcMain.handle('tabs:install-update', (e) => { own(e); void promptInstall(); });
  ipcMain.on('tabs:resized', (e) => { if (win && e.sender === win.webContents) layout(); });
  // Người dùng bấm thông báo do trang tạo (vd tin nhắn Vala) ⇒ đưa cửa sổ lên, chuyển sang đúng tab đó. Giới hạn nhịp để
  // một trang không dùng lệnh này giành cửa sổ liên tục.
  let lastNotifyClick = 0;
  ipcMain.on('vala:web-notification-click', (e) => {
    if (Date.now() - lastNotifyClick < 1500) return;
    const t = [...tabs.values()].find((x) => x.view?.webContents === e.sender);
    if (!t) return;
    lastNotifyClick = Date.now();
    showTab(t.key);
    if (win && !win.isDestroyed()) reveal(win, true);
  });
  ipcMain.handle('tabs:lang', (e, l: unknown) => { own(e); setPrefs({ lang: normLang(l) }); });
  ipcMain.handle('tabs:theme', (e, v: unknown) => { own(e); setPrefs({ theme: v }); });
}

export function initBrowser(h: BrowserHooks): void {
  hooks = h;
  registerIpc();
  events.on('status', refreshBrowser);
  packageEvents.on('changed', () => { for (const t of tabs.values()) if (t.view) injectAll(t.view.webContents); });
  // Vừa tải xong bản giao diện cổng mới: tab Báo cáo đang không xem thì chuyển ngay sang bản mới (giữ trang đang mở);
  // đang xem thì để lần mở sau — không nạp lại giữa lúc người dùng thao tác.
  uiEvents.on('updated', () => {
    const t = tabs.get('portal');
    syncPinnedPortalUrl();
    const wc = t?.view?.webContents;
    if (!t || !wc || wc.isDestroyed() || active === 'portal') return;
    void wc.loadURL(mapToUi(wc.getURL()) ?? (wc.getURL().startsWith(UI_ORIGIN) ? wc.getURL() : t.url));
  });
  // Ngôn ngữ / sáng-tối đổi (ở thanh tab, Cài đặt hay trong cổng) ⇒ vẽ lại thanh tab, báo cổng đổi theo.
  prefsEvents.on('changed', () => { pushState(); pushPrefsToPortal(); });
}

/** Gửi tin cho các tab đang mở cổng (chỉ trang đúng origin máy chủ — trang khác không nhận). */
export function sendToPortal(msg: Record<string, unknown>): void {
  for (const t of tabs.values()) {
    const wc = t.view?.webContents;
    if (!wc || wc.isDestroyed() || !isPortalUrl(wc.getURL())) continue;
    wc.send('vala:event', msg);
  }
}

/** Ngôn ngữ + sáng/tối cho cổng đổi theo. */
const pushPrefsToPortal = () => sendToPortal({ type: 'prefs', ...currentPrefs() });

/** Tab đang mở của một hệ thống nguồn (để chạy thao tác trong đó). */
export const sourceWebContents = (code: string): WebContents | undefined => tabs.get(sourceTabKey(code))?.view?.webContents;

/** "Tăng Xuân Điệp" ⇒ "TĐ" (chữ đầu của họ và tên); một từ ⇒ chữ đầu. */
function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return ((w[0]![0] ?? '') + (w.length > 1 ? w[w.length - 1]![0] ?? '' : '')).toUpperCase();
}

/**
 * Đăng xuất: xoá phiên cổng (token trong localStorage của trang cổng) — không thì cổng còn đăng nhập sẽ lại tự cấp token
 * thiết bị mới cho ứng dụng. Tab Báo cáo đang mở thì nạp lại (hiện màn hình đăng nhập).
 */
export async function forgetPortalLogin(): Promise<void> {
  const s = getSettings();
  if (!s.serverUrl) return;
  const wc = tabs.get('portal')?.view?.webContents;
  if (wc && !wc.isDestroyed()) {
    // vala.noAutoSso: trang đăng nhập cổng không tự chuyển sang SSO ngay lần này (phiên SSO còn sống sẽ đăng nhập lại luôn).
    try { await wc.executeJavaScript("localStorage.removeItem('vala.token'); sessionStorage.setItem('vala.noAutoSso', '1'); 1", true); } catch { /* trang đang tải */ }
    void wc.loadURL(uiPortalUrl() ?? s.serverUrl);
  } else {
    for (const origin of [new URL(s.serverUrl).origin, UI_ORIGIN]) await session.defaultSession.clearStorageData({ origin, storages: ['localstorage'] });
  }
  pushState();
}

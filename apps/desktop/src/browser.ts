/**
 * Cửa sổ chính: một BrowserWindow KHÔNG VIỀN (như Lark). Trang cục bộ của cửa sổ (resources/tabs.html) vẽ HEADER trên cùng
 * (logo, ◀ ▶ ⟳, ô tìm kiếm Ctrl+K, nút cửa sổ ─ □ ✕) và THANH ỨNG DỤNG DỌC bên trái (họp 07/10/2026); trang web của mục đang
 * chọn (mỗi mục một WebContentsView, chỉ mục đang chọn hiện) nằm trong khung bo góc ở phần còn lại. KHÔNG có ô địa chỉ —
 * người dùng không thấy và không gõ địa chỉ trang. Electron 32 chưa bo góc được WebContentsView ⇒ 4 lớp mặt nạ góc nhỏ
 * (resources/corner.html) đặt trên 4 góc khung.
 *
 * Thanh dọc: ✦ Trợ lý AI (trang cục bộ, mặc định khi mở app) · ỨNG DỤNG (ứng dụng ghim: Vala, Báo cáo, các hệ thống nguồn —
 * ghim/bỏ ghim trong khung ⊞) · ĐANG MỞ (trang mở từ liên kết, Cài đặt, Bản ghi, hệ thống nguồn không ghim — đóng được).
 * Đóng tab hệ thống nguồn không mất kết nối: phiên vẫn nằm trong ứng dụng và Vala vẫn lấy dữ liệu theo lịch. Popup có kích
 * thước và form POST vẫn mở cửa sổ thật (tabs-model.ts openTarget). Menu hồ sơ và khung ⊞ vẽ trong một lớp trong suốt
 * trên cùng (resources/overlay.html) để đè được lên trang web; ô tìm kiếm cũng mở trên lớp đó (search.ts).
 *
 * Mọi tab dùng portal-preload.js (cầu nối với cổng) — tiến trình chính tự kiểm origin trước khi trả lời, nên tab của
 * trang khác không gọi được gì.
 */
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, nativeTheme, screen, session, shell, WebContentsView, type HandlerDetails, type Input, type IpcMainInvokeEvent, type Menu, type WebContents } from 'electron';
import { APP_NAME, ICON, IS_DEV } from './channel';
import { messages, normLang } from './i18n';
import { attachAutofill } from './autofill';
import { attachSsoAuto } from './sso-auto';
import { attachPackages, injectAll, listActions, packageEvents, packages } from './scripts';
import { chooseDownload, hasPendingAsk, downloadAction, downloadEvents, downloadsState } from './downloads';
import { recordActions, recordAppVisit } from './local-data';
import { portalApi } from './account';
import { appByKey, appKey, canAdmin, catalog, insideDomains, pinnedKeys as catalogPinnedKeys, setAppPinned, setPinnedOrder } from './apps';
import { isPortalUrl, mapToUi, UI_ORIGIN, uiEvents, uiPortalUrl } from './ui-cache';
import { currentPrefs, prefsEvents, setPrefs } from './prefs';
import { getSettings, setSettings } from './settings';
import { cachedSources, events, statusOf, type SourceFull } from './sync';
import { applySubsetOrder, cookieMatchesHost, openTarget, reordered, sidebarSections, siteOf, tabStatus, webLoginTone, type AppLoginTone, type TabStatus } from './tabs-model';
import { ssoHosts } from './sso-session';
import { siteIcon, siteIconEvents } from './site-icons';
import { changeZoom, trackZoom, zoomEvents, zoomFactor, zoomPercent } from './zoom';
import { clearNotifications, createSampleNotifications, markNotifications, notificationEvents, notificationsState, openNotification, refreshNotifications, setNotificationFilter } from './notifications';
import { vanBanKeys } from './vanban-model';
import { pendingUpdate, promptInstall } from './updater';
import { recordingKey } from './recorder';
import { closeLoginSso, layoutSso } from './login-page';

const M = messages({
  home: 'Vala', reports: 'Báo cáo', newTab: 'Trang', assistant: 'Trợ lý AI',
  appsSection: 'Ứng dụng', openSection: 'Đang mở', more: 'Thêm', moreTitle: 'Tất cả ứng dụng',
  back: 'Quay lại (Alt+←)', forward: 'Tiến tới (Alt+→)', reload: 'Tải lại (F5)', collapse: 'Thu gọn thanh bên', expand: 'Mở rộng thanh bên',
  search: 'Tìm kiếm', minimize: 'Thu nhỏ', maximize: 'Phóng to', restore: 'Thu về', closeWindow: 'Đóng (ẩn xuống khay)',
  close: 'Đóng tab (Ctrl+W)', menu: 'Hệ thống nguồn',
  signIn: 'Đăng nhập', signInTitle: 'Đăng nhập Vala Desktop', account: 'Tài khoản', admin: 'Quản trị',
  lightMode: 'Chế độ sáng', darkMode: 'Chế độ tối', recording: 'đang ghi thao tác', aiTitle: 'Trợ lý AI — mở bên cạnh trang đang xem', notifTitle: 'Thông báo', notifPending: 'chờ xử lý', notifCenter: 'Trung tâm thông báo', downloads: 'Tải xuống (Ctrl+J)', dlStarted: 'Đang tải', dlDone: 'Đã tải xong', dlFailed: 'Tải lỗi',
  vbVala: 'Giao diện Vala', vbGoc: 'Trang gốc', vbTitle: 'Chuyển giữa giao diện Văn bản của Vala và trang gốc của hệ thống',
  updateTitle: 'Cài bản mới: ứng dụng đóng lại, cài xong tự mở lại',
  updateLabel: (v: string) => `Đã có bản ${v} — Cập nhật`,
  status: { ok: 'Đã kết nối', warn: 'Cần đăng nhập lại', off: 'Chưa kết nối' } as Record<TabStatus, string>,
}, {
  home: 'Vala', reports: 'Reports', newTab: 'Page', assistant: 'AI assistant',
  appsSection: 'Apps', openSection: 'Open', more: 'More', moreTitle: 'All apps',
  back: 'Back (Alt+←)', forward: 'Forward (Alt+→)', reload: 'Reload (F5)', collapse: 'Collapse sidebar', expand: 'Expand sidebar',
  search: 'Search', minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore', closeWindow: 'Close (hide to tray)',
  close: 'Close tab (Ctrl+W)', menu: 'Source systems',
  signIn: 'Sign in', signInTitle: 'Sign in to Vala Desktop', account: 'Account', admin: 'Administration',
  lightMode: 'Light mode', darkMode: 'Dark mode', recording: 'recording actions', aiTitle: 'AI assistant — open next to the current page', notifTitle: 'Notifications', notifPending: 'pending', notifCenter: 'Notification center', downloads: 'Downloads (Ctrl+J)', dlStarted: 'Downloading', dlDone: 'Downloaded', dlFailed: 'Download failed',
  vbVala: 'Vala view', vbGoc: 'Original page', vbTitle: "Switch between Vala's documents view and the system's original page",
  updateTitle: 'Install the new version: the app closes, installs and reopens',
  updateLabel: (v: string) => `Version ${v} available — Update`,
  status: { ok: 'Connected', warn: 'Needs signing in again', off: 'Not connected' } as Record<TabStatus, string>,
});

/** Kích thước khung theo cỡ chữ (zoom.ts): số đo CSS của tabs.html × tỉ lệ đang phóng ⇒ điểm ảnh của cửa sổ. */
const z = (cssPx: number) => Math.round(cssPx * zoomFactor());
/** Độ rộng thanh ứng dụng dọc (mở rộng / thu gọn chỉ biểu tượng) — khớp resources/tabs.html. */
const SIDEBAR_W = () => z(248);
/** 8 (lề thanh) + 8 (lề mục) + 20 (biểu tượng) + 8 + 8 ⇒ biểu tượng ở giữa VÀ trùng chỗ với lúc mở rộng (xem nhanh không nhảy). */
const SIDEBAR_MIN_W = () => z(52);
/** Đã đăng nhập (có token thiết bị). Chưa ⇒ chỉ màn hình đăng nhập, không có thanh ứng dụng. */
const signedIn = () => !!getSettings().deviceToken;
/** Độ rộng thanh trong lúc trượt thu gọn / mở rộng (animateSidebar); null ⇒ theo cài đặt. */
let sidebarAnimW: number | null = null;
const sidebarWidth = () => (!signedIn() ? 0 : sidebarAnimW ?? (getSettings().sidebarCollapsed ? SIDEBAR_MIN_W() : SIDEBAR_W()));
/** Thời gian trượt — khớp transition của #bar (renderer/tabs.ts). */
const SLIDE_MS = 200;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
let sidebarAnim: NodeJS.Timeout | null = null;
/** Thu gọn / mở rộng: khung trang web trượt theo cùng nhịp với thanh (thanh trượt bằng CSS trong trang). */
function animateSidebar(from: number, to: number): void {
  if (sidebarAnim) clearInterval(sidebarAnim);
  const start = Date.now();
  sidebarAnimW = from;
  sidebarAnim = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / SLIDE_MS);
    sidebarAnimW = Math.round(from + (to - from) * easeOut(t));
    if (t >= 1) { clearInterval(sidebarAnim!); sidebarAnim = null; sidebarAnimW = null; }
    layout();
  }, 16);
}
/** Header trên cùng (thay thanh tiêu đề của hệ điều hành) và lề quanh khung trang web — khớp resources/tabs.html. */
const HEADER_H = () => z(44);
const GAP = () => z(8);
/** Bán kính bo góc khung trang web — khớp resources/corner.css. */
const RADIUS = () => z(12);
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
  /** Sáng/tối của app đã đổi khi tab đang ẩn ⇒ tải lại lúc chuyển sang (themeChanged). */
  themeStale?: boolean;
  /**
   * Ứng dụng văn bản (có gói phiên dịch — vanban-model.ts): lớp giao diện Văn bản chung đặt trên trang gốc (`view`, vẫn
   * nạp để chạy thao tác vb_*); `goc` ⇒ đang xem trang gốc (đăng nhập, thao tác phiên dịch chưa có).
   */
  ui?: WebContentsView;
  goc?: boolean;
  /**
   * Tab mở từ link, đang nạp NGẦM: chưa hiện trên thanh bên / chưa chuyển sang cho tới khi trang hiện ra (commit). Link hoá
   * ra là tệp tải về ⇒ tab đóng luôn, người dùng không thấy tab trắng (downloads.ts 'started').
   */
  hidden?: boolean;
  /** Tab đã mở ra tab này (link) ⇒ đóng tab tải về thì quay lại đó. */
  opener?: string;
}

/** Lệnh từ menu hồ sơ (khung nổi) do main.ts xử lý. */
export type ProfileCommand = 'settings' | 'admin' | 'passwords' | 'change-password' | 'sync' | 'check-update' | 'sign-out' | 'quit';

export interface BrowserHooks {
  /** Rời một tab sau `ms` mili-giây đang xem (vd rời tab eGov ⇒ báo lấy dữ liệu ngay). */
  onLeave: (key: string, ms: number) => void;
  /** Nút "Đăng nhập" (chưa đăng nhập): đưa sang tab Báo cáo. */
  signIn: () => void;
  /** Menu chuột phải trên một tab (tab nguồn / trang khác: mật khẩu); null ⇒ không có menu. */
  tabMenu: (key: string, url: string) => Menu | null;
  /** Lệnh của menu hồ sơ. */
  profileCommand: (cmd: ProfileCommand) => void;
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

/** Mục cố định: Trợ lý AI, Trung tâm thông báo. Mọi ứng dụng khác lấy từ danh mục của đơn vị (apps.ts). */
function pinnedDefs(): PinnedDef[] {
  const t = M[getSettings().lang];
  return [{ key: CHAT, label: t.assistant, url: '' }, { key: NOTIF_CENTER, label: t.notifCenter, url: '' }];
}

/** Báo cáo (ứng dụng `reports` của danh mục): giao diện cổng chạy từ bản trong máy khi đã tải được (ui-cache.ts). */
const portalUrl = (): string => uiPortalUrl() ?? getSettings().serverUrl;

/** Tab của một ứng dụng trong danh mục (trang web, hệ thống nguồn, Báo cáo) — khác Trợ lý AI, Cài đặt, trang mở từ link. */
const isAppKey = (key: string) => key === 'portal' || key.startsWith('web:') || key.startsWith('src:');

/** Nguồn của một tab hệ thống nguồn (null nếu không phải tab nguồn hoặc nguồn không còn). */
const sourceOf = (key: string): SourceFull | null =>
  (key.startsWith('src:') && getSettings().deviceToken ? cachedSources().find((s) => sourceTabKey(s.code) === key) : undefined) ?? null;

/**
 * Khớp tab với cấu hình hiện tại: đăng xuất ⇒ đóng mọi tab ứng dụng; ứng dụng trang web / Báo cáo bị gỡ khỏi danh mục ⇒
 * đóng (tab hệ thống nguồn giữ: Trợ lý AI có thể đang chạy thao tác ngầm trong đó).
 */
function syncPinned(): void {
  // Đăng xuất ⇒ đóng cửa sổ Trợ lý AI (hội thoại của người trước).
  if (!signedIn() && aiOpen) { aiOpen = false; if (aiView && win && !win.isDestroyed()) win.contentView.removeChildView(aiView); }
  const defs = pinnedDefs();
  const keep = new Set(defs.map((d) => d.key));
  const loaded = catalog().apps.length > 0;
  for (const t of [...tabs.values()]) {
    // Đăng xuất ⇒ đóng MỌI tab (ứng dụng, trang mở từ link, Trợ lý AI — hội thoại của người trước), chỉ còn đăng nhập / Cài đặt.
    if (!signedIn() && t.key !== LOGIN && t.key !== SETTINGS) destroyTab(t.key);
    else if (t.pinned && !keep.has(t.key)) destroyTab(t.key);
    else if (loaded && (t.key === 'portal' || t.key.startsWith('web:')) && !appByKey(t.key)) destroyTab(t.key);
    // Mất quyền quản trị ⇒ đóng tab Bản ghi thao tác (ghi thao tác chưa mở cho người dùng).
    else if (loaded && t.key === RECORDING && !canAdmin()) destroyTab(t.key);
  }
  if (signedIn()) for (const d of defs) if (!tabs.get(d.key)) tabs.set(d.key, { key: d.key, pinned: true, url: d.url, view: null });
}

/** Tab Báo cáo chưa nạp trang: cập nhật địa chỉ sẽ nạp (bản trong máy vừa có / vừa đổi). */
function syncPinnedPortalUrl(): void {
  const t = tabs.get('portal');
  if (t && !t.view) t.url = portalUrl();
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  const w = new BrowserWindow({
    width: 1280, height: 860, minWidth: 720, minHeight: 480, icon: ICON, title: APP_NAME, show: false,
    autoHideMenuBar: true, frame: false,
    webPreferences: { preload: join(__dirname, 'tabs-preload.js') },
  });
  win = w;
  // Tiêu đề cửa sổ luôn là tên ứng dụng (bản dev: "Vala Desktop (dev)"), không theo tiêu đề trang thanh dọc.
  w.on('page-title-updated', (e) => e.preventDefault());
  w.once('ready-to-show', () => w.show());
  // Quay lại cửa sổ ⇒ làm mới thông báo (không chờ nhịp 1 phút).
  w.on('focus', () => void refreshNotifications());
  // Đóng cửa sổ chỉ ẩn xuống khay hệ thống (các tab, phiên vẫn giữ); "Thoát" mới đóng thật.
  w.on('close', (e) => { if (!quitting) { e.preventDefault(); w.hide(); } });
  w.on('closed', () => { win = null; tabs.clear(); order = []; active = null; corners = []; peek = null; peekOpen = false; });
  // Trên Linux, sự kiện phóng to/đổi cỡ đến TRƯỚC khi cửa sổ đổi kích thước thật ⇒ canh ngay và canh lại sau một nhịp.
  // Tín hiệu chính xác nhất là trang thanh dọc báo khung nhìn đổi cỡ ('tabs:resized').
  const relayout = () => { layout(); setTimeout(layout, 100); };
  for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'] as const) w.on(ev as 'resize', relayout);
  // Nút □ của header đổi giữa "Phóng to" / "Thu về".
  for (const ev of ['maximize', 'unmaximize'] as const) w.on(ev as 'maximize', () => pushState());
  w.webContents.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  void w.loadFile(join(__dirname, '../resources/tabs.html'));
  // Cỡ chữ theo tài khoản phóng cả khung (zoom.ts) — header / thanh bên, góc bo (bán kính nhân theo tỉ lệ — RADIUS()).
  trackZoom(w.webContents);
  corners = (['tl', 'tr', 'bl', 'br'] as const).map((c) => {
    const v = new WebContentsView();
    v.setBackgroundColor('#00000000');
    trackZoom(v.webContents);
    void v.webContents.loadFile(join(__dirname, '../resources/corner.html'), { hash: c });
    w.contentView.addChildView(v);
    return v;
  });
  syncPinned();
  // Nạp sẵn bản xem nhanh (chưa gắn vào cửa sổ) ⇒ lần rê chuột đầu tiên xổ ra ngay, không chờ nạp trang.
  ensurePeek();
  return w;
}

/** Mặt nạ 4 góc khung trang web (trên–trái, trên–phải, dưới–trái, dưới–phải). */
let corners: WebContentsView[] = [];

/** Đưa mặt nạ góc (rồi khung nổi nếu đang mở) lên trên các trang web — gọi sau khi thêm một trang. */
function raiseChrome(): void {
  if (!win || win.isDestroyed()) return;
  for (const c of corners) win.contentView.addChildView(c);
  // Trợ lý AI (cột / nổi) trên trang đang xem, dưới thanh xem nhanh và khung nổi.
  if (aiView && aiOpen) win.contentView.addChildView(aiView);
  if (peek && peekOpen) win.contentView.addChildView(peek);
  if (overlay && overlayOpen) win.contentView.addChildView(overlay);
}

// ---- Trợ lý AI dạng cột bên phải / cửa sổ nổi (yêu cầu "Tích hợp Trợ lý AI" 09/10/2026) ----
// Icon ✦ góc phải header ⇒ trang Trợ lý (chat.html#panel — cùng hội thoại, lệnh "/") trong một view riêng: cột bên phải
// (trang đang xem co lại) hoặc cửa sổ nổi kéo đi được. Vị trí / cỡ nhớ trong settings.aiPanel.
let aiView: WebContentsView | null = null;
let aiOpen = false;
type AiMode = 'cot' | 'noi';
type Rect = { x: number; y: number; width: number; height: number };
/** Trong lúc kéo: vị trí / cỡ tạm (chưa ghi đĩa); thả chuột ⇒ ghi một lần. */
let aiLive: Partial<{ w: number; rect: Rect }> = {};
const aiPrefs = () => {
  const p = { ...getSettings().aiPanel, ...aiLive };
  return { mode: (p?.mode === 'noi' ? 'noi' : 'cot') as AiMode, w: Math.min(720, Math.max(320, p?.w ?? 400)), rect: p?.rect ?? null };
};
/** Chỗ cột Trợ lý AI chiếm bên phải (gồm lề với trang); không mở / đang nổi ⇒ 0. */
function aiColumnW(): number {
  return aiOpen && signedIn() && aiPrefs().mode === 'cot' ? z(aiPrefs().w) + GAP() : 0;
}
function aiBounds(): Rect {
  const [width, height] = win!.getContentSize();
  const p = aiPrefs();
  if (p.mode === 'cot') return { x: width! - GAP() - z(p.w), y: HEADER_H(), width: z(p.w), height: Math.max(0, height! - HEADER_H() - GAP()) };
  // Nổi: vị trí đã nhớ (giữ trong cửa sổ), chưa có ⇒ góc dưới phải.
  const w = Math.min(p.rect?.width ?? z(420), width! - 16);
  const h = Math.min(p.rect?.height ?? Math.min(z(600), height! - HEADER_H() - 48), height! - HEADER_H() - 8);
  const x = Math.min(Math.max(8, p.rect?.x ?? width! - w - 24), width! - w - 8);
  const y = Math.min(Math.max(HEADER_H(), p.rect?.y ?? height! - h - 24), height! - h - 8);
  return { x, y, width: Math.max(280, w), height: Math.max(240, h) };
}
const saveAi = (patch: Partial<{ mode: AiMode; w: number; rect: Rect | null }>) => setSettings({ aiPanel: { ...aiPrefs(), ...patch } });

function ensureAiView(): WebContentsView {
  if (aiView && !aiView.webContents.isDestroyed()) return aiView;
  const v = new WebContentsView({ webPreferences: { preload: join(__dirname, 'chat-preload.js') } });
  v.setBackgroundColor('#00000000');
  const wc = v.webContents;
  autoRecover(wc);
  trackZoom(wc);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  void wc.loadFile(join(__dirname, '../resources/chat.html'), { hash: 'panel' });
  aiView = v;
  return v;
}

/** Bật / tắt cửa sổ Trợ lý AI. */
export function toggleAiPanel(open = !aiOpen): void {
  if (!win || win.isDestroyed() || !signedIn()) return;
  aiOpen = open;
  if (open) {
    const v = ensureAiView();
    win.contentView.addChildView(v);
    raiseChrome();
    v.webContents.focus();
    pushAiContext();
  } else if (aiView) {
    win.contentView.removeChildView(aiView);
    const at = tabs.get(active ?? '');
    if (at) face(at)?.webContents.focus();
  }
  layout();
  pushState();
}

/** Bối cảnh cho Trợ lý AI: ứng dụng / trang người dùng đang xem (AI theo ngữ cảnh — kịch bản sau). */
function aiContext(): { key: string; label: string; host: string } | null {
  if (!active || active === CHAT) return null;
  const t = tabs.get(active);
  const wc = t?.view?.webContents;
  let host = '';
  try { host = wc && !wc.isDestroyed() ? new URL(wc.getURL()).host : ''; } catch { /* trang cục bộ */ }
  const label = appDefs().find((a) => a.key === active)?.label ?? (active === NOTIF_CENTER ? M[getSettings().lang].notifCenter : '') ?? '';
  return { key: active, label: label || (wc && !wc.isDestroyed() ? wc.getTitle() : '') || host, host };
}
function pushAiContext(): void {
  if (aiView && aiOpen && !aiView.webContents.isDestroyed()) aiView.webContents.send('chat:panel', { mode: aiPrefs().mode, context: aiContext() });
}

/** Kéo thanh tiêu đề (di chuyển, chế độ nổi) / kéo mép, góc (đổi cỡ): bám theo con trỏ tới khi thả chuột. */
let aiDrag: { timer: NodeJS.Timeout; until: number } | null = null;
function aiDragStart(kind: 'move' | 'resize' | 'width'): void {
  if (!win || !aiView) return;
  aiDragEnd();
  const start = screen.getCursorScreenPoint();
  const b0 = aiView.getBounds();
  const w0 = aiPrefs().w;
  aiDrag = {
    until: Date.now() + 60_000,
    timer: setInterval(() => {
      if (!win || win.isDestroyed() || !aiView || Date.now() > aiDrag!.until) { aiDragEnd(); return; }
      const p = screen.getCursorScreenPoint();
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (kind === 'width') { aiLive = { ...aiLive, w: Math.round(Math.min(720, Math.max(320, w0 - dx / zoomFactor()))) }; layout(); return; }
      aiLive = { ...aiLive, rect: kind === 'move' ? { ...b0, x: b0.x + dx, y: b0.y + dy } : { ...b0, width: Math.max(280, b0.width + dx), height: Math.max(240, b0.height + dy) } };
      aiView.setBounds(aiBounds());
    }, 16),
  };
}
function aiDragEnd(): void {
  if (aiDrag) { clearInterval(aiDrag.timer); aiDrag = null; }
  if (Object.keys(aiLive).length) { const live = aiLive; aiLive = {}; saveAi({ ...live, ...(live.rect ? { rect: aiView?.getBounds() ?? live.rect } : {}) }); }
}

// ---- thanh dọc "xem nhanh" (như Edge): thanh đang thu gọn, rê chuột vào ⇒ thanh đầy đủ ĐÈ lên trang web, rời chuột ⇒ ẩn ----
// Trang web là view nằm trên trang thanh dọc ⇒ không nới thanh trong trang đó được; dùng một view riêng trên cùng nạp chính
// tabs.html ở chế độ #peek (chỉ thanh dọc, luôn mở rộng; cùng preload / IPC / trạng thái với thanh thật).
let peek: WebContentsView | null = null;
let peekOpen = false;
let peekWatch: NodeJS.Timeout | null = null;
let peekRemove: NodeJS.Timeout | null = null;
/** Rộng thêm phần trong suốt bên phải cho bóng đổ. */
const PEEK_SHADOW = () => z(16);
const peekBounds = () => {
  const [, height] = win!.getContentSize();
  return { x: 0, y: HEADER_H(), width: SIDEBAR_W() + PEEK_SHADOW(), height: Math.max(0, height! - HEADER_H()) };
};
const isPeek = (wc: WebContents) => !!peek && peek.webContents === wc;

function ensurePeek(): WebContentsView {
  if (peek && !peek.webContents.isDestroyed()) return peek;
  const v = new WebContentsView({ webPreferences: { preload: join(__dirname, 'tabs-preload.js') } });
  v.setBackgroundColor('#00000000');
  v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  v.webContents.on('will-navigate', (e) => e.preventDefault());
  v.webContents.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  trackZoom(v.webContents);
  void v.webContents.loadFile(join(__dirname, '../resources/tabs.html'), { hash: 'peek' });
  // Lần đầu: trang chưa nạp xong lúc bảo trượt ra ⇒ bảo lại khi nạp xong.
  v.webContents.on('did-finish-load', () => { if (peekOpen) v.webContents.send('tabs:peek-slide', true); });
  peek = v;
  return v;
}

function showPeek(): void {
  if (!win || win.isDestroyed() || peekOpen || !signedIn() || !getSettings().sidebarCollapsed || overlayOpen) return;
  const v = ensurePeek();
  peekOpen = true;
  if (peekRemove) { clearTimeout(peekRemove); peekRemove = null; }
  v.setBounds(peekBounds());
  raiseChrome();
  pushState();
  v.webContents.send('tabs:peek-slide', true);
  // Ẩn khi chuột ra khỏi vùng thanh (kể cả ra ngoài cửa sổ) — hỏi vị trí chuột thay vì tin sự kiện rời chuột của trang
  // (view vừa hiện dưới con trỏ không chắc nhận được mouseenter / mouseleave).
  if (peekWatch) clearInterval(peekWatch);
  peekWatch = setInterval(() => {
    if (!win || win.isDestroyed() || !peekOpen) { hidePeek(); return; }
    // Khung nổi mở từ bản xem nhanh (Thêm, menu chuột phải, hồ sơ) ⇒ giữ thanh đầy đủ bên dưới tới khi khung đóng.
    if (overlayOpen) return;
    const p = screen.getCursorScreenPoint();
    const c = win.getContentBounds();
    const b = peekBounds();
    const x = p.x - c.x;
    const y = p.y - c.y;
    // Còn trên thanh, hoặc trên phần thanh thu gọn / header bên trái (đang đi từ thanh gốc sang) ⇒ giữ.
    const inside = x >= 0 && x < b.width && y >= b.y - 4 && y < b.y + b.height;
    if (!inside || !win.isVisible()) hidePeek();
  }, 150);
}

/** Thôi xem nhanh: trượt thanh vào rồi gỡ view; `now` ⇒ gỡ ngay (mở rộng thanh thật, đăng xuất…). */
function hidePeek(now = false): void {
  if (peekWatch) { clearInterval(peekWatch); peekWatch = null; }
  if (!peekOpen && !(now && peekRemove)) return;
  peekOpen = false;
  if (peekRemove) { clearTimeout(peekRemove); peekRemove = null; }
  const remove = () => { peekRemove = null; if (!peekOpen && peek && win && !win.isDestroyed()) win.contentView.removeChildView(peek); };
  if (now || !peek) { remove(); return; }
  peek.webContents.send('tabs:peek-slide', false);
  peekRemove = setTimeout(remove, SLIDE_MS);
}

function layout(): void {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  const bounds = contentBounds()!;
  for (const t of tabs.values()) { t.view?.setBounds(bounds); t.ui?.setBounds(bounds); }
  const r = RADIUS();
  const right = bounds.x + bounds.width - r;
  const bottom = bounds.y + bounds.height - r;
  [[bounds.x, bounds.y], [right, bounds.y], [bounds.x, bottom], [right, bottom]].forEach(([x, y], i) => corners[i]?.setBounds({ x: x!, y: y!, width: r, height: r }));
  if (overlay && overlayOpen) overlay.setBounds({ x: 0, y: 0, width: width!, height: height! });
  if (peek && peekOpen) peek.setBounds(peekBounds());
  if (aiView && aiOpen) aiView.setBounds(aiBounds());
  layoutSso();
}

/** Cửa sổ chính (null nếu chưa tạo / đã đóng). */
export const browserWindow = (): BrowserWindow | null => (win && !win.isDestroyed() ? win : null);

/** Vị trí khung trang (trang cục bộ / trang web) trong cửa sổ — màn hình đăng nhập đặt view SSO theo đó. */
export function contentBounds(): { x: number; y: number; width: number; height: number } | null {
  if (!win || win.isDestroyed()) return null;
  const [width, height] = win.getContentSize();
  // Không có thanh ứng dụng (màn hình đăng nhập) ⇒ lề trái bằng lề phải.
  const w = sidebarWidth() || GAP();
  // Trợ lý AI dạng cột bên phải ⇒ trang co lại nhường chỗ.
  return { x: w, y: HEADER_H(), width: Math.max(0, width! - w - GAP() - aiColumnW()), height: Math.max(0, height! - HEADER_H() - GAP()) };
}

// ---- tab trang cục bộ: Cài đặt (như chrome://settings), Bản ghi thao tác — preload riêng, không điều hướng đi đâu ----
const SETTINGS = 'settings';
const RECORDING = 'recording';
/** Trợ lý AI — mục cố định đầu thanh dọc, mặc định khi mở app (chat-page.ts). */
export const CHAT = 'chat';
/** Trung tâm thông báo — trang riêng, mục cố định trên thanh dọc (thongbao-page.ts). */
export const NOTIF_CENTER = 'thong-bao';
/** Màn hình đăng nhập (login-page.ts) — trang duy nhất khi chưa đăng nhập. */
export const LOGIN = 'login';
/** Quản trị đơn vị (admin-page.ts; giao diện admin/ build ra dist/admin) — chỉ quản trị đơn vị. */
const ADMIN = 'admin';
let settingsSection = '';
/** Mục mở đầu của trang Quản trị (vd 'he-thong-nguon') khi tạo view lần đầu. */
let adminSection = '';
const LOCAL: Record<string, { preload: string; html: string }> = {
  [SETTINGS]: { preload: 'settings-preload.js', html: 'settings.html' },
  [RECORDING]: { preload: 'recording-preload.js', html: 'recording.html' },
  [CHAT]: { preload: 'chat-preload.js', html: 'chat.html' },
  [NOTIF_CENTER]: { preload: 'thongbao-preload.js', html: '../dist/thongbao/index.html' },
  [LOGIN]: { preload: 'login-preload.js', html: 'login.html' },
  // Trang React build bằng Vite (admin/) — đường dẫn tính từ resources/.
  [ADMIN]: { preload: 'admin-preload.js', html: '../dist/admin/index.html' },
};

/**
 * Trang của tab bị đóng đột ngột (crash, hết bộ nhớ…) ⇒ tự tải lại để người dùng không gặp trang trắng; tối đa 3 lần mỗi
 * phút (trang lỗi lặp lại thì thôi). Báo lỗi gửi riêng (error-report.ts).
 */
function autoRecover(wc: WebContents): void {
  const times: number[] = [];
  wc.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit' || wc.isDestroyed()) return;
    const now = Date.now();
    while (times.length && now - times[0]! > 60_000) times.shift();
    if (times.length >= 3) return;
    times.push(now);
    setTimeout(() => { if (!wc.isDestroyed()) wc.reload(); }, 500);
  });
}

function createLocalView(t: Tab): WebContentsView {
  const def = LOCAL[t.key]!;
  const view = new WebContentsView({ webPreferences: { preload: join(__dirname, def.preload) } });
  t.view = view;
  win!.contentView.addChildView(view);
  view.setVisible(false);
  const wc = view.webContents;
  autoRecover(wc);
  // Cỡ chữ theo tài khoản — trang cục bộ (Trợ lý, Cài đặt, Quản trị…); màn hình đăng nhập giữ cỡ gốc.
  if (t.key !== LOGIN) trackZoom(wc);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('page-title-updated', () => pushState());
  wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  const section = t.key === SETTINGS ? settingsSection : t.key === ADMIN ? adminSection : '';
  const hash = section ? { hash: section } : undefined;
  void wc.loadFile(join(__dirname, '../resources', def.html), hash);
  raiseChrome();
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

/** Mở (hoặc chuyển tới) tab Bản ghi thao tác (bản ghi gần nhất — recorder.ts). Ghi thao tác chỉ dành cho quản trị. */
export function openRecordingTab(): void {
  if (!canAdmin()) return;
  ensureWindow();
  if (!tabs.has(RECORDING)) {
    tabs.set(RECORDING, { key: RECORDING, pinned: false, url: '', view: null });
    order.push(RECORDING);
  } else pushRecording();
  showTab(RECORDING);
}

export const isRecordingContents = (wc: WebContents): boolean => tabs.get(RECORDING)?.view?.webContents === wc;
export const isChatContents = (wc: WebContents): boolean => tabs.get(CHAT)?.view?.webContents === wc || (!!aiView && aiView.webContents === wc);
const isAiPanel = (wc: WebContents): boolean => !!aiView && aiView.webContents === wc;
export const thongBaoContents = (): WebContents | null => tabs.get(NOTIF_CENTER)?.view?.webContents ?? null;
export const isThongBaoContents = (wc: WebContents): boolean => thongBaoContents() === wc;
export const isLoginContents = (wc: WebContents): boolean => tabs.get(LOGIN)?.view?.webContents === wc;

/** Báo màn hình đăng nhập (nếu đang mở) vẽ lại. */
export function pushLogin(): void {
  const wc = tabs.get(LOGIN)?.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.send('login:changed');
}

/** Mở màn hình đăng nhập (chưa đăng nhập: nút "Đăng nhập", khay, đăng xuất). Đã đăng nhập ⇒ trang mặc định. */
export function showLogin(): void {
  showTab(signedIn() ? CHAT : LOGIN);
}

/** Báo trang Trợ lý AI (nếu đang mở) vẽ lại. */
export function pushChat(): void {
  const wc = tabs.get(CHAT)?.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.send('chat:changed');
  if (aiView && !aiView.webContents.isDestroyed()) aiView.webContents.send('chat:changed');
}

/** Báo tab Bản ghi (nếu đang mở) vẽ lại; thanh dọc vẽ lại chấm "đang ghi". */
export function pushRecording(): void {
  const wc = tabs.get(RECORDING)?.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.send('vala:rec-changed');
  pushState();
}

/** Trang web của một tab (để ghi thao tác); tab trang cục bộ / chưa nạp ⇒ undefined. */
export const tabWebContents = (key: string): WebContents | undefined => (LOCAL[key] ? undefined : tabs.get(key)?.view?.webContents);

/** Báo tab Cài đặt (nếu đang mở) vẽ lại. */
export function pushSettings(): void {
  const wc = tabs.get(SETTINGS)?.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.send('vala:settings-changed');
}

function createView(t: Tab): WebContentsView {
  if (LOCAL[t.key]) return createLocalView(t);
  // plugins: bộ xem PDF của Chromium — link PDF mở xem ngay trong tab (như Chrome), không bị tải về; tab xem trước tệp.
  const view = new WebContentsView({ webPreferences: { preload: TAB_PRELOAD, plugins: true } });
  t.view = view;
  win!.contentView.addChildView(view);
  view.setVisible(false);
  const wc = view.webContents;
  autoRecover(wc);
  wc.setWindowOpenHandler((d: HandlerDetails) => {
    // Trang đang mở trong tab này: link sang tên miền gốc khác ⇒ trình duyệt mặc định (tabs-model.ts openTarget).
    const target = openTarget({ url: d.url, disposition: d.disposition, hasPostBody: !!d.postBody, openerUrl: wc.getURL() }, insideDomains());
    // Cửa sổ popup: tạo ẨN, trang hiện ra mới hiện cửa sổ (link tải tệp ⇒ đóng luôn — closeDownloadOnly).
    if (target.kind === 'window') return { action: 'allow', overrideBrowserWindowOptions: { icon: ICON, autoHideMenuBar: true, show: false } };
    if (target.kind === 'external') void shell.openExternal(d.url);
    if (target.kind === 'tab') openTab(d.url, target.foreground, t.key);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => {
    const show = () => { if (!child.isDestroyed() && !child.isVisible()) child.show(); };
    child.webContents.once('did-navigate', show);
    setTimeout(show, 4000);
  });
  const push = () => pushState();
  // Chỉ vẽ lại thanh dọc khi tiêu đề đổi / trang chính điều hướng (nút Back/Forward) — không theo sự kiện tải khung con
  // (trang như vala.bkav.com, eGov tải ngầm liên tục).
  for (const ev of ['page-title-updated', 'did-navigate', 'did-navigate-in-page'] as const) wc.on(ev as 'did-navigate', push);
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
  // Trang đăng nhập riêng của ứng dụng có nút "Đăng nhập bằng SSO" ⇒ app đã có phiên SSO thì bấm hộ (sso-auto.ts).
  attachSsoAuto(wc, () => homeUrl(t));
  // Cỡ chữ theo tài khoản (zoom.ts).
  trackZoom(wc);
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
  // Tab hệ thống nguồn nạp xong (gói kịch bản đã chèn) ⇒ ghi danh mục thao tác để ô tìm kiếm tìm được.
  if (t.key.startsWith('src:')) {
    const code = t.key.slice(4);
    wc.on('did-finish-load', () => setTimeout(() => {
      if (wc.isDestroyed()) return;
      void listActions(wc).then((l) => { if (l.length) recordActions(code, l); });
    }, 1500));
  }
  void wc.loadURL(t.url);
  raiseChrome();
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
  dropUi(t);
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

/** Mở cửa sổ ở mục đang xem; chưa có ⇒ Trợ lý AI (mặc định khi mở app, bấm biểu tượng khay, mở lần hai). */
export function showDefault(): void {
  showTab(signedIn() ? active ?? CHAT : LOGIN);
}

/** Bấm thông báo: hiện cửa sổ ở tab đang chọn (chưa có tab nào ⇒ tab Vala), kể cả khi ứng dụng đang ẩn ở khay. */
export function revealWindow(): void {
  showTab(active ?? CHAT);
  if (win && !win.isDestroyed()) reveal(win, true);
}

/** Chọn một tab (tạo cửa sổ / nạp trang nếu cần) và đưa cửa sổ lên trước. */
export function showTab(key: string, opts: { reloadTo?: string } = {}): boolean {
  const w = ensureWindow();
  syncPinned();
  // Chưa đăng nhập: chỉ màn hình đăng nhập (và Cài đặt). Đã đăng nhập: không còn màn hình đăng nhập.
  if (!signedIn() && key !== SETTINGS) key = LOGIN;
  else if (signedIn() && key === LOGIN) key = CHAT;
  if (key === LOGIN && !tabs.has(LOGIN)) tabs.set(LOGIN, { key: LOGIN, pinned: false, url: '', view: null });
  const t = tabs.get(key);
  if (!t) return false;
  const prev = active ? tabs.get(active) : undefined;
  if (!t.view) createView(t);
  else if (opts.reloadTo) void t.view.webContents.loadURL(opts.reloadTo);
  if (vbKeys().has(key) && !t.ui) createUiView(t);
  // Hiện tab mới TRƯỚC rồi mới ẩn tab cũ: làm ngược lại sẽ lộ nền cửa sổ trong một khung hình (nháy khi chuyển tab).
  // Sáng/tối đã đổi lúc tab này ẩn ⇒ tải lại để trang của ứng dụng theo giao diện mới (themeChanged).
  if (t.themeStale && t.view) { t.themeStale = false; t.view.webContents.reload(); }
  const shown = face(t)!;
  shown.setVisible(true);
  if (shown !== t.view) t.view?.setVisible(false); else t.ui?.setVisible(false);
  if (prev && prev.key !== key) {
    prev.view?.setVisible(false);
    prev.ui?.setVisible(false);
    if (prev.since) hooks.onLeave(prev.key, Date.now() - prev.since);
    prev.since = undefined;
  }
  t.since = t.since ?? Date.now();
  if (prev && prev.key !== key && shown === t.view && !LOCAL[key]) reclaimVala(shown.webContents);
  // Lịch sử cho ô tìm kiếm: chỉ ghi đã vào ỨNG DỤNG nào (không lưu địa chỉ / tiêu đề trang).
  if (isAppKey(key) && active !== key) recordAppVisit(key, appLabel(key));
  active = key;
  reveal(w);
  shown.webContents.focus();
  pushState();
  return true;
}

// ---- giao diện Văn bản chung (docs/van-ban-chung.md; trang vanban/ build ra dist/vanban, IPC ở vanban-page.ts) ----

/** Ứng dụng dùng giao diện Văn bản: địa chỉ khớp một gói phiên dịch (khai báo vb_danh_sach). */
const vbKeys = () => vanBanKeys(appDefs().map((a) => ({ key: a.key, url: sourceOf(a.key)?.login_url ?? a.url })), packages());

/** View đang hiện của một tab: giao diện Văn bản (nếu có và không xem trang gốc) hoặc trang. */
const face = (t: Tab): WebContentsView | null => (t.ui && !t.goc ? t.ui : t.view);

function createUiView(t: Tab): void {
  const view = new WebContentsView({ webPreferences: { preload: join(__dirname, 'vanban-preload.js') } });
  t.ui = view;
  t.goc = false;
  win!.contentView.addChildView(view);
  view.setVisible(false);
  const wc = view.webContents;
  autoRecover(wc);
  trackZoom(wc);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault(); });
  void wc.loadFile(join(__dirname, '../dist/vanban/index.html'));
  // Trang gốc tải xong (vd vừa đăng nhập) ⇒ giao diện thử lại nếu đang báo chưa đăng nhập.
  t.view?.webContents.on('did-finish-load', () => { if (!wc.isDestroyed()) wc.send('vanban:goc-loaded'); });
  raiseChrome();
  layout();
}

function dropUi(t: Tab): void {
  if (!t.ui) return;
  if (win && !win.isDestroyed()) win.contentView.removeChildView(t.ui);
  if (!t.ui.webContents.isDestroyed()) t.ui.webContents.close();
  t.ui = undefined;
  t.goc = false;
}

/** Gói / danh mục đổi ⇒ ứng dụng thôi là ứng dụng văn bản thì bỏ lớp giao diện (về trang gốc). */
function syncUi(): void {
  const keys = vbKeys();
  for (const t of tabs.values()) if (t.ui && !keys.has(t.key)) { dropUi(t); if (t.key === active) showTab(t.key); }
}

/** Tab ứng dụng văn bản của trang giao diện gửi IPC (null nếu không phải). */
export const vanbanTabOf = (wc: WebContents): { key: string; label: string; goc: WebContents | null } | null => {
  for (const t of tabs.values()) {
    if (t.ui?.webContents === wc) return { key: t.key, label: appLabel(t.key), goc: t.view && !t.view.webContents.isDestroyed() ? t.view.webContents : null };
  }
  return null;
};

/** Các trang giao diện Văn bản đang mở (báo đổi ngôn ngữ / sáng tối). */
export const vanbanUis = (): WebContents[] => [...tabs.values()].map((t) => t.ui?.webContents).filter((w): w is WebContents => !!w && !w.isDestroyed());

/**
 * Chuyển giữa giao diện Văn bản và trang gốc của một ứng dụng văn bản. `url` (mục menu chưa phiên dịch) ⇒ mở đúng trang
 * đó — chỉ nhận địa chỉ cùng tên miền gốc với trang gốc đang mở (phiên dịch không đưa tab sang trang khác được).
 */
export function setVanbanGoc(key: string, goc: boolean, url?: string): void {
  const t = tabs.get(key);
  if (!t?.ui) return;
  const wc = t.view?.webContents;
  if (goc && url && wc && !wc.isDestroyed()) {
    try {
      const to = new URL(url);
      const from = new URL(wc.getURL() || t.url);
      if (/^https?:$/.test(to.protocol) && siteOf(to.hostname) === siteOf(from.hostname)) void wc.loadURL(to.toString());
    } catch { /* địa chỉ hỏng ⇒ chỉ chuyển sang trang gốc */ }
  }
  t.goc = goc;
  if (active === key) showTab(key); else pushState();
}

/**
 * Mạng xã hội Vala chưa cho mở nhiều tab: mọi tab cùng phiên dùng chung clientId MQTT ⇒ tab kết nối sau đá tab trước
 * (MQTT 5 reason 142), tab bị đá hiện "Kết nối trực tuyến bị ngắt…" + nút "Kết nối lại" và thôi nhận tin. Trong lúc chờ
 * Vala sửa (mỗi tab một clientId — docs/vala-mqtt-nhieu-tab.md): chuyển sang tab nào mà trang có đúng nút đó ⇒ bấm hộ, để
 * tab đang xem luôn nhận tin (tab vừa rời sẽ bị đá, tới lượt nó được chọn lại thì nối lại). Nút nhận ra bằng class
 * `snw-cursor-pointer` (riêng của Vala) + chữ của nút theo ngôn ngữ Vala.
 */
const VALA_RECONNECT = `(() => {
  const labels = ['Kết nối lại', 'Reconnect', 'Neu verbinden'];
  const b = [...document.querySelectorAll('button.snw-cursor-pointer')].find((x) => labels.includes(x.textContent.trim()));
  if (b) b.click();
})()`;
function reclaimVala(wc: WebContents): void {
  if (wc.isDestroyed() || !/^https:\/\/[^/]*vala[^/]*\//i.test(wc.getURL())) return;
  void wc.executeJavaScript(VALA_RECONNECT, true).catch(() => { /* trang đang tải / đã đóng */ });
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
  // Mở từ link của một tab ⇒ nạp ngầm, trang hiện ra mới chuyển sang (link tải tệp thì tab tự đóng — xem Tab.hidden).
  const t: Tab = { key, pinned: false, url, view: null, opener: after, hidden: !!after };
  tabs.set(key, t);
  // Như Edge: tab mở từ một tab thường nằm ngay sau tab đó; còn lại thêm cuối.
  const i = after ? order.indexOf(after) : -1;
  if (i >= 0) order.splice(i + 1, 0, key); else order.push(key);
  if (!t.hidden) {
    if (foreground) showTab(key);
    else { createView(t); pushState(); }
    return key;
  }
  createView(t);
  const wc = t.view!.webContents;
  const reveal = () => {
    if (!t.hidden || tabs.get(key) !== t) return;
    t.hidden = false;
    if (foreground) showTab(key); else pushState();
  };
  wc.once('did-navigate', reveal);
  // Trang chậm: sau 4 giây vẫn hiện tab (đang tải) cho người dùng thấy.
  setTimeout(reveal, 4000);
  return key;
}

/** Có tệp mới chờ chọn cách lưu ⇒ khung Tải xuống dưới nút header tự xổ ra (đang mở ⇒ vẽ lại). */
function showDownloadAsk(): void {
  if (!win || win.isDestroyed()) return;
  if (overlayOpen && overlayKind === 'downloads') { overlay?.webContents.send('overlay:refresh'); return; }
  if (hasPendingAsk()) win.webContents.send('tabs:open-downloads');
}

/** Lượt tải bắt đầu từ một trang chưa hiện gì (link mở tab / cửa sổ mới chỉ để tải) ⇒ đóng nó, về lại tab đã mở ra nó. */
function closeDownloadOnly(wc: WebContents): void {
  if (wc.isDestroyed() || committed.has(wc.id)) return;
  for (const t of tabs.values()) {
    if (t.view?.webContents !== wc || !t.key.startsWith('t:')) continue;
    const back = t.opener && tabs.has(t.opener) ? t.opener : null;
    const wasActive = active === t.key;
    destroyTab(t.key);
    if (wasActive) showTab(back ?? CHAT); else pushState();
    return;
  }
  const w = BrowserWindow.fromWebContents(wc);
  if (w && w !== win && !w.isDestroyed()) w.close();
}

/** Trang đã hiện ra ít nhất một lần (commit) — phân biệt tab tải tệp với trang thật. */
const committed = new Set<number>();

/** Ứng dụng đang ghim trên thanh bên — không đóng được (kể cả tab mở trước rồi mới ghim). */
const isPinnedTab = (key: string) => !!tabs.get(key)?.pinned || pinnedKeys().includes(key);

export function closeTab(key: string): void {
  const t = tabs.get(key);
  if (!t || isPinnedTab(key)) return;
  const keys = visibleKeys();
  const idx = keys.indexOf(key);
  const wasActive = active === key;
  if (t.since) hooks.onLeave(key, Date.now() - t.since);
  destroyTab(key);
  if (wasActive) {
    const rest = visibleKeys();
    showTab(rest[Math.min(idx, rest.length - 1)] ?? CHAT);
  } else {
    pushState();
  }
}

/** Đưa tab chứa trang này lên (vd quay về cổng báo cáo sau khi kết nối xong). */
export function showWebContents(wc: WebContents): boolean {
  for (const t of tabs.values()) if (t.view?.webContents === wc) return showTab(t.key);
  return false;
}

/** Tên ứng dụng của một tab (lịch sử trang); tab mở từ liên kết ⇒ ''. */
const appLabel = (key: string): string => appDefs().find((a) => a.key === key)?.label ?? '';

/** Mọi ứng dụng mở được (ô tìm kiếm). */
export const listApps = (): { key: string; label: string }[] => appDefs().map(({ key, label }) => ({ key, label }));

// ---- ứng dụng trên thanh dọc: danh mục của đơn vị (apps.ts) ----
interface AppDef { key: string; label: string; icon: string | null; url: string; isDefault: boolean; desc?: string | null }
function appDefs(): AppDef[] {
  if (!signedIn()) return [];
  const list: AppDef[] = catalog().apps.map((a) => ({
    key: appKey(a), label: a.ten, icon: a.icon, isDefault: a.is_default, desc: a.mo_ta ?? null,
    url: a.kind === 'reports' ? portalUrl() : a.url ?? '',
  }));
  // Báo cáo luôn đi kèm Vala Desktop (phiên các hệ thống nguồn, kết nối, lịch dữ liệu đều ở đó) — danh mục thiếu thì tự thêm.
  if (!list.some((a) => a.key === 'portal')) list.push({ key: 'portal', label: M[getSettings().lang].reports, icon: null, url: portalUrl(), isDefault: false });
  return list;
}
const pinnedKeys = () => {
  if (!signedIn()) return [];
  const keys = catalogPinnedKeys();
  if (!appByKey('portal') && !keys.includes('portal')) keys.push('portal');
  return keys;
};
/** Ứng dụng ghim + mục đang mở (ứng dụng không ghim đã mở, trang mở từ link, Cài đặt…) theo thứ tự mở. */
function sections() {
  return sidebarSections({ pinned: pinnedKeys(), open: order });
}

/**
 * Tab của một ứng dụng trong danh mục (chưa có thì tạo, chưa nạp trang). Hệ thống nguồn có kết nối qua Desktop ⇒ mở trang
 * đăng nhập của hệ thống (như trước); còn lại ⇒ địa chỉ của ứng dụng.
 */
function ensureAppTab(key: string): Tab | null {
  const existing = tabs.get(key);
  if (existing) return existing;
  const src = sourceOf(key);
  const def = appDefs().find((a) => a.key === key);
  const url = src?.login_url ?? def?.url;
  if (!url) return null;
  const t: Tab = { key, pinned: false, url, view: null };
  tabs.set(key, t);
  order.push(key);
  return t;
}

/** Ứng dụng mặc định của đơn vị: nạp sẵn ở nền (đăng nhập / mở app / danh mục đổi). */
export function preloadDefaultApp(): void {
  if (!win || win.isDestroyed() || !signedIn()) return;
  const def = appDefs().find((a) => a.isDefault);
  if (!def) return;
  const t = ensureAppTab(def.key);
  if (t && !t.view) { createView(t); pushState(); }
}

/** Mở trang Quản trị đơn vị (trang cục bộ của app — admin-page.ts), chỉ quản trị đơn vị. */
/** `section` (vd 'he-thong-nguon', 'don-vi') ⇒ mở đúng mục đó (tab đang mở thì chuyển mục). */
export function openAdminTab(section = ''): void {
  if (!canAdmin()) return;
  const s = /^[a-z-]{1,40}$/.test(section) ? section : '';
  adminSection = s;
  if (!tabs.has(ADMIN)) {
    tabs.set(ADMIN, { key: ADMIN, pinned: false, url: '', view: null });
    order.push(ADMIN);
  } else if (s) sendToAdmin('admin:navigate', s);
  showTab(ADMIN);
}

export const isAdminContents = (wc: WebContents): boolean => tabs.get(ADMIN)?.view?.webContents === wc;
/** Gửi tin cho trang Quản trị (nếu đang mở). */
export function sendToAdmin(channel: string, payload: unknown): void {
  const wc = tabs.get(ADMIN)?.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.send(channel, payload);
}

/** Mở ứng dụng mặc định (menu khay "Mở Vala Desktop" cũ ⇒ tab Vala). */
export function showDefaultApp(): void {
  const def = appDefs().find((a) => a.isDefault) ?? appDefs()[0];
  if (def) activate(def.key); else showDefault();
}
/** Thứ tự trên thanh dọc (phím Ctrl+Tab, Ctrl+1…9): Trợ lý AI, ứng dụng, đang mở. */
const visibleKeys = () => { const sec = sections(); return [CHAT, NOTIF_CENTER, ...sec.apps, ...sec.open.filter((k) => order.includes(k) || tabs.has(k))]; };
/** Trang web đang xem (nút ◀ ▶ ⟳) — trang cục bộ, giao diện Văn bản ⇒ không có. */
const activeWc = () => { const t = active && !LOCAL[active] ? tabs.get(active) : undefined; return t && face(t) === t.view ? t.view?.webContents : undefined; };

/** Địa chỉ gốc của tab: trang của ứng dụng lúc mở tab (Tin nhắn ⇒ /messenger…), không phải trang đang đứng. */
const homeUrl = (t: Tab): string | null => (/^https?:/.test(t.url) ? t.url : null);

/**
 * Tải lại (nút trên header / F5 / Ctrl+R) ⇒ đưa tab về TRANG GỐC của ứng dụng (người dùng 09/10/2026), không tải lại trang
 * đang đứng (có thể là trang đăng nhập, trang lỗi, trang lạc). Tab Văn bản: trang gốc về địa chỉ gốc, giao diện Vala tải lại
 * về màn hình đầu — giữ nguyên chế độ đang xem (Giao diện Vala / Trang gốc).
 */
function reloadActive(): void {
  const t = active && !LOCAL[active] ? tabs.get(active) : undefined;
  const wc = t?.view?.webContents;
  if (!t || !wc || wc.isDestroyed()) return;
  const home = homeUrl(t);
  if (home) void wc.loadURL(home); else wc.reload();
  if (t.ui && !t.goc && !t.ui.webContents.isDestroyed()) t.ui.webContents.reload();
}
const canReload = () => { const t = active && !LOCAL[active] ? tabs.get(active) : undefined; return !!t?.view && !t.view.webContents.isDestroyed(); };

/** Bấm một mục: đã có tab ⇒ chọn; ứng dụng chưa mở ⇒ mở tab của nó. */
/**
 * Mở chi tiết một thông báo (Trung tâm thông báo — link callback): link thuộc ứng dụng trong danh mục ⇒ mở trong đúng tab
 * ứng dụng đó (giữ phiên); không có link ⇒ mở ứng dụng; ứng dụng không còn trong danh mục ⇒ tab mới.
 */
export function openAppLink(ma: string, link: string | null): void {
  const a = catalog().apps.find((x) => x.ma === ma);
  const key = a ? appKey(a) : null;
  if (key && (tabs.has(key) || ensureAppTab(key))) {
    const t = tabs.get(key)!;
    if (!link) { showTab(key); return; }
    // Ứng dụng văn bản (giao diện Vala đè trang gốc) ⇒ chuyển sang trang gốc, mở đúng địa chỉ (cùng hệ thống).
    if (t.ui) { showTab(key); setVanbanGoc(key, true, link); return; }
    if (!t.view) { showTab(key); void t.view!.webContents.loadURL(link); return; }
    showTab(key, { reloadTo: link });
    return;
  }
  if (link) openTab(link);
}

export function activate(key: string): void {
  if (tabs.has(key)) { showTab(key); return; }
  if (ensureAppTab(key)) showTab(key);
}

/** Ghim / bỏ ghim một ứng dụng trên thanh dọc — bố cục riêng của người dùng, lưu trên máy chủ. */
export function setPinned(key: string, on: boolean): void {
  if (!appDefs().some((a) => a.key === key)) return;
  void setAppPinned(key, on).then(pushState);
  pushState();
}

/**
 * Kéo thả trên thanh dọc: xếp lại nhóm Ứng dụng (bố cục người dùng, lưu trên máy chủ; ứng dụng mặc định của đơn vị luôn
 * đứng đầu) hoặc nhóm Đang mở (chỉ trong phiên). Sai nhóm / sai mục ⇒ bỏ qua, vẽ lại theo thứ tự cũ.
 */
function reorderGroup(group: unknown, keys: unknown): void {
  const next = Array.isArray(keys) ? keys : [];
  if (group === 'apps') {
    const ok = reordered(pinnedKeys(), next);
    const def = appDefs().find((a) => a.isDefault)?.key;
    if (ok && (!def || !ok.includes(def) || ok[0] === def)) void setPinnedOrder(ok).then(pushState);
  } else if (group === 'open') {
    const ok = reordered(sections().open.filter((k) => tabs.has(k)), next);
    if (ok) order = applySubsetOrder(order, ok);
  }
  pushState();
}

/** Cấu hình đổi (đăng nhập/đăng xuất, trang chính, ngôn ngữ) hoặc trạng thái nguồn đổi ⇒ cập nhật tab ghim và thanh dọc. */
export function refreshBrowser(): void {
  if (!win || win.isDestroyed()) return;
  syncPinned();
  syncUi();
  // Vừa đăng nhập ⇒ bỏ màn hình đăng nhập, vào Trợ lý AI; vừa đăng xuất ⇒ về màn hình đăng nhập.
  if (signedIn() && tabs.has(LOGIN)) {
    closeLoginSso();
    const wasActive = active === LOGIN;
    destroyTab(LOGIN);
    if (wasActive || !active) { layout(); showTab(CHAT); return; }
  }
  if (!signedIn() && active !== LOGIN && active !== SETTINGS) { layout(); showTab(LOGIN); return; }
  if (active && !tabs.has(active)) { showTab(CHAT); return; }
  layout();
  pushState();
}

/**
 * Biểu tượng phần mềm của một ứng dụng trong danh mục: quản trị khai ⇒ dùng; không ⇒ biểu tượng cố định của trang chủ ứng
 * dụng (site-icons.ts: /favicon.ico…); không phải ứng dụng danh mục ⇒ null.
 */
function appIconOf(key: string): string | null {
  if (!isAppKey(key)) return null;
  const def = appByKey(key)?.icon;
  if (def) return def;
  const url = sourceOf(key)?.login_url ?? appDefs().find((a) => a.key === key)?.url ?? '';
  return siteIcon(key === 'portal' ? getSettings().serverUrl : url);
}

function itemOf(key: string, label: string | undefined, t: (typeof M)['vi'], closable: boolean) {
  const tab = tabs.get(key);
  const wc = tab?.view?.webContents;
  const src = sourceOf(key);
  const title = (wc && !wc.isDestroyed() ? wc.getTitle() : '') || '';
  return {
    key,
    label: key === ADMIN ? t.admin : label ?? src?.ten ?? (title || t.newTab),
    // Rê chuột: tên + mô tả quản trị khai (nếu có).
    title: [title || label || src?.ten || '', appDefs().find((a) => a.key === key)?.desc].filter(Boolean).join(' — '),
    // Ứng dụng trong danh mục: biểu tượng PHẦN MỀM (appIconOf), không theo favicon động của trang; tab mở từ link: favicon trang.
    favicon: appIconOf(key) ?? (isAppKey(key) ? null : tab?.favicon ?? null),
    status: src ? tabStatus(statusOf(src.code)?.result, src.state) : null,
    recording: key === recordingKey(),
    opened: !!tab?.view,
    closable,
    // Biểu tượng riêng của mục cố định (thanh dọc vẽ sẵn) — mục khác dùng favicon / chữ cái đầu.
    glyph: key === CHAT ? 'chat' : key === NOTIF_CENTER ? 'bell' : key === SETTINGS || key === ADMIN ? 'settings' : key === RECORDING ? 'recording' : null,
    // Trung tâm thông báo: số chưa đọc (chờ xử lý).
    badge: key === NOTIF_CENTER ? notificationsState().dem.chua_doc : 0,
  };
}

function pushState(): void {
  if (!win || win.isDestroyed()) return;
  pushAiContext();
  const s = getSettings();
  const t = M[s.lang];
  const labels = new Map(appDefs().map((a) => [a.key, a.label]));
  const defKey = appDefs().find((a) => a.isDefault)?.key;
  const sec = sections();
  const wc = activeWc();
  const h = wc && !wc.isDestroyed() ? wc.navigationHistory : null;
  // Hàm (chữ có tham số) không gửi qua IPC được ⇒ tách ra, gửi chữ đã ghép.
  const { updateLabel, ...plain } = t;
  const up = pendingUpdate();
  const name = s.user?.ho_ten || s.user?.email || '';
  // Mở rộng thanh / đăng xuất ⇒ thôi xem nhanh.
  if (peekOpen && (!s.sidebarCollapsed || !signedIn())) hidePeek(true);
  const state = {
    lang: s.lang, t: plain, active, dev: IS_DEV, collapsed: !!s.sidebarCollapsed, signedIn: signedIn(),
    chat: itemOf(CHAT, t.assistant, t, false),
    notif: itemOf(NOTIF_CENTER, t.notifCenter, t, false),
    // Ứng dụng mặc định của đơn vị luôn đứng đầu nhóm ⇒ không kéo được.
    apps: sec.apps.map((k) => ({ ...itemOf(k, labels.get(k), t, false), fixed: k === defKey })),
    open: sec.open.filter((k) => tabs.has(k) && !tabs.get(k)!.hidden).map((k) => itemOf(k, labels.get(k), t, !tabs.get(k)!.pinned)),
    // Nút "Thêm" cuối nhóm Ứng dụng (như Lark): mở nhanh ứng dụng chưa ghim.
    // Nút "Thêm" cuối nhóm Ứng dụng: khung Tất cả ứng dụng (ghim + chưa ghim, trạng thái đăng nhập) — có ứng dụng là hiện.
    more: appDefs().length,
    nav: { back: !!h?.canGoBack(), forward: !!h?.canGoForward(), reload: canReload() },
    // Nút Tải xuống trên header: hiện khi có lịch sử; đang tải ⇒ phần trăm.
    downloads: (() => { const d = downloadsState(); return { has: d.list.length > 0, dang_tai: d.dang_tai, phan_tram: d.phan_tram, su_kien: d.su_kien }; })(),
    // Trợ lý AI (icon ✦ góc phải header): đang mở?
    ai: { open: aiOpen },
    // Chuông thông báo trên header: số chưa đọc (chờ xử lý).
    thongBao: (() => { const d = notificationsState().dem; return { chua_doc: d.chua_doc, cho: d.cho_xu_ly }; })(),
    // Ứng dụng văn bản đang xem ⇒ nút chuyển Giao diện Vala / Trang gốc trên header.
    vanban: active && tabs.get(active)?.ui ? (tabs.get(active)!.goc ? 'goc' : 'vala') : null,
    maximized: win.isMaximized(),
    // Hồ sơ cuối thanh: tên + chữ cái đầu (họ + tên) khi đã đăng nhập; chưa thì nút "Đăng nhập".
    profile: s.deviceToken && name ? { name, email: s.user?.email ?? '', initials: initialsOf(name) } : null,
    update: up ? { label: updateLabel(up.version), title: t.updateTitle } : null,
  };
  win.webContents.send('tabs:state', state);
  if (peek && !peek.webContents.isDestroyed()) peek.webContents.send('tabs:state', state);
}

/** Phím tắt chuyển/đóng tab, tải lại, quay lại — bắt ở cả thanh dọc lẫn trong trang. Trả true nếu đã xử lý. */
function shortcut(input: Input): boolean {
  if (input.type !== 'keyDown') return false;
  const ctrl = input.control || input.meta;
  const key = input.key;
  // Chưa đăng nhập: chỉ có màn hình đăng nhập ⇒ bỏ phím chuyển tab / tìm kiếm (Ctrl+, vẫn mở Cài đặt).
  if (!signedIn() && !(ctrl && key === ',')) return false;
  const keys = visibleKeys();
  if (ctrl && key.toLowerCase() === 'w') { if (active) closeTab(active); return true; }
  if (ctrl && key === ',') { hooks.profileCommand('settings'); return true; }
  if (ctrl && key.toLowerCase() === 'k') { openSearch(); return true; }
  if (ctrl && key.toLowerCase() === 'j') { openDownloads(); return true; }
  // Cỡ chữ (như trình duyệt): Ctrl + = / + tăng, Ctrl + − giảm, Ctrl + 0 về 100% — lưu theo tài khoản.
  if (ctrl && (key === '=' || key === '+')) { changeZoom(1); return true; }
  if (ctrl && (key === '-' || key === '_')) { changeZoom(-1); return true; }
  if (ctrl && key === '0') { changeZoom(0); return true; }
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
  if (key === 'F5' || (ctrl && key.toLowerCase() === 'r')) { reloadActive(); return true; }
  if (input.alt && key === 'ArrowLeft') { const h = activeWc()?.navigationHistory; if (h?.canGoBack()) h.goBack(); return true; }
  if (input.alt && key === 'ArrowRight') { const h = activeWc()?.navigationHistory; if (h?.canGoForward()) h.goForward(); return true; }
  return false;
}

/** IPC của thanh dọc — chỉ nhận từ chính trang thanh dọc của cửa sổ này. */
function registerIpc(): void {
  // Trang thanh dọc của cửa sổ, hoặc bản "xem nhanh" của nó (cùng lệnh).
  const own = (e: IpcMainInvokeEvent) => { if (!win || (e.sender !== win.webContents && !isPeek(e.sender))) throw new Error('forbidden'); };
  /** Toạ độ trong bản xem nhanh ⇒ toạ độ trong cửa sổ (menu / khung nổi neo đúng chỗ). */
  // Vị trí view (điểm ảnh cửa sổ) ⇒ đơn vị CSS của trang đã phóng theo cỡ chữ (khung nổi cùng tỉ lệ với thanh bên).
  const offset = (e: IpcMainInvokeEvent) => {
    const b = isPeek(e.sender) && win ? peekBounds() : { x: 0, y: 0 };
    return { x: b.x / zoomFactor(), y: b.y / zoomFactor() };
  };
  ipcMain.handle('tabs:ready', (e) => { own(e); if (!active && !isPeek(e.sender)) showDefault(); else pushState(); });
  ipcMain.handle('tabs:peek', (e, on: unknown) => { own(e); if (on === true) showPeek(); else hidePeek(); });
  ipcMain.handle('tabs:activate', (e, key: unknown) => { own(e); if (typeof key === 'string') activate(key); });
  ipcMain.handle('tabs:close', (e, key: unknown) => { own(e); if (typeof key === 'string') closeTab(key); });
  ipcMain.handle('tabs:ai', (e) => { own(e); toggleAiPanel(); });
  // Lệnh từ cửa sổ Trợ lý AI (chat.html#panel) — chỉ nhận từ đúng view đó.
  ipcMain.handle('chat:panel-cmd', (e, a: { act?: unknown; kind?: unknown }) => {
    if (!isAiPanel(e.sender)) throw new Error('forbidden');
    if (a?.act === 'state') return { mode: aiPrefs().mode, context: aiContext() };
    if (a?.act === 'mode') { saveAi({ mode: aiPrefs().mode === 'cot' ? 'noi' : 'cot' }); layout(); raiseChrome(); pushAiContext(); }
    else if (a?.act === 'full') { toggleAiPanel(false); activate(CHAT); }
    else if (a?.act === 'close') toggleAiPanel(false);
    else if (a?.act === 'drag-start' && (a.kind === 'move' || a.kind === 'resize' || a.kind === 'width')) aiDragStart(a.kind);
    else if (a?.act === 'drag-end') aiDragEnd();
    return { mode: aiPrefs().mode, context: aiContext() };
  });
  ipcMain.handle('tabs:vanban', (e, mode: unknown) => { own(e); if (active && (mode === 'goc' || mode === 'vala')) setVanbanGoc(active, mode === 'goc'); });
  ipcMain.handle('tabs:reorder', (e, a: { group?: unknown; keys?: unknown }) => { own(e); reorderGroup(a?.group, a?.keys); });
  ipcMain.handle('tabs:nav', (e, cmd: unknown) => {
    own(e);
    if (cmd === 'reload') { reloadActive(); return; }
    const wc = activeWc();
    if (!wc || wc.isDestroyed()) return;
    if (cmd === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (cmd === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  });
  ipcMain.handle('tabs:collapse', (e) => {
    own(e);
    const collapsing = !getSettings().sidebarCollapsed;
    const from = sidebarWidth();
    hidePeek(true);
    setSettings({ sidebarCollapsed: collapsing });
    pushState();
    animateSidebar(from, collapsing ? SIDEBAR_MIN_W() : SIDEBAR_W());
  });
  ipcMain.handle('tabs:window', (e, cmd: unknown) => {
    own(e);
    if (!win) return;
    if (cmd === 'minimize') win.minimize();
    else if (cmd === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (cmd === 'close') win.close();   // ẩn xuống khay (sự kiện 'close' ở ensureWindow)
  });
  ipcMain.handle('tabs:overlay', (e, a: { kind?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown }) => {
    own(e);
    if (a?.kind !== 'profile' && a?.kind !== 'search' && a?.kind !== 'more' && a?.kind !== 'downloads' && a?.kind !== 'notifications') return;
    const n = (v: unknown) => Math.round(Number(v) || 0);
    const o = offset(e);
    // Mở từ bản xem nhanh ⇒ neo như thanh mở rộng; bản xem nhanh nhường chỗ cho khung nổi.
    const fromPeek = isPeek(e.sender);
    openOverlay(a.kind, { x: n(a.x) + o.x, y: n(a.y) + o.y, w: n(a.w), h: n(a.h) }, fromPeek);
  });
  ipcMain.handle('tabs:sign-in', (e) => { own(e); hooks.signIn(); });
  ipcMain.handle('tabs:context', (e, a: { key?: unknown; x?: unknown; y?: unknown }) => {
    own(e);
    if (typeof a?.key !== 'string') return;
    const url = tabs.get(a.key)?.view?.webContents.getURL() ?? '';
    const o = offset(e);
    openContextMenu(a.key, url, { x: Math.round(Number(a.x) || 0) + o.x, y: Math.round(Number(a.y) || 0) + o.y }, isPeek(e.sender));
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
}

// ---- khung nổi (menu hồ sơ, khung ⊞ Tất cả ứng dụng): lớp trong suốt trên cùng, chỉ hiện khi mở ----
let overlay: WebContentsView | null = null;
let overlayOpen = false;
type OverlayKind = 'profile' | 'search' | 'password' | 'more' | 'context' | 'downloads' | 'notifications';
let overlayKind: OverlayKind = 'profile';
let overlayAnchor = { x: 0, y: 0, w: 0, h: 0 };
/** Khung nổi mở từ bản xem nhanh (thanh hiện đầy đủ) ⇒ neo như thanh mở rộng dù cài đặt đang thu gọn. */
let overlayExpanded = false;

function ensureOverlay(): WebContentsView {
  if (overlay && !overlay.webContents.isDestroyed()) return overlay;
  const v = new WebContentsView({ webPreferences: { preload: join(__dirname, 'overlay-preload.js') } });
  v.setBackgroundColor('#00000000');
  const wc = v.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    // Esc đóng; Ctrl+K lần nữa ⇒ đóng ô tìm kiếm.
    if (input.key === 'Escape' || ((input.control || input.meta) && input.key.toLowerCase() === 'k' && overlayKind === 'search')) { e.preventDefault(); closeOverlay(); }
  });
  trackZoom(wc);
  void wc.loadFile(join(__dirname, '../resources/overlay.html'));
  overlay = v;
  return v;
}

/** Ctrl+K: nhờ thanh dọc gửi lại vị trí ô tìm kiếm của header rồi mở (đang mở ⇒ đóng). */
function openSearch(): void {
  if (!win || win.isDestroyed()) return;
  if (overlayOpen && overlayKind === 'search') { closeOverlay(); return; }
  win.webContents.send('tabs:open-search');
}

/** Khung Tải xuống (Ctrl+J / nút trên header): thanh dọc tự tính chỗ neo dưới nút rồi gọi tabs:overlay. */
function openDownloads(): void {
  if (!win || win.isDestroyed()) return;
  if (overlayOpen && overlayKind === 'downloads') { closeOverlay(); return; }
  win.webContents.send('tabs:open-downloads');
}

export const isOverlayContents = (wc: WebContents): boolean => !!overlay && overlay.webContents === wc;

/**
 * Đổi mật khẩu của tài khoản Vala Desktop (menu hồ sơ / khay): có mật khẩu Vala ⇒ form trên lớp khung nổi; chỉ đăng nhập
 * bằng SSO ⇒ mở trang đổi mật khẩu của SSO đơn vị trong app (cùng phiên SSO). Không còn đi qua cổng Báo cáo.
 */
export function changePassword(): void {
  const acc = catalog().account;
  if (acc?.has_password) {
    const [width, height] = win && !win.isDestroyed() ? win.getContentSize() : [1280, 800];
    openOverlay('password', { x: Math.round(width! / 2 / zoomFactor()), y: Math.round(height! / 3 / zoomFactor()), w: 0, h: 0 });
  } else if (acc?.sso_password_url) openTab(acc.sso_password_url);
}

/** Tên miền đang có cookie trong app — trang chưa mở mà không có cookie nào ⇒ chắc chắn chưa đăng nhập. */
let cookieDomains: string[] = [];
async function refreshCookieDomains(): Promise<void> {
  const list = await session.defaultSession.cookies.get({}).catch(() => []);
  cookieDomains = [...new Set(list.map((c) => c.domain ?? '').filter(Boolean))];
}

/** Trạng thái đăng nhập của một ứng dụng cho khung Tất cả ứng dụng (chữ theo ngôn ngữ). */
function appLogin(a: AppDef, t: (typeof O)['vi']): { tone: AppLoginTone; text: string } {
  const src = sourceOf(a.key);
  if (src) { const st = tabStatus(statusOf(src.code)?.result, src.state); return { tone: st, text: t.loginSrc[st] }; }
  if (a.key === 'portal') return { tone: signedIn() ? 'ok' : 'off', text: t.loginWeb[signedIn() ? 'ok' : 'off'] };
  const wc = tabs.get(a.key)?.view?.webContents;
  const openUrl = wc && !wc.isDestroyed() ? wc.getURL() : null;
  let host = '';
  try { host = new URL(a.url).hostname; } catch { /* chưa có địa chỉ */ }
  // Chưa mở mà một tab khác CÙNG MÁY đang đăng nhập (vd Tin nhắn / Danh bạ cùng valabeta.bkav.com với Vala) ⇒ cùng phiên.
  const sameHost = !openUrl && !!host && [...tabs.values()].some((o) => {
    const w = o.view?.webContents;
    if (!w || w.isDestroyed()) return false;
    try { return new URL(w.getURL()).hostname === host && webLoginTone({ openUrl: w.getURL(), ssoHosts: ssoHosts(), hasCookies: true }) === 'ok'; } catch { return false; }
  });
  const tone = sameHost ? 'ok' : webLoginTone({ openUrl, ssoHosts: ssoHosts(), hasCookies: !!host && cookieDomains.some((d) => cookieMatchesHost(d, host)) });
  return { tone, text: t.loginWeb[tone] };
}

function openOverlay(kind: OverlayKind, anchor: { x: number; y: number; w: number; h: number }, expanded = false): void {
  if (!win || win.isDestroyed()) return;
  // Mở từ bản xem nhanh ⇒ thanh đầy đủ ở yên bên dưới khung nổi (không co lại làm khung lơ lửng); mở nơi khác ⇒ thôi xem nhanh.
  if (!expanded) hidePeek();
  const v = ensureOverlay();
  overlayKind = kind;
  overlayExpanded = expanded;
  overlayAnchor = anchor;
  // Khung Tất cả ứng dụng: làm mới danh sách tên miền có cookie (trạng thái "chưa đăng nhập" của trang chưa mở) rồi vẽ lại.
  if (kind === 'more') void refreshCookieDomains().then(() => { if (overlayOpen && overlayKind === 'more' && !v.webContents.isDestroyed()) v.webContents.send('overlay:refresh'); });
  win.contentView.addChildView(v);          // thêm lại ⇒ lên trên cùng
  overlayOpen = true;
  layout();
  v.webContents.send('overlay:open');
  v.webContents.focus();
}

export function closeOverlay(): void {
  if (!overlay || !overlayOpen || !win || win.isDestroyed()) return;
  overlayOpen = false;
  win.contentView.removeChildView(overlay);
  const at = tabs.get(active ?? '');
  if (at) face(at)?.webContents.focus();
}

// ---- menu chuột phải trên mục của thanh dọc: vẽ trên khung nổi (cùng giao diện app, không phải menu hệ điều hành) ----
interface ContextEntry { id: string; label: string; enabled: boolean; checked?: boolean; sep?: boolean; icon?: string; hint?: string }
let contextMenu: { title: string; items: ContextEntry[] } | null = null;
const contextRun = new Map<string, () => void>();

/**
 * Ghim / bỏ ghim (ứng dụng trong danh mục), đóng tab (tab đóng được), rồi các mục riêng của tab (mật khẩu đã lưu, ghi thao
 * tác… — menu.ts tabContextMenu, chuyển từ Menu của Electron sang mục vẽ trên khung nổi).
 */
function openContextMenu(key: string, url: string, at: { x: number; y: number }, fromPeek: boolean): void {
  const t = O[getSettings().lang];
  const items: ContextEntry[] = [];
  contextRun.clear();
  const add = (label: string, run: (() => void) | null, more: Partial<ContextEntry> = {}) => {
    const id = String(items.length);
    items.push({ id, label, enabled: !!run, ...more });
    if (run) contextRun.set(id, run);
  };
  const sep = () => { if (items.length && !items[items.length - 1]!.sep) items.push({ id: `s${items.length}`, label: '', enabled: false, sep: true }); };
  const def = appDefs().find((a) => a.key === key);
  const tab = tabs.get(key);
  if (def) {
    if (!tab?.view || active !== key) add(t.ctxOpen, () => activate(key), { icon: 'open' });
    const pinned = pinnedKeys().includes(key);
    add(pinned ? t.ctxUnpin : t.ctxPin, () => setPinned(key, !pinned), { icon: 'pin' });
  }
  if (tab && !isPinnedTab(key) && key !== CHAT && key !== NOTIF_CENTER) add(t.ctxClose, () => closeTab(key), { icon: 'quit', hint: 'Ctrl+W' });
  const native = hooks.tabMenu(key, url);
  if (native) {
    sep();
    for (const it of native.items) {
      if (it.type === 'separator') sep();
      else if (it.type === 'normal' || it.type === 'checkbox') {
        add(it.label, it.enabled ? () => it.click() : null, it.type === 'checkbox' ? { checked: it.checked } : {});
      }
    }
  }
  while (items.length && items[items.length - 1]!.sep) items.pop();
  if (!items.length) return;
  const title = def?.label ?? (key === ADMIN ? M[getSettings().lang].admin : tab?.view?.webContents.getTitle() || '');
  contextMenu = { title, items };
  openOverlay('context', { x: at.x, y: at.y, w: 0, h: 0 }, fromPeek);
}

function overlayState() {
  const s = getSettings();
  const t = O[s.lang];
  const pinned = new Set(pinnedKeys());
  const name = s.user?.ho_ten || s.user?.email || '';
  const up = pendingUpdate();
  const { version, installUpdate, ...plain } = t;
  return {
    kind: overlayKind, anchor: overlayAnchor, collapsed: !!s.sidebarCollapsed && !overlayExpanded, lang: s.lang, theme: s.theme, zoom: zoomPercent(), dev: IS_DEV,
    isAdmin: canAdmin(),
    context: overlayKind === 'context' ? contextMenu : null,
    downloads: overlayKind === 'downloads' ? downloadsState() : null,
    notifications: overlayKind === 'notifications' ? notificationsState() : null,
    t: { ...plain, version: version(app.getVersion()), installUpdate: up ? installUpdate(up.version) : '' },
    profile: s.deviceToken && name ? { name, email: s.user?.email ?? '', initials: initialsOf(name) } : null,
    // Đổi mật khẩu: có mật khẩu Vala ⇒ form ngay trong app; chỉ SSO ⇒ trang đổi mật khẩu của SSO đơn vị (nếu có).
    account: s.deviceToken ? catalog().account ?? null : null,
    apps: appDefs().map((a) => {
      const src = sourceOf(a.key);
      return { key: a.key, label: a.label, desc: a.desc ?? null, favicon: appIconOf(a.key), pinned: pinned.has(a.key),
        status: src ? tabStatus(statusOf(src.code)?.result, src.state) : null, login: appLogin(a, t) };
    }),
  };
}

function registerOverlayIpc(): void {
  const own = (e: IpcMainInvokeEvent) => { if (!overlay || e.sender !== overlay.webContents) throw new Error('forbidden'); };
  const COMMANDS: ProfileCommand[] = ['settings', 'admin', 'passwords', 'change-password', 'sync', 'check-update', 'sign-out', 'quit'];
  ipcMain.handle('overlay:state', (e) => { own(e); return overlayState(); });
  ipcMain.handle('overlay:download', (e, a: { id?: unknown; act?: unknown }) => {
    own(e);
    const acts = ['open', 'folder', 'cancel', 'remove', 'clear'] as const;
    const act = acts.find((x) => x === a?.act);
    if (act && typeof a?.id === 'string') downloadAction(a.id, act);
    return overlayState();
  });
  ipcMain.handle('overlay:notif', async (e, a: { act?: unknown; ids?: unknown; trang_thai?: unknown; ung_dung?: unknown }) => {
    own(e);
    const ids = Array.isArray(a?.ids) ? a.ids.filter((x): x is string => typeof x === 'string' && /^\d{1,18}$/.test(x)).slice(0, 500) : [];
    if (a?.act === 'open' && ids[0]) { closeOverlay(); openNotification(ids[0]); return overlayState(); }
    if (a?.act === 'xu_ly') await markNotifications(ids, { da_xu_ly: true });
    else if (a?.act === 'chua_xu_ly') await markNotifications(ids, { da_xu_ly: false });
    else if (a?.act === 'doc') await markNotifications(ids, { da_doc: true });
    else if (a?.act === 'xoa') await clearNotifications({ ids });
    else if (a?.act === 'xoa_da_xu_ly') await clearNotifications({ da_xu_ly: true });
    else if (a?.act === 'loc') await setNotificationFilter({
      ...(a.trang_thai === 'cho_xu_ly' || a.trang_thai === 'tat_ca' ? { trang_thai: a.trang_thai } : {}),
      ...(a.ung_dung === null || (typeof a.ung_dung === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(a.ung_dung)) ? { ung_dung: a.ung_dung as string | null } : {}),
    });
    else if (a?.act === 'mau' && IS_DEV) await createSampleNotifications();
    else if (a?.act === 'trung_tam') { closeOverlay(); activate(NOTIF_CENTER); return overlayState(); }
    return overlayState();
  });
  ipcMain.handle('overlay:download-choose', async (e, a: { id?: unknown; choice?: unknown; khongHoi?: unknown }) => {
    own(e);
    const choice = (['tai', 'luu_thanh', 'huy'] as const).find((x) => x === a?.choice);
    if (!choice || typeof a?.id !== 'string') return overlayState();
    await chooseDownload(a.id, choice, a.khongHoi === true);
    return overlayState();
  });
  ipcMain.handle('overlay:close', (e) => { own(e); closeOverlay(); });
  ipcMain.handle('overlay:command', (e, cmd: unknown) => {
    own(e);
    closeOverlay();
    if (cmd === 'install-update') { void promptInstall(); return; }
    if (cmd === 'sign-in') { hooks.signIn(); return; }
    if (COMMANDS.includes(cmd as ProfileCommand)) hooks.profileCommand(cmd as ProfileCommand);
  });
  ipcMain.handle('overlay:zoom', (e, dir: unknown) => { own(e); if (dir === 1 || dir === -1 || dir === 0) changeZoom(dir); return overlayState(); });
  ipcMain.handle('overlay:prefs', (e, p: { lang?: unknown; theme?: unknown }) => { own(e); setPrefs({ lang: p?.lang, theme: p?.theme }); return overlayState(); });
  ipcMain.handle('overlay:open-app', (e, key: unknown) => { own(e); closeOverlay(); if (typeof key === 'string') activate(key); });
  ipcMain.handle('overlay:pin', (e, key: unknown, on: unknown) => { own(e); if (typeof key === 'string') setPinned(key, on === true); return overlayState(); });
  ipcMain.handle('overlay:context-run', (e, id: unknown) => {
    own(e);
    const run = typeof id === 'string' ? contextRun.get(id) : undefined;
    closeOverlay();
    contextRun.clear();
    run?.();
  });
  ipcMain.handle('overlay:change-password', async (e, a: { current?: unknown; next?: unknown }) => {
    own(e);
    if (typeof a?.current !== 'string' || typeof a?.next !== 'string' || !a.next || a.next.length > 400 || a.current.length > 400) return { ok: false };
    const r = await portalApi('POST', '/auth/change-password', { current_password: a.current, new_password: a.next });
    if (r.ok) return { ok: true };
    const p = (r.json ?? {}) as { type?: string; title?: string; detail?: string };
    return { ok: false, type: p.type, title: p.title ?? String(r.status), detail: p.detail };
  });
}

/** Chữ của khung nổi (menu hồ sơ, khung ⊞). */
const O = messages({
  settings: 'Cài đặt', admin: 'Quản trị', language: 'Ngôn ngữ', appearance: 'Giao diện', textSize: 'Cỡ chữ', zoomIn: 'Tăng cỡ chữ (Ctrl + =)', zoomOut: 'Giảm cỡ chữ (Ctrl + −)', zoomReset: 'Về 100% (Ctrl + 0)', light: 'Sáng', dark: 'Tối', system: 'Theo hệ thống',
  passwords: 'Quản lý mật khẩu', sync: 'Đồng bộ phiên ngay', checkUpdate: 'Kiểm tra cập nhật', signOut: 'Đăng xuất', quit: 'Thoát',
  signIn: 'Đăng nhập', changePassword: 'Đổi mật khẩu', changeSsoPassword: 'Đổi mật khẩu SSO',
  currentPassword: 'Mật khẩu hiện tại', newPassword: 'Mật khẩu mới — ít nhất 8 ký tự, có cả chữ và số', confirmPassword: 'Nhập lại mật khẩu mới',
  passwordMismatch: 'Hai lần nhập mật khẩu mới chưa khớp.', passwordWeak: 'Mật khẩu mới cần ít nhất 8 ký tự, có cả chữ và số.',
  passwordWrong: 'Mật khẩu hiện tại không đúng.', passwordFailed: 'Không đổi được mật khẩu. Kiểm tra kết nối rồi thử lại.', passwordSave: 'Đổi mật khẩu', passwordSaving: 'Đang đổi…', cancel: 'Huỷ',
  passwordChanged: 'Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.', done: 'Xong',
  searchPlaceholder: 'Tìm ứng dụng, thao tác, hội thoại…', secRecent: 'Ứng dụng gần đây', secChats: 'Hội thoại gần đây',
  secApps: 'Ứng dụng', secActions: 'Thao tác', secChatsFound: 'Hội thoại', noResults: 'Không tìm thấy kết quả',
  searchEmpty: 'Chưa có lịch sử. Các ứng dụng bạn mở và hội thoại với Trợ lý AI sẽ hiện ở đây.',
  clearHistory: 'Xoá lịch sử', searchHint: '↑ ↓ chọn · Enter mở · Esc đóng',
  pin: 'Ghim lên thanh bên', unpin: 'Bỏ ghim',
  nTitle: 'Thông báo', nPending: 'Chờ xử lý', nAll: 'Tất cả', nAllApps: 'Tất cả', nEmptyPending: 'Không còn thông báo nào chờ xử lý.', nEmpty: 'Chưa có thông báo.', nOpen: 'Mở chi tiết', nImportant: 'Quan trọng', nDone: 'Đã xử lý', nMarkDone: 'Đánh dấu đã xử lý', nUndo: 'Đưa lại chờ xử lý', nRemove: 'Xoá', nClearDone: 'Xoá đã xử lý', nCenter: 'Mở Trung tâm thông báo', nSample: 'Tạo thông báo mẫu', nJustNow: 'vừa xong', nMinutes: 'phút trước', nHours: 'giờ trước', nYesterday: 'hôm qua', noApps: 'Đơn vị chưa khai ứng dụng nào. Liên hệ quản trị của đơn vị.',
  moreTitle: 'Tất cả ứng dụng', moreHint: 'Bấm để mở. Ghim để luôn hiện trên thanh bên.', groupPinned: 'Đã ghim', groupOther: 'Chưa ghim',
  notSignedIn: 'chưa đăng nhập', onlyNotSignedIn: 'Chỉ hiện chưa đăng nhập', showAll: 'Hiện tất cả',
  loginSrc: { ok: 'Đã kết nối', warn: 'Cần đăng nhập lại', off: 'Chưa kết nối' } as Record<TabStatus, string>,
  loginWeb: { ok: 'Đã đăng nhập', warn: 'Chưa đăng nhập', off: 'Chưa đăng nhập', none: 'Chưa mở' } as Record<AppLoginTone, string>,
  dlTitle: 'Tải xuống', dlEmpty: 'Chưa tải tệp nào.', dlOpen: 'Mở', dlFolder: 'Mở thư mục', dlCancel: 'Huỷ', dlRemove: 'Xoá khỏi danh sách',
  dlWaiting: 'Đã tải xong — chọn cách lưu', dlClear: 'Xoá lịch sử',
  askSave: 'Tải về', askSaveHint: 'Lưu vào thư mục Tải về', askSaveAs: 'Lưu thành…', askSaveAsHint: 'Chọn thư mục và tên tệp', askCancel: 'Huỷ', askCancelHint: 'Huỷ tải, xoá tệp', askNoAsk: 'Lần sau không hỏi — tải thẳng vào thư mục Tải về', dlPaused: 'Tạm dừng', dlDone: 'Đã tải', dlGone: 'Tệp đã bị xoá hoặc chuyển đi', dlCancelled: 'Đã huỷ', dlFailed: 'Lỗi — tải lại từ trang gốc', dlHint: 'Tệp lưu ở thư mục Tải về. Lịch sử chỉ ở máy này, đăng xuất là xoá.',
  ctxPin: 'Ghim lên thanh bên', ctxUnpin: 'Bỏ ghim khỏi thanh bên', ctxClose: 'Đóng tab', ctxOpen: 'Mở',
  version: (v: string) => `Phiên bản ${v}`, installUpdate: (v: string) => `Cập nhật lên bản ${v}`,
}, {
  settings: 'Settings', admin: 'Administration', language: 'Language', appearance: 'Appearance', textSize: 'Text size', zoomIn: 'Larger text (Ctrl + =)', zoomOut: 'Smaller text (Ctrl + −)', zoomReset: 'Back to 100% (Ctrl + 0)', light: 'Light', dark: 'Dark', system: 'System',
  passwords: 'Manage passwords', sync: 'Sync sessions now', checkUpdate: 'Check for updates', signOut: 'Sign out', quit: 'Quit',
  signIn: 'Sign in', changePassword: 'Change password', changeSsoPassword: 'Change SSO password',
  currentPassword: 'Current password', newPassword: 'New password: at least 8 characters, with both letters and numbers', confirmPassword: 'Confirm new password',
  passwordMismatch: "The new passwords don't match.", passwordWeak: 'The new password needs at least 8 characters, with both letters and numbers.',
  passwordWrong: 'Current password is incorrect.', passwordFailed: "Couldn't change the password. Check your connection and try again.", passwordSave: 'Change password', passwordSaving: 'Changing…', cancel: 'Cancel',
  passwordChanged: 'Password changed. Use the new password next time you sign in.', done: 'Done',
  searchPlaceholder: 'Search apps, actions, conversations…', secRecent: 'Recent apps', secChats: 'Recent conversations',
  secApps: 'Apps', secActions: 'Actions', secChatsFound: 'Conversations', noResults: 'No results',
  searchEmpty: 'No history yet. Apps you open and conversations with the AI assistant will show up here.',
  clearHistory: 'Clear history', searchHint: '↑ ↓ select · Enter open · Esc close',
  pin: 'Pin to sidebar', unpin: 'Unpin',
  nTitle: 'Notifications', nPending: 'Pending', nAll: 'All', nAllApps: 'All', nEmptyPending: 'Nothing pending.', nEmpty: 'No notifications yet.', nOpen: 'Open details', nImportant: 'Important', nDone: 'Done', nMarkDone: 'Mark as done', nUndo: 'Mark as pending', nRemove: 'Remove', nClearDone: 'Clear done', nCenter: 'Open Notification center', nSample: 'Create sample notifications', nJustNow: 'just now', nMinutes: 'min ago', nHours: 'h ago', nYesterday: 'yesterday', noApps: "Your organization hasn't set up any apps yet. Contact your administrator.",
  moreTitle: 'All apps', moreHint: 'Click to open. Pin to keep it on the sidebar.', groupPinned: 'Pinned', groupOther: 'Not pinned',
  notSignedIn: 'not signed in', onlyNotSignedIn: 'Show only not signed in', showAll: 'Show all',
  loginSrc: { ok: 'Connected', warn: 'Needs signing in again', off: 'Not connected' } as Record<TabStatus, string>,
  loginWeb: { ok: 'Signed in', warn: 'Not signed in', off: 'Not signed in', none: 'Not opened yet' } as Record<AppLoginTone, string>,
  dlTitle: 'Downloads', dlEmpty: 'No downloads yet.', dlOpen: 'Open', dlFolder: 'Show in folder', dlCancel: 'Cancel', dlRemove: 'Remove from list',
  dlWaiting: 'Downloaded — choose how to save it', dlClear: 'Clear history',
  askSave: 'Download', askSaveHint: 'Save to your Downloads folder', askSaveAs: 'Save as…', askSaveAsHint: 'Choose a folder and file name', askCancel: 'Cancel', askCancelHint: 'Cancel and delete the file', askNoAsk: "Don't ask next time — save straight to Downloads", dlPaused: 'Paused', dlDone: 'Downloaded', dlGone: 'File was deleted or moved', dlCancelled: 'Cancelled', dlFailed: 'Failed — download again from the original page', dlHint: 'Files are saved to your Downloads folder. History stays on this computer and is cleared when you sign out.',
  ctxPin: 'Pin to sidebar', ctxUnpin: 'Unpin from sidebar', ctxClose: 'Close tab', ctxOpen: 'Open',
  version: (v: string) => `Version ${v}`, installUpdate: (v: string) => `Update to version ${v}`,
});

/**
 * Sáng/tối của app thực sự đổi (chọn ở menu hồ sơ / Cài đặt, hoặc hệ điều hành đổi khi để "theo hệ thống"). Trang của
 * các ứng dụng web (Vala, eGov…) thường chỉ đọc prefers-color-scheme lúc tải ⇒ tải lại: tab đang xem tải lại ngay, tab
 * ẩn tải lại lúc chuyển sang (không tải lại hàng loạt, không cắt thao tác Trợ lý AI đang chạy ngầm). Trang của app và
 * Báo cáo tự đổi ngay nên không tải lại.
 */
function themeChanged(): void {
  for (const t of tabs.values()) {
    if (!t.view || LOCAL[t.key] || t.key === 'portal') continue;
    if (t.key === active) t.view.webContents.reload(); else t.themeStale = true;
  }
}

export function initBrowser(h: BrowserHooks): void {
  hooks = h;
  app.on('web-contents-created', (_e, c) => {
    const id = c.id;
    c.on('did-navigate', () => committed.add(id));
    c.once('destroyed', () => committed.delete(id));
  });
  downloadEvents.on('started', (wc: WebContents) => closeDownloadOnly(wc));
  downloadEvents.on('ask', () => showDownloadAsk());
  // Cỡ chữ đổi ⇒ kích thước khung (thanh bên, header, lề, góc) theo tỉ lệ mới; khung nổi đang mở ⇒ vẽ lại.
  // Thông báo đổi ⇒ chuông trên header; khung thông báo đang mở ⇒ vẽ lại.
  notificationEvents.on('changed', () => {
    pushState();
    if (overlay && overlayOpen && overlayKind === 'notifications' && !overlay.webContents.isDestroyed()) overlay.webContents.send('overlay:refresh');
  });
  zoomEvents.on('changed', () => {
    hidePeek(true);
    layout();
    pushState();
    if (overlay && overlayOpen && !overlay.webContents.isDestroyed()) overlay.webContents.send('overlay:refresh');
  });
  let dark = nativeTheme.shouldUseDarkColors;
  nativeTheme.on('updated', () => {
    if (nativeTheme.shouldUseDarkColors === dark) return;
    dark = nativeTheme.shouldUseDarkColors;
    themeChanged();
  });
  registerIpc();
  registerOverlayIpc();
  // Tiến độ tải đổi ⇒ nút trên header; khung Tải xuống đang mở ⇒ vẽ lại.
  downloadEvents.on('changed', () => {
    pushState();
    if (overlay && overlayOpen && overlayKind === 'downloads' && !overlay.webContents.isDestroyed()) overlay.webContents.send('overlay:refresh');
  });
  events.on('status', refreshBrowser);
  // Biểu tượng phần mềm của ứng dụng vừa lấy xong ⇒ thanh bên; khung Tất cả ứng dụng đang mở ⇒ vẽ lại.
  siteIconEvents.on('changed', () => {
    pushState();
    if (overlay && overlayOpen && overlayKind === 'more' && !overlay.webContents.isDestroyed()) overlay.webContents.send('overlay:refresh');
  });
  packageEvents.on('changed', () => {
    for (const t of tabs.values()) if (t.view) injectAll(t.view.webContents);
    // Gói phiên dịch văn bản vừa có / vừa gỡ ⇒ thêm / bỏ lớp giao diện Văn bản của tab đang xem.
    syncUi();
    if (active && vbKeys().has(active) && !tabs.get(active)?.ui) showTab(active); else pushState();
  });
  // Vừa tải xong bản giao diện cổng mới: tab Báo cáo đang không xem thì chuyển ngay sang bản mới (giữ trang đang mở);
  // đang xem thì để lần mở sau — không nạp lại giữa lúc người dùng thao tác.
  uiEvents.on('updated', () => {
    const t = tabs.get('portal');
    syncPinnedPortalUrl();
    const wc = t?.view?.webContents;
    if (!t || !wc || wc.isDestroyed() || active === 'portal') return;
    void wc.loadURL(mapToUi(wc.getURL()) ?? (wc.getURL().startsWith(UI_ORIGIN) ? wc.getURL() : t.url));
  });
  // Ngôn ngữ / sáng-tối đổi (ở thanh dọc, Cài đặt hay trong cổng) ⇒ vẽ lại thanh dọc, báo cổng đổi theo.
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

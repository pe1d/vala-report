/**
 * Menu của Vala Desktop: thanh menu luôn hiện trên mọi cửa sổ (Vala · Báo cáo · Hệ thống nguồn · Xem · Cài đặt) và menu
 * biểu tượng khay hệ thống. Thanh menu là đường chính để chuyển giữa trang chính và cổng báo cáo — biểu tượng khay không
 * phải máy nào cũng hiện (vd Ubuntu GNOME thiếu extension AppIndicator).
 * Vẽ lại mỗi khi trạng thái nguồn, ngôn ngữ hoặc đăng nhập đổi.
 */
import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, Tray, type BaseWindow, type MenuItemConstructorOptions } from 'electron';
import { messages } from './i18n';
import { getSettings } from './settings';
import { cachedSources, events, statusOf, syncAll, type SyncResult } from './sync';
import { openSourceTab } from './windows';

const M = messages({
  tooltip: 'Vala Desktop',
  vala: 'Vala', openMain: 'Trang chính',
  reports: 'Báo cáo', openPortal: 'Mở cổng báo cáo',
  sources: 'Hệ thống nguồn', noSources: '(chưa có hệ thống nào)', signInFirst: '(đăng nhập Vala Reporting trong Cài đặt trước)',
  syncNow: 'Đồng bộ phiên ngay',
  view: 'Xem', reload: 'Tải lại', back: 'Quay lại', forward: 'Tiến tới', zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', zoomReset: 'Cỡ gốc',
  settingsMenu: 'Cài đặt', settings: 'Cài đặt…', signIn: 'Đăng nhập Vala Reporting…', quit: 'Thoát',
  result: {
    sent: 'đã kết nối', unchanged: 'đã kết nối', managed: 'hệ thống tự đăng nhập', not_logged_in: 'chưa đăng nhập',
    need_consent: 'cần xác nhận đồng ý', rejected: 'phiên hết hạn', error: 'lỗi',
  } as Record<SyncResult, string>,
}, {
  tooltip: 'Vala Desktop',
  vala: 'Vala', openMain: 'Home page',
  reports: 'Reports', openPortal: 'Open reporting portal',
  sources: 'Source systems', noSources: '(no systems yet)', signInFirst: '(sign in to Vala Reporting in Settings first)',
  syncNow: 'Sync sessions now',
  view: 'View', reload: 'Reload', back: 'Back', forward: 'Forward', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Actual size',
  settingsMenu: 'Settings', settings: 'Settings…', signIn: 'Sign in to Vala Reporting…', quit: 'Quit',
  result: {
    sent: 'connected', unchanged: 'connected', managed: 'signed in automatically', not_logged_in: 'not signed in',
    need_consent: 'consent needed', rejected: 'session expired', error: 'error',
  } as Record<SyncResult, string>,
});

export interface MenuActions { showMain: () => void; showPortal: () => void; openSettings: () => void }

let tray: Tray | null = null;
let actions: MenuActions;

function sourceItems(): MenuItemConstructorOptions[] {
  const s = getSettings();
  const t = M[s.lang];
  if (!s.deviceToken) return [{ label: t.signInFirst, enabled: false }];
  const items: MenuItemConstructorOptions[] = cachedSources().map((src) => {
    const r = statusOf(src.code)?.result;
    return { label: r ? `${src.ten} — ${t.result[r]}` : src.ten, click: () => openSourceTab(src) };
  });
  return [
    ...(items.length ? items : [{ label: t.noSources, enabled: false }]),
    { type: 'separator' },
    { label: t.syncNow, click: () => void syncAll(true) },
  ];
}

const history = (w: BaseWindow | undefined) => (w instanceof BrowserWindow ? w.webContents.navigationHistory : null);

function appMenu(): Menu {
  const s = getSettings();
  const t = M[s.lang];
  return Menu.buildFromTemplate([
    { label: t.vala, submenu: [{ label: t.openMain, accelerator: 'CmdOrCtrl+1', click: actions.showMain }] },
    { label: t.reports, submenu: [s.deviceToken
      ? { label: t.openPortal, accelerator: 'CmdOrCtrl+2', click: actions.showPortal }
      : { label: t.signIn, click: actions.openSettings }] },
    { label: t.sources, submenu: sourceItems() },
    { label: t.view, submenu: [
      { label: t.back, accelerator: 'Alt+Left', click: (_i, w) => { const h = history(w); if (h?.canGoBack()) h.goBack(); } },
      { label: t.forward, accelerator: 'Alt+Right', click: (_i, w) => { const h = history(w); if (h?.canGoForward()) h.goForward(); } },
      { label: t.reload, role: 'reload' },
      { type: 'separator' },
      { label: t.zoomIn, role: 'zoomIn' },
      { label: t.zoomOut, role: 'zoomOut' },
      { label: t.zoomReset, role: 'resetZoom' },
    ] },
    { label: t.settingsMenu, submenu: [
      { label: t.settings, click: actions.openSettings },
      { type: 'separator' },
      { label: t.quit, accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
    ] },
  ]);
}

/** Menu khay hệ thống, cũng là menu "⋯" trên thanh điều hướng. */
export function trayMenu(): Menu {
  const s = getSettings();
  const t = M[s.lang];
  return Menu.buildFromTemplate([
    { label: t.openMain, click: actions.showMain },
    s.deviceToken ? { label: t.openPortal, click: actions.showPortal } : { label: t.signIn, click: actions.openSettings },
    { label: t.sources, submenu: sourceItems() },
    { type: 'separator' },
    { label: t.settings, click: actions.openSettings },
    { label: t.quit, click: () => app.quit() },
  ]);
}

/** Đổi ngôn ngữ / đăng nhập / đăng xuất / trạng thái nguồn ⇒ vẽ lại cả thanh menu và menu khay. */
export function refreshMenus(): void {
  if (!actions) return;
  Menu.setApplicationMenu(appMenu());
  if (tray) {
    const s = getSettings();
    tray.setToolTip(s.deviceToken && s.user ? `${M[s.lang].tooltip} — ${s.user.email}` : M[s.lang].tooltip);
    tray.setContextMenu(trayMenu());
  }
}

export function createMenus(a: MenuActions): void {
  actions = a;
  tray = new Tray(nativeImage.createFromPath(join(__dirname, '../resources/icon.png')).resize({ width: 16, height: 16 }));
  tray.on('click', actions.showMain);
  refreshMenus();
  events.on('status', refreshMenus);
}

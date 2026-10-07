/**
 * Menu của Vala Desktop:
 *   - menu hồ sơ (bấm tên / ảnh đại diện trên thanh tab): tài khoản, Cài đặt, cập nhật, phiên bản, Đăng xuất, Thoát;
 *   - menu "⋯" trên thanh tab: hệ thống nguồn, đồng bộ phiên;
 *   - menu biểu tượng khay hệ thống (đủ mục — khi cửa sổ đang ẩn);
 *   - thanh menu ứng dụng (ẩn, nhấn Alt).
 * Vẽ lại mỗi khi trạng thái nguồn, ngôn ngữ hoặc đăng nhập đổi.
 */
import { app, BrowserWindow, Menu, nativeImage, Tray, type BaseWindow, type MenuItemConstructorOptions } from 'electron';
import { APP_NAME, ICON } from './channel';
import { messages } from './i18n';
import { portalHasPassword } from './portal-state';
import { getSettings } from './settings';
import { cachedSources, events, statusOf, syncAll, type SourceFull, type SyncResult } from './sync';
import { deleteCredential, savedCredential, secureStorageAvailable, setAutoLogin } from './credentials';
import { openCredentialDialog } from './credential-window';
import { checkNow, installNow, pendingUpdate } from './updater';
import { openSourceTab } from './windows';

const M = messages({
  vala: 'Vala', openMain: 'Trang chính',
  reports: 'Báo cáo', openPortal: 'Mở cổng báo cáo',
  sources: 'Hệ thống nguồn', noSources: '(chưa có hệ thống nào)', signInFirst: '(đăng nhập ở tab Báo cáo trước)',
  syncNow: 'Đồng bộ phiên ngay',
  view: 'Xem', reload: 'Tải lại', back: 'Quay lại', forward: 'Tiến tới', zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', zoomReset: 'Cỡ gốc',
  settingsMenu: 'Cài đặt', settings: 'Cài đặt…', signIn: 'Đăng nhập…', signOut: 'Đăng xuất', quit: 'Thoát', changePassword: 'Đổi mật khẩu…',
  open: (ten: string) => `Mở ${ten}`, credSaved: (u: string) => `Mật khẩu: ${u} ✓ đã lưu`, credNone: 'Chưa lưu mật khẩu',
  credAuto: 'Tự đăng nhập lại', credEnter: 'Lưu mật khẩu…', credChange: 'Đổi mật khẩu…', credDelete: 'Xoá mật khẩu',
  credUnavailable: 'Máy chưa có kho mật khẩu của hệ điều hành',
  checkUpdate: 'Kiểm tra cập nhật', installUpdate: (v: string) => `Cập nhật lên bản ${v}`, version: (v: string) => `Phiên bản ${v}`,
  result: {
    sent: 'đã kết nối', unchanged: 'đã kết nối', managed: 'hệ thống tự đăng nhập', not_logged_in: 'chưa đăng nhập',
    need_consent: 'cần xác nhận đồng ý', rejected: 'phiên hết hạn', error: 'lỗi',
  } as Record<SyncResult, string>,
}, {
  vala: 'Vala', openMain: 'Home page',
  reports: 'Reports', openPortal: 'Open reporting portal',
  sources: 'Source systems', noSources: '(no systems yet)', signInFirst: '(sign in on the Reports tab first)',
  syncNow: 'Sync sessions now',
  view: 'View', reload: 'Reload', back: 'Back', forward: 'Forward', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Actual size',
  settingsMenu: 'Settings', settings: 'Settings…', signIn: 'Sign in…', signOut: 'Sign out', quit: 'Quit', changePassword: 'Change password…',
  open: (ten: string) => `Open ${ten}`, credSaved: (u: string) => `Password: ${u} ✓ saved`, credNone: 'No saved password',
  credAuto: 'Sign in again automatically', credEnter: 'Save password…', credChange: 'Change password…', credDelete: 'Delete password',
  credUnavailable: 'No operating-system password store on this computer',
  checkUpdate: 'Check for updates', installUpdate: (v: string) => `Update to version ${v}`, version: (v: string) => `Version ${v}`,
  result: {
    sent: 'connected', unchanged: 'connected', managed: 'signed in automatically', not_logged_in: 'not signed in',
    need_consent: 'consent needed', rejected: 'session expired', error: 'error',
  } as Record<SyncResult, string>,
});

export interface MenuActions {
  showMain: () => void; showPortal: () => void; openSettings: () => void; signOut: () => void;
  /** Mở hộp đổi mật khẩu của cổng (cổng ẩn header trong app — mục này thay cho menu người dùng của cổng). */
  changePassword: () => void;
}

let tray: Tray | null = null;
let actions: MenuActions;

/**
 * Mục của một hệ thống nguồn: mở tab + mật khẩu lưu trong máy (T08). Dùng cho menu ⋯ (mỗi hệ thống một menu con) và menu
 * chuột phải trên tab của hệ thống đó.
 */
export function sourceMenuItems(src: SourceFull): MenuItemConstructorOptions[] {
  const t = M[getSettings().lang];
  const saved = savedCredential(src.code);
  const refresh = () => refreshMenus();
  const cred: MenuItemConstructorOptions[] = !secureStorageAvailable()
    ? [{ label: t.credUnavailable, enabled: false }]
    : [
        { label: saved ? t.credSaved(saved.username) : t.credNone, enabled: false },
        ...(saved ? [{ label: t.credAuto, type: 'checkbox' as const, checked: saved.auto, click: () => { setAutoLogin(src.code, !saved.auto); refresh(); } }] : []),
        { label: saved ? t.credChange : t.credEnter, click: () => openCredentialDialog(src, refresh) },
        ...(saved ? [{ label: t.credDelete, click: () => { deleteCredential(src.code); refresh(); } }] : []),
      ];
  return [{ label: t.open(src.ten), click: () => openSourceTab(src) }, { type: 'separator' }, ...cred];
}

/** Menu chuột phải trên tab nguồn (key src:<mã>); tab khác ⇒ null. */
export function tabContextMenu(key: string): Menu | null {
  const src = getSettings().deviceToken ? cachedSources().find((x) => `src:${x.code}` === key) : undefined;
  return src ? Menu.buildFromTemplate(sourceMenuItems(src)) : null;
}

function sourceItems(): MenuItemConstructorOptions[] {
  const s = getSettings();
  const t = M[s.lang];
  if (!s.deviceToken) return [{ label: t.signInFirst, enabled: false }];
  const items: MenuItemConstructorOptions[] = cachedSources().map((src) => {
    const r = statusOf(src.code)?.result;
    return { label: r ? `${src.ten} — ${t.result[r]}` : src.ten, submenu: sourceMenuItems(src) };
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
      : { label: t.signIn, click: actions.showPortal }] },
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
      updateItem(t),
      { label: t.version(app.getVersion()), enabled: false },
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
    s.deviceToken ? { label: t.openPortal, click: actions.showPortal } : { label: t.signIn, click: actions.showPortal },
    { label: t.sources, submenu: sourceItems() },
    { type: 'separator' },
    // Tài khoản đăng nhập bằng mật khẩu (không phải SSO) ⇒ đổi mật khẩu ngay trong cổng.
    ...(s.deviceToken && portalHasPassword() ? [{ label: t.changePassword, click: actions.changePassword }] : []),
    { label: t.settings, click: actions.openSettings },
    updateItem(t),
    { label: t.version(app.getVersion()), enabled: false },
    { type: 'separator' },
    { label: t.quit, click: () => app.quit() },
  ]);
}

/** Menu hồ sơ trên thanh tab: tài khoản, Cài đặt, cập nhật, phiên bản, Đăng xuất, Thoát. */
export function profileMenu(): Menu {
  const s = getSettings();
  const t = M[s.lang];
  return Menu.buildFromTemplate([
    ...(s.deviceToken && s.user ? [
      { label: s.user.ho_ten || s.user.email, enabled: false },
      ...(s.user.ho_ten ? [{ label: s.user.email, enabled: false }] : []),
      { type: 'separator' as const },
    ] : []),
    ...(s.deviceToken && portalHasPassword() ? [{ label: t.changePassword, click: actions.changePassword }] : []),
    { label: t.settings, click: actions.openSettings },
    updateItem(t),
    { label: t.version(app.getVersion()), enabled: false },
    { type: 'separator' },
    ...(s.deviceToken ? [{ label: t.signOut, click: actions.signOut }] : [{ label: t.signIn, click: actions.showPortal }]),
    { label: t.quit, click: () => app.quit() },
  ]);
}

/** Menu "⋯" trên thanh tab: các hệ thống nguồn (mở tab) và đồng bộ phiên. */
export function moreMenu(): Menu {
  return Menu.buildFromTemplate(sourceItems());
}

function updateItem(t: (typeof M)['vi']): MenuItemConstructorOptions {
  const up = pendingUpdate();
  return up ? { label: t.installUpdate(up.version), click: installNow } : { label: t.checkUpdate, click: checkNow };
}

/** Đổi ngôn ngữ / đăng nhập / đăng xuất / trạng thái nguồn ⇒ vẽ lại cả thanh menu và menu khay. */
export function refreshMenus(): void {
  if (!actions) return;
  Menu.setApplicationMenu(appMenu());
  if (tray) {
    const s = getSettings();
    tray.setToolTip(s.deviceToken && s.user ? `${APP_NAME} — ${s.user.email}` : APP_NAME);
    tray.setContextMenu(trayMenu());
  }
}

export function createMenus(a: MenuActions): void {
  actions = a;
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.on('click', actions.showMain);
  refreshMenus();
  events.on('status', refreshMenus);
}

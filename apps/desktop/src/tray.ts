/** Biểu tượng khay hệ thống: ứng dụng chạy nền ở đây khi đóng cửa sổ. Menu vẽ lại mỗi khi trạng thái nguồn đổi. */
import { join } from 'node:path';
import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import { messages } from './i18n';
import { getSettings } from './settings';
import { cachedSources, events, statusOf, syncAll, type SyncResult } from './sync';
import { openSourceWindow } from './windows';

const M = messages({
  tooltip: 'Vala Desktop',
  openMain: 'Mở trang chính', openPortal: 'Mở cổng báo cáo',
  sources: 'Hệ thống nguồn', noSources: '(chưa có hệ thống nào)',
  syncNow: 'Đồng bộ phiên ngay', settings: 'Cài đặt…', signIn: 'Đăng nhập…', quit: 'Thoát',
  result: {
    sent: 'đã kết nối', unchanged: 'đã kết nối', managed: 'hệ thống tự đăng nhập', not_logged_in: 'chưa đăng nhập',
    need_consent: 'cần xác nhận đồng ý', rejected: 'phiên hết hạn', error: 'lỗi',
  } as Record<SyncResult, string>,
}, {
  tooltip: 'Vala Desktop',
  openMain: 'Open home page', openPortal: 'Open reporting portal',
  sources: 'Source systems', noSources: '(no systems yet)',
  syncNow: 'Sync sessions now', settings: 'Settings…', signIn: 'Sign in…', quit: 'Quit',
  result: {
    sent: 'connected', unchanged: 'connected', managed: 'signed in automatically', not_logged_in: 'not signed in',
    need_consent: 'consent needed', rejected: 'session expired', error: 'error',
  } as Record<SyncResult, string>,
});

export interface TrayActions { showMain: () => void; showPortal: () => void; openSettings: () => void }

let tray: Tray | null = null;
let actions: TrayActions;

function buildMenu() {
  if (!tray) return;
  const s = getSettings();
  const t = M[s.lang];
  const signedIn = !!s.deviceToken;
  const sources: MenuItemConstructorOptions[] = cachedSources().map((src) => {
    const r = statusOf(src.code)?.result;
    return { label: r ? `${src.ten} — ${t.result[r]}` : src.ten, click: () => openSourceWindow(src) };
  });
  tray.setToolTip(signedIn && s.user ? `${t.tooltip} — ${s.user.email}` : t.tooltip);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.openMain, click: actions.showMain },
    ...(signedIn ? [
      { label: t.openPortal, click: actions.showPortal },
      { label: t.sources, submenu: sources.length ? sources : [{ label: t.noSources, enabled: false }] },
      { label: t.syncNow, click: () => void syncAll(true) },
    ] : [{ label: t.signIn, click: actions.openSettings }]),
    { type: 'separator' },
    { label: t.settings, click: actions.openSettings },
    { label: t.quit, click: () => app.quit() },
  ]));
}

export function createTray(a: TrayActions): void {
  actions = a;
  tray = new Tray(nativeImage.createFromPath(join(__dirname, '../resources/icon.png')).resize({ width: 16, height: 16 }));
  tray.on('click', actions.showMain);
  buildMenu();
  events.on('status', buildMenu);
}

/** Đổi ngôn ngữ / đăng nhập / đăng xuất ⇒ vẽ lại menu. */
export const refreshTray = buildMenu;

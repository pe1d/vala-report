/**
 * Tự cập nhật Vala Desktop (electron-updater, kênh "generic"): hỏi <máy chủ Vala Reporting>/desktop/latest.yml lúc mở và
 * 4 giờ một lần; có bản mới thì tải ngầm (kiểm sha512 trong latest.yml), xong thì thanh tab hiện "Đã có bản … — Cập nhật".
 * Bấm ⇒ đóng ứng dụng, cài, mở lại; không bấm ⇒ cài khi thoát.
 *
 * Chỉ chạy ở bản CÀI ĐẶT (NSIS) — bản zip/bản chạy từ mã nguồn không tự thay được chính nó.
 * Phát hành: chép file cài + .blockmap lên thư mục /desktop/ của máy chủ trước, latest.yml sau cùng (docs/trien-khai-k3s.md).
 */
import { app, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { messages } from './i18n';
import { getSettings, updateFeedUrl } from './settings';

const M = messages({
  readyTitle: (v: string) => `Đã có Vala Desktop bản ${v}`,
  readyBody: 'Bấm "Cập nhật" trên thanh tab để cài ngay, hoặc bản mới tự cài khi bạn thoát ứng dụng.',
  latest: (v: string) => `Bạn đang dùng bản mới nhất (${v}).`,
  checkFailed: 'Không kiểm tra được bản cập nhật',
  notInstalled: 'Bản này không tự cập nhật được — cài Vala Desktop bằng bộ cài để nhận cập nhật tự động.',
}, {
  readyTitle: (v: string) => `Vala Desktop ${v} is available`,
  readyBody: 'Click "Update" on the tab bar to install now, or it installs automatically when you quit.',
  latest: (v: string) => `You are on the latest version (${v}).`,
  checkFailed: 'Could not check for updates',
  notInstalled: 'This copy cannot update itself — install Vala Desktop with the installer to get automatic updates.',
});

const CHECK_EVERY_MS = 4 * 3600_000;
const ICON = join(__dirname, '../resources/icon.png');

let ready: { version: string } | null = null;
/** Người dùng tự bấm "Kiểm tra cập nhật" ⇒ báo cả khi không có bản mới / lỗi. */
let manual = false;

/** Bản mới đã tải xong, chờ cài (null nếu chưa có). */
export const pendingUpdate = (): { version: string } | null => ready;

/**
 * Có tự cập nhật được không: bản CÀI ĐẶT (có resources/app-update.yml do electron-builder sinh cho NSIS — bản zip không có),
 * hoặc VALA_UPDATE_DEV=1 để thử ở bản chạy từ mã nguồn.
 */
export const canUpdate = (): boolean =>
  app.isPackaged ? existsSync(join(process.resourcesPath, 'app-update.yml')) : !!process.env.VALA_UPDATE_DEV;

function notify(title: string, body = '') {
  if (Notification.isSupported()) new Notification({ title, body, icon: ICON }).show();
}

function check() {
  autoUpdater.setFeedURL({ provider: 'generic', url: updateFeedUrl(getSettings().serverUrl) });
  autoUpdater.checkForUpdates().catch(() => { /* lỗi đã báo qua sự kiện 'error' */ });
}

export function initUpdater(onReady: () => void): void {
  if (!canUpdate()) return;
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: () => {}, debug: () => {}, warn: (m: unknown) => console.warn('[vala] update', m), error: (m: unknown) => console.warn('[vala] update', m) };

  autoUpdater.on('update-downloaded', (info) => {
    ready = { version: info.version };
    manual = false;
    const t = M[getSettings().lang];
    notify(t.readyTitle(info.version), t.readyBody);
    onReady();
  });
  autoUpdater.on('update-not-available', () => {
    if (manual) notify(M[getSettings().lang].latest(app.getVersion()));
    manual = false;
  });
  autoUpdater.on('error', (e) => {
    console.warn('[vala] update', e.message);
    if (manual) notify(M[getSettings().lang].checkFailed, e.message);
    manual = false;
  });

  setTimeout(check, 10_000);
  setInterval(check, CHECK_EVERY_MS);
}

/** Menu "Kiểm tra cập nhật". */
export function checkNow(): void {
  if (!canUpdate()) { notify(M[getSettings().lang].notInstalled); return; }
  manual = true;
  check();
}

/** Nút "Cập nhật": đóng ứng dụng, cài im lặng, mở lại bản mới. */
export function installNow(): void {
  if (ready) autoUpdater.quitAndInstall(true, true);
}

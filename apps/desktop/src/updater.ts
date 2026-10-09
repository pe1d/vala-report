/**
 * Tự cập nhật Vala Desktop (electron-updater, kênh "generic"): hỏi <máy chủ Vala Reporting>/desktop/latest.yml lúc mở và
 * 4 giờ một lần; có bản mới thì tải ngầm (kiểm sha512 trong latest.yml), xong thì thanh dọc hiện "Đã có bản … — Cập nhật".
 * Bấm ⇒ hộp "Bản … có gì mới" (Cài ngay / Để sau); không bấm ⇒ cài khi thoát. Lần đầu mở bản mới ⇒ thông báo "Đã cập nhật
 * lên bản …" (bấm ⇒ Cài đặt → Giới thiệu). Điểm mới lấy từ CHANGELOG.md (release-notes.ts).
 *
 * "Tự động cập nhật" (Cài đặt → Khởi động & cập nhật, mặc định bật — người dùng chốt 08/10/2026): tải xong ⇒ tự cài im
 * lặng rồi mở lại khi không phiền người dùng (cửa sổ ẩn xuống khay hoặc máy để không 10 phút — updater-model.ts).
 *
 * Chỉ chạy ở bản CÀI ĐẶT: Windows NSIS (hỏi latest.yml), Ubuntu gói .deb (hỏi latest-linux.yml) — bản zip/bản chạy từ mã
 * nguồn không tự thay được chính nó. Gói .deb cài bằng quyền quản trị (pkexec hỏi mật khẩu) nên trên Linux chỉ cài khi người
 * dùng bấm "Cập nhật", không tự cài lúc thoát (tránh bị hỏi mật khẩu bất ngờ khi tắt máy).
 * Phát hành: chép file cài + .blockmap lên thư mục /desktop/ của máy chủ trước, latest.yml sau cùng (docs/trien-khai-k3s.md).
 */
import { app, BrowserWindow, dialog, powerMonitor } from 'electron';
import { notify } from './notify';
import { autoUpdater } from 'electron-updater';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { messages, type Lang } from './i18n';
import { parseNotes, type ReleaseNotes } from './release-notes';
import { getSettings, setSettings, updateFeedUrl } from './settings';
import { shouldAutoInstall } from './updater-model';
import { reportError } from './error-report';

const M = messages({
  readyTitle: (v: string) => `Đã có Vala Desktop bản ${v}`,
  readyBody: 'Bấm "Cập nhật" ở cuối thanh bên để cài ngay, hoặc bản mới tự cài khi bạn thoát ứng dụng.',
  readyBodyLinux: 'Bấm "Cập nhật" ở cuối thanh bên để cài — Ubuntu sẽ hỏi mật khẩu quản trị.',
  latest: (v: string) => `Bạn đang dùng bản mới nhất (${v}).`,
  checkFailed: 'Không kiểm tra được bản cập nhật',
  notInstalled: 'Bản này không tự cập nhật được — cài Vala Desktop bằng bộ cài để nhận cập nhật tự động.',
  whatsNew: (v: string) => `Vala Desktop bản ${v} có gì mới`,
  noNotes: 'Bản này chưa có ghi chú.',
  installNow: 'Cài ngay', later: 'Để sau',
  restartHint: 'Vala Desktop sẽ đóng, cài bản mới rồi tự mở lại.',
  restartHintLinux: 'Vala Desktop sẽ đóng, cài bản mới rồi tự mở lại. Ubuntu sẽ hỏi mật khẩu quản trị.',
  updatedTitle: (v: string) => `Đã cập nhật Vala Desktop lên bản ${v}`,
  updatedBody: 'Bấm để xem có gì mới.',
}, {
  readyTitle: (v: string) => `Vala Desktop ${v} is available`,
  readyBody: 'Click "Update" at the bottom of the sidebar to install now, or it installs automatically when you quit.',
  readyBodyLinux: 'Click "Update" at the bottom of the sidebar to install — Ubuntu will ask for an administrator password.',
  latest: (v: string) => `You are on the latest version (${v}).`,
  checkFailed: 'Could not check for updates',
  notInstalled: 'This copy cannot update itself — install Vala Desktop with the installer to get automatic updates.',
  whatsNew: (v: string) => `What's new in Vala Desktop ${v}`,
  noNotes: 'No notes for this version.',
  installNow: 'Install now', later: 'Later',
  restartHint: 'Vala Desktop will close, install the new version and open again.',
  restartHintLinux: 'Vala Desktop will close, install the new version and open again. Ubuntu will ask for an administrator password.',
  updatedTitle: (v: string) => `Vala Desktop updated to ${v}`,
  updatedBody: 'Click to see what\'s new.',
});

const CHECK_EVERY_MS = 4 * 3600_000;

/** Bật / tắt tự cài bản mới (không đặt ⇒ bật). */
export const autoUpdateEnabled = (): boolean => getSettings().autoUpdate !== false;
export function setAutoUpdate(on: boolean): void { setSettings({ autoUpdate: on }); }

/** Đã tải xong bản mới ⇒ mỗi phút xem đã đến lúc tự cài chưa (không cài giữa lúc người dùng đang làm việc). */
let autoTimer: ReturnType<typeof setInterval> | null = null;
function scheduleAutoInstall(): void {
  if (autoTimer) return;
  autoTimer = setInterval(() => {
    if (!ready) return;
    const ok = shouldAutoInstall({
      enabled: autoUpdateEnabled(), platform: process.platform,
      windowVisible: BrowserWindow.getAllWindows().some((w) => w.isVisible() && !w.isMinimized()),
      idleSeconds: powerMonitor.getSystemIdleTime(),
    });
    if (ok) installNow();
  }, 60_000);
}

let ready: { version: string; notes: ReleaseNotes | null } | null = null;
/** Người dùng tự bấm "Kiểm tra cập nhật" ⇒ báo cả khi không có bản mới / lỗi. */
let manual = false;

/** Bản mới đã tải xong, chờ cài (null nếu chưa có); `notes` ⇒ điểm mới đọc từ latest.yml (bản phát hành cũ không có). */
export const pendingUpdate = (): { version: string; notes: ReleaseNotes | null } | null => ready;

/** Điểm mới của bản đang chạy (dist/release-notes.json đóng kèm); bản dev chưa có mục trong CHANGELOG.md ⇒ null. */
export function currentNotes(): ReleaseNotes | null {
  try {
    const n = parseNotes(readFileSync(join(__dirname, 'release-notes.json'), 'utf8'));
    return n?.version === app.getVersion() ? n : null;
  } catch { return null; }
}

/** Các điểm mới theo ngôn ngữ, mỗi điểm một dòng "• …". */
export const notesText = (n: ReleaseNotes | null, lang: Lang): string => (n ? n[lang].map((x) => `• ${x}`).join('\n') : '');

/**
 * Có tự cập nhật được không: bản CÀI ĐẶT (có resources/app-update.yml do electron-builder sinh cho NSIS — bản zip không có),
 * hoặc VALA_UPDATE_DEV=1 để thử ở bản chạy từ mã nguồn.
 */
export const canUpdate = (): boolean => {
  if (!app.isPackaged) return !!process.env.VALA_UPDATE_DEV;
  return existsSync(join(process.resourcesPath, 'app-update.yml'));
};


/**
 * Ubuntu: electron-updater mặc định gọi `pkexec /bin/bash -c 'dpkg -i …'` ⇒ hộp xin mật khẩu hiện nguyên câu lệnh. Gói .deb
 * (packaging/deb-after-install.sh) cài sẵn script cài cập nhật + chính sách polkit có lời nhắn song ngữ ⇒ gọi script đó.
 * Máy cài từ bản cũ chưa có script ⇒ giữ cách mặc định.
 */
const DEB_HELPER = '/usr/lib/vala-desktop/cai-cap-nhat';
function useDebHelper(): void {
  if (process.platform !== 'linux' || !existsSync(DEB_HELPER)) return;
  const u = autoUpdater as unknown as {
    runCommandWithSudoIfNeeded?: (cmd: string[]) => unknown;
    spawnSyncLog: (cmd: string, args: string[]) => unknown;
  };
  const original = u.runCommandWithSudoIfNeeded?.bind(u);
  if (!original) return;
  u.runCommandWithSudoIfNeeded = (cmd: string[]) => {
    const deb = cmd[0] === 'dpkg' && cmd[1] === '-i' ? cmd[2] : null;
    // Script tự xử lý phụ thuộc thiếu ⇒ bỏ bước "apt-get install -f" electron-updater gọi khi dpkg lỗi.
    if (cmd[0] === 'apt-get' && cmd[1] === 'install' && cmd[2] === '-f') return '';
    if (!deb || /'/.test(deb)) return original(cmd);
    return u.spawnSyncLog('pkexec', ['--disable-internal-agent', DEB_HELPER, `'${deb}'`]);
  };
}

function check() {
  autoUpdater.setFeedURL({ provider: 'generic', url: updateFeedUrl(getSettings().serverUrl) });
  autoUpdater.checkForUpdates().catch(() => { /* lỗi đã báo qua sự kiện 'error' */ });
}

export function initUpdater(onReady: () => void): void {
  if (!canUpdate()) return;
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'linux';
  autoUpdater.logger = { info: () => {}, debug: () => {}, warn: (m: unknown) => console.warn('[vala] update', m), error: (m: unknown) => console.warn('[vala] update', m) };
  useDebHelper();

  autoUpdater.on('update-downloaded', (info) => {
    const notes = parseNotes(info.releaseNotes);
    ready = { version: info.version, notes: notes?.version === info.version ? notes : null };
    manual = false;
    const lang = getSettings().lang;
    const t = M[lang];
    // Thông báo nêu điểm mới đầu tiên; bấm ⇒ hộp "có gì mới" đầy đủ.
    const first = ready.notes?.[lang][0];
    // Tự cập nhật đang bật (không phải Ubuntu) ⇒ không báo, tự cài lúc rảnh; còn lại ⇒ báo để người dùng bấm.
    if (autoUpdateEnabled() && process.platform !== 'linux') scheduleAutoInstall();
    else notify(t.readyTitle(info.version), first ? `${first}…` : process.platform === 'linux' ? t.readyBodyLinux : t.readyBody, promptInstall);
    onReady();
  });
  autoUpdater.on('update-not-available', () => {
    if (manual) notify(M[getSettings().lang].latest(app.getVersion()));
    manual = false;
  });
  autoUpdater.on('error', (e) => {
    console.warn('[vala] update', e.message);
    reportError('cap_nhat', e.message, e.stack);
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

/** Đóng ứng dụng, cài im lặng, mở lại bản mới (nút trong Cài đặt → Giới thiệu, nơi đã hiện sẵn điểm mới). */
export function installNow(): void {
  if (ready) autoUpdater.quitAndInstall(true, true);
}

/** Nút "Cập nhật" trên thanh dọc / menu / thông báo: hộp "Bản … có gì mới" ⇒ Cài ngay hoặc Để sau. */
export async function promptInstall(): Promise<void> {
  if (!ready) return;
  const lang = getSettings().lang;
  const t = M[lang];
  const hint = process.platform === 'linux' ? t.restartHintLinux : t.restartHint;
  const opts = {
    type: 'info' as const, title: t.whatsNew(ready.version), message: t.whatsNew(ready.version),
    detail: `${notesText(ready.notes, lang) || t.noNotes}\n\n${hint}`,
    buttons: [t.installNow, t.later], defaultId: 0, cancelId: 1, noLink: true,
  };
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((w) => w.isVisible());
  const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
  if (response === 0) installNow();
}

/**
 * Gọi lúc khởi động: bản đang chạy khác bản lần trước ⇒ vừa cập nhật ⇒ một thông báo "Đã cập nhật lên bản …" (bấm ⇒
 * `openAbout`, Cài đặt → Giới thiệu có danh sách điểm mới). Chưa có lastVersion: máy đã đăng nhập ⇒ vừa lên từ bản cũ chưa
 * ghi trường này (≤ 0.2.3) nên vẫn báo; chưa đăng nhập ⇒ coi như mới cài, không báo.
 */
export function announceUpdate(openAbout: () => void): void {
  const s = getSettings();
  const now = app.getVersion();
  if (s.lastVersion === now) return;
  setSettings({ lastVersion: now });
  if (!s.lastVersion && !s.deviceToken) return;
  const lang = getSettings().lang;
  const t = M[lang];
  const first = currentNotes()?.[lang][0];
  notify(t.updatedTitle(now), first ? `${first}… ${t.updatedBody}` : t.updatedBody, openAbout);
}

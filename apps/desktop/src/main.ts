/**
 * Vala Desktop — tiến trình chính.
 * Một cửa sổ tab (browser.ts). Chạy nền ở khay hệ thống (đóng cửa sổ không thoát), tự khởi động cùng máy, giữ phiên các hệ thống nguồn và gửi
 * cho Vala Reporting mỗi khi đổi + định kỳ 15 phút (thay tiện ích trình duyệt).
 */
import { app } from 'electron';
import { setupChannel } from './channel';
import { cleanUserAgent } from './ua';
import { accountEvents, logoutDevice } from './account';
import { openSettingsWindow } from './settings-window';
import { getSettings } from './settings';
import { syncAll } from './sync';
import { forgetPackages, refreshPackages } from './scripts';
import { applyTheme, prefsEvents } from './prefs';
import { forgetPortalLogin, initBrowser, refreshBrowser } from './browser';
import { createMenus, moreMenu, profileMenu, refreshMenus } from './menu';
import { refreshHomeFromServer } from './homepage';
import { enableLinuxAutostart } from './linux';
import { initUpdater } from './updater';
import { onTabLeave, registerBridge, showMain, showPortal, watchCookies } from './windows';

const SYNC_INTERVAL_MS = 15 * 60_000;
/** Mở lúc Windows khởi động ⇒ chỉ chạy nền, không bật cửa sổ. */
const HIDDEN = process.argv.includes('--hidden');

let syncTimer: ReturnType<typeof setInterval> | null = null;

/** Đăng nhập/đăng xuất, đổi trang chính, đổi ngôn ngữ ⇒ vẽ lại menu và các tab ghim. */
function refreshAll() {
  refreshMenus();
  refreshBrowser();
}

/** Trang chính do quản trị đặt trên cổng: đổi ⇒ tab Vala nạp trang mới. */
const refreshHome = () => refreshHomeFromServer().then((changed) => { if (changed) refreshAll(); });

function startSync() {
  void syncAll().then(refreshAll, refreshAll);
  void refreshPackages();
  if (!syncTimer) syncTimer = setInterval(() => { void syncAll(); void refreshHome(); void refreshPackages(); }, SYNC_INTERVAL_MS);
}

/** Đăng xuất cả ứng dụng (thu hồi token thiết bị) lẫn cổng (xoá phiên cổng — không thì cổng lại tự cấp token mới). */
async function signOut() {
  await logoutDevice();
  await forgetPortalLogin();
  refreshAll();
}

// Đăng nhập cổng ở tab Báo cáo ⇒ cổng cấp token thiết bị qua cầu nối (account.ts) ⇒ bắt đầu giữ/gửi phiên.
accountEvents.on('login', () => { refreshAll(); startSync(); });
accountEvents.on('logout', () => { forgetPackages(); refreshAll(); });
// Đổi ngôn ngữ / sáng-tối ở bất kỳ đâu ⇒ menu, khay, thanh tab theo (browser.ts tự báo cổng).
prefsEvents.on('changed', refreshAll);

function openSettings() {
  openSettingsWindow({
    signIn: showPortal,
    signOut,
    onHomeChanged: () => { void refreshHome().then(() => showMain()); },
    openPortal: showPortal,
  });
}

// Bản dev ⇒ tên, thư mục dữ liệu riêng (channel.ts). Phải chạy trước khi đọc cấu hình / xin khoá "chỉ một bản".
setupChannel();
app.userAgentFallback = cleanUserAgent(app.userAgentFallback);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Mở lần hai (bấm biểu tượng khi đã chạy nền) ⇒ hiện cửa sổ chính của bản đang chạy.
  app.on('second-instance', () => showMain());
  app.setAppUserModelId('com.bkav.vala.desktop');

  app.whenReady().then(() => {
    // Tự khởi động cùng máy — chỉ ở bản đã cài (bản dev chạy bằng binary electron chung). Linux không có
    // setLoginItemSettings ⇒ tự ghi mục autostart (linux.ts).
    if (app.isPackaged) {
      if (process.platform === 'linux') enableLinuxAutostart();
      else app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    }
    applyTheme();
    registerBridge();
    watchCookies();
    createMenus({ showMain, showPortal, openSettings, signOut: () => void signOut() });
    initBrowser({ onLeave: onTabLeave, menu: moreMenu, profileMenu, signIn: showPortal });
    // Bản mới tải xong ⇒ hiện nút "Cập nhật" trên thanh tab và trong menu.
    initUpdater(refreshAll);

    void refreshHome();
    // Không bật cửa sổ Cài đặt: chưa đăng nhập thì thanh tab có nút "Đăng nhập" (sang tab Báo cáo đăng nhập cổng).
    if (getSettings().deviceToken) startSync();
    if (!HIDDEN) showMain();
  });

  // Chạy nền ở khay hệ thống: đóng hết cửa sổ không thoát ứng dụng.
  app.on('window-all-closed', () => { /* giữ chạy */ });
}

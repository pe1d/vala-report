/**
 * Vala Desktop — tiến trình chính.
 * Một cửa sổ tab (browser.ts). Chạy nền ở khay hệ thống (đóng cửa sổ không thoát), tự khởi động cùng máy, giữ phiên các hệ thống nguồn và gửi
 * cho Vala Reporting mỗi khi đổi + định kỳ 15 phút (thay tiện ích trình duyệt).
 */
import { app } from 'electron';
import { setupChannel } from './channel';
import { cleanUserAgent } from './ua';
import { closeSettingsWindow, openSettingsWindow } from './settings-window';
import { getSettings } from './settings';
import { syncAll } from './sync';
import { initBrowser, refreshBrowser } from './browser';
import { createMenus, refreshMenus, trayMenu } from './menu';
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
  if (!syncTimer) syncTimer = setInterval(() => { void syncAll(); void refreshHome(); }, SYNC_INTERVAL_MS);
}

function openSettings() {
  openSettingsWindow({
    // Đăng nhập xong ⇒ mở luôn tab Báo cáo (mục đích của việc đăng nhập).
    onLogin: () => { refreshAll(); startSync(); closeSettingsWindow(); showPortal(); },
    onLogout: refreshAll,
    onLangChanged: refreshAll,
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
    registerBridge();
    watchCookies();
    createMenus({ showMain, showPortal, openSettings });
    initBrowser({ onLeave: onTabLeave, menu: trayMenu, onLangChanged: refreshAll });
    // Bản mới tải xong ⇒ hiện nút "Cập nhật" trên thanh tab và trong menu.
    initUpdater(refreshAll);

    void refreshHome();
    if (getSettings().deviceToken) {
      startSync();
      if (!HIDDEN) showMain();
    } else {
      // Chưa đăng nhập thiết bị: vẫn mở được trang chính; cửa sổ Cài đặt mời đăng nhập để giữ phiên các hệ thống nguồn.
      if (!HIDDEN) showMain();
      openSettings();
    }
  });

  // Chạy nền ở khay hệ thống: đóng hết cửa sổ không thoát ứng dụng.
  app.on('window-all-closed', () => { /* giữ chạy */ });
}

/**
 * Vala Desktop — tiến trình chính.
 * Một cửa sổ tab (browser.ts). Chạy nền ở khay hệ thống (đóng cửa sổ không thoát), tự khởi động cùng Windows, giữ phiên các hệ thống nguồn và gửi
 * cho Vala Reporting mỗi khi đổi + định kỳ 15 phút (thay tiện ích trình duyệt).
 */
import { app } from 'electron';
import { closeSettingsWindow, openSettingsWindow } from './settings-window';
import { getSettings } from './settings';
import { syncAll } from './sync';
import { initBrowser, refreshBrowser } from './browser';
import { createMenus, refreshMenus, trayMenu } from './menu';
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

function startSync() {
  void syncAll().then(refreshAll, refreshAll);
  if (!syncTimer) syncTimer = setInterval(() => void syncAll(), SYNC_INTERVAL_MS);
}

function openSettings() {
  openSettingsWindow({
    // Đăng nhập xong ⇒ mở luôn tab Báo cáo (mục đích của việc đăng nhập).
    onLogin: () => { refreshAll(); startSync(); closeSettingsWindow(); showPortal(); },
    onLogout: refreshAll,
    onHomeChanged: () => { refreshAll(); showMain(); },
    onLangChanged: refreshAll,
    openPortal: showPortal,
  });
}

// User-Agent như Chrome thường: bỏ "Electron/x" và tên ứng dụng. Có trang (vd vala.bkav.com) thấy "Electron" là trả về
// thông báo "đã dừng phát triển bản Vala Desktop" (của bản desktop cũ) thay cho trang thật.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|[\w@./-]*desktop)\/\S+/gi, '');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Mở lần hai (bấm biểu tượng khi đã chạy nền) ⇒ hiện cửa sổ chính của bản đang chạy.
  app.on('second-instance', () => showMain());
  app.setAppUserModelId('com.bkav.vala.desktop');

  app.whenReady().then(() => {
    // Chỉ đăng ký tự khởi động ở bản đã cài (bản dev chạy bằng binary electron chung).
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    registerBridge();
    watchCookies();
    createMenus({ showMain, showPortal, openSettings });
    initBrowser({ onLeave: onTabLeave, menu: trayMenu, onLangChanged: refreshAll });
    // Bản mới tải xong ⇒ hiện nút "Cập nhật" trên thanh tab và trong menu.
    initUpdater(refreshAll);

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

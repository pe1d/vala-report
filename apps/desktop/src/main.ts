/**
 * Vala Desktop — tiến trình chính.
 * Một cửa sổ tab (browser.ts). Chạy nền ở khay hệ thống (đóng cửa sổ không thoát), tự khởi động cùng máy, giữ phiên các hệ thống nguồn và gửi
 * cho Vala Reporting mỗi khi đổi + định kỳ 15 phút (thay tiện ích trình duyệt).
 */
import { app } from 'electron';
import { setupChannel } from './channel';
import { cleanUserAgent } from './ua';
import { accountEvents, logoutDevice } from './account';
import { registerSettingsPage } from './settings-page';
import { registerRecordingPage } from './recording-page';
import { registerChatPage } from './chat-page';
import { getSettings } from './settings';
import { syncAll } from './sync';
import { forgetPackages, refreshPackages } from './scripts';
import { applyTheme, prefsEvents } from './prefs';
import { portalHasPassword, setPortalUser } from './portal-state';
import { registerAutofill } from './autofill';
import { lockCredentials } from './credentials';
import { installUiProtocol, refreshUi, registerUiScheme } from './ui-cache';
import { forgetPortalLogin, initBrowser, showDefault, isChatContents, isRecordingContents, pushChat, isSettingsContents, openRecordingTab, openSettingsTab, pushRecording, pushSettings, refreshBrowser, revealWindow } from './browser';
import { setNotifyReveal } from './notify';
import { createMenus, refreshMenus, tabContextMenu } from './menu';
import { refreshHomeFromServer } from './homepage';
import { applyAutostart } from './autostart';
import { announceUpdate, checkNow, initUpdater } from './updater';
import { changePortalPassword, onTabLeave, portalUserEvents, registerBridge, showMain, showPortal, watchCookies } from './windows';

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
  if (!syncTimer) syncTimer = setInterval(() => { void syncAll(); void refreshHome(); void refreshPackages(); void refreshUi(); }, SYNC_INTERVAL_MS);
}

/** Đăng xuất cả ứng dụng (thu hồi token thiết bị) lẫn cổng (xoá phiên cổng — không thì cổng lại tự cấp token mới). */
async function signOut() {
  await logoutDevice();
  await forgetPortalLogin();
  refreshAll();
}

// Đăng nhập cổng ở tab Báo cáo ⇒ cổng cấp token thiết bị qua cầu nối (account.ts) ⇒ bắt đầu giữ/gửi phiên.
accountEvents.on('login', () => { refreshAll(); startSync(); });
accountEvents.on('logout', () => { forgetPackages(); setPortalUser(null); lockCredentials(); refreshAll(); });
// Đổi ngôn ngữ / sáng-tối ở bất kỳ đâu ⇒ menu, khay, thanh dọc theo (browser.ts tự báo cổng).
prefsEvents.on('changed', refreshAll);
portalUserEvents.on('changed', refreshAll);

/** Cài đặt mở thành tab (như chrome://settings); `section` ⇒ nhảy tới mục đó. */
const openSettings = (section?: string) => openSettingsTab(section);

// Bản dev ⇒ tên, thư mục dữ liệu riêng (channel.ts). Phải chạy trước khi đọc cấu hình / xin khoá "chỉ một bản".
setupChannel();
app.userAgentFallback = cleanUserAgent(app.userAgentFallback);
// vala-ui:// — giao diện cổng chạy từ bản trong máy (ui-cache.ts); phải đăng ký trước app ready.
registerUiScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Mở lần hai (bấm biểu tượng khi đã chạy nền) ⇒ hiện cửa sổ chính của bản đang chạy.
  app.on('second-instance', () => showDefault());
  app.setAppUserModelId('com.bkav.vala.desktop');

  app.whenReady().then(() => {
    // Tự khởi động cùng máy — chỉ ở bản đã cài (bản dev chạy bằng binary electron chung). Linux không có
    // setLoginItemSettings ⇒ tự ghi mục autostart (linux.ts).
    applyAutostart();
    applyTheme();
    setNotifyReveal(revealWindow);
    installUiProtocol();
    registerBridge();
    registerAutofill();
    registerSettingsPage({
      signIn: showPortal, signOut, openPortal: showPortal,
      onHomeChanged: () => { void refreshHome().then(() => showMain()); },
      isSettings: (e) => isSettingsContents(e.sender), push: pushSettings,
    });
    registerRecordingPage({ isRecording: (e) => isRecordingContents(e.sender), push: pushRecording, open: openRecordingTab });
    registerChatPage({ isChat: (e) => isChatContents(e.sender), push: pushChat });
    watchCookies();
    createMenus({ showMain, showDefault, showPortal, openSettings, signOut: () => void signOut(), changePassword: changePortalPassword });
    initBrowser({
      onLeave: onTabLeave, signIn: showPortal, tabMenu: tabContextMenu, portalHasPassword,
      // Menu hồ sơ ở cuối thanh dọc (khung nổi).
      profileCommand: (cmd) => {
        if (cmd === 'settings') openSettings();
        else if (cmd === 'passwords') openSettings('mat-khau');
        else if (cmd === 'change-password') changePortalPassword();
        else if (cmd === 'sync') void syncAll(true);
        else if (cmd === 'check-update') checkNow();
        else if (cmd === 'sign-out') void signOut();
        else if (cmd === 'quit') app.quit();
      },
    });
    // Bản mới tải xong ⇒ hiện nút "Cập nhật" trên thanh dọc và trong menu.
    initUpdater(refreshAll);
    // Vừa cập nhật lên bản mới ⇒ báo một lần "có gì mới" (bấm ⇒ Cài đặt → Giới thiệu).
    announceUpdate(() => openSettings('gioi-thieu'));

    void refreshHome();
    void refreshUi();
    // Không bật cửa sổ Cài đặt: chưa đăng nhập thì thanh dọc có nút "Đăng nhập" (sang tab Báo cáo đăng nhập cổng).
    if (getSettings().deviceToken) startSync();
    if (!HIDDEN) showDefault();
  });

  // Chạy nền ở khay hệ thống: đóng hết cửa sổ không thoát ứng dụng.
  app.on('window-all-closed', () => { /* giữ chạy */ });
}

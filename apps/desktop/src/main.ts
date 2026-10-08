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
import { registerLoginPage } from './login-page';
import { clearLocalData } from './local-data';
import { registerSearch } from './search';
import { getSettings } from './settings';
import { syncAll } from './sync';
import { forgetPackages, refreshPackages } from './scripts';
import { applyTheme, prefsEvents } from './prefs';
import { portalHasPassword, setPortalUser } from './portal-state';
import { registerAutofill } from './autofill';
import { lockCredentials } from './credentials';
import { installUiProtocol, refreshUi, registerUiScheme } from './ui-cache';
import { contentBounds, browserWindow, preloadDefaultApp, showDefaultApp, forgetPortalLogin, initBrowser, isLoginContents, pushLogin, showLogin, showDefault, isChatContents, isRecordingContents, pushChat, isSettingsContents, openRecordingTab, openSettingsTab, pushRecording, pushSettings, refreshBrowser, revealWindow } from './browser';
import { setNotifyReveal } from './notify';
import { createMenus, refreshMenus, tabContextMenu } from './menu';
import { appsEvents, clearApps, refreshApps } from './apps';
import { clearSsoSession, initSsoSession } from './sso-session';
import { applyAutostart } from './autostart';
import { announceUpdate, checkNow, initUpdater } from './updater';
import { changePortalPassword, onTabLeave, portalUserEvents, registerBridge, showPortal, watchCookies } from './windows';

const SYNC_INTERVAL_MS = 15 * 60_000;
/** Mở lúc Windows khởi động ⇒ chỉ chạy nền, không bật cửa sổ. */
const HIDDEN = process.argv.includes('--hidden');

let syncTimer: ReturnType<typeof setInterval> | null = null;

/** Đăng nhập/đăng xuất, đổi trang chính, đổi ngôn ngữ ⇒ vẽ lại menu và các tab ghim. */
function refreshAll() {
  refreshMenus();
  refreshBrowser();
}

/** Danh mục ứng dụng của đơn vị (quản trị đơn vị khai trên cổng) ⇒ thanh ứng dụng; ứng dụng mặc định nạp sẵn ở nền. */
const refreshCatalog = () => refreshApps().then(() => { refreshAll(); preloadDefaultApp(); });

function startSync() {
  void syncAll().then(refreshAll, refreshAll);
  void refreshPackages();
  void refreshCatalog();
  if (!syncTimer) syncTimer = setInterval(() => { void syncAll(); void refreshCatalog(); void refreshPackages(); void refreshUi(); }, SYNC_INTERVAL_MS);
}

/** Đăng xuất cả ứng dụng (thu hồi token thiết bị) lẫn cổng (xoá phiên cổng — không thì cổng lại tự cấp token mới). */
async function signOut() {
  // Bỏ phiên SSO của đơn vị trong app TRƯỚC khi quên danh mục (host SSO lấy từ danh mục / lần đăng nhập).
  await clearSsoSession();
  await logoutDevice();
  await forgetPortalLogin();
  refreshAll();
}

// Đăng nhập cổng ở tab Báo cáo ⇒ cổng cấp token thiết bị qua cầu nối (account.ts) ⇒ bắt đầu giữ/gửi phiên.
accountEvents.on('login', () => { refreshAll(); startSync(); });
// Đăng xuất ⇒ xoá cả lịch sử trang, hội thoại Trợ lý, danh mục thao tác trên máy (có dữ liệu của các hệ thống nguồn).
accountEvents.on('logout', () => { forgetPackages(); setPortalUser(null); lockCredentials(); clearLocalData(); clearApps(); refreshAll(); });
appsEvents.on('changed', refreshAll);
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
    initSsoSession();
    registerBridge();
    registerAutofill();
    registerSettingsPage({
      signIn: showLogin, signOut, openPortal: showPortal,
      isSettings: (e) => isSettingsContents(e.sender), push: pushSettings,
    });
    registerRecordingPage({ isRecording: (e) => isRecordingContents(e.sender), push: pushRecording, open: openRecordingTab });
    registerChatPage({ isChat: (e) => isChatContents(e.sender), push: pushChat });
    registerLoginPage({ isLogin: (e) => isLoginContents(e.sender), push: pushLogin, win: browserWindow, pageBounds: contentBounds });
    registerSearch();
    watchCookies();
    createMenus({ showMain: showDefaultApp, showDefault, showPortal, signIn: showLogin, openSettings, signOut: () => void signOut(), changePassword: changePortalPassword });
    initBrowser({
      onLeave: onTabLeave, signIn: showLogin, tabMenu: tabContextMenu, portalHasPassword,
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

    void refreshUi();
    // Chưa đăng nhập ⇒ cửa sổ mở màn hình đăng nhập (2 bước, nhiều đơn vị — login-page.ts).
    if (getSettings().deviceToken) startSync();
    if (!HIDDEN) showDefault();
  });

  // Chạy nền ở khay hệ thống: đóng hết cửa sổ không thoát ứng dụng.
  app.on('window-all-closed', () => { /* giữ chạy */ });
}

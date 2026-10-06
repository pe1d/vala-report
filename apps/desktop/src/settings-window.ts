/**
 * Cửa sổ Cài đặt — mở từ menu hồ sơ trên thanh tab: tài khoản đang dùng (đăng nhập qua cổng ở tab Báo cáo, không có form
 * riêng), ngôn ngữ, sáng/tối. Máy chủ Vala Reporting và trang chính do nơi triển khai / quản trị cấu hình, người dùng không
 * sửa; riêng bản dev được tự đặt trang chính để thử.
 * Trang là HTML tĩnh trong gói (resources/settings.html); chữ hiển thị lấy từ đây theo ngôn ngữ đang chọn.
 * IPC chỉ nhận từ chính cửa sổ này.
 */
import { join } from 'node:path';
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { accountEvents } from './account';
import { ICON, IS_DEV } from './channel';
import { messages, normLang } from './i18n';
import { DEFAULT_SERVER, getSettings, normalizeHome, setSettings } from './settings';

const M = messages({
  title: 'Cài đặt Vala Desktop',
  homeTitle: 'Trang chính (chỉ bản dev)',
  homeHint: 'Trang mở ở tab Vala để thử. Bản cho người dùng luôn dùng trang quản trị đặt trên cổng (Quản trị → Cấu hình chung).',
  homeLabel: 'Địa chỉ trang chính', save: 'Lưu', saved: 'Đã lưu trang chính', useServer: 'Dùng trang của máy chủ',
  serverHome: 'Đang dùng trang của máy chủ',
  badHome: 'Địa chỉ không hợp lệ (cần bắt đầu bằng https://, hoặc http://localhost)',
  lightMode: 'Chế độ sáng', darkMode: 'Chế độ tối',
  accountTitle: 'Tài khoản',
  accountHint: 'Vala Desktop dùng tài khoản bạn đăng nhập ở tab Báo cáo để giữ phiên các hệ thống nguồn (eGov, eTask…) và gửi cho Vala lấy dữ liệu thay bạn.',
  notSignedIn: 'Chưa đăng nhập.',
  signIn: 'Đăng nhập',
  signedInAs: 'Đã đăng nhập', serverIs: 'Máy chủ',
  openPortal: 'Mở cổng báo cáo', logout: 'Đăng xuất',
}, {
  title: 'Vala Desktop settings',
  homeTitle: 'Home page (dev build only)',
  homeHint: 'The page opened in the Vala tab, for testing. The user build always uses the page the administrator sets on the portal (Admin → General settings).',
  homeLabel: 'Home page address', save: 'Save', saved: 'Home page saved', useServer: 'Use the server\'s page',
  serverHome: 'Using the server\'s page',
  badHome: 'Invalid address (must start with https://, or http://localhost)',
  lightMode: 'Light mode', darkMode: 'Dark mode',
  accountTitle: 'Account',
  accountHint: 'Vala Desktop uses the account you sign in with on the Reports tab to keep your source-system sessions (eGov, eTask…) and send them to Vala to fetch data for you.',
  notSignedIn: 'Not signed in.',
  signIn: 'Sign in',
  signedInAs: 'Signed in as', serverIs: 'Server',
  openPortal: 'Open reporting portal', logout: 'Sign out',
});

export interface SettingsHooks {
  /** Đưa người dùng sang tab Báo cáo để đăng nhập cổng. */
  signIn: () => void;
  /** Đăng xuất cả ứng dụng lẫn cổng. */
  signOut: () => Promise<void>;
  onLangChanged: () => void;
  /** Bản dev đổi trang chính tự đặt ⇒ nạp lại tab Vala. */
  onHomeChanged: () => void;
  openPortal: () => void;
}

let win: BrowserWindow | null = null;

function state() {
  const s = getSettings();
  const t = M[s.lang];
  return {
    t: { ...t, title: IS_DEV ? `${t.title} (dev)` : t.title }, lang: s.lang, serverUrl: s.serverUrl || DEFAULT_SERVER,
    user: s.deviceToken ? s.user : null,
    dev: IS_DEV, homeUrl: s.homeUrl, devHomeUrl: s.devHomeUrl ?? null,
  };
}

/** Tài khoản đổi (đăng nhập ở tab Báo cáo / đăng xuất) ⇒ cửa sổ đang mở tự vẽ lại. */
const pushState = () => { if (win && !win.isDestroyed()) win.webContents.send('vala:settings-changed'); };
accountEvents.on('login', pushState);
accountEvents.on('logout', pushState);

export function openSettingsWindow(hooks: SettingsHooks): void {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  const w = new BrowserWindow({
    width: 520, height: IS_DEV ? 760 : 560, minWidth: 420, minHeight: 480, autoHideMenuBar: true, show: false,
    icon: ICON,
    webPreferences: { preload: join(__dirname, 'settings-preload.js') },
  });
  win = w;
  w.setMenu(null);   // hộp thoại: không cần thanh menu của ứng dụng
  const own = (e: IpcMainInvokeEvent) => { if (e.sender !== w.webContents) throw new Error('forbidden'); };

  ipcMain.handle('vala:settings-state', (e) => { own(e); return state(); });
  ipcMain.handle('vala:set-lang', (e, l: unknown) => { own(e); setSettings({ lang: normLang(l) }); hooks.onLangChanged(); return state(); });
  ipcMain.handle('vala:save-home', (e, raw: unknown) => {
    own(e);
    if (!IS_DEV) return { ok: false };
    const t = M[getSettings().lang];
    // null ⇒ thôi tự đặt, dùng lại trang của máy chủ.
    const url = raw === null ? null : typeof raw === 'string' ? normalizeHome(raw) : null;
    if (raw !== null && !url) return { ok: false, message: t.badHome };
    setSettings({ devHomeUrl: url });
    hooks.onHomeChanged();
    return { ok: true, message: url ? t.saved : t.serverHome, state: state() };
  });
  ipcMain.handle('vala:sign-in', (e) => { own(e); hooks.signIn(); w.close(); });
  ipcMain.handle('vala:logout', async (e) => { own(e); await hooks.signOut(); return state(); });
  ipcMain.handle('vala:open-portal', (e) => { own(e); hooks.openPortal(); });

  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    for (const ch of ['vala:settings-state', 'vala:set-lang', 'vala:save-home', 'vala:sign-in', 'vala:logout', 'vala:open-portal']) ipcMain.removeHandler(ch);
    if (win === w) win = null;
  });
  void w.loadFile(join(__dirname, '../resources/settings.html'));
}

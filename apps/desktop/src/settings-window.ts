/**
 * Cửa sổ Cài đặt: đăng nhập thiết bị vào Vala Reporting, ngôn ngữ. Trang chính do quản trị đặt trên cổng (homepage.ts),
 * người dùng không sửa ở đây.
 * Trang là HTML tĩnh trong gói (resources/settings.html); chữ hiển thị lấy từ đây theo ngôn ngữ đang chọn.
 * IPC chỉ nhận từ chính cửa sổ này.
 */
import { join } from 'node:path';
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { loginDevice, logoutDevice } from './account';
import { ICON, IS_DEV } from './channel';
import { ApiError } from './api';
import { messages, normLang } from './i18n';
import { DEFAULT_SERVER, getSettings, normalizeHome, normalizeServer, setSettings } from './settings';

const M = messages({
  title: 'Cài đặt Vala Desktop',
  homeTitle: 'Trang chính (chỉ bản dev)',
  homeHint: 'Trang mở ở tab Vala để thử. Bản cho người dùng luôn dùng trang quản trị đặt trên cổng (Quản trị → Cấu hình chung).',
  homeLabel: 'Địa chỉ trang chính', save: 'Lưu', saved: 'Đã lưu trang chính', useServer: 'Dùng trang của máy chủ',
  serverHome: 'Đang dùng trang của máy chủ',
  badHome: 'Địa chỉ không hợp lệ (cần bắt đầu bằng https://, hoặc http://localhost)',
  lightMode: 'Chế độ sáng', darkMode: 'Chế độ tối',
  accountTitle: 'Tài khoản Vala Reporting',
  accountHint: 'Đăng nhập để Vala Desktop giữ phiên các hệ thống nguồn (eGov, eTask…) và gửi cho Vala lấy dữ liệu thay bạn.',
  serverLabel: 'Máy chủ Vala Reporting', usernameLabel: 'Tài khoản', passwordLabel: 'Mật khẩu',
  login: 'Đăng nhập', loggingIn: 'Đang đăng nhập…',
  badServer: 'Địa chỉ máy chủ không hợp lệ (cần bắt đầu bằng https://)',
  missing: 'Nhập tài khoản và mật khẩu',
  signedInAs: 'Đã đăng nhập', serverIs: 'Máy chủ',
  openPortal: 'Mở cổng báo cáo', logout: 'Đăng xuất',
  unknownError: 'Lỗi không xác định',
}, {
  title: 'Vala Desktop settings',
  homeTitle: 'Home page (dev build only)',
  homeHint: 'The page opened in the Vala tab, for testing. The user build always uses the page the administrator sets on the portal (Admin → General settings).',
  homeLabel: 'Home page address', save: 'Save', saved: 'Home page saved', useServer: 'Use the server\'s page',
  serverHome: 'Using the server\'s page',
  badHome: 'Invalid address (must start with https://, or http://localhost)',
  lightMode: 'Light mode', darkMode: 'Dark mode',
  accountTitle: 'Vala Reporting account',
  accountHint: 'Sign in so Vala Desktop keeps your source-system sessions (eGov, eTask…) and sends them to Vala to fetch data for you.',
  serverLabel: 'Vala Reporting server', usernameLabel: 'Username', passwordLabel: 'Password',
  login: 'Sign in', loggingIn: 'Signing in…',
  badServer: 'Invalid server address (must start with https://)',
  missing: 'Enter your username and password',
  signedInAs: 'Signed in as', serverIs: 'Server',
  openPortal: 'Open reporting portal', logout: 'Sign out',
  unknownError: 'Unknown error',
});

export interface SettingsHooks {
  onLogin: () => void;
  onLogout: () => void;
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

const errText = (e: unknown) => {
  if (e instanceof ApiError) return e.detail ? `${e.message}: ${e.detail}` : e.message;
  return M[getSettings().lang].unknownError;
};

export function openSettingsWindow(hooks: SettingsHooks): void {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  const w = new BrowserWindow({
    width: 520, height: 800, minWidth: 420, minHeight: 600, autoHideMenuBar: true, show: false,
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
  ipcMain.handle('vala:login', async (e, a: { server?: unknown; username?: unknown; password?: unknown }) => {
    own(e);
    const t = M[getSettings().lang];
    const server = typeof a?.server === 'string' ? normalizeServer(a.server) : null;
    if (!server) return { ok: false, message: t.badServer };
    if (typeof a.username !== 'string' || !a.username.trim() || typeof a.password !== 'string' || !a.password) return { ok: false, message: t.missing };
    try {
      await loginDevice(server, a.username.trim(), a.password);
    } catch (err) {
      return { ok: false, message: errText(err) };
    }
    hooks.onLogin();
    return { ok: true, state: state() };
  });
  ipcMain.handle('vala:logout', async (e) => { own(e); await logoutDevice(); hooks.onLogout(); return state(); });
  ipcMain.handle('vala:open-portal', (e) => { own(e); hooks.openPortal(); });

  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    for (const ch of ['vala:settings-state', 'vala:set-lang', 'vala:save-home', 'vala:login', 'vala:logout', 'vala:open-portal']) ipcMain.removeHandler(ch);
    if (win === w) win = null;
  });
  void w.loadFile(join(__dirname, '../resources/settings.html'));
}

export function closeSettingsWindow(): void {
  if (win && !win.isDestroyed()) win.close();
}

/**
 * Cửa sổ Cài đặt: đăng nhập thiết bị vào Vala Reporting, trang chính của đơn vị, ngôn ngữ.
 * Trang là HTML tĩnh trong gói (resources/settings.html); chữ hiển thị lấy từ đây theo ngôn ngữ đang chọn.
 * IPC chỉ nhận từ chính cửa sổ này.
 */
import { join } from 'node:path';
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { loginDevice, logoutDevice } from './account';
import { ApiError } from './api';
import { messages, normLang } from './i18n';
import { DEFAULT_SERVER, getSettings, normalizeHome, normalizeServer, setSettings } from './settings';

const M = messages({
  title: 'Cài đặt Vala Desktop',
  lightMode: 'Chế độ sáng', darkMode: 'Chế độ tối',
  homeTitle: 'Trang chính',
  homeHint: 'Trang mở trong cửa sổ chính của Vala Desktop. Mỗi đơn vị dùng trang riêng của mình.',
  homeLabel: 'Địa chỉ trang chính',
  save: 'Lưu', saved: 'Đã lưu trang chính',
  badHome: 'Địa chỉ trang chính không hợp lệ (cần bắt đầu bằng https://)',
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
  lightMode: 'Light mode', darkMode: 'Dark mode',
  homeTitle: 'Home page',
  homeHint: 'The page opened in the Vala Desktop main window. Each organization uses its own page.',
  homeLabel: 'Home page address',
  save: 'Save', saved: 'Home page saved',
  badHome: 'Invalid home page address (must start with https://)',
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
  onHomeChanged: () => void;
  onLangChanged: () => void;
  openPortal: () => void;
}

let win: BrowserWindow | null = null;

function state() {
  const s = getSettings();
  return { t: M[s.lang], lang: s.lang, homeUrl: s.homeUrl, serverUrl: s.serverUrl || DEFAULT_SERVER, user: s.deviceToken ? s.user : null };
}

const errText = (e: unknown) => {
  if (e instanceof ApiError) return e.detail ? `${e.message}: ${e.detail}` : e.message;
  return M[getSettings().lang].unknownError;
};

export function openSettingsWindow(hooks: SettingsHooks): void {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  const w = new BrowserWindow({
    width: 520, height: 800, minWidth: 420, minHeight: 600, autoHideMenuBar: true, show: false,
    icon: join(__dirname, '../resources/icon.png'),
    webPreferences: { preload: join(__dirname, 'settings-preload.js') },
  });
  win = w;
  w.setMenu(null);   // hộp thoại: không cần thanh menu của ứng dụng
  const own = (e: IpcMainInvokeEvent) => { if (e.sender !== w.webContents) throw new Error('forbidden'); };

  ipcMain.handle('vala:settings-state', (e) => { own(e); return state(); });
  ipcMain.handle('vala:set-lang', (e, l: unknown) => { own(e); setSettings({ lang: normLang(l) }); hooks.onLangChanged(); return state(); });
  ipcMain.handle('vala:save-home', (e, raw: unknown) => {
    own(e);
    const url = typeof raw === 'string' ? normalizeHome(raw) : null;
    if (!url) return { ok: false, message: M[getSettings().lang].badHome };
    setSettings({ homeUrl: url });
    hooks.onHomeChanged();
    return { ok: true, message: M[getSettings().lang].saved, state: state() };
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

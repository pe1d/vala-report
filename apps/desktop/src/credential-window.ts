/**
 * Hộp nhập tài khoản / mật khẩu một hệ thống nguồn — mở từ menu ⋯ (Hệ thống nguồn → <hệ thống> → Lưu / Đổi mật khẩu…),
 * chuột phải lên tab của hệ thống đó, hoặc Cài đặt → Mật khẩu. Mỗi lúc một hộp; IPC chỉ nhận từ chính cửa sổ này.
 */
import { join } from 'node:path';
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { onCredentialSaved } from './autofill';
import { ICON } from './channel';
import { saveCredential, savedCredential, secureStorageAvailable } from './credentials';
import { messages } from './i18n';
import { getSettings } from './settings';
import type { SourceFull } from './sync';

const M = messages({
  title: (ten: string) => `Mật khẩu ${ten}`,
  hint: 'Lưu trong kho mật khẩu của hệ điều hành trên máy này, chỉ dùng để Vala Desktop tự đăng nhập lại hệ thống này. Không gửi lên máy chủ Vala.',
  user: 'Tên đăng nhập', pass: 'Mật khẩu', cancel: 'Huỷ', save: 'Lưu',
  bad: 'Nhập đủ tên đăng nhập và mật khẩu',
  unavailable: 'Máy này chưa có kho mật khẩu của hệ điều hành — không lưu được.',
}, {
  title: (ten: string) => `${ten} password`,
  hint: 'Stored in your operating system’s password store on this computer, used only so Vala Desktop can sign in to this system again. Never sent to the Vala server.',
  user: 'Username', pass: 'Password', cancel: 'Cancel', save: 'Save',
  bad: 'Enter both the username and the password',
  unavailable: 'This computer has no operating-system password store — cannot save.',
});

let win: BrowserWindow | null = null;
const CHANNELS = ['vala:cred-dialog-state', 'vala:cred-dialog-save', 'vala:cred-dialog-cancel'];

export function openCredentialDialog(src: Pick<SourceFull, 'code' | 'ten'>, onSaved: () => void): void {
  if (win && !win.isDestroyed()) win.close();
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((w) => w.isVisible()) ?? undefined;
  const w = new BrowserWindow({
    width: 400, height: 360, useContentSize: true, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true, show: false,
    parent, modal: !!parent, icon: ICON,
    webPreferences: { preload: join(__dirname, 'credential-preload.js') },
  });
  win = w;
  w.setMenu(null);
  const own = (e: IpcMainInvokeEvent) => { if (e.sender !== w.webContents) throw new Error('forbidden'); };
  for (const ch of CHANNELS) ipcMain.removeHandler(ch);
  ipcMain.handle('vala:cred-dialog-state', (e) => {
    own(e);
    const lang = getSettings().lang;
    const { title, ...t } = M[lang];
    return { lang, t: { ...t, title: title(src.ten) }, username: savedCredential(src.code)?.username ?? '' };
  });
  ipcMain.handle('vala:cred-dialog-save', (e, a: { username?: unknown; password?: unknown }) => {
    own(e);
    const t = M[getSettings().lang];
    const user = typeof a?.username === 'string' ? a.username.trim().slice(0, 200) : '';
    const pass = typeof a?.password === 'string' ? a.password.slice(0, 500) : '';
    if (!user || !pass) return { ok: false, message: t.bad };
    if (!secureStorageAvailable() || !saveCredential(src.code, user, pass)) return { ok: false, message: t.unavailable };
    onCredentialSaved(src.code);
    onSaved();
    w.close();
    return { ok: true };
  });
  ipcMain.handle('vala:cred-dialog-cancel', (e) => { own(e); w.close(); });
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    if (win === w) { for (const ch of CHANNELS) ipcMain.removeHandler(ch); win = null; }
  });
  void w.loadFile(join(__dirname, '../resources/credential.html'));
}

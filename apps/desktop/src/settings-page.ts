/**
 * Tab Cài đặt (như chrome://settings) — menu trái: Tài khoản · Mật khẩu (hướng dẫn) · Giao diện · Khởi động · Giới thiệu
 * (· Trang chính ở bản dev). Trang là HTML tĩnh trong gói (resources/settings.html + renderer/settings.ts); chữ hiển thị lấy
 * từ settings-strings.ts theo ngôn ngữ. IPC chỉ nhận từ đúng tab Cài đặt.
 */
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { accountEvents } from './account';
import { autostartEnabled, autostartSupported, setAutostart } from './autostart';
import { IS_DEV } from './channel';
import { messages, normLang } from './i18n';
import { prefsEvents, setPrefs } from './prefs';
import { DEFAULT_SERVER, getSettings, normalizeHome, setSettings } from './settings';
import { strings } from './settings-strings';
import { canUpdate, checkNow, installNow, pendingUpdate } from './updater';

export interface SettingsHooks {
  signIn: () => void;
  signOut: () => Promise<void>;
  onHomeChanged: () => void;
  openPortal: () => void;
  /** Lời gọi IPC có đến từ tab Cài đặt không. */
  isSettings: (e: IpcMainInvokeEvent) => boolean;
  /** Báo tab Cài đặt (nếu đang mở) vẽ lại. */
  push: () => void;
}

const M = messages(strings.vi, strings.en);

function state() {
  const s = getSettings();
  const t = M[s.lang];
  return {
    t: { ...t, title: IS_DEV ? `${t.title} (dev)` : t.title },
    lang: s.lang, theme: s.theme, dev: IS_DEV, version: app.getVersion(),
    serverUrl: s.serverUrl || DEFAULT_SERVER, user: s.deviceToken ? s.user : null,
    homeUrl: s.homeUrl, devHomeUrl: s.devHomeUrl ?? null,
    autostart: { enabled: autostartEnabled(), supported: autostartSupported() },
    update: { pending: pendingUpdate()?.version ?? null, canUpdate: canUpdate() },
  };
}

export function registerSettingsPage(hooks: SettingsHooks): void {
  const own = (e: IpcMainInvokeEvent) => { if (!hooks.isSettings(e)) throw new Error('forbidden'); };
  for (const ev of ['login', 'logout'] as const) accountEvents.on(ev, hooks.push);
  prefsEvents.on('changed', hooks.push);

  ipcMain.handle('vala:settings-state', (e) => { own(e); return state(); });
  ipcMain.handle('vala:set-lang', (e, l: unknown) => { own(e); setPrefs({ lang: normLang(l) }); return state(); });
  ipcMain.handle('vala:set-theme', (e, v: unknown) => { own(e); setPrefs({ theme: v }); return state(); });
  ipcMain.handle('vala:set-autostart', (e, on: unknown) => { own(e); setAutostart(on === true); return state(); });
  ipcMain.handle('vala:sign-in', (e) => { own(e); hooks.signIn(); });
  ipcMain.handle('vala:logout', async (e) => { own(e); await hooks.signOut(); return state(); });
  ipcMain.handle('vala:open-portal', (e) => { own(e); hooks.openPortal(); });
  ipcMain.handle('vala:check-update', (e) => { own(e); checkNow(); });
  ipcMain.handle('vala:install-update', (e) => { own(e); installNow(); });
  ipcMain.handle('vala:save-home', (e, raw: unknown) => {
    own(e);
    if (!IS_DEV) return { ok: false };
    const t = M[getSettings().lang];
    const url = raw === null ? null : typeof raw === 'string' ? normalizeHome(raw) : null;
    if (raw !== null && !url) return { ok: false, message: t.badHome };
    setSettings({ devHomeUrl: url });
    hooks.onHomeChanged();
    return { ok: true, message: url ? t.homeSaved : t.homeServer, state: state() };
  });
}

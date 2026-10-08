/**
 * Tab Cài đặt (như chrome://settings) — menu trái: Tài khoản · Mật khẩu · Giao diện · Khởi động · Giới thiệu
 * (· Trang chính ở bản dev). Trang là HTML tĩnh trong gói (resources/settings.html + renderer/settings.ts); chữ hiển thị lấy
 * từ settings-strings.ts theo ngôn ngữ. IPC chỉ nhận từ đúng tab Cài đặt.
 */
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { accountEvents } from './account';
import { autostartEnabled, autostartSupported, setAutostart } from './autostart';
import { IS_DEV } from './channel';
import { openCredentialDialog } from './credential-window';
import {
  credentialEvents, deleteCredential, listCredentials, listNeverSave, secureStorageAvailable, setAutoLogin, setNeverSave,
} from './credentials';
import { messages, normLang } from './i18n';
import { prefsEvents, setPrefs } from './prefs';
import { DEFAULT_SERVER, getSettings, setSettings } from './settings';
import { strings } from './settings-strings';
import { SSO_KEY } from './autofill';
import { ssoHosts } from './sso-session';
import { cachedSources, events as syncEvents } from './sync';
import { setErrorReport } from './error-report';
import { autoUpdateEnabled, canUpdate, checkNow, currentNotes, installNow, pendingUpdate, setAutoUpdate } from './updater';

export interface SettingsHooks {
  signIn: () => void;
  signOut: () => Promise<void>;
  openPortal: () => void;
  /** Lời gọi IPC có đến từ tab Cài đặt không. */
  isSettings: (e: IpcMainInvokeEvent) => boolean;
  /** Báo tab Cài đặt (nếu đang mở) vẽ lại. */
  push: () => void;
}

const M = messages(strings.vi, strings.en);

/**
 * Mật khẩu đã lưu trong máy (credentials.ts), như chrome://settings/passwords: hệ thống nguồn khai trên cổng (kể cả chưa
 * lưu, để lưu ngay tại đây) + trang khác (site:<host>) + danh sách "không bao giờ lưu". Không bao giờ gửi mật khẩu ra trang.
 */
function passwords() {
  const saved = listCredentials();
  const srcs = getSettings().deviceToken ? cachedSources() : [];
  const nameOf = (code: string) => (code === SSO_KEY ? `${M[getSettings().lang].ssoPassword}${ssoHosts()[0] ? ` (${ssoHosts()[0]})` : ''}`
    : code.startsWith('site:') ? code.slice(5) : srcs.find((x) => x.code === code)?.ten ?? code);
  const row = (code: string) => {
    const c = saved[code];
    return { code, ten: nameOf(code), username: c?.username ?? null, auto: c?.auto ?? false, savedAt: c?.savedAt ?? null };
  };
  const codes = Object.keys(saved);
  return {
    available: secureStorageAvailable(),
    // Nguồn trên cổng trước (đúng thứ tự cổng), rồi mật khẩu của nguồn không còn trên cổng / chưa đăng nhập.
    sources: [...srcs.map((x) => x.code), ...codes.filter((k) => !k.startsWith('site:') && !srcs.some((x) => x.code === k)).sort()].map(row),
    sites: codes.filter((k) => k.startsWith('site:')).sort().map(row),
    never: listNeverSave().map((code) => ({ code, ten: nameOf(code) })),
  };
}

function state() {
  const s = getSettings();
  const t = M[s.lang];
  return {
    t: { ...t, title: IS_DEV ? `${t.title} (dev)` : t.title },
    lang: s.lang, theme: s.theme, dev: IS_DEV, version: app.getVersion(),
    serverUrl: s.serverUrl || DEFAULT_SERVER, user: s.deviceToken ? s.user : null,
    autostart: { enabled: autostartEnabled(), supported: autostartSupported() },
    options: { autoUpdate: autoUpdateEnabled(), errorReport: getSettings().errorReport !== false },
    update: { pending: pendingUpdate()?.version ?? null, canUpdate: canUpdate() },
    // Điểm mới của bản đang chạy và của bản đã tải chờ cài (null ⇒ không có ghi chú).
    whatsNew: { current: currentNotes()?.[s.lang] ?? null, pending: pendingUpdate()?.notes?.[s.lang] ?? null },
    passwords: passwords(),
  };
}

export function registerSettingsPage(hooks: SettingsHooks): void {
  const own = (e: IpcMainInvokeEvent) => { if (!hooks.isSettings(e)) throw new Error('forbidden'); };
  for (const ev of ['login', 'logout'] as const) accountEvents.on(ev, hooks.push);
  prefsEvents.on('changed', hooks.push);
  credentialEvents.on('changed', hooks.push);
  syncEvents.on('status', hooks.push);

  ipcMain.handle('vala:settings-state', (e) => { own(e); return state(); });
  ipcMain.handle('vala:set-lang', (e, l: unknown) => { own(e); setPrefs({ lang: normLang(l) }); return state(); });
  ipcMain.handle('vala:set-theme', (e, v: unknown) => { own(e); setPrefs({ theme: v }); return state(); });
  ipcMain.handle('vala:set-autostart', (e, on: unknown) => { own(e); setAutostart(on === true); return state(); });
  ipcMain.handle('vala:set-option', (e, a: { key?: unknown; on?: unknown }) => {
    own(e);
    if (a?.key === 'autoUpdate') setAutoUpdate(a.on === true);
    else if (a?.key === 'errorReport') setErrorReport(a.on === true);
    return state();
  });
  ipcMain.handle('vala:sign-in', (e) => { own(e); hooks.signIn(); });
  ipcMain.handle('vala:logout', async (e) => { own(e); await hooks.signOut(); return state(); });
  ipcMain.handle('vala:open-portal', (e) => { own(e); hooks.openPortal(); });
  ipcMain.handle('vala:check-update', (e) => { own(e); checkNow(); });
  ipcMain.handle('vala:install-update', (e) => { own(e); installNow(); });

  // Mật khẩu: chỉ nhận mã đang có trong danh sách (nguồn trên cổng / đã lưu / không bao giờ lưu).
  const target = (raw: unknown) => {
    const p = passwords();
    return [...p.sources, ...p.sites, ...p.never].find((x) => x.code === raw) ?? null;
  };
  ipcMain.handle('vala:pw-auto', (e, code: unknown, on: unknown) => { own(e); if (target(code)) setAutoLogin(code as string, on === true); return state(); });
  ipcMain.handle('vala:pw-delete', (e, code: unknown) => { own(e); if (target(code)) deleteCredential(code as string); return state(); });
  ipcMain.handle('vala:pw-allow', (e, code: unknown) => { own(e); if (target(code)) setNeverSave(code as string, false); return state(); });
  ipcMain.handle('vala:pw-edit', (e, code: unknown) => {
    own(e);
    const tg = target(code);
    if (tg) openCredentialDialog(tg, hooks.push);
  });
}

/**
 * Luồng "kết nối một hệ thống nguồn" và các tab của Vala Desktop (xem browser.ts):
 *   - tab Vala: trang chính của đơn vị (settings.homeUrl, vd https://vala.bkav.com/);
 *   - tab Báo cáo: cổng Vala Reporting (settings.serverUrl);
 *   - tab từng hệ thống nguồn (eGov, eTask…): người dùng đăng nhập/làm việc ngay trong ứng dụng, cookie đổi ⇒ gửi phiên.
 *
 * Cầu nối với cổng báo cáo: cổng nói chuyện với tiện ích qua window.postMessage (apps/web/src/extension.ts);
 * portal-preload.ts giả lập đúng giao thức đó nên nút "Đăng nhập qua tiện ích" chạy được trong desktop mà không sửa cổng.
 * Mọi lời gọi IPC từ trang chỉ được nhận khi khung gọi thuộc đúng origin máy chủ Vala đã cấu hình.
 */
import { join } from 'node:path';
import { app, ipcMain, Notification, session, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { api } from './api';
import { showTab, showWebContents, sourceTabKey } from './browser';
import { matchesSessionDomain, sessionDomain } from './cookies';
import { messages } from './i18n';
import { getSettings } from './settings';
import { cachedSources, events, refreshSources, statusOf, syncSource, type SourceFull } from './sync';

const M = messages({
  unknownSource: 'Vala Desktop chưa đăng nhập hoặc không có hệ thống này',
  loginOpened: (ten: string) => `Đăng nhập ${ten} trong tab vừa mở — xong Vala Desktop tự đưa bạn quay lại`,
  connectFailed: 'Kết nối không thành công',
  connected: (ten: string) => `Đã kết nối ${ten}`,
  reconnected: (ten: string) => `Đã kết nối lại ${ten}`,
  connectedBody: 'Vala đã nhận phiên đăng nhập, dữ liệu sẽ được lấy tiếp theo lịch.',
  notConnected: (ten: string) => `Chưa kết nối được ${ten}`,
  expiredTitle: (ten: string) => `Phiên ${ten} đã hết hạn`,
  expiredBody: 'Vala không lấy được dữ liệu mới. Bấm vào đây để đăng nhập lại.',
}, {
  unknownSource: 'Vala Desktop is not signed in or does not have this system',
  loginOpened: (ten: string) => `Sign in to ${ten} in the tab that just opened — Vala Desktop will bring you back when done`,
  connectFailed: 'Connection failed',
  connected: (ten: string) => `Connected to ${ten}`,
  reconnected: (ten: string) => `Reconnected to ${ten}`,
  connectedBody: 'Vala has received your sign-in session; data will keep being fetched on schedule.',
  notConnected: (ten: string) => `Could not connect to ${ten}`,
  expiredTitle: (ten: string) => `${ten} session expired`,
  expiredBody: 'Vala cannot fetch new data. Click here to sign in again.',
});
const T = () => M[getSettings().lang];

const ICON = join(__dirname, '../resources/icon.png');

/** Tab Vala: trang chính của đơn vị. */
export const showMain = (): void => { showTab('home'); };

/** Tab Báo cáo: cổng Vala Reporting (chỉ có khi đã đăng nhập thiết bị). */
export const showPortal = (): void => { showTab('portal'); };

/** Tab của một hệ thống nguồn; `relogin` ⇒ đưa về trang đăng nhập (luồng kết nối). */
export const openSourceTab = (src: SourceFull, relogin = false): void => {
  showTab(sourceTabKey(src.code), relogin ? { reloadTo: src.login_url } : {});
};

/** Trang trong khung gọi IPC có thuộc đúng origin máy chủ Vala Reporting không. */
function fromPortal(e: IpcMainInvokeEvent): boolean {
  const s = getSettings();
  try {
    return !!s.serverUrl && !!e.senderFrame && new URL(e.senderFrame.url).origin === new URL(s.serverUrl).origin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Vừa làm việc trên tab hệ thống nguồn rồi rời tab ⇒ báo Vala lấy lại dữ liệu ngay (máy chủ tự giới hạn).
// ---------------------------------------------------------------------------------------------
const MIN_STAY_MS = 15_000;
const NUDGE_GAP_MS = 2 * 60_000;
const nudged = new Map<string, number>();

export function onTabLeave(key: string, ms: number): void {
  if (!key.startsWith('src:') || ms < MIN_STAY_MS) return;
  const src = cachedSources().find((s) => sourceTabKey(s.code) === key);
  if (!src || Date.now() - (nudged.get(src.code) ?? 0) < NUDGE_GAP_MS) return;
  nudged.set(src.code, Date.now());
  void (async () => {
    try {
      await syncSource(src);
      await api('POST', `/ext/sources/${src.code}/refresh`);
    } catch { /* lần sau */ }
  })();
}

// ---------------------------------------------------------------------------------------------
// Luồng kết nối (bấm từ cổng, menu hoặc thông báo hết phiên)
// ---------------------------------------------------------------------------------------------
type ConnectEvent =
  | { type: 'connected'; code: string; ten: string }
  | { type: 'connect-failed'; code: string; ten: string; message: string };

interface Pending { portal?: WebContents; at: number }
const PENDING_TTL_MS = 15 * 60_000;
const pending = new Map<string, Pending>();

export async function startConnect(code: string, portal?: WebContents): Promise<{ status: string; message?: string }> {
  try { await refreshSources(); } catch { /* dùng danh sách đã có */ }
  const src = cachedSources().find((s) => s.code === code);
  if (!src) return { status: 'unknown_source', message: T().unknownSource };
  pending.set(code, { portal, at: Date.now() });
  const r = await syncSource(src, true);
  if (r === 'sent' || r === 'unchanged') return { status: 'connected' };      // finishPending chạy qua sự kiện 'status'
  if (r === 'managed' || r === 'need_consent') {
    pending.delete(code);
    return { status: r === 'managed' ? 'managed' : 'error', message: statusOf(code)?.message };
  }
  // Chưa đăng nhập / phiên hỏng ⇒ mở tab nguồn ở trang đăng nhập; cookie đổi sẽ kích hoạt gửi (watchCookies).
  openSourceTab(src, true);
  return { status: 'login_opened', message: T().loginOpened(src.ten) };
}

/** Kết thúc lượt kết nối đang chờ: báo cổng, đưa người dùng về tab cổng (tab nguồn vẫn giữ để làm việc tiếp). */
function finishPending(src: SourceFull, ok: boolean, message?: string) {
  const p = pending.get(src.code);
  if (!p) return;
  pending.delete(src.code);
  if (Date.now() - p.at > PENDING_TTL_MS) return;
  const ev: ConnectEvent = ok ? { type: 'connected', code: src.code, ten: src.ten }
    : { type: 'connect-failed', code: src.code, ten: src.ten, message: message ?? T().connectFailed };
  if (!ok) notify(T().notConnected(src.ten), ev.type === 'connect-failed' ? ev.message : '');
  if (p.portal && !p.portal.isDestroyed()) {
    p.portal.send('vala:event', ev);
    showWebContents(p.portal);
  }
}

events.on('status', (code?: string) => {
  if (!code) return;
  const src = cachedSources().find((s) => s.code === code);
  const st = statusOf(code);
  if (!src || !st) return;
  if (st.result === 'sent' || st.result === 'unchanged') finishPending(src, true);
  else if (st.result === 'rejected') finishPending(src, false, st.message);
  checkExpiry(src);
});

events.on('connected', (src: SourceFull, again: boolean) => {
  if (!pending.has(src.code)) notify(again ? T().reconnected(src.ten) : T().connected(src.ten), T().connectedBody);
});

// ---------------------------------------------------------------------------------------------
// Thông báo hết phiên: nguồn kết nối bằng desktop/tiện ích mà phiên chết và ứng dụng không có phiên mới ⇒ một thông báo
// (bấm để đăng nhập lại). Mỗi đợt báo một lần, nhắc lại sau 24 giờ.
// ---------------------------------------------------------------------------------------------
const EXPIRY_REMIND_MS = 24 * 3600_000;
const expiryNoticeAt = new Map<string, number>();

function checkExpiry(src: SourceFull) {
  const r = statusOf(src.code)?.result;
  if (r === 'sent' || r === 'unchanged' || r === 'managed') { expiryNoticeAt.delete(src.code); return; }
  if (src.auth_method !== 'extension' || pending.has(src.code)) return;
  const dead = src.state === 'expired' || src.state === 'failed' || r === 'rejected';
  if (!dead) return;
  const last = expiryNoticeAt.get(src.code);
  if (last && Date.now() - last < EXPIRY_REMIND_MS) return;
  expiryNoticeAt.set(src.code, Date.now());
  notify(T().expiredTitle(src.ten), T().expiredBody, () => { void startConnect(src.code); });
}

function notify(title: string, body: string, onClick?: () => void) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  if (onClick) n.on('click', onClick);
  n.show();
}

// ---------------------------------------------------------------------------------------------
/** Cookie phiên của một nguồn đổi (vừa đăng nhập, phiên được gia hạn) ⇒ gửi lại, gộp các thay đổi liền nhau. */
const DEBOUNCE_MS = 3000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function watchCookies(): void {
  session.defaultSession.cookies.on('changed', (_e, cookie, _cause, removed) => {
    if (removed) return;
    for (const src of cachedSources()) {
      if (!src.cookie_names.includes(cookie.name) || !matchesSessionDomain(sessionDomain(src), cookie.domain ?? '')) continue;
      clearTimeout(timers.get(src.code));
      timers.set(src.code, setTimeout(() => { timers.delete(src.code); void syncSource(src); }, DEBOUNCE_MS));
    }
  });
}

/** Cầu nối IPC cho portal-preload.ts. */
export function registerBridge(): void {
  ipcMain.handle('vala:bridge-hello', (e) => {
    if (!fromPortal(e)) return null;
    const s = getSettings();
    return { installed: true, version: app.getVersion(), logged_in: !!s.deviceToken, email: s.user?.email ?? null };
  });
  ipcMain.handle('vala:connect', (e, code: unknown) => {
    if (!fromPortal(e) || typeof code !== 'string' || !/^[a-z0-9_]{1,40}$/.test(code)) return { status: 'error' };
    return startConnect(code, e.sender);
  });
}

/**
 * Mặc định cho mọi trang (popup thật mở từ tab, cửa sổ Cài đặt): web http(s) mở cửa sổ trong ứng dụng, giao thức khác giao cho
 * hệ điều hành. Tab đặt handler riêng ngay sau khi tạo (browser.ts) — mở link thành tab.
 */
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { icon: ICON, autoHideMenuBar: true } };
    if (/^(mailto|tel):/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
});

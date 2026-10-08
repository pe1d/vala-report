/**
 * Tài khoản của Vala Desktop: đăng nhập ở MÀN HÌNH ĐĂNG NHẬP của ứng dụng (2 bước, nhiều đơn vị — login-page.ts) ⇒ token
 * thiết bị (vxt_…, POST /me/extension-devices). Bản cũ: cổng cấp token qua cầu nối khi người dùng đăng nhập ở tab Báo
 * cáo (windows.ts) — vẫn nhận. Token hiện trên cổng ở mục thiết bị đã kết nối, thu hồi được ở đó.
 * Tab Báo cáo lấy phiên cổng từ ứng dụng qua cầu nối (portalToken) — không phải đăng nhập lần nữa.
 */
import { EventEmitter } from 'node:events';
import { session } from 'electron';
import { clearApps } from './apps';
import { deleteAllCredentials } from './credentials';
import { clearLocalData } from './local-data';
import { api } from './api';
import { messages } from './i18n';
import { getSettings, setSettings } from './settings';
import { resetSync } from './sync';

const M = messages({
  device: (os: string) => `Vala Desktop trên ${os}`,
  computer: 'máy tính',
}, {
  device: (os: string) => `Vala Desktop on ${os}`,
  computer: 'computer',
});

/** 'login' — vừa nhận token thiết bị; 'logout' — vừa đăng xuất. */
export const accountEvents = new EventEmitter();

export function deviceName(): string {
  const t = M[getSettings().lang];
  const os = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : t.computer;
  return t.device(os);
}

/** `vxt_<ngẫu nhiên>` (Bkav, dạng cũ) hoặc `vxt_<mã đơn vị>.<ngẫu nhiên>` (nhiều đơn vị). */
export const DEVICE_TOKEN = /^vxt_(?:[a-z][a-z0-9]{1,19}\.)?[\w-]{20,100}$/;

/** Phiên cổng (JWT) cho tab Báo cáo — có từ lúc đăng nhập, hết hạn thì xin lại bằng token thiết bị. */
let portal: { token: string; exp: number } | null = null;
const expOf = (jwt: string): number => {
  try { return Number(JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')).exp) * 1000 || 0; } catch { return 0; }
};

export function rememberPortalToken(jwt: string): void {
  portal = { token: jwt, exp: expOf(jwt) };
}

/** Phiên cổng còn dùng được ≥ 10 phút; không có ⇒ xin máy chủ (POST /ext/portal-token, chỉ token Desktop). Lỗi ⇒ null. */
export async function portalToken(): Promise<string | null> {
  if (!getSettings().deviceToken) return null;
  if (portal && portal.exp - Date.now() > 10 * 60_000) return portal.token;
  try {
    const r = await api<{ access_token: string }>('POST', '/ext/portal-token');
    rememberPortalToken(r.access_token);
    return r.access_token;
  } catch { return null; }
}

/**
 * Xoá toàn bộ dữ liệu web trong ứng dụng: cookie (phiên Vala, eGov, eTask, SSO…), localStorage, IndexedDB, cache. Đăng
 * xuất / đổi người ⇒ người sau không vào nhầm các ứng dụng bằng phiên của người trước.
 */
export async function clearWebSession(): Promise<void> {
  const ses = session.defaultSession;
  await ses.clearStorageData().catch(() => {});
  await ses.clearCache().catch(() => {});
  await ses.clearAuthCache().catch(() => {});
  await ses.cookies.flushStore().catch(() => {});
}

/** `<mã đơn vị>:<email>` của token thiết bị (`vxt_<mã>.…`; dạng cũ ⇒ bkav). */
const accountOf = (token: string, email: string) => `${/^vxt_([a-z][a-z0-9]{1,19})\./.exec(token)?.[1] ?? 'bkav'}:${email.trim().toLowerCase()}`;

/**
 * Nhận token thiết bị (màn hình đăng nhập / cổng cấp). Đang đăng nhập người khác ⇒ thu hồi token cũ trước. Người đăng nhập
 * KHÁC người dùng máy này lần trước ⇒ xoá sạch dữ liệu của người trước: phiên web, mật khẩu đã lưu, lịch sử, hội thoại,
 * danh mục ứng dụng.
 */
export async function adoptDeviceToken(token: string, user: { ho_ten: string; email: string }): Promise<void> {
  const s = getSettings();
  if (s.deviceToken === token) return;
  const account = accountOf(token, user.email);
  if (s.lastAccount && s.lastAccount !== account) {
    await clearWebSession();
    deleteAllCredentials();
    clearLocalData();
    clearApps();
  }
  setSettings({ lastAccount: account });
  if (s.deviceToken) {
    try { await api('POST', '/ext/logout'); } catch { /* token cũ đã hết hạn / máy chủ không tới được */ }
    resetSync();
  }
  setSettings({ deviceToken: token, user });
  accountEvents.emit('login');
}

export async function logoutDevice(): Promise<void> {
  try { await api('POST', '/ext/logout'); } catch { /* máy chủ không tới được: vẫn quên token ở máy này */ }
  setSettings({ deviceToken: null, user: null });
  portal = null;
  resetSync();
  accountEvents.emit('logout');
}

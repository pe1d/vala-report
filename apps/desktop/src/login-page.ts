/**
 * Màn hình đăng nhập của Vala Desktop (nhiều đơn vị, họp 07/10/2026) — trang cục bộ, hiện khi chưa đăng nhập:
 *   1. tài khoản `tên@đơn vị` ⇒ POST /auth/lookup (đơn vị theo tên miền, kiểm tài khoản có trong đơn vị);
 *   2. tài khoản khoá lại; mật khẩu Vala (mật khẩu tạm ⇒ đổi ngay tại đây) hoặc SSO của đơn vị: trang SSO mở trong một view
 *      nằm trong thẻ đăng nhập, ỨNG DỤNG tự điền + khoá ô tài khoản (bộ chọn theo đơn vị, mặc định WSO2), người dùng chỉ gõ
 *      mật khẩu; máy chủ trả về /dang-nhap/xong#token=… ⇒ bắt lấy token cổng.
 * Token cổng ⇒ POST /me/extension-devices ⇒ token thiết bị (account.ts adoptDeviceToken); token cổng giữ lại cho tab
 * Báo cáo (cầu nối, portalToken). IPC chỉ nhận từ đúng trang.
 */
import { join } from 'node:path';
import { ipcMain, WebContentsView, type BrowserWindow, type IpcMainInvokeEvent, type Rectangle } from 'electron';
import { adoptDeviceToken, deviceName, rememberPortalToken } from './account';
import { api, ApiError } from './api';
import { messages } from './i18n';
import { strings } from './login-strings';
import { prefsEvents } from './prefs';
import { getSettings, setSettings, type LoginTarget } from './settings';

const M = messages(strings.vi, strings.en);

export interface LoginPageHooks {
  isLogin: (e: IpcMainInvokeEvent) => boolean;
  /** Báo trang (nếu đang mở) vẽ lại. */
  push: () => void;
  /** Cửa sổ + vị trí trang đăng nhập trong cửa sổ (để đặt view SSO đúng chỗ khung trống của trang). */
  win: () => BrowserWindow | null;
  pageBounds: () => Rectangle | null;
}

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; type: string; title: string; detail?: string };
const fail = (e: unknown): Result<never> => (e instanceof ApiError
  ? { ok: false, type: e.type, title: e.message, detail: e.detail }
  : { ok: false, type: 'internal', title: (e as Error).message });

/** Gọi API bằng token cổng (JWT) thay cho token thiết bị. */
const withJwt = <T>(jwt: string, method: string, path: string, body?: unknown) =>
  api<T>(method, path, body, { ...getSettings(), deviceToken: jwt });

/** Đăng nhập mật khẩu đang chờ đổi mật khẩu tạm: giữ JWT + mật khẩu tạm trong bộ nhớ (không lưu đĩa). */
let pendingChange: { jwt: string; current: string } | null = null;

/** Token cổng ⇒ token thiết bị cho ứng dụng; nhớ tài khoản cho lần sau. */
async function finish(jwt: string): Promise<void> {
  const r = await withJwt<{ token: string; user: { ho_ten: string; email: string } }>(jwt, 'POST', '/me/extension-devices', { device_name: deviceName() });
  rememberPortalToken(jwt);
  await adoptDeviceToken(r.token, r.user);
}

// ---- SSO trong view ----
let sso: WebContentsView | null = null;
let ssoTarget: LoginTarget | null = null;
let ssoSlot: { x: number; y: number; w: number; h: number } | null = null;
let hooksRef: LoginPageHooks;

/** Bộ chọn mặc định: trang đăng nhập WSO2 Identity Server (Bkav SSO) và các form thường gặp. */
const DEFAULT_USER = '#usernameUserInput, #username, input[name="username"], input[name="login"], input[type="email"]';
const DEFAULT_PASS = '#password, input[name="password"], input[type="password"]';

/**
 * Script chèn vào trang SSO của đơn vị: điền tài khoản đã nhập ở bước 1 và KHOÁ ô đó (readonly — ô disabled sẽ không được
 * gửi đi cùng form), đưa con trỏ vào ô mật khẩu. Trang vẽ form muộn (SPA) ⇒ thử lại trong 15 giây.
 */
function fillScript(value: string, sel: { username?: string; password?: string } | null): string {
  return `(() => {
    const value = ${JSON.stringify(value)};
    const userSel = ${JSON.stringify(sel?.username || DEFAULT_USER)};
    const passSel = ${JSON.stringify(sel?.password || DEFAULT_PASS)};
    const apply = () => {
      const u = document.querySelector(userSel);
      if (!u || u.dataset.valaLocked) return !!u;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(u, value);
      u.dispatchEvent(new Event('input', { bubbles: true }));
      u.dispatchEvent(new Event('change', { bubbles: true }));
      u.readOnly = true;
      u.dataset.valaLocked = '1';
      u.setAttribute('aria-readonly', 'true');
      u.style.background = 'rgba(148,163,184,.18)';
      u.style.cursor = 'not-allowed';
      u.title = 'Vala Desktop';
      const p = document.querySelector(passSel);
      if (p) p.focus();
      return true;
    };
    if (apply()) return true;
    const obs = new MutationObserver(() => { if (apply()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 15000);
    return false;
  })()`;
}

function closeSso(): void {
  const w = hooksRef.win();
  if (sso && w && !w.isDestroyed()) w.contentView.removeChildView(sso);
  if (sso && !sso.webContents.isDestroyed()) sso.webContents.close();
  sso = null;
  ssoTarget = null;
}

/** Đặt view SSO đúng khung trống của trang đăng nhập (trang báo vị trí khung khi vẽ / đổi cỡ). */
export function layoutSso(): void {
  const page = hooksRef?.pageBounds();
  if (!sso || !page || !ssoSlot) return;
  sso.setBounds({ x: page.x + Math.round(ssoSlot.x), y: page.y + Math.round(ssoSlot.y), width: Math.round(ssoSlot.w), height: Math.round(ssoSlot.h) });
}

/** Gửi kết quả SSO về trang đăng nhập. */
const tellPage = (msg: Record<string, unknown>) => {
  const w = hooksRef.win();
  if (!w) return;
  for (const c of w.contentView.children) {
    const wc = (c as WebContentsView).webContents;
    if (wc && !wc.isDestroyed() && wc.getURL().includes('/resources/login.html')) wc.send('login:sso-result', msg);
  }
};

function openSso(t: LoginTarget, slot: { x: number; y: number; w: number; h: number }): void {
  const w = hooksRef.win();
  const s = getSettings();
  if (!w || !s.serverUrl) return;
  closeSso();
  ssoTarget = t;
  ssoSlot = slot;
  // Cùng phiên mặc định với các tab: cookie PKCE của máy chủ (đặt ở /auth/sso/start) còn khi quay về /sso/callback, và
  // phiên SSO của IdP dùng luôn cho các ứng dụng bên trong (sso-session.ts). Preload chung của tab: chỉ để bắt form đăng
  // nhập ⇒ hỏi lưu mật khẩu SSO (autofill.ts); cầu nối cổng của preload chỉ trả lời đúng origin cổng nên trang IdP không gọi được.
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: join(__dirname, 'portal-preload.js') } });
  sso = view;
  w.contentView.addChildView(view);
  layoutSso();
  const wc = view.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  /**
   * Trang đăng nhập của cổng — chỗ máy chủ trả người dùng về sau SSO (PUBLIC_WEB_URL, có thể khác địa chỉ API, có đường
   * dẫn con): /…/dang-nhap/xong#token=… (xong) hoặc /…/dang-nhap?loi=… (lỗi). Token cổng còn được máy chủ kiểm lại khi
   * đổi lấy token thiết bị.
   */
  const portalPath = (url: string) => {
    try { const u = new URL(url); return /\/dang-nhap(\/xong)?\/?$/.test(u.pathname) ? u : null; } catch { return null; }
  };
  const done = async (url: string) => {
    const u = portalPath(url);
    if (!u) return false;
    if (view !== sso) return true;          // đã xử lý (will-redirect rồi did-navigate cùng một lần quay về)
    if (/\/dang-nhap\/xong\/?$/.test(u.pathname)) {
      const token = new URLSearchParams(u.hash.slice(1)).get('token');
      closeSso();
      if (!token) { tellPage({ ok: false, title: M[getSettings().lang].ssoFailed }); return true; }
      tellPage({ ok: true, finishing: true });
      try { await finish(token); tellPage({ ok: true }); } catch (e) { tellPage(fail(e)); }
      return true;
    }
    if (/\/dang-nhap\/?$/.test(u.pathname)) {
      const loi = u.searchParams.get('loi');
      closeSso();
      const t2 = M[getSettings().lang];
      tellPage({ ok: false, title: loi === 'sso_tu_choi' ? t2.ssoCancelled : (loi && t2.ssoErrors[loi]) || t2.ssoFailed });
      return true;
    }
    return false;
  };
  // Máy chủ trả về bằng chuyển hướng (Location có #token) ⇒ bắt ở will-redirect; phòng hờ cả will-navigate / did-navigate.
  wc.on('will-redirect', (e, url) => { if (portalPath(url)) { e.preventDefault(); void done(url); } });
  wc.on('will-navigate', (e, url) => { if (portalPath(url)) { e.preventDefault(); void done(url); } });
  wc.on('did-navigate', (_e, url) => { void done(url); });
  // Mỗi trang của IdP: điền + khoá ô tài khoản.
  wc.on('dom-ready', () => {
    if (!ssoTarget || portalPath(wc.getURL())) return;
    void wc.executeJavaScript(fillScript(ssoTarget.fill, ssoTarget.selectors), true).catch(() => { /* trang đổi giữa chừng */ });
  });
  const q = new URLSearchParams({ next: '/', tenant: t.tenant.ma, login_hint: t.fill });
  void wc.loadURL(`${s.serverUrl}/api/v1/auth/sso/start?${q}`);
}

function state() {
  const s = getSettings();
  let server = '';
  try { server = new URL(s.serverUrl).host; } catch { /* chưa cấu hình */ }
  return { lang: s.lang, t: M[s.lang], last: s.lastLogin ?? null, server, changing: !!pendingChange };
}

export function registerLoginPage(hooks: LoginPageHooks): void {
  hooksRef = hooks;
  const own = (e: IpcMainInvokeEvent) => { if (!hooks.isLogin(e)) throw new Error('forbidden'); };
  prefsEvents.on('changed', hooks.push);

  ipcMain.handle('login:state', (e) => { own(e); return state(); });

  ipcMain.handle('login:lookup', async (e, login: unknown): Promise<Result<{ target: LoginTarget }>> => {
    own(e);
    if (typeof login !== 'string' || login.length > 200) return { ok: false, type: 'invalid_params', title: 'invalid' };
    try {
      const r = await api<Omit<LoginTarget, 'login'>>('POST', '/auth/lookup', { login: login.trim() });
      const target: LoginTarget = { ...r, login: login.trim().toLowerCase() };
      setSettings({ lastLogin: target });
      return { ok: true, target };
    } catch (err) { return fail(err); }
  });

  ipcMain.handle('login:forget', (e) => { own(e); closeSso(); pendingChange = null; setSettings({ lastLogin: null }); });

  ipcMain.handle('login:password', async (e, password: unknown): Promise<Result<{ changePassword?: boolean }>> => {
    own(e);
    const t = getSettings().lastLogin;
    if (!t || typeof password !== 'string' || !password || password.length > 400) return { ok: false, type: 'invalid_params', title: 'invalid' };
    try {
      const r = await api<{ access_token: string; must_change_password: boolean }>('POST', '/auth/login',
        { username: t.account, password, tenant: t.tenant.ma });
      if (r.must_change_password) { pendingChange = { jwt: r.access_token, current: password }; return { ok: true, changePassword: true }; }
      await finish(r.access_token);
      return { ok: true };
    } catch (err) { return fail(err); }
  });

  ipcMain.handle('login:change-password', async (e, next: unknown): Promise<Result> => {
    own(e);
    if (!pendingChange || typeof next !== 'string' || !next || next.length > 400) return { ok: false, type: 'invalid_params', title: 'invalid' };
    try {
      await withJwt(pendingChange.jwt, 'POST', '/auth/change-password', { current_password: pendingChange.current, new_password: next });
      const jwt = pendingChange.jwt;
      pendingChange = null;
      await finish(jwt);
      return { ok: true };
    } catch (err) { return fail(err); }
  });

  ipcMain.handle('login:sso', (e, slot: { x?: unknown; y?: unknown; w?: unknown; h?: unknown }) => {
    own(e);
    const t = getSettings().lastLogin;
    const n = (v: unknown) => Math.max(0, Number(v) || 0);
    if (t) openSso(t, { x: n(slot?.x), y: n(slot?.y), w: n(slot?.w), h: n(slot?.h) });
  });
  ipcMain.handle('login:sso-slot', (e, slot: { x?: unknown; y?: unknown; w?: unknown; h?: unknown }) => {
    own(e);
    const n = (v: unknown) => Math.max(0, Number(v) || 0);
    ssoSlot = { x: n(slot?.x), y: n(slot?.y), w: n(slot?.w), h: n(slot?.h) };
    layoutSso();
  });
  ipcMain.handle('login:sso-cancel', (e) => { own(e); closeSso(); });
}

/** Rời màn hình đăng nhập (đã đăng nhập / đóng trang) ⇒ đóng view SSO nếu còn. */
export const closeLoginSso = (): void => { if (hooksRef) closeSso(); };

/**
 * Tự bấm "Đăng nhập bằng SSO" (sso-auto.ts) — phần thuần để kiểm thử: nhận ra chữ của nút, quyết định có bấm không.
 */

/** Chữ nút đăng nhập SSO thường gặp (vi/en): "Đăng nhập bằng SSO", "Đăng nhập với Bkav SSO", "Sign in with SSO", "SSO"… */
const SSO_BUTTON = /^(?:(?:đăng nhập|login|log in|sign in)(?:\s+(?:bằng|với|qua|with|via|using))?(?:\s+tài khoản)?(?:\s+\S+)?\s+sso|sso(?:\s+(?:login|log in|sign in|đăng nhập))?)$/iu;

export const isSsoButtonText = (text: string): boolean => SSO_BUTTON.test(text.replace(/\s+/g, ' ').trim());

/** Không bấm lại trên cùng tab trong khoảng này (IdP trả về lỗi / người dùng tự quay lại trang đăng nhập ⇒ không vòng lặp). */
export const RETRY_MS = 2 * 60_000;

export interface AutoSsoInput {
  /** Vala Desktop đã đăng nhập. */
  signedIn: boolean;
  /** Host của trang (tab ứng dụng). */
  pageHost: string;
  /** Host SSO của đơn vị (máy chủ báo). */
  ssoHosts: string[];
  /** App đang có cookie của IdP (đã đăng nhập SSO trong app). */
  hasSsoSession: boolean;
  /** Lần tự bấm gần nhất trên tab này (ms) — chưa có ⇒ 0. */
  lastClick: number;
  now: number;
}

/** Chỉ tự bấm khi bấm xong IdP trả về ngay (đã có phiên SSO) — không thì để người dùng tự chọn cách đăng nhập. */
export function shouldAutoSso(o: AutoSsoInput): boolean {
  if (!o.signedIn || !o.hasSsoSession || !o.ssoHosts.length || !o.pageHost) return false;
  const h = o.pageHost.toLowerCase().replace(/:\d+$/, '');
  if (o.ssoHosts.some((s) => s.toLowerCase().replace(/:\d+$/, '') === h)) return false;
  return o.now - o.lastClick >= RETRY_MS;
}

/** Bấm SSO xong đợi tối đa chừng này để ứng dụng đăng nhập xong rồi đưa tab về đúng trang của nó. */
export const RETURN_MS = 2 * 60_000;

/** Trang đăng nhập / bước trung gian của luồng đăng nhập (chưa xong — đừng chuyển trang lúc này). */
const LOGIN_STEP = /log-?in|sign-?in|dang-?nhap|callback|oauth|sso|auth|token/i;

/**
 * Sau khi tự đăng nhập SSO, ứng dụng thường về trang chung (vd Vala ⇒ checkLogin ⇒ /start ⇒ bảng tin) chứ không về trang
 * của tab (Tin nhắn ⇒ /messenger). `cho`: chưa xong đăng nhập (trang đăng nhập / IdP / callback có mã) hoặc đang ở máy
 * khác; `xong`: đã đúng trang; `chuyen`: đăng nhập xong nhưng sai trang ⇒ chuyển tới `url`.
 */
export function returnStep(current: string, home: string): { kind: 'cho' } | { kind: 'xong' } | { kind: 'chuyen'; url: string } {
  let c: URL, h: URL;
  try { c = new URL(current); h = new URL(home); } catch { return { kind: 'xong' }; }
  if (c.host !== h.host || !/^https?:$/.test(c.protocol)) return { kind: 'cho' };
  if (LOGIN_STEP.test(c.pathname) || c.searchParams.has('code') || c.searchParams.has('ticket')) return { kind: 'cho' };
  if (c.pathname.replace(/\/+$/, '') === h.pathname.replace(/\/+$/, '') && c.search === h.search) return { kind: 'xong' };
  return { kind: 'chuyen', url: h.toString() };
}

/**
 * Script trong trang: tìm nút SSO đang hiện (trang SPA vẽ muộn ⇒ theo dõi 10 giây), bấm một lần. Chỉ khi trang có dấu hiệu
 * là trang đăng nhập (đường dẫn / tiêu đề / chữ "đăng nhập", "login") — tránh bấm nhầm nút SSO ở trang thường.
 */
export const CLICK_SCRIPT = `(() => new Promise((done) => {
  const re = new RegExp(${JSON.stringify(SSO_BUTTON.source)}, 'iu');
  const isLogin = () => /log-?in|sign-?in|dang-?nhap|auth/i.test(location.pathname + location.hash)
    || /đăng nhập|login|sign in/i.test(document.title + ' ' + (document.body ? document.body.innerText.slice(0, 2000) : ''));
  const find = () => {
    if (!isLogin()) return null;
    for (const el of document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')) {
      const text = (el.value || el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (text.length > 60 || !re.test(text)) continue;
      if (!el.getClientRects().length || el.disabled) continue;
      return el;
    }
    return null;
  };
  const tryClick = () => { const el = find(); if (!el) return false; el.click(); done(true); return true; };
  if (tryClick()) return;
  const obs = new MutationObserver(() => { if (tryClick()) obs.disconnect(); });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => { obs.disconnect(); done(false); }, 10000);
}))()`;

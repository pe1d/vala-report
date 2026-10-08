/**
 * SSO của Vala Desktop (người dùng 08/10/2026: "SSO bê lên cho desktop"): đăng nhập Desktop bằng SSO của đơn vị một lần
 * ⇒ mọi ứng dụng bên trong dùng cùng SSO (Vala, eGov, eTask… qua iam.bkav.com) tự vào, kể cả sau khi tắt / mở lại app.
 *
 *   - Màn hình đăng nhập SSO (login-page.ts) và các tab dùng CHUNG một phiên trình duyệt ⇒ cookie phiên của IdP đặt lúc
 *     đăng nhập Desktop dùng được ngay cho các ứng dụng.
 *   - Cookie phiên (không hạn) của IdP mất khi tắt app ⇒ chuyển thành cookie có hạn (SSO_KEEP_DAYS) để mở lại app vẫn
 *     còn đăng nhập SSO. Chỉ cookie của đúng host SSO đơn vị khai (máy chủ trả `sso_hosts`), không đụng cookie khác.
 *   - Phiên SSO hết hạn phía IdP ⇒ trang đăng nhập SSO hiện trong một ứng dụng ⇒ tự điền mật khẩu SSO đã lưu (một mật
 *     khẩu cho mọi ứng dụng — autofill.ts, khoá `sso`).
 *   - Đăng xuất Desktop ⇒ xoá toàn bộ dữ liệu web trong app, gồm cookie của IdP (account.ts clearWebSession).
 *
 * Cũng giữ như vậy cho các ỨNG DỤNG VĂN BẢN (có gói phiên dịch — vanban-model.ts; người dùng chốt 08/10/2026): hệ thống
 * như Văn bản Hà Nội chỉ dùng cookie phiên + mã xác nhận khi đăng nhập ⇒ không giữ thì mỗi lần mở app phải đăng nhập lại.
 * Chỉ giúp khi phiên phía máy chủ của hệ thống còn sống (máy chủ vẫn tự hết hạn phiên theo chính sách của nó).
 */
import { session, type Cookie } from 'electron';
import { appsEvents, catalog } from './apps';
import { packageEvents, packages } from './scripts';
import { getSettings } from './settings';
import { cookieForHosts, vanBanHosts } from './vanban-model';

/** Giữ phiên SSO bao lâu sau lần đăng nhập / làm mới gần nhất (IdP vẫn tự hết hạn phiên theo chính sách của nó). */
const SSO_KEEP_DAYS = 14;

/** Host SSO của đơn vị: theo danh mục ứng dụng (đã đăng nhập) hoặc bước 1 của lần đăng nhập gần nhất. */
export function ssoHosts(): string[] {
  const s = new Set<string>([...(catalog().sso_hosts ?? []), ...(getSettings().lastLogin?.sso_hosts ?? [])]);
  return [...s];
}

/** So theo tên máy (bỏ số cổng): cookie không mang cổng, còn host trang có thể có (vd localhost:4021). */
const hostname = (h: string) => h.toLowerCase().replace(/:\d+$/, '');
export const isSsoHost = (host: string): boolean => ssoHosts().some((h) => hostname(h) === hostname(host));

const cookieHost = (c: Cookie) => (c.domain ?? '').replace(/^\./, '').toLowerCase();
const cookieUrl = (c: Cookie) => `${c.secure ? 'https' : 'http'}://${cookieHost(c)}${c.path || '/'}`;

/** Máy của các ứng dụng văn bản (tính lại khi danh mục / gói đổi). */
let vbHosts: string[] = [];
const refreshVbHosts = () => { vbHosts = getSettings().deviceToken ? vanBanHosts(catalog().apps.map((a) => ({ key: a.ma, url: a.url ?? '' })), packages()) : []; };

/** Cookie phiên của IdP / ứng dụng văn bản ⇒ cookie có hạn (giữ khi tắt app). Không đụng cookie đã có hạn. */
async function keep(c: Cookie): Promise<void> {
  if (!c.session || !(isSsoHost(cookieHost(c)) || cookieForHosts(c.domain ?? '', vbHosts))) return;
  try {
    await session.defaultSession.cookies.set({
      url: cookieUrl(c), name: c.name, value: c.value, path: c.path,
      // Cookie chỉ của host (không có dấu chấm đầu) ⇒ không đặt domain, giữ đúng phạm vi cũ.
      ...(c.domain?.startsWith('.') ? { domain: c.domain } : {}),
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      expirationDate: Date.now() / 1000 + SSO_KEEP_DAYS * 86400,
    });
  } catch { /* cookie đặc biệt (__Host- …) không đặt lại được: giữ như cũ */ }
}

/** Danh mục / gói vừa đổi ⇒ ứng dụng văn bản mới: giữ luôn cookie phiên đang có của nó. */
async function sweep(): Promise<void> {
  refreshVbHosts();
  if (!vbHosts.length) return;
  for (const c of await session.defaultSession.cookies.get({})) if (c.session) await keep(c);
}

export function initSsoSession(): void {
  session.defaultSession.cookies.on('changed', (_e, c, _cause, removed) => { if (!removed) void keep(c); });
  void sweep();
  packageEvents.on('changed', () => void sweep());
  appsEvents.on('changed', () => void sweep());
}

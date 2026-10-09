/**
 * Tự bấm "Đăng nhập bằng SSO" trên trang đăng nhập của ứng dụng (người dùng 09/10/2026: đăng xuất rồi đăng nhập lại bằng
 * SSO thì Vala không tự vào). Ứng dụng như vala.bkav.com hết phiên thì về trang đăng nhập RIÊNG của nó (nút "Đăng nhập
 * bằng SSO" / "… LDAP") chứ không tự chuyển sang IdP như eGov ⇒ phiên SSO của Desktop (sso-session.ts) không được dùng.
 * App đã có phiên SSO của đơn vị ⇒ bấm hộ nút SSO: IdP trả về ngay, không hỏi mật khẩu. Không đụng phần mềm của họ, không
 * code riêng cho ứng dụng nào — nhận nút theo chữ (sso-auto-model.ts). Mỗi tab tối đa một lần / 2 phút.
 */
import { session, type WebContents } from 'electron';
import { getSettings } from './settings';
import { ssoHosts } from './sso-session';
import { CLICK_SCRIPT, shouldAutoSso } from './sso-auto-model';

const hostOf = (u: string) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.host : ''; } catch { return ''; } };

/** App có cookie của IdP đơn vị (đăng nhập Desktop bằng SSO / đã qua SSO trong một ứng dụng). */
async function hasSsoSession(hosts: string[]): Promise<boolean> {
  for (const h of hosts) {
    const name = h.replace(/:\d+$/, '');
    const cookies = await session.defaultSession.cookies.get({ domain: name }).catch(() => []);
    if (cookies.length) return true;
  }
  return false;
}

const lastClick = new Map<number, number>();
const running = new Set<number>();

async function maybeClick(wc: WebContents): Promise<void> {
  if (wc.isDestroyed() || running.has(wc.id)) return;
  const hosts = ssoHosts();
  const input = {
    signedIn: !!getSettings().deviceToken, pageHost: hostOf(wc.getURL()), ssoHosts: hosts,
    hasSsoSession: false, lastClick: lastClick.get(wc.id) ?? 0, now: Date.now(),
  };
  if (!shouldAutoSso({ ...input, hasSsoSession: true })) return;      // kiểm rẻ trước, cookie sau
  if (!(await hasSsoSession(hosts))) return;
  running.add(wc.id);
  try {
    const clicked = await wc.executeJavaScript(CLICK_SCRIPT, true).catch(() => false);
    if (clicked) lastClick.set(wc.id, Date.now());
  } finally { running.delete(wc.id); }
}

export function attachSsoAuto(wc: WebContents): void {
  wc.on('dom-ready', () => void maybeClick(wc));
  // Ứng dụng SPA chuyển sang /login bằng pushState (không tải lại trang).
  wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => { if (isMainFrame) void maybeClick(wc); });
  wc.once('destroyed', () => { lastClick.delete(wc.id); running.delete(wc.id); });
}

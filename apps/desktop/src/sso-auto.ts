/**
 * Tự bấm "Đăng nhập bằng SSO" trên trang đăng nhập của ứng dụng (người dùng 09/10/2026: đăng xuất rồi đăng nhập lại bằng
 * SSO thì Vala không tự vào). Ứng dụng như vala.bkav.com hết phiên thì về trang đăng nhập RIÊNG của nó (nút "Đăng nhập
 * bằng SSO" / "… LDAP") chứ không tự chuyển sang IdP như eGov ⇒ phiên SSO của Desktop (sso-session.ts) không được dùng.
 * App đã có phiên SSO của đơn vị ⇒ bấm hộ nút SSO: IdP trả về ngay, không hỏi mật khẩu. Không đụng phần mềm của họ, không
 * code riêng cho ứng dụng nào — nhận nút theo chữ (sso-auto-model.ts). Mỗi tab tối đa một lần / 2 phút.
 * Đăng nhập xong ứng dụng thường về trang chung ⇒ đưa tab về đúng trang gốc của nó (Tin nhắn ⇒ /messenger).
 */
import { session, type WebContents } from 'electron';
import { getSettings } from './settings';
import { ssoHosts } from './sso-session';
import { CLICK_SCRIPT, RETURN_MS, returnStep, shouldAutoSso } from './sso-auto-model';

const hostOf = (u: string) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.host : ''; } catch { return ''; } };

/** App có cookie của IdP đơn vị (đăng nhập Desktop bằng SSO / đã qua SSO trong một ứng dụng). */
async function hasSsoSession(hosts: string[]): Promise<boolean> {
  for (const h of hosts) {
    const cookies = await session.defaultSession.cookies.get({ domain: h.replace(/:\d+$/, '') }).catch(() => []);
    if (cookies.length) return true;
  }
  return false;
}

interface TabState {
  /** Địa chỉ gốc của tab. */
  home: () => string | null;
  lastClick: number;
  running: boolean;
  /** Vừa bấm SSO hộ ⇒ chờ đăng nhập xong để đưa về trang gốc (tới lúc `until`). */
  returning?: { home: string; until: number };
  timer?: ReturnType<typeof setTimeout>;
}
const states = new Map<number, TabState>();

async function maybeClick(wc: WebContents, st: TabState): Promise<void> {
  if (wc.isDestroyed() || st.running) return;
  const hosts = ssoHosts();
  const input = { signedIn: !!getSettings().deviceToken, pageHost: hostOf(wc.getURL()), ssoHosts: hosts, lastClick: st.lastClick, now: Date.now() };
  if (!shouldAutoSso({ ...input, hasSsoSession: true })) return;      // kiểm rẻ trước, cookie sau
  if (!(await hasSsoSession(hosts))) return;
  st.running = true;
  try {
    const clicked = await wc.executeJavaScript(CLICK_SCRIPT, true).catch(() => false);
    if (clicked) {
      st.lastClick = Date.now();
      const home = st.home();
      if (home) st.returning = { home, until: Date.now() + RETURN_MS };
    }
  } finally { st.running = false; }
}

/** Trang vừa đổi: đợi ứng dụng ổn định (qua checkLogin / chuyển hướng trong trang) rồi mới quyết định. */
function scheduleReturn(wc: WebContents, st: TabState): void {
  if (!st.returning) return;
  if (Date.now() > st.returning.until) { st.returning = undefined; return; }
  if (st.timer) clearTimeout(st.timer);
  st.timer = setTimeout(() => {
    const r = st.returning;
    if (!r || wc.isDestroyed() || wc.isLoading()) return;
    const step = returnStep(wc.getURL(), r.home);
    if (step.kind === 'cho') return;
    st.returning = undefined;
    if (step.kind === 'chuyen') void wc.loadURL(step.url);
  }, 2500);
}

/** `home`: địa chỉ gốc của tab (trang của ứng dụng lúc mở tab) — đăng nhập SSO hộ xong thì đưa tab về đó. */
export function attachSsoAuto(wc: WebContents, home: () => string | null): void {
  const id = wc.id;
  const st: TabState = { home, lastClick: 0, running: false };
  states.set(id, st);
  wc.on('dom-ready', () => void maybeClick(wc, st));
  wc.on('did-navigate', () => scheduleReturn(wc, st));
  wc.on('did-stop-loading', () => scheduleReturn(wc, st));
  // Ứng dụng SPA chuyển trang bằng pushState (không tải lại trang).
  wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => { if (isMainFrame) { void maybeClick(wc, st); scheduleReturn(wc, st); } });
  wc.once('destroyed', () => { if (st.timer) clearTimeout(st.timer); states.delete(id); });
}

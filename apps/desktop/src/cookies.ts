/**
 * Đọc cookie phiên của các hệ thống nguồn từ phiên trình duyệt của chính Vala Desktop (thay chrome.cookies của tiện ích).
 *
 * Khác tiện ích: Electron không có hộp thoại xin quyền theo tên miền — ứng dụng đọc được cookie trong phiên của chính
 * nó, nên không có trạng thái "chưa cho phép". Nguyên tắc an toàn giữ nguyên: chỉ đọc và gửi đúng các cookie adapter
 * khai (cookie_names), không lưu giá trị, không log giá trị.
 */
import { session, webContents } from 'electron';

export interface Source {
  code: string;
  ten: string;
  origin: string;
  login_url: string;
  cookie_names: string[];
  /** Mỗi nhóm là các tên thay thế nhau, có một trong số đó là đủ (vd [bkavAuthen1, bkavAuthen]). */
  cookie_groups?: string[][];
  /** Cookie định danh (vd meId/companyId của eTask) chỉ có khi đang mở trang nguồn; thiếu thì máy chủ dùng lại giá trị cũ. */
  stable_cookies?: string[];
  /** Tên miền tìm cookie phiên (vd bkav.com cho eGov thật). */
  cookie_domain?: string;
}

/** Dạng tối thiểu của một cookie mà phần lọc cần (Electron.Cookie thoả kiểu này). */
export interface CookieLike {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  session?: boolean;
  expirationDate?: number;
}

/** Cookie đặt ở `cookieDomain` có áp dụng cho cây tên miền phiên `domain` không (chính nó, tên miền con, tên miền cha). */
export function matchesSessionDomain(domain: string, cookieDomain: string): boolean {
  const d = cookieDomain.replace(/^\./, '');
  return d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`);
}

export const sessionDomain = (src: Source) => (src.cookie_domain ?? new URL(src.origin).hostname).replace(/^\./, '');

/** Chọn đúng các cookie phiên adapter khai; trùng tên thì ưu tiên Path ngắn. Kèm thời hạn (giây epoch), không kèm giá trị. */
export function pickSessionCookies(src: Source, all: CookieLike[]): { cookies: Record<string, string>; expires: Record<string, number> } {
  const domain = sessionDomain(src);
  const cookies: Record<string, string> = {};
  const expires: Record<string, number> = {};
  const sorted = all
    .filter((c) => matchesSessionDomain(domain, c.domain ?? ''))
    .sort((a, b) => (a.path?.length ?? 0) - (b.path?.length ?? 0));
  for (const c of sorted) {
    if (!src.cookie_names.includes(c.name) || c.name in cookies) continue;
    cookies[c.name] = c.value;
    if (!c.session && c.expirationDate) expires[c.name] = Math.floor(c.expirationDate);
  }
  return { cookies, expires };
}

export const cookieGroupsOf = (src: Source): string[][] =>
  src.cookie_groups?.length ? src.cookie_groups : src.cookie_names.map((n) => [n]);

/** Các nhóm chưa có cookie nào, dạng "bkavAuthen1|bkavAuthen". */
export const missingGroups = (src: Source, have: Record<string, string>): string[] =>
  cookieGroupsOf(src).filter((g) => !g.some((n) => n in have)).map((g) => g.join('|'));

/** Tách `document.cookie`, chỉ lấy đúng các tên cần. */
export function parseDocumentCookie(raw: string, wanted: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (wanted.includes(name) && !(name in out)) out[name] = part.slice(i + 1);
  }
  return out;
}

/**
 * Cookie do JS của trang đặt mà kho cookie không trả (vd cookie phân vùng meId/companyId của eTask): đọc
 * document.cookie trên một tab/cửa sổ đang mở trang nguồn. Không có trang nào ⇒ rỗng (bắt được ở lần đồng bộ sau).
 */
async function readPageCookies(src: Source, names: string[]): Promise<Record<string, string>> {
  if (!names.length) return {};
  const host = new URL(src.origin).hostname;
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    const url = wc.getURL();
    if (!/^https?:/.test(url) || new URL(url).hostname !== host) continue;
    try {
      const raw = (await wc.executeJavaScript('document.cookie', false)) as string;
      const got = parseDocumentCookie(raw, names);
      if (Object.keys(got).length) return got;
    } catch { /* trang đang tải lại: thử cửa sổ khác */ }
  }
  return {};
}

/** Đọc đúng các cookie phiên của một nguồn từ phiên của ứng dụng (+ đọc bù từ trang nguồn đang mở). */
export async function readCookies(src: Source): Promise<{ cookies: Record<string, string>; expires: Record<string, number> }> {
  const all = await session.defaultSession.cookies.get({ domain: sessionDomain(src) });
  const r = pickSessionCookies(src, all);
  Object.assign(r.cookies, await readPageCookies(src, src.cookie_names.filter((n) => !(n in r.cookies))));
  return r;
}

/**
 * Lấy phiên ứng dụng (eGov, eTask…) từ phiên SSO — "đi theo chuỗi chuyển hướng" (phương án, mục 08):
 *
 *   GET eGov/Home/Index (chưa có phiên) → 302 SSO → SSO nhận access token → 302 eGov kèm ticket
 *   → eGov đặt cookie phiên → 200.
 *
 * Chốt chặn riêng cho bước này (không đi qua GuardedHttpClient vì URL do máy chủ quyết định):
 *  - chỉ đi tới host của hệ thống nguồn và host SSO; chuyển hướng ra ngoài ⇒ dừng;
 *  - access token CHỈ gửi cho host SSO, không bao giờ gửi cho hệ thống nguồn;
 *  - tối đa max_redirects bước;
 *  - kết thúc phải có đủ cookies_required, nếu không coi là SSO không cấp phiên.
 */
import { Problem } from '../errors.js';
import type { FetchLike } from './http.js';
import type { AdapterSpec } from './spec.js';

interface StoredCookie {
  name: string;
  value: string;
  /** host-only nếu không có Domain; ngược lại khớp đuôi. */
  domain: string;
  hostOnly: boolean;
}

export class CookieJar {
  private readonly cookies: StoredCookie[] = [];

  store(host: string, setCookie: string[]): void {
    for (const line of setCookie) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair!.indexOf('=');
      if (eq <= 0) continue;
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      let domain = host;
      let hostOnly = true;
      let expired = false;
      for (const a of attrs) {
        const [k, v = ''] = a.split('=').map((x) => x.trim());
        const key = k!.toLowerCase();
        if (key === 'domain' && v) {
          const d = v.replace(/^\./, '').toLowerCase();
          // Chỉ nhận Domain là chính host hoặc cha của host đang trả lời (như trình duyệt).
          if (host === d || host.endsWith(`.${d}`)) { domain = d; hostOnly = false; }
        }
        if (key === 'max-age' && Number(v) <= 0) expired = true;
      }
      const i = this.cookies.findIndex((c) => c.name === name && c.domain === domain);
      if (i >= 0) this.cookies.splice(i, 1);
      if (!expired) this.cookies.push({ name, value, domain, hostOnly });
    }
  }

  forHost(host: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of this.cookies) {
      if (c.hostOnly ? c.domain === host : host === c.domain || host.endsWith(`.${c.domain}`)) out[c.name] = c.value;
    }
    return out;
  }
}

export interface WalkStep {
  url: URL;
  status: number;
  text: string;
}

/**
 * Đi theo chuyển hướng với một hũ cookie, chỉ trong tập host cho phép.
 * `authFor(host)` cho phép gắn Authorization cho đúng một host (vd access token chỉ cho SSO).
 */
export class RedirectWalker {
  readonly jar = new CookieJar();
  constructor(
    private readonly allowedHosts: Set<string>,
    private readonly fetchImpl: FetchLike,
    private readonly maxHops: number,
    private readonly authFor: (host: string) => string | undefined = () => undefined,
  ) {}

  async go(start: URL, first?: { method: 'POST'; form: Record<string, string> }): Promise<WalkStep> {
    let url = start;
    let req = first;
    for (let hop = 0; hop <= this.maxHops; hop++) {
      if (!this.allowedHosts.has(url.host)) {
        throw new Problem('forbidden', 'Chuyển hướng ra ngoài các host được phép', url.host);
      }
      const headers: Record<string, string> = { Accept: 'text/html,application/xhtml+xml,application/json' };
      const cookies = this.jar.forHost(url.hostname);
      if (Object.keys(cookies).length) headers.Cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      const auth = this.authFor(url.host);
      if (auth) headers.Authorization = auth;
      let body: string | undefined;
      if (req) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(req.form).toString();
      }
      let res: Response;
      try {
        res = await this.fetchImpl(url.toString(), {
          method: req?.method ?? 'GET', headers, body, redirect: 'manual', signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        // Không đưa URL đầy đủ vào lỗi: query có thể chứa code/sessionDataKey.
        throw new Error(`Lỗi mạng khi gọi ${url.host}${url.pathname}: ${(e as Error).name}`);
      }
      this.jar.store(url.hostname, res.headers.getSetCookie());
      req = undefined;   // sau chuyển hướng luôn là GET (303/302 theo trình duyệt)
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error('Chuyển hướng không có Location');
        url = new URL(loc, url);
        continue;
      }
      return { url, status: res.status, text: await res.text() };
    }
    throw new Error(`Quá ${this.maxHops} lần chuyển hướng`);
  }

  cookiesFor(baseUrl: string): Record<string, string> {
    return this.jar.forHost(new URL(baseUrl).hostname);
  }
}

export interface BootstrapResult {
  cookies: Record<string, string>;
  expires_at: string;
}

/** cookies_required dạng nhóm: mỗi nhóm là các tên thay thế nhau. */
export const cookieGroups = (spec: AdapterSpec): string[][] =>
  spec.auth.cookies_required.map((g) => (Array.isArray(g) ? g : [g]));

/** Mọi tên cookie phiên có thể có (để tiện ích biết đọc cookie nào). */
export const cookieNames = (spec: AdapterSpec): string[] => [...new Set([...cookieGroups(spec).flat(), ...spec.auth.cookies_optional])];

/** Các nhóm chưa có cookie nào, dạng "bkavAuthen1|bkavAuthen" để báo lỗi. */
export const missingCookieGroups = (spec: AdapterSpec, cookies: Record<string, string>): string[] =>
  cookieGroups(spec).filter((g) => !g.some((c) => c in cookies)).map((g) => g.join('|'));

/** Giữ đúng các cookie phiên (mọi tên có mặt trong từng nhóm + cookie tuỳ chọn có mặt); thiếu nhóm nào ⇒ null. */
export function pickRequiredCookies(spec: AdapterSpec, cookies: Record<string, string>): Record<string, string> | null {
  if (missingCookieGroups(spec, cookies).length) return null;
  return Object.fromEntries(cookieNames(spec).filter((c) => c in cookies).map((c) => [c, cookies[c]!]));
}

export interface BootstrapOptions {
  spec: AdapterSpec;
  baseUrl: string;
  ssoOrigin: string;
  accessToken: string;
  fetchImpl?: FetchLike;
}

/**
 * auth_method = 'sso': lấy phiên ứng dụng bằng access token SSO. Access token CHỈ gửi cho host SSO.
 */
export async function bootstrapAppSession(o: BootstrapOptions): Promise<BootstrapResult> {
  const cfg = o.spec.auth.bootstrap;
  if (!cfg) throw new Error(`${o.spec.id}: spec chưa khai báo auth.bootstrap`);
  const appHost = new URL(o.baseUrl).host;
  const ssoHost = new URL(o.ssoOrigin).host;
  const walker = new RedirectWalker(new Set([appHost, ssoHost]), o.fetchImpl ?? ((u, i) => fetch(u, i)), cfg.max_redirects,
    (host) => (host === ssoHost ? `Bearer ${o.accessToken}` : undefined));

  const end = await walker.go(new URL(cfg.start.path, o.baseUrl));
  if (end.status === 401 || end.status === 403) throw new Problem('session_expired', 'Phiên SSO không còn hiệu lực', `${end.url.host} → ${end.status}`);
  if (end.status >= 400) throw new Error(`Lấy phiên: ${end.url.host}${end.url.pathname} → HTTP ${end.status}`);
  // Dừng ở SSO với 200 = SSO hiện trang đăng nhập (không nhận access token) ⇒ phải đăng nhập lại.
  if (end.url.host !== appHost) throw new Problem('session_expired', 'SSO yêu cầu đăng nhập lại');
  const cookies = pickRequiredCookies(o.spec, walker.cookiesFor(o.baseUrl));
  if (!cookies) throw new Problem('session_expired', 'Hệ thống nguồn không cấp đủ cookie phiên');
  return { cookies, expires_at: new Date(Date.now() + cfg.session_ttl_minutes * 60_000).toISOString() };
}

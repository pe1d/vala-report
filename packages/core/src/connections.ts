/**
 * Kết nối dữ liệu = một người dùng × một hệ thống nguồn × một cách xác thực (source_grants.auth_method).
 * Vault:
 *   vault://{tenant}/users/{id}/{source}        phiên (cookie) đang dùng — mọi cách xác thực
 *   vault://{tenant}/users/{id}/{source}_login  tài khoản/mật khẩu nguồn — chỉ khi auth_method = 'password'
 *   vault://{tenant}/users/{id}/sso             refresh token SSO — chỉ khi auth_method = 'sso'
 * auth_method = 'extension': tiện ích trình duyệt gửi cookie về mỗi khi người dùng đăng nhập hệ thống nguồn.
 */
import { GuardedHttpClient, cookieGroups, cookieNames, findSpec, missingCookieGroups, loadAllSpecs, parseCookieInput, passwordLogin, pickRequiredCookies, probeSession, type AdapterSpec, type FetchLike, type SessionInfo, type SourceCredential } from './adapter/index.js';
import { Problem, L } from './errors.js';
import { vaultRef, type SecretStore, type SessionSecret } from './secrets.js';
import { currentSchema } from './tenant.js';
import type { SessionManager } from './sessions.js';

export type AuthMethod = 'sso' | 'password' | 'cookie' | 'extension';
/** Cách xác thực cấu hình được qua form. 'extension' chỉ do tiện ích trình duyệt tạo ra. */
export const AUTH_METHODS: AuthMethod[] = ['password', 'cookie', 'sso'];

/** Hệ thống tự lấy lại phiên được (không cần người dùng làm gì) hay không. */
export const canAutoRenew = (m: AuthMethod) => m === 'password' || m === 'sso';

export interface SourceInfo {
  baseUrl: string;
  loginHosts: string[];
  /** Base của API dữ liệu nếu khác trang đăng nhập (override adapter.auth.api_base_url; dev/test dùng host giả). */
  apiBaseUrl?: string;
}

export interface ConnectionSessionsOptions {
  secrets: SecretStore;
  /** Tiền tố đường dẫn vault (schema đơn vị). Không đặt ⇒ theo đơn vị của ngữ cảnh lúc gọi (multi-tenant). */
  tenant?: string;
  sourceInfo: (source: string) => Promise<SourceInfo>;
  specs?: AdapterSpec[];
  fetchImpl?: FetchLike;
  /** Chỉ cần khi có kết nối auth_method = 'sso'. */
  sso?: SessionManager;
  /** Tự đăng nhập bằng mật khẩu gặp OTP ⇒ báo để đánh dấu hệ thống có xác thực 2 lớp (xem markSourceMfa). */
  onOtpRequired?: (source: string) => Promise<void>;
  /** Spec của hệ thống nguồn do quản trị tạo trên cổng (dựng từ auth_profile), đọc từ cache — xem SourceRegistry. */
  extraSpecs?: () => AdapterSpec[];
}

export class ConnectionSessions {
  constructor(private readonly o: ConnectionSessionsOptions) {}

  credentialRef(userId: number, source: string) {
    return vaultRef(this.o.tenant ?? currentSchema(), userId, `${source}_login`);
  }

  sessionRef(userId: number, source: string) {
    return vaultRef(this.o.tenant ?? currentSchema(), userId, source);
  }

  spec(source: string): AdapterSpec {
    const portal = this.o.extraSpecs?.().find((s) => s.source_system === source);
    if (portal) return portal;
    const specs = this.o.specs ?? loadAllSpecs();
    const s = specs.find((x) => x.source_system === source && x.auth.password_login) ?? specs.find((x) => x.source_system === source);
    if (!s) throw new Error(`Chưa có cấu hình adapter cho ${source}`);
    return s;
  }

  async saveCredential(userId: number, source: string, cred: SourceCredential): Promise<void> {
    if (!cred.username.trim() || !cred.password) throw new Problem('invalid_params', L('Thiếu tên đăng nhập hoặc mật khẩu', 'Username or password is missing'));
    await this.o.secrets.put(this.credentialRef(userId, source), { username: cred.username.trim(), password: cred.password });
  }

  async hasCredential(userId: number, source: string): Promise<boolean> {
    return !!(await this.o.secrets.get(this.credentialRef(userId, source)));
  }

  /** Cookie quản trị dán vào: chỉ giữ đúng các cookie cần; hạn dùng không biết trước. */
  async saveCookie(userId: number, source: string, raw: string): Promise<SessionSecret> {
    const secret: SessionSecret = { cookies: parseCookieInput(this.spec(source), raw), obtained_at: new Date().toISOString() };
    await this.o.secrets.put(this.sessionRef(userId, source), secret);
    return secret;
  }

  /** Nhóm cookie phiên (mỗi nhóm: các tên thay thế nhau, có một là đủ). */
  cookieGroups(source: string): string[][] {
    return cookieGroups(this.spec(source));
  }

  /** Tên các cookie là phiên của hệ thống nguồn — tiện ích chỉ đọc và gửi đúng các cookie này. */
  /** Adapter có cách tự đăng nhập bằng mật khẩu không (hệ thống do quản trị tạo thì không). */
  supportsPassword(source: string): boolean {
    try { return !!this.spec(source).auth.password_login; } catch { return false; }
  }

  cookieNames(source: string): string[] {
    return cookieNames(this.spec(source));
  }

  /**
   * Kiểm tra cookie tiện ích gửi về: chỉ giữ đúng cookies_required, rồi gọi session_probe để chắc phiên
   * còn sống và biết nó thuộc tài khoản nguồn nào (puid). Không ghi gì vào vault.
   */
  async verifyCookies(source: string, raw: Record<string, string>): Promise<{ cookies: Record<string, string>; session: SessionInfo }> {
    const spec = this.spec(source);
    const cookies = pickRequiredCookies(spec, raw);
    if (!cookies) {
      const missing = missingCookieGroups(spec, raw);
      throw new Problem('session_expired', L('Trình duyệt chưa đăng nhập hệ thống nguồn', 'The browser is not signed in to the source system'), L(`thiếu cookie: ${missing.join(', ')}`, `missing cookies: ${missing.join(', ')}`));
    }
    const info = await this.o.sourceInfo(source);
    const apiBase = info.apiBaseUrl ?? spec.auth.api_base_url ?? info.baseUrl;
    const client = new GuardedHttpClient({ baseUrl: apiBase, cookies, spec, fetchImpl: this.o.fetchImpl });
    return { cookies, session: await probeSession(spec, client) };
  }

  /**
   * Mẫu quyền host tiện ích cần xin để đọc cookie phiên: origin của hệ thống, cộng tên miền cha nếu
   * adapter khai cookie_domain VÀ host thật nằm dưới tên miền đó (dev chạy localhost thì không cần).
   */
  permissionOrigins(source: string, baseUrl: string): string[] {
    const u = new URL(baseUrl);
    const d = this.cookieDomain(source, baseUrl);
    return d === u.hostname ? [`${u.origin}/*`] : [`${u.origin}/*`, `${u.protocol}//*.${d}/*`];
  }

  /** Tên miền để tìm cookie phiên: cookie_domain của adapter nếu host nằm dưới nó, không thì chính host. */
  cookieDomain(source: string, baseUrl: string): string {
    const host = new URL(baseUrl).hostname;
    const d = this.spec(source).auth.cookie_domain?.replace(/^\./, '');
    return d && (host === d || host.endsWith(`.${d}`)) ? d : host;
  }

  /**
   * Dò bộ cookie phiên tối thiểu: probe với TẤT CẢ cookie trình duyệt gửi, được thì bớt dần từng cookie
   * (bớt mà vẫn sống ⇒ không cần). Chỉ đọc (session_probe), không lưu gì. Dùng khi adapter khai sai tên.
   */
  async discoverCookies(source: string, all: Record<string, string>, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
    const spec = this.spec(source);
    const info = await this.o.sourceInfo(source);
    const apiBase = info.apiBaseUrl ?? spec.auth.api_base_url ?? info.baseUrl;
    const gap = Math.max(spec.rate_limit.delay_between_calls_ms, 500);
    let probes = 0;
    const tryWith = async (cookies: Record<string, string>): Promise<{ ok: true } | { ok: false; detail: string }> => {
      if (probes++) await sleep(gap);
      try {
        await probeSession(spec, new GuardedHttpClient({ baseUrl: apiBase, cookies, spec, fetchImpl: this.o.fetchImpl }));
        return { ok: true };
      } catch (e) {
        if (e instanceof Problem && e.type === 'session_expired') return { ok: false, detail: e.detail ?? e.title };
        throw e;
      }
    };
    const first = await tryWith(all);
    if (!first.ok) return { ok: false as const, detail: first.detail, probes };
    const keep = { ...all };
    for (const name of Object.keys(all)) {
      const { [name]: _drop, ...without } = keep;
      if ((await tryWith(without)).ok) delete keep[name];
    }
    return { ok: true as const, required: Object.keys(keep), probes };
  }

  /** Cookie định danh (stable_cookies) có trong cookies_required — tiện ích được phép gửi thiếu. */
  stableCookies(source: string): string[] {
    try {
      const spec = this.spec(source);
      const names = cookieNames(spec);
      return spec.auth.stable_cookies.filter((n) => names.includes(n));
    } catch { return []; }
  }

  /**
   * Bổ sung cookie định danh tiện ích gửi thiếu bằng giá trị của phiên đang lưu của CHÍNH người này. Chỉ gọi khi
   * kết nối hiện tại của người đó là qua tiện ích và chưa thu hồi. Trả tên đã bổ sung (không bao giờ log giá trị).
   */
  async fillStableCookies(userId: number, source: string, raw: Record<string, string>): Promise<{ cookies: Record<string, string>; filled: string[] }> {
    const want = this.stableCookies(source).filter((n) => !raw[n]);
    if (!want.length) return { cookies: raw, filled: [] };
    const prev = await this.o.secrets.get<SessionSecret>(this.sessionRef(userId, source));
    const filled = want.filter((n) => !!prev?.cookies[n]);
    return { cookies: { ...raw, ...Object.fromEntries(filled.map((n) => [n, prev!.cookies[n]!])) }, filled };
  }

  /**
   * Kiểm tra phiên ĐANG LƯU bằng session_probe (không lấy phiên mới): còn sống / nguồn từ chối phiên (hết hạn thật) /
   * không có trong kho / nguồn đang lỗi. Dùng khi spider bị 401/403 để không kết luận "hết hạn" khi phiên vẫn tốt.
   */
  async checkStoredSession(userId: number, source: string): Promise<{ state: 'alive' | 'expired' | 'missing' | 'unavailable'; detail?: string }> {
    const cur = await this.o.secrets.get<SessionSecret>(this.sessionRef(userId, source));
    if (!cur) return { state: 'missing' };
    try {
      await this.verifyCookies(source, cur.cookies);
      return { state: 'alive' };
    } catch (e) {
      if (e instanceof Problem && e.type === 'session_expired') return { state: 'expired', detail: e.detail ?? e.title };
      return { state: 'unavailable', detail: e instanceof Problem ? e.detail ?? e.title : (e as Error).message };
    }
  }

  /**
   * Phiên dùng ngay cho một lượt chạy (vd runner chạy kịch bản trên máy chủ): phiên đang lưu còn hạn ⇒ dùng; không thì lấy
   * phiên mới khi cách xác thực cho phép (mật khẩu / SSO), còn lại báo cần phiên mới từ người dùng.
   */
  async sessionFor(userId: number, source: string, method: AuthMethod): Promise<SessionSecret> {
    const cur = await this.o.secrets.get<SessionSecret>(this.sessionRef(userId, source));
    if (cur && (!cur.expires_at || new Date(cur.expires_at).getTime() > Date.now() + 60_000)) return cur;
    return this.renew(userId, source, method);
  }

  /**
   * Giữ phiên (T10): gọi session_probe bằng ĐÚNG cookie đang lưu — một request nhẹ làm phiên kiểu "trượt" (hết hạn khi để
   * lâu không dùng) được gia hạn. Nguồn cấp cookie mới qua Set-Cookie ⇒ lưu đè. Không lấy phiên mới, không đăng nhập.
   *   alive — phiên còn sống · expired — nguồn từ chối phiên · missing — kho bí mật không có phiên · unavailable — nguồn lỗi
   */
  async keepAlive(userId: number, source: string): Promise<{ state: 'alive' | 'expired' | 'missing' | 'unavailable'; rotated: number; detail?: string }> {
    const ref = this.sessionRef(userId, source);
    const cur = await this.o.secrets.get<SessionSecret>(ref);
    if (!cur) return { state: 'missing', rotated: 0 };
    const spec = this.spec(source);
    const info = await this.o.sourceInfo(source);
    const client = new GuardedHttpClient({ baseUrl: info.apiBaseUrl ?? spec.auth.api_base_url ?? info.baseUrl, cookies: cur.cookies, spec, fetchImpl: this.o.fetchImpl });
    try {
      await probeSession(spec, client);
    } catch (e) {
      if (e instanceof Problem && e.type === 'session_expired') return { state: 'expired', rotated: 0, detail: e.detail ?? e.title };
      return { state: 'unavailable', rotated: 0, detail: e instanceof Problem ? e.detail ?? e.title : (e as Error).message };
    }
    const rotated = Object.keys(client.rotated).length;
    if (rotated) await this.o.secrets.put(ref, { ...cur, cookies: { ...cur.cookies, ...client.rotated } });
    return { state: 'alive', rotated };
  }

  /** Phiên do tiện ích trình duyệt gửi về (đã qua verifyCookies). */
  async saveSession(userId: number, source: string, cookies: Record<string, string>): Promise<SessionSecret> {
    const secret: SessionSecret = { cookies, obtained_at: new Date().toISOString() };
    await this.o.secrets.put(this.sessionRef(userId, source), secret);
    return secret;
  }

  /** Lấy phiên mới theo cách xác thực của kết nối và ghi vào vault. */
  async renew(userId: number, source: string, method: AuthMethod): Promise<SessionSecret> {
    if (method === 'cookie') {
      throw new Problem('session_expired', L('Cookie đã hết hạn', 'Cookie has expired'), L('Quản trị cần dán cookie mới cho kết nối này', 'An admin needs to paste a new cookie for this connection'));
    }
    if (method === 'extension') {
      throw new Problem('session_expired', L('Phiên từ tiện ích trình duyệt đã hết hạn', 'Session from the browser extension has expired'),
        L('Mở hệ thống nguồn trên trình duyệt có cài tiện ích Vala và đăng nhập — tiện ích tự gửi phiên mới',
          'Open the source system in a browser with the Vala extension installed and sign in — the extension sends the new session automatically'));
    }
    if (method === 'sso') {
      if (!this.o.sso) throw new Problem('session_expired', L('Chưa cấu hình SSO cho luồng uỷ quyền', 'SSO is not configured for the authorization flow'));
      return this.o.sso.deriveAppSession(userId, source);
    }
    const cred = await this.o.secrets.get<SourceCredential>(this.credentialRef(userId, source));
    if (!cred) throw new Problem('invalid_credentials', L('Chưa có tài khoản/mật khẩu cho kết nối này', 'No username/password saved for this connection'));
    const info = await this.o.sourceInfo(source);
    const r = await passwordLogin({ spec: this.spec(source), baseUrl: info.baseUrl, loginHosts: info.loginHosts, credential: cred, fetchImpl: this.o.fetchImpl })
      .catch(async (e: unknown) => {
        if (e instanceof Problem && e.type === 'otp_required') await this.o.onOtpRequired?.(source).catch(() => {});
        throw e;
      });
    const secret: SessionSecret = { cookies: r.cookies, obtained_at: new Date().toISOString(), expires_at: r.expires_at };
    await this.o.secrets.put(this.sessionRef(userId, source), secret);
    return secret;
  }

  /** Xoá mọi bí mật của kết nối (thu hồi / xoá kết nối). */
  async destroy(userId: number, source: string): Promise<void> {
    await this.o.secrets.destroy(this.sessionRef(userId, source));
    await this.o.secrets.destroy(this.credentialRef(userId, source));
  }
}

/** Lỗi đăng nhập mà thử lại chỉ làm hại (khoá tài khoản nguồn): dừng kết nối cho tới khi quản trị sửa. */
export function isPermanentLoginError(e: unknown): e is Problem {
  return e instanceof Problem && (e.type === 'invalid_credentials' || e.type === 'otp_required');
}

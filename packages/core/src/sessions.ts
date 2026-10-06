/**
 * Quản lý phiên uỷ quyền của một người dùng (phương án, mục 08):
 *
 *   vault://{tenant}/users/{id}/sso   — refresh token SSO: một bộ cho mọi hệ thống nguồn
 *   vault://{tenant}/users/{id}/egov  — phiên ứng dụng eGov, phái sinh từ SSO, có hạn riêng
 *
 * Phiên ứng dụng hỏng mà SSO còn hiệu lực ⇒ chỉ lấy lại đúng phiên đó, không bắt đăng nhập lại.
 * SSO từ chối refresh token ⇒ session_expired ⇒ người dùng phải đăng nhập lại qua giao diện.
 */
import { bootstrapAppSession, findSpec, loadAllSpecs, type AdapterSpec, type FetchLike } from './adapter/index.js';
import { Problem, L } from './errors.js';
import { vaultRef, type SecretStore, type SessionSecret } from './secrets.js';
import { toSsoSecret, type SsoClient, type SsoSecret, type SsoTokens } from './sso.js';

export interface SessionManagerOptions {
  secrets: SecretStore;
  sso: SsoClient;
  tenant: string;
  /** base_url theo source. Không có ⇒ phải truyền resolveBaseUrl. */
  baseUrls?: Record<string, string>;
  resolveBaseUrl?: (source: string) => Promise<string>;
  specs?: AdapterSpec[];
  /** fetch cho chuỗi chuyển hướng lấy phiên (test truyền bản giả lập). */
  fetchImpl?: FetchLike;
  /** Làm mới access token khi còn ít hơn chừng này giây. */
  refreshSkewSeconds?: number;
}

export class SessionManager {
  /** Khoá theo người dùng trong một tiến trình: refresh token thường bị xoay vòng, hai lần refresh
   *  song song sẽ khiến lần sau nhận invalid_grant và đánh dấu nhầm là hết phiên. */
  private readonly locks = new Map<number, Promise<unknown>>();

  constructor(private readonly o: SessionManagerOptions) {}

  ssoRef(userId: number) {
    return vaultRef(this.o.tenant, userId, 'sso');
  }

  private async withLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(userId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(userId, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(userId) === run) this.locks.delete(userId);
    }
  }

  async saveSso(userId: number, tokens: SsoTokens, sub: string): Promise<SsoSecret> {
    const secret = toSsoSecret(tokens, sub);
    await this.o.secrets.put(this.ssoRef(userId), secret);
    return secret;
  }

  /** Access token còn hạn; tự refresh khi sắp hết. `force` bỏ qua token đang giữ. */
  accessToken(userId: number, force = false): Promise<string> {
    return this.withLock(userId, async () => {
      const s = await this.o.secrets.get<SsoSecret>(this.ssoRef(userId));
      if (!s) throw new Problem('session_expired', L('Chưa có phiên SSO', 'No SSO session yet'), L('Người dùng cần đăng nhập để uỷ quyền', 'The user needs to sign in to authorize'));
      const skew = (this.o.refreshSkewSeconds ?? 60) * 1000;
      if (!force && new Date(s.access_expires_at).getTime() - Date.now() > skew) return s.access_token;
      try {
        const t = await this.o.sso.refresh(s.refresh_token);
        const next = toSsoSecret(t, s.sub, s.refresh_token);
        await this.o.secrets.put(this.ssoRef(userId), next);
        return next.access_token;
      } catch (e) {
        // Refresh token chết: xoá hẳn khỏi vault để không ai dùng lại được.
        if (e instanceof Problem && e.type === 'session_expired') await this.o.secrets.destroy(this.ssoRef(userId));
        throw e;
      }
    });
  }

  private async baseUrl(source: string): Promise<string> {
    const u = this.o.baseUrls?.[source] ?? (await this.o.resolveBaseUrl?.(source));
    if (!u) throw new Error(`Không biết base_url của ${source}`);
    return u;
  }

  /** Lấy phiên ứng dụng mới từ SSO rồi ghi đè vào vault. */
  async deriveAppSession(userId: number, source: string): Promise<SessionSecret> {
    const specs = this.o.specs ?? loadAllSpecs();
    const spec = specs.find((s) => s.source_system === source && s.auth.bootstrap) ?? specs.find((s) => s.source_system === source);
    if (!spec) throw new Error(`Chưa có cấu hình adapter cho ${source}`);
    const baseUrl = await this.baseUrl(source);
    const attempt = async (force: boolean) => bootstrapAppSession({
      spec, baseUrl, ssoOrigin: this.o.sso.cfg.origin, accessToken: await this.accessToken(userId, force), fetchImpl: this.o.fetchImpl,
    });
    let r;
    try {
      r = await attempt(false);
    } catch (e) {
      // Access token có thể đã bị SSO thu hồi trước hạn: refresh cưỡng bức và thử lại một lần.
      if (!(e instanceof Problem && e.type === 'session_expired')) throw e;
      r = await attempt(true);
    }
    const secret: SessionSecret = { cookies: r.cookies, obtained_at: new Date().toISOString(), expires_at: r.expires_at };
    await this.o.secrets.put(vaultRef(this.o.tenant, userId, source), secret);
    return secret;
  }

  /** Thu hồi toàn bộ: báo SSO huỷ refresh token, xoá khỏi vault. */
  async revokeSso(userId: number): Promise<void> {
    const s = await this.o.secrets.get<SsoSecret>(this.ssoRef(userId));
    if (s) await this.o.sso.revoke(s.refresh_token);
    await this.o.secrets.destroy(this.ssoRef(userId));
  }
}

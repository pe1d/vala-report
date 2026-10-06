/**
 * Client SSO theo OAuth2 / OpenID Connect authorization code — dùng được với mọi SSO chuẩn OIDC (WSO2 như Bkav SSO,
 * Keycloak, SSO tỉnh, Azure AD…). Không cần cài thêm gì: nơi triển khai đăng ký Vala làm một client trên SSO của họ.
 *  - SSO_ISSUER ⇒ tự đọc địa chỉ các endpoint từ {issuer}/.well-known/openid-configuration (discover()).
 *  - Không có SSO_ISSUER ⇒ SSO_ORIGIN + đường dẫn mặc định của WSO2 (/oauth2/authorize …), ghi đè từng cái bằng SSO_*_URL.
 *  - PKCE (S256) cho luồng đăng nhập (SSO_PKCE=false để tắt nếu SSO không hỗ trợ).
 *
 * Hai việc dùng chung một client:
 *  - đăng nhập cổng báo cáo: scope "openid profile email";
 *  - uỷ quyền lấy dữ liệu: thêm "offline_access" để nhận refresh_token. Refresh token là thứ DUY NHẤT
 *    cho phép hệ thống tự lấy lại phiên khi người dùng không ngồi trước máy. Không bao giờ lưu mật khẩu.
 *
 * Mọi địa chỉ đọc từ biến môi trường SSO_*. Dev trỏ vào một SSO giả lập nếu cần.
 */
import { createHash, randomBytes } from 'node:crypto';
import { env, envBool } from './env.js';
import { Problem, L } from './errors.js';
import type { FetchLike } from './adapter/http.js';

export interface SsoConfig {
  /** Gốc của SSO, vd https://sso.bkav.com — cũng là host được phép gửi access token trong chuỗi chuyển hướng. */
  origin: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  revokeUrl?: string;
  clientId: string;
  clientSecret: string;
  loginScope: string;
  grantScope: string;
  /** Issuer OIDC (vd https://sso.tinh.gov.vn/realms/cong-chuc) — có thì tự đọc endpoint (discover). */
  issuer?: string;
  /** Endpoint đặt tay bằng SSO_*_URL — discovery không ghi đè. */
  pinned: Array<'authorizeUrl' | 'tokenUrl' | 'userinfoUrl' | 'revokeUrl'>;
  pkce: boolean;
  /** Lần đầu đăng nhập SSO: ghép với tài khoản cổng có sẵn theo các trường này (theo thứ tự). */
  matchBy: Array<'email' | 'username'>;
  /** Claim chứa tên đăng nhập trong userinfo (Keycloak/WSO2: preferred_username). */
  usernameClaim: string;
  /** Chưa có tài khoản cổng ⇒ tự tạo (người dùng thường). Mặc định tắt: quản trị tạo / nhập người dùng trước. */
  autoCreate: boolean;
}

/** Đơn vị chưa có SSO ⇒ địa chỉ giả không phân giải được: luồng SSO báo lỗi rõ thay vì làm dừng cả API/worker. */
const SSO_NOT_CONFIGURED = 'https://sso-chua-cau-hinh.invalid';

export function ssoConfigFromEnv(): SsoConfig {
  const issuer = (process.env.SSO_ISSUER ?? '').trim().replace(/\/$/, '') || undefined;
  const raw = (process.env.SSO_ORIGIN ?? '').trim() || (issuer ? new URL(issuer).origin : '');
  if (!raw && envBool('LOGIN_SSO')) throw new Error('LOGIN_SSO=true nhưng chưa đặt SSO_ISSUER hoặc SSO_ORIGIN (địa chỉ SSO của đơn vị)');
  const pinned = ([['SSO_AUTHORIZE_URL', 'authorizeUrl'], ['SSO_TOKEN_URL', 'tokenUrl'], ['SSO_USERINFO_URL', 'userinfoUrl'], ['SSO_REVOKE_URL', 'revokeUrl']] as const)
    .filter(([k]) => !!process.env[k]).map(([, f]) => f);
  const matchBy = (process.env.SSO_MATCH_BY ?? 'email,username').split(',').map((x) => x.trim())
    .filter((x): x is 'email' | 'username' => x === 'email' || x === 'username');
  const origin = (raw || SSO_NOT_CONFIGURED).replace(/\/$/, '');
  return {
    origin,
    // Đường dẫn chuẩn của WSO2 Identity Server (vd Bkav SSO iam.bkav.com).
    authorizeUrl: process.env.SSO_AUTHORIZE_URL ?? `${origin}/oauth2/authorize`,
    tokenUrl: process.env.SSO_TOKEN_URL ?? `${origin}/oauth2/token`,
    userinfoUrl: process.env.SSO_USERINFO_URL ?? `${origin}/oauth2/userinfo`,
    revokeUrl: process.env.SSO_REVOKE_URL ?? `${origin}/oauth2/revoke`,
    clientId: raw ? env('SSO_CLIENT_ID') : process.env.SSO_CLIENT_ID || 'chua-cau-hinh',
    clientSecret: raw ? env('SSO_CLIENT_SECRET') : process.env.SSO_CLIENT_SECRET || 'chua-cau-hinh',
    loginScope: process.env.SSO_LOGIN_SCOPE ?? 'openid profile email',
    grantScope: process.env.SSO_GRANT_SCOPE ?? 'openid offline_access',
    issuer, pinned, matchBy,
    pkce: process.env.SSO_PKCE !== 'false',
    usernameClaim: process.env.SSO_USERNAME_CLAIM ?? 'preferred_username',
    autoCreate: envBool('SSO_AUTO_CREATE'),
  };
}

export interface SsoTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type?: string;
}

export interface SsoUser {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  [claim: string]: unknown;
}

/** PKCE: code_verifier ngẫu nhiên + code_challenge = base64url(sha256(verifier)). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Thông tin SSO của một người dùng, nằm trong vault ở vault://{tenant}/users/{id}/sso. */
export interface SsoSecret {
  access_token: string;
  access_expires_at: string;
  refresh_token: string;
  refresh_expires_at?: string;
  sub: string;
  obtained_at: string;
}

export class SsoClient {
  private readonly fetchImpl: FetchLike;
  private discovered: Promise<void> | null = null;
  constructor(readonly cfg: SsoConfig, fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? ((u, i) => fetch(u, i));
  }

  /**
   * Có SSO_ISSUER ⇒ đọc {issuer}/.well-known/openid-configuration một lần, điền các endpoint chưa đặt tay. Lỗi ⇒ lần
   * gọi sau thử lại (SSO tạm không tới được lúc khởi động không làm hỏng vĩnh viễn).
   */
  discover(): Promise<void> {
    if (!this.cfg.issuer) return Promise.resolve();
    this.discovered ??= (async () => {
      const res = await this.fetchImpl(`${this.cfg.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`SSO discovery → HTTP ${res.status}`);
      const d = (await res.json()) as Record<string, string | undefined>;
      const set = (f: SsoConfig['pinned'][number], v: string | undefined) => { if (v && !this.cfg.pinned.includes(f)) this.cfg[f] = v; };
      set('authorizeUrl', d.authorization_endpoint);
      set('tokenUrl', d.token_endpoint);
      set('userinfoUrl', d.userinfo_endpoint);
      set('revokeUrl', d.revocation_endpoint);
    })().catch((e) => { this.discovered = null; throw e; });
    return this.discovered;
  }

  authorizeUrl(o: { state: string; redirectUri: string; scope: string; prompt?: 'login' | 'consent'; codeChallenge?: string }): string {
    const u = new URL(this.cfg.authorizeUrl);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.cfg.clientId);
    u.searchParams.set('redirect_uri', o.redirectUri);
    u.searchParams.set('scope', o.scope);
    u.searchParams.set('state', o.state);
    if (o.prompt) u.searchParams.set('prompt', o.prompt);
    if (o.codeChallenge) {
      u.searchParams.set('code_challenge', o.codeChallenge);
      u.searchParams.set('code_challenge_method', 'S256');
    }
    return u.toString();
  }

  private async tokenRequest(body: Record<string, string>): Promise<SsoTokens> {
    await this.discover();
    let res: Response;
    try {
      res = await this.fetchImpl(this.cfg.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams(body).toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new Error(`Không gọi được SSO token endpoint: ${(e as Error).name}`);
    }
    const json = (await res.json().catch(() => ({}))) as Partial<SsoTokens> & { error?: string };
    // invalid_grant = refresh token/code đã hết hạn hoặc bị thu hồi ⇒ người dùng phải đăng nhập lại.
    if (json.error === 'invalid_grant') throw new Problem('session_expired', L('Phiên SSO đã hết hạn', 'SSO session has expired'), L('SSO từ chối refresh token', 'SSO rejected the refresh token'));
    if (!res.ok || !json.access_token) throw new Error(`SSO token endpoint → HTTP ${res.status} ${json.error ?? ''}`.trim());
    return json as SsoTokens;
  }

  exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<SsoTokens> {
    return this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, ...(codeVerifier ? { code_verifier: codeVerifier } : {}) });
  }

  refresh(refreshToken: string): Promise<SsoTokens> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async userinfo(accessToken: string): Promise<SsoUser> {
    await this.discover();
    const res = await this.fetchImpl(this.cfg.userinfoUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Problem('unauthenticated', L('SSO không xác nhận được người dùng', 'SSO could not verify the user'));
    const u = (await res.json()) as SsoUser;
    if (!u.sub) throw new Problem('unauthenticated', L('SSO không trả định danh người dùng', 'SSO did not return a user identifier'));
    return u;
  }

  /** Thu hồi phía SSO. Lỗi ở đây không chặn việc thu hồi phía mình (vault vẫn bị xoá). */
  async revoke(token: string): Promise<void> {
    await this.discover().catch(() => {});
    if (!this.cfg.revokeUrl) return;
    await this.fetchImpl(this.cfg.revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ token, token_type_hint: 'refresh_token' }).toString(),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
}

export function toSsoSecret(t: SsoTokens, sub: string, previousRefresh?: string, now = Date.now()): SsoSecret {
  const refresh = t.refresh_token ?? previousRefresh;
  if (!refresh) throw new Problem('grant_required', L('SSO không cấp refresh token', 'SSO did not issue a refresh token'), L('Thiếu scope offline_access', 'Missing offline_access scope'));
  return {
    access_token: t.access_token,
    access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    refresh_token: refresh,
    refresh_expires_at: t.refresh_expires_in ? new Date(now + t.refresh_expires_in * 1000).toISOString() : undefined,
    sub,
    obtained_at: new Date(now).toISOString(),
  };
}

/**
 * Client Bkav SSO theo OAuth2 authorization code (mục 07, adapter-egov.yaml auth.sso.preferred_flow).
 *
 * Hai việc dùng chung một client:
 *  - đăng nhập cổng báo cáo: scope "openid profile email";
 *  - uỷ quyền lấy dữ liệu: thêm "offline_access" để nhận refresh_token. Refresh token là thứ DUY NHẤT
 *    cho phép hệ thống tự lấy lại phiên khi người dùng không ngồi trước máy. Không bao giờ lưu mật khẩu.
 *
 * Mọi địa chỉ đọc từ biến môi trường SSO_*. Dev trỏ vào một SSO giả lập nếu cần.
 */
import { env } from './env.js';
import { Problem } from './errors.js';
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
}

export function ssoConfigFromEnv(): SsoConfig {
  const origin = env('SSO_ORIGIN').replace(/\/$/, '');
  return {
    origin,
    // Đường dẫn chuẩn của WSO2 Identity Server (iam.bkav.com).
    authorizeUrl: process.env.SSO_AUTHORIZE_URL ?? `${origin}/oauth2/authorize`,
    tokenUrl: process.env.SSO_TOKEN_URL ?? `${origin}/oauth2/token`,
    userinfoUrl: process.env.SSO_USERINFO_URL ?? `${origin}/oauth2/userinfo`,
    revokeUrl: process.env.SSO_REVOKE_URL ?? `${origin}/oauth2/revoke`,
    clientId: env('SSO_CLIENT_ID'),
    clientSecret: env('SSO_CLIENT_SECRET'),
    loginScope: process.env.SSO_LOGIN_SCOPE ?? 'openid profile email',
    grantScope: process.env.SSO_GRANT_SCOPE ?? 'openid offline_access',
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
  constructor(readonly cfg: SsoConfig, fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? ((u, i) => fetch(u, i));
  }

  authorizeUrl(o: { state: string; redirectUri: string; scope: string; prompt?: 'login' | 'consent' }): string {
    const u = new URL(this.cfg.authorizeUrl);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.cfg.clientId);
    u.searchParams.set('redirect_uri', o.redirectUri);
    u.searchParams.set('scope', o.scope);
    u.searchParams.set('state', o.state);
    if (o.prompt) u.searchParams.set('prompt', o.prompt);
    return u.toString();
  }

  private async tokenRequest(body: Record<string, string>): Promise<SsoTokens> {
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
    if (json.error === 'invalid_grant') throw new Problem('session_expired', 'Phiên SSO đã hết hạn', 'SSO từ chối refresh token');
    if (!res.ok || !json.access_token) throw new Error(`SSO token endpoint → HTTP ${res.status} ${json.error ?? ''}`.trim());
    return json as SsoTokens;
  }

  exchangeCode(code: string, redirectUri: string): Promise<SsoTokens> {
    return this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  refresh(refreshToken: string): Promise<SsoTokens> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async userinfo(accessToken: string): Promise<SsoUser> {
    const res = await this.fetchImpl(this.cfg.userinfoUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Problem('unauthenticated', 'SSO không xác nhận được người dùng');
    const u = (await res.json()) as SsoUser;
    if (!u.sub) throw new Problem('unauthenticated', 'SSO không trả định danh người dùng');
    return u;
  }

  /** Thu hồi phía SSO. Lỗi ở đây không chặn việc thu hồi phía mình (vault vẫn bị xoá). */
  async revoke(token: string): Promise<void> {
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
  if (!refresh) throw new Problem('grant_required', 'SSO không cấp refresh token', 'Thiếu scope offline_access');
  return {
    access_token: t.access_token,
    access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    refresh_token: refresh,
    refresh_expires_at: t.refresh_expires_in ? new Date(now + t.refresh_expires_in * 1000).toISOString() : undefined,
    sub,
    obtained_at: new Date(now).toISOString(),
  };
}

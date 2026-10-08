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
import { envBool } from './env.js';
import { Problem, L } from './errors.js';
import { claimsCheck, decodeJwtPayload, looksLikeJwt, type Claims } from './jwt-claims.js';
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
  /** SSO không trả email ⇒ ghép <tên đăng nhập>@emailDomain (vd bkav.com). Trống ⇒ không ghép. */
  emailDomain?: string;
  /** Đủ địa chỉ SSO + client id/secret để đăng nhập SSO. false ⇒ `problem` nói thiếu gì (API tắt nút SSO, không dừng). */
  ready: boolean;
  problem?: string;
}

/** Đơn vị chưa có SSO ⇒ địa chỉ giả không phân giải được: luồng SSO báo lỗi rõ thay vì làm dừng cả API/worker. */
const SSO_NOT_CONFIGURED = 'https://sso-chua-cau-hinh.invalid';

/** Giá trị còn là chữ mẫu trong .env.prod (chưa điền thật). */
const placeholder = (v: string) => !v || v === 'chua-dang-ky' || v === 'chua-cau-hinh' || /^<.*>$/.test(v);

/**
 * Cấu hình SSO từ biến môi trường. KHÔNG bao giờ dừng chương trình vì cấu hình SSO thiếu/sai: API và worker phải chạy
 * được (lấy dữ liệu theo lịch không phụ thuộc SSO); thiếu gì ⇒ ready=false + problem, API tắt nút SSO và ghi cảnh báo.
 */
export function ssoConfigFromEnv(): SsoConfig {
  return ssoConfigFrom(process.env);
}

/**
 * Cấu hình SSO của một đơn vị khác Bkav (core.tenants.sso, multi-tenant): cùng các khoá như .env nhưng viết thường, bỏ
 * tiền tố SSO_ (origin, issuer, client_id, authorize_url, …); client secret lấy từ vault, không nằm trong CSDL.
 */
export function ssoConfigFromJson(j: Record<string, unknown>, clientSecret: string | null): SsoConfig {
  const src: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(j)) {
    if (v === null || v === undefined) continue;
    src[`SSO_${k.toUpperCase()}`] = Array.isArray(v) ? v.join(',') : String(v);
  }
  delete src.SSO_CLIENT_SECRET;
  if (clientSecret) src.SSO_CLIENT_SECRET = clientSecret;
  return ssoConfigFrom(src);
}

function ssoConfigFrom(env: Record<string, string | undefined>): SsoConfig {
  const envBool = (name: string) => { const v = env[name]; return v === 'true' || v === '1'; };
  const problems: string[] = [];
  let issuer = (env.SSO_ISSUER ?? '').trim().replace(/\/$/, '') || undefined;
  let issuerOrigin = '';
  if (issuer) {
    try { issuerOrigin = new URL(issuer).origin; } catch { problems.push(`SSO_ISSUER không phải địa chỉ hợp lệ: "${issuer}"`); issuer = undefined; }
  }
  let raw = (env.SSO_ORIGIN ?? '').trim() || issuerOrigin;
  if (raw) { try { new URL(raw); } catch { problems.push(`SSO_ORIGIN không phải địa chỉ hợp lệ: "${raw}"`); raw = ''; } }
  if (!raw) problems.push('chưa đặt SSO_ISSUER hoặc SSO_ORIGIN (địa chỉ SSO của đơn vị)');
  const clientId = (env.SSO_CLIENT_ID ?? '').trim();
  const clientSecret = (env.SSO_CLIENT_SECRET ?? '').trim();
  if (placeholder(clientId)) problems.push('chưa có SSO_CLIENT_ID (đội quản trị SSO cấp)');
  if (placeholder(clientSecret)) problems.push('chưa có SSO_CLIENT_SECRET (đội quản trị SSO cấp)');
  const pinned = ([['SSO_AUTHORIZE_URL', 'authorizeUrl'], ['SSO_TOKEN_URL', 'tokenUrl'], ['SSO_USERINFO_URL', 'userinfoUrl'], ['SSO_REVOKE_URL', 'revokeUrl']] as const)
    .filter(([k]) => !!env[k]).map(([, f]) => f);
  const matchBy = (env.SSO_MATCH_BY ?? 'email,username').split(',').map((x) => x.trim())
    .filter((x): x is 'email' | 'username' => x === 'email' || x === 'username');
  const origin = (raw || SSO_NOT_CONFIGURED).replace(/\/$/, '');
  return {
    origin,
    // Đường dẫn chuẩn của WSO2 Identity Server (vd Bkav SSO iam.bkav.com).
    authorizeUrl: env.SSO_AUTHORIZE_URL ?? `${origin}/oauth2/authorize`,
    tokenUrl: env.SSO_TOKEN_URL ?? `${origin}/oauth2/token`,
    userinfoUrl: env.SSO_USERINFO_URL ?? `${origin}/oauth2/userinfo`,
    revokeUrl: env.SSO_REVOKE_URL ?? `${origin}/oauth2/revoke`,
    clientId: clientId || 'chua-cau-hinh',
    clientSecret: clientSecret || 'chua-cau-hinh',
    loginScope: env.SSO_LOGIN_SCOPE ?? 'openid profile email',
    grantScope: env.SSO_GRANT_SCOPE ?? 'openid offline_access',
    issuer, pinned, matchBy,
    pkce: env.SSO_PKCE !== 'false',
    usernameClaim: env.SSO_USERNAME_CLAIM ?? 'preferred_username',
    autoCreate: envBool('SSO_AUTO_CREATE'),
    emailDomain: (env.SSO_EMAIL_DOMAIN ?? '').trim().replace(/^@/, '').toLowerCase() || undefined,
    ready: problems.length === 0,
    ...(problems.length ? { problem: problems.join('; ') } : {}),
  };
}

export interface SsoTokens {
  access_token: string;
  /** OIDC: JWT chứa claim người dùng (scope openid) — dùng khi userinfo trả JWT / lỗi / thiếu trường. */
  id_token?: string;
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

const USERNAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
/** sub dạng UUID (WSO2 bản mới) — không phải tên đăng nhập, không đoán từ đây. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tên đăng nhập SSO: claim usernameClaim (preferred_username); không có thì sub khi sub là tên đăng nhập — WSO2 hay để
 * `dieptx` hoặc `dieptx@carbon.super` (carbon.super = tenant mặc định của WSO2, bỏ đi). sub là UUID ⇒ null.
 */
export function usernameOf(who: SsoUser, o: { usernameClaim: string }): string | null {
  const claim = who[o.usernameClaim];
  if (typeof claim === 'string' && claim.trim()) return claim.trim().toLowerCase();
  if (typeof who.sub !== 'string' || UUID.test(who.sub)) return null;
  // Bỏ tenant mặc định (@carbon.super) và miền kho người dùng (PRIMARY/…) mà WSO2 hay gắn vào sub.
  const sub = who.sub.trim().toLowerCase().replace(/@carbon\.super$/, '').replace(/^[a-z0-9_-]+\//, '');
  return USERNAME.test(sub) || EMAIL.test(sub) ? sub : null;
}

/**
 * Email để ghép / tạo tài khoản: email SSO trả (trừ khi SSO báo chưa xác minh); không có ⇒ <tên đăng nhập>@emailDomain khi
 * nơi triển khai đặt SSO_EMAIL_DOMAIN (tên đăng nhập đã là email thì dùng nguyên). Không đoán được ⇒ null.
 */
export function emailOf(who: SsoUser, o: { usernameClaim: string; emailDomain?: string }): string | null {
  if (typeof who.email === 'string' && who.email.includes('@') && who.email_verified !== false) return who.email.trim().toLowerCase();
  if (!o.emailDomain) return null;
  const u = usernameOf(who, o);
  if (!u) return null;
  if (EMAIL.test(u)) return u;
  return USERNAME.test(u) ? `${u}@${o.emailDomain}` : null;
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

  authorizeUrl(o: { state: string; redirectUri: string; scope: string; prompt?: 'login' | 'consent'; codeChallenge?: string; loginHint?: string }): string {
    const u = new URL(this.cfg.authorizeUrl);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.cfg.clientId);
    u.searchParams.set('redirect_uri', o.redirectUri);
    u.searchParams.set('scope', o.scope);
    u.searchParams.set('state', o.state);
    if (o.prompt) u.searchParams.set('prompt', o.prompt);
    // Tài khoản người dùng đã nhập ở bước 1 (đăng nhập 2 bước) — IdP hỗ trợ thì điền sẵn.
    if (o.loginHint) u.searchParams.set('login_hint', o.loginHint);
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

  /**
   * Thông tin người dùng gộp từ ba nguồn SSO trả, ưu tiên tăng dần: access token (nếu là JWT — WSO2) < id_token < userinfo
   * (JSON hoặc JWT — Bkav SSO trả JWT). Mỗi JWT được kiểm iss/aud/hạn (jwt-claims.ts). Các nguồn phải cùng sub (cùng người),
   * khác ⇒ từ chối. `diag` nhận tình trạng từng nguồn (dùng/loại vì sao — KHÔNG kèm giá trị) để ghi log chẩn đoán.
   */
  async userinfo(accessToken: string, idToken?: string, diag?: (d: Record<string, string>) => void): Promise<SsoUser> {
    await this.discover();
    const check = { issuer: this.cfg.issuer, clientId: this.cfg.clientId };
    const d: Record<string, string> = {};
    const fromJwt = (name: string, token: string | undefined, requireAud: boolean): Claims | null => {
      if (!token) { d[name] = 'không có'; return null; }
      const c = decodeJwtPayload(token);
      if (!c) { d[name] = 'không phải JWT'; return null; }
      const r = claimsCheck(c, { ...check, requireAud });
      if ('reason' in r) { d[name] = `loại: ${r.reason}`; return null; }
      d[name] = `dùng (${Object.keys(r.ok).filter((k) => !['iss', 'aud', 'exp', 'iat', 'nbf', 'jti', 'azp', 'at_hash', 'c_hash', 'nonce', 'auth_time', 'amr', 'acr', 'sid', 'client_id', 'scope', 'token_type', 'aut', 'binding_type', 'binding_ref', 'isk'].includes(k)).sort().join(',')})`;
      return r.ok;
    };
    const fromAccess = fromJwt('access_token', accessToken, false);
    const fromId = fromJwt('id_token', idToken, true);

    let fromInfo: Claims | null = null;
    try {
      const res = await this.fetchImpl(this.cfg.userinfoUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json, application/jwt' },
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      if (!res.ok) d.userinfo = `HTTP ${res.status}`;
      else if (/jwt/i.test(res.headers.get('content-type') ?? '') || looksLikeJwt(text)) {
        const c = decodeJwtPayload(text);
        const r = c ? claimsCheck(c, { ...check, requireAud: false }) : null;
        if (r && 'ok' in r) { fromInfo = r.ok; d.userinfo = 'jwt'; } else d.userinfo = r ? `jwt loại: ${r.reason}` : 'jwt không đọc được';
      } else {
        try { fromInfo = JSON.parse(text) as Claims; d.userinfo = 'json'; } catch { d.userinfo = 'không phải JSON/JWT'; }
      }
    } catch (e) {
      d.userinfo = `lỗi ${(e as Error).name}`;
    }
    diag?.(d);

    const subs = [fromAccess, fromId, fromInfo].map((c) => c?.sub).filter((x): x is string => typeof x === 'string' && !!x);
    if (new Set(subs).size > 1) {
      throw new Problem('unauthenticated', L('SSO trả thông tin của hai người khác nhau', 'SSO returned information for two different users'));
    }
    const u = { ...(fromAccess ?? {}), ...(fromId ?? {}), ...(fromInfo ?? {}) } as SsoUser;
    if (!u.sub || typeof u.sub !== 'string') {
      const s = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('; ');
      throw new Problem('unauthenticated', L('SSO không xác nhận được người dùng', 'SSO could not verify the user'), L(s, s));
    }
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

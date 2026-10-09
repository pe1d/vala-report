/**
 * Một redirect URI duy nhất cho SSO: {PUBLIC_API_URL}/api/v1/sso/callback.
 * `state` (ký HMAC, hết hạn 10 phút) cho biết đây là quay về sau khi ĐĂNG NHẬP cổng hay sau khi UỶ QUYỀN.
 */
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { DEFAULT_TENANT, Problem, emailOf, isTenantCode, pkcePair, runInTenant, sameSubject, usernameOf, withTenant, withUserContext, type SsoClient, type SsoUser, type UserContext } from '@vala/core';
import { audit } from '../audit.js';
import { issuePortalToken } from '../auth.js';
import type { ApiDeps } from '../deps.js';
import { tenantByCode } from '../login-target.js';
import { ssoFor } from '../sso-clients.js';
import { sign, verify } from '../tokens.js';

export const callbackUrl = (deps: ApiDeps) => `${deps.config.publicApiUrl}/api/v1/sso/callback`;

/** `tnt`: đơn vị đăng nhập (multi-tenant) — callback chạy trong ngữ cảnh đơn vị đó với SSO của đơn vị; không có ⇒ Bkav. */
type LoginState = { kind: 'login'; next: string; tnt?: string };
type GrantState = { kind: 'grant'; uid: number; src: string; caps: string[] };

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');
const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });

/** PKCE: code_verifier giữ trong cookie HttpOnly của trình duyệt đang đăng nhập (không đi qua URL / state). */
const PKCE_COOKIE = 'vala_sso_pkce';
const pkceCookie = (deps: ApiDeps, value: string, maxAge: number) =>
  `${PKCE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${deps.config.publicApiUrl.startsWith('https:') ? '; Secure' : ''}`;
const readCookie = (header: string | undefined, name: string) =>
  header?.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

export function grantStartUrl(deps: ApiDeps, st: Omit<GrantState, 'kind'>): string {
  const state = sign({ kind: 'grant', ...st }, deps.config.jwtSecret, 600);
  return deps.sso.authorizeUrl({ state, redirectUri: callbackUrl(deps), scope: deps.sso.cfg.grantScope });
}

export const ssoRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /**
   * Đăng nhập cổng qua Bkav SSO (tuỳ chọn, ngoài đăng nhập bằng mật khẩu). Chuyển sang /auth/sso/start bằng địa chỉ ĐẦY ĐỦ
   * của máy chủ: Vala Desktop chạy giao diện từ bản trong máy và chuyển tiếp /api hộ trang (không giữ cookie) — bước này
   * biến thành một lần điều hướng thật tới máy chủ, nên cookie PKCE được lưu đúng như trên trình duyệt thường.
   */
  type StartQuery = { next?: string; tenant?: string; login_hint?: string };
  const startQuery = (q: StartQuery) => {
    const out: Record<string, string> = { next: safeNext(q.next) };
    if (isTenantCode(q.tenant)) out.tenant = q.tenant;
    if (typeof q.login_hint === 'string' && q.login_hint.length <= 200) out.login_hint = q.login_hint;
    return new URLSearchParams(out);
  };
  app.get<{ Querystring: StartQuery }>('/auth/sso/login', async (req, reply) =>
    reply.redirect(`${deps.config.publicApiUrl.replace(/\/+$/, '')}/api/v1/auth/sso/start?${startQuery(req.query)}`));

  /** `tenant` (mã đơn vị, bước 1 của đăng nhập 2 bước) ⇒ IdP của đơn vị đó; `login_hint` ⇒ IdP điền sẵn tài khoản. */
  app.get<{ Querystring: StartQuery }>('/auth/sso/start', async (req, reply) => {
    const ma = isTenantCode(req.query.tenant) ? req.query.tenant : DEFAULT_TENANT;
    const row = await tenantByCode(deps, ma);
    const sso = row ? await ssoFor(deps, row) : null;
    if (!sso) return toWeb(reply, deps, '/dang-nhap', { loi: 'sso_loi' });
    try { await sso.discover(); } catch (e) {
      req.log.error({ err: (e as Error).message, tenant: ma }, 'không đọc được cấu hình SSO (discovery)');
      return toWeb(reply, deps, '/dang-nhap', { loi: 'sso_loi' });
    }
    const state = sign({ kind: 'login', next: safeNext(req.query.next), tnt: ma }, deps.config.jwtSecret, 600);
    let codeChallenge: string | undefined;
    if (sso.cfg.pkce) {
      const p = pkcePair();
      codeChallenge = p.challenge;
      reply.header('Set-Cookie', pkceCookie(deps, p.verifier, 600));
    }
    const loginHint = typeof req.query.login_hint === 'string' ? req.query.login_hint.slice(0, 200) : undefined;
    return reply.redirect(sso.authorizeUrl({ state, redirectUri: callbackUrl(deps), scope: sso.cfg.loginScope, codeChallenge, loginHint }));
  });

  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>('/sso/callback', async (req, reply) => {
    const st = verify<LoginState | GrantState>(req.query.state ?? '', deps.config.jwtSecret);
    if (!st) return toWeb(reply, deps, '/dang-nhap', { loi: 'state_khong_hop_le' });
    if (st.kind === 'login') {
      const verifier = readCookie(req.headers.cookie, PKCE_COOKIE);
      reply.header('Set-Cookie', pkceCookie(deps, '', 0));          // dùng một lần
      const ma = isTenantCode(st.tnt) ? st.tnt : DEFAULT_TENANT;
      const row = await tenantByCode(deps, ma);
      const sso = row ? await ssoFor(deps, row) : null;
      if (!sso) return toWeb(reply, deps, '/dang-nhap', { loi: 'sso_loi' });
      return runInTenant(ma, () => handleLogin(deps, sso, req, reply, st, req.query.code, verifier));
    }
    return handleGrant(deps, req, reply, st, req.query.code);
  });
};

function toWeb(reply: FastifyReply, deps: ApiDeps, path: string, q: Record<string, string>, hash?: Record<string, string>) {
  // PUBLIC_WEB_URL có thể kèm đường dẫn con (…/vala-report) — nối chuỗi, không dùng new URL(path, base) (bỏ mất đường dẫn con).
  const u = new URL(`${deps.config.publicWebUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  if (hash) u.hash = new URLSearchParams(hash).toString();
  return reply.redirect(u.toString());
}

async function handleLogin(deps: ApiDeps, sso: SsoClient, req: Parameters<typeof audit>[1], reply: FastifyReply, st: LoginState, code?: string, verifier?: string) {
  if (!code) return toWeb(reply, deps, '/dang-nhap', { loi: 'sso_tu_choi' });
  let who: SsoUser;
  try {
    const tokens = await sso.exchangeCode(code, callbackUrl(deps), verifier);
    // Tình trạng từng nguồn (access token / id_token / userinfo): dùng được, có những TRƯỜNG nào, hay bị loại vì sao.
    who = await sso.userinfo(tokens.access_token, tokens.id_token, (d) => req.log?.info({ nguon: d }, 'SSO: nguồn thông tin người dùng'));
    // Chỉ ghi TÊN các claim (không giá trị) — để biết SSO có trả email / tên đăng nhập không khi ghép tài khoản lỗi.
    req.log?.info({ claims: Object.keys(who).sort() }, 'SSO trả thông tin người dùng');
  } catch (e) {
    req.log?.warn({ err: (e as Error).message, detail: e instanceof Problem ? e.detail : undefined }, 'đăng nhập SSO thất bại');
    return toWeb(reply, deps, '/dang-nhap', { loi: 'sso_loi' });
  }
  const found = await findOrLinkUser(deps, sso, who, req.log);
  if ('loi' in found) return toWeb(reply, deps, '/dang-nhap', { loi: found.loi });
  const user = found;
  const token = issuePortalToken(user.id, deps.config.jwtSecret);
  // Token đặt trong fragment: không đi lên máy chủ, không vào log truy cập. Web đọc rồi xoá ngay.
  return toWeb(reply, deps, '/dang-nhap/xong', {}, { token, next: st.next });
}

async function handleGrant(deps: ApiDeps, req: Parameters<typeof audit>[1], reply: FastifyReply, st: GrantState, code?: string) {
  const back = (ok: boolean, reason?: string) =>
    toWeb(reply, deps, '/uy-quyen', { he_thong: st.src, ket_qua: ok ? 'ok' : 'loi', ...(reason ? { ly_do: reason } : {}) });
  if (!code) return back(false, 'sso_tu_choi');

  let expiresAt: string | undefined;
  try {
    const tokens = await deps.sso.exchangeCode(code, callbackUrl(deps));
    const who = await deps.sso.userinfo(tokens.access_token, tokens.id_token);
    // Người đăng nhập SSO lúc uỷ quyền phải CHÍNH LÀ người dùng cổng đã bấm uỷ quyền. Không thì dữ liệu
    // của tài khoản B sẽ bị gán cho người dùng A.
    const expected = await withTenant(deps.reader, (t) => t.one(
      'SELECT sso_subject, email FROM app_users WHERE id = $1', [st.uid], (r: { sso_subject: string | null; email: string | null }) => r));
    if (!expected.sso_subject || !sameSubject(expected.sso_subject, who.sub, expected.email)) return back(false, 'sai_tai_khoan');
    await deps.sessions.saveSso(st.uid, tokens, who.sub);
    expiresAt = (await deps.sessions.deriveAppSession(st.uid, st.src)).expires_at;
  } catch (e) {
    req.log?.warn({ err: (e as Error).message, src: st.src }, 'uỷ quyền thất bại');
    return back(false, e instanceof Problem && e.type === 'grant_required' ? 'thieu_offline_access' : 'khong_lay_duoc_phien');
  }

  await withUserContext(deps.reader, own(st.uid), async (t) => {
    await t.none(
      `UPDATE source_grants SET session_state = 'active', revoked_at = NULL, granted_at = now(), session_expires_at = $4,
              last_refresh_at = now(), refresh_fail_count = 0, last_error = NULL, scope_capabilities = $3
        WHERE app_user_id = $1 AND source_system = $2`, [st.uid, st.src, st.caps, expiresAt ?? null]);
    await audit(t, req, 'grant', { type: 'source_grant', id: st.src }, { capabilities: st.caps }, st.uid);
  });
  return back(true);
}

/**
 * Tài khoản cổng của người vừa đăng nhập SSO:
 *   1. đã liên kết (sso_subject = sub) ⇒ dùng luôn;
 *   2. lần đầu ⇒ ghép với tài khoản có sẵn theo SSO_MATCH_BY (email — chỉ khi SSO không báo email chưa xác thực —
 *      rồi tên đăng nhập), liên kết sub vào tài khoản đó; tài khoản đã liên kết với định danh SSO KHÁC ⇒ từ chối;
 *   3. vẫn chưa có ⇒ tự tạo nếu SSO_AUTO_CREATE=true (người dùng thường), không thì báo chưa có tài khoản.
 */
async function findOrLinkUser(deps: ApiDeps, sso: SsoClient, who: SsoUser, log?: { warn: (o: object, m: string) => void }): Promise<{ id: number } | { loi: string }> {
  const cfg = sso.cfg;
  // Email SSO trả; không có ⇒ <tên đăng nhập>@SSO_EMAIL_DOMAIN (nếu đặt). Tên đăng nhập: preferred_username hoặc sub (WSO2).
  const email = emailOf(who, cfg);
  const username = usernameOf(who, cfg);
  return withTenant(deps.writer, async (t) => {
    const linked = await t.oneOrNone<{ id: number; is_active: boolean }>('SELECT id, is_active FROM app_users WHERE sso_subject = $1', [who.sub]);
    if (linked) {
      if (!linked.is_active) return { loi: 'tai_khoan_bi_khoa' };
      await t.none('UPDATE app_users SET last_login_at = now() WHERE id = $1', [linked.id]);
      return { id: linked.id };
    }
    for (const by of cfg.matchBy) {
      const v = by === 'email' ? email : username;
      if (!v) continue;
      const u = await t.oneOrNone<{ id: number; is_active: boolean; sso_subject: string | null; email: string | null }>(
        `SELECT id, is_active, sso_subject, email FROM app_users WHERE lower(${by === 'email' ? 'email' : 'username'}) = $1`, [v]);
      if (!u) continue;
      // Cùng người nhưng sub khác dạng (WSO2 trả theo chuỗi gõ ở trang đăng nhập — sameSubject) ⇒ nhận, giữ liên kết cũ.
      if (u.sso_subject && !sameSubject(u.sso_subject, who.sub, u.email)) {
        log?.warn({ tai_khoan: u.id, ghep_theo: by, sub_da_luu: u.sso_subject, sub_moi: who.sub }, 'SSO: tài khoản cổng đã liên kết với sub khác');
        return { loi: 'tai_khoan_da_lien_ket' };
      }
      if (!u.is_active) return { loi: 'tai_khoan_bi_khoa' };
      await t.none('UPDATE app_users SET sso_subject = COALESCE(sso_subject, $2), last_login_at = now() WHERE id = $1', [u.id, who.sub]);
      return { id: u.id };
    }
    if (!cfg.autoCreate) return { loi: 'chua_co_tai_khoan' };
    if (!email) return { loi: 'sso_thieu_email' };
    // Tên đăng nhập: claim của SSO (nếu hợp lệ và chưa ai dùng), không thì phần trước @ của email + số.
    const base = (username && /^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) ? username : email.split('@')[0]!.replace(/[^a-z0-9._-]/g, '')).slice(0, 36) || 'nguoidung';
    let uname = base;
    for (let n = 2; await t.oneOrNone('SELECT 1 FROM app_users WHERE username = $1', [uname]); n++) uname = `${base}${n}`;
    const created = await t.one<{ id: number }>(
      `INSERT INTO app_users (sso_subject, email, ho_ten, username, is_active, last_login_at) VALUES ($1, $2, $3, $4, true, now()) RETURNING id`,
      [who.sub, email, (typeof who.name === 'string' && who.name.trim()) || email, uname]);
    return { id: created.id };
  });
}

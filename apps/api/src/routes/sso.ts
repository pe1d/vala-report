/**
 * Một redirect URI duy nhất cho SSO: {PUBLIC_API_URL}/api/v1/sso/callback.
 * `state` (ký HMAC, hết hạn 10 phút) cho biết đây là quay về sau khi ĐĂNG NHẬP cổng hay sau khi UỶ QUYỀN.
 */
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { Problem, withTenant, withUserContext, type UserContext } from '@vala/core';
import { audit } from '../audit.js';
import { issuePortalToken } from '../auth.js';
import type { ApiDeps } from '../deps.js';
import { sign, verify } from '../tokens.js';

export const callbackUrl = (deps: ApiDeps) => `${deps.config.publicApiUrl}/api/v1/sso/callback`;

type LoginState = { kind: 'login'; next: string };
type GrantState = { kind: 'grant'; uid: number; src: string; caps: string[] };

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');
const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });

export function grantStartUrl(deps: ApiDeps, st: Omit<GrantState, 'kind'>): string {
  const state = sign({ kind: 'grant', ...st }, deps.config.jwtSecret, 600);
  return deps.sso.authorizeUrl({ state, redirectUri: callbackUrl(deps), scope: deps.sso.cfg.grantScope });
}

export const ssoRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /** Đăng nhập cổng qua Bkav SSO (tuỳ chọn, ngoài đăng nhập bằng mật khẩu). */
  app.get<{ Querystring: { next?: string } }>('/auth/sso/login', async (req, reply) => {
    const state = sign({ kind: 'login', next: safeNext(req.query.next) }, deps.config.jwtSecret, 600);
    return reply.redirect(deps.sso.authorizeUrl({ state, redirectUri: callbackUrl(deps), scope: deps.sso.cfg.loginScope }));
  });

  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>('/sso/callback', async (req, reply) => {
    const st = verify<LoginState | GrantState>(req.query.state ?? '', deps.config.jwtSecret);
    if (!st) return toWeb(reply, deps, '/dang-nhap', { loi: 'state_khong_hop_le' });
    if (st.kind === 'login') return handleLogin(deps, reply, st, req.query.code);
    return handleGrant(deps, req, reply, st, req.query.code);
  });
};

function toWeb(reply: FastifyReply, deps: ApiDeps, path: string, q: Record<string, string>, hash?: Record<string, string>) {
  const u = new URL(path, deps.config.publicWebUrl);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  if (hash) u.hash = new URLSearchParams(hash).toString();
  return reply.redirect(u.toString());
}

async function handleLogin(deps: ApiDeps, reply: FastifyReply, st: LoginState, code?: string) {
  if (!code) return toWeb(reply, deps, '/dang-nhap', { loi: 'sso_tu_choi' });
  let who;
  try {
    const tokens = await deps.sso.exchangeCode(code, callbackUrl(deps));
    who = await deps.sso.userinfo(tokens.access_token);
  } catch {
    return toWeb(reply, deps, '/dang-nhap', { loi: 'sso_loi' });
  }
  // Người dùng cổng phải đã có trong danh bạ (đồng bộ cùng cây tổ chức). Không tự tạo tài khoản.
  const user = await withTenant(deps.writer, (t) => t.oneOrNone<{ id: number }>(
    `UPDATE app_users SET last_login_at = now() WHERE sso_subject = $1 AND is_active RETURNING id`, [who.sub]));
  if (!user) return toWeb(reply, deps, '/dang-nhap', { loi: 'chua_co_tai_khoan' });
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
    const who = await deps.sso.userinfo(tokens.access_token);
    // Người đăng nhập SSO lúc uỷ quyền phải CHÍNH LÀ người dùng cổng đã bấm uỷ quyền. Không thì dữ liệu
    // của tài khoản B sẽ bị gán cho người dùng A.
    const expected = await withTenant(deps.reader, (t) => t.one(
      'SELECT sso_subject FROM app_users WHERE id = $1', [st.uid], (r: { sso_subject: string }) => r.sso_subject));
    if (who.sub !== expected) return back(false, 'sai_tai_khoan');
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

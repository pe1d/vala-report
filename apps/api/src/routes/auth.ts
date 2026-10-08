/**
 * Đăng nhập cổng bằng tài khoản/mật khẩu (chuẩn). Mật khẩu chỉ so khớp qua pool writer (app_reader
 * không đọc được password_hash). Khoá tạm thời sau nhiều lần sai để chống dò mật khẩu.
 */
import type { FastifyPluginAsync } from 'fastify';
import { L, Problem, hashPassword, passwordPolicyError, runInTenant, verifyPassword, withTenant } from '@vala/core';
import { authenticate, issuePortalToken } from '../auth.js';
import type { ApiDeps } from '../deps.js';
import { accountExists, fillFor, inLoginTenant, loginMethodsOf, parseLogin, ssoAutoCreate, ssoHostsOf, takeN, tenantByDomain } from '../login-target.js';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

interface Row {
  id: number;
  password_hash: string | null;
  is_active: boolean;
  failed_logins: number;
  locked_until: Date | null;
  must_change_password: boolean;
}

export const loginBodySchema = { type: 'object', required: ['username', 'password'], properties: {
  username: { type: 'string', maxLength: 200 }, password: { type: 'string', maxLength: 400 },
  // Mã đơn vị do bước 1 (/auth/lookup) trả; không có ⇒ theo tên miền trong username (tk@tênmiền), tài khoản trơn ⇒ Bkav.
  tenant: { type: 'string', maxLength: 20 } } } as const;

/**
 * Kiểm mật khẩu cổng, có khoá tạm sau nhiều lần sai. Dùng cho đăng nhập cổng và đăng nhập tiện ích — trong ngữ cảnh
 * đơn vị do nơi gọi đặt (inLoginTenant). `email` (tk@tênmiền đầy đủ) ⇒ cũng khớp tài khoản có email đó.
 * Ném invalid_credentials / rate_limited; trả về người dùng khi đúng.
 */
export async function checkPortalPassword(deps: ApiDeps, rawUsername: string, password: string, email = ''): Promise<Row> {
  if (!deps.config.loginMethods.includes('password')) throw new Problem('forbidden', L('Đăng nhập bằng mật khẩu đang tắt', 'Password sign-in is disabled'));
  const username = rawUsername.trim().toLowerCase();
  const fail = () => new Problem('invalid_credentials', L('Sai tài khoản hoặc mật khẩu', 'Incorrect username or password'));

  const row = await withTenant(deps.writer, (t) => t.oneOrNone<Row>(
    `SELECT id, password_hash, is_active, failed_logins, locked_until, must_change_password
       FROM app_users WHERE lower(username) = $1 OR ($2 <> '' AND lower(email) = $2)
      ORDER BY (lower(username) = $1) DESC LIMIT 1`, [username, email.trim().toLowerCase()]));
  // Vẫn kiểm mật khẩu với chuỗi rỗng để thời gian phản hồi không lộ tài khoản có tồn tại hay không.
  if (!row || !row.is_active) { await verifyPassword(password, null); throw fail(); }
  if (row.locked_until && row.locked_until > new Date()) {
    throw new Problem('rate_limited', L('Tài khoản tạm khoá', 'Account temporarily locked'),
      L(`Sai mật khẩu quá nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`, `Too many failed password attempts. Try again in ${LOCK_MINUTES} minutes.`));
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    const fails = row.failed_logins + 1;
    await withTenant(deps.writer, (t) => t.none(
      `UPDATE app_users SET failed_logins = $2, locked_until = CASE WHEN $2 >= $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
        WHERE id = $1`, [row.id, fails, MAX_FAILS, LOCK_MINUTES]));
    throw fail();
  }
  await withTenant(deps.writer, (t) => t.none(
    `UPDATE app_users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [row.id]));
  return row;
}

/** Email đầy đủ để khớp tài khoản theo email: người dùng gõ tk@tênmiền, hoặc tk + tên miền đầu tiên của đơn vị. */
export function emailOf(account: string, typed: string, domains: string[]): string {
  const d = parseLogin(typed)?.domain ?? domains[0];
  return d ? `${account}@${d}` : '';
}

export const authRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/auth/config', async () => ({ login_methods: deps.config.loginMethods }));

  /**
   * Bước 1 (họp 07/10): `tk@tênmiền` ⇒ đơn vị + cách đăng nhập. Báo rõ "không có đơn vị" / "chưa có tài khoản" ngay bước
   * này theo yêu cầu, nên ai cũng dò được tài khoản có tồn tại ⇒ giới hạn nhịp theo IP và theo chuỗi tra.
   */
  app.post<{ Body: { login: string } }>('/auth/lookup', {
    schema: { body: { type: 'object', required: ['login'], properties: { login: { type: 'string', maxLength: 200 } } } },
  }, async (req) => {
    const p = parseLogin(req.body.login);
    if (!(await takeN(deps.limiter, `lookup:ip:${req.ip}`, 20, 60)) || !(await takeN(deps.limiter, `lookup:${req.body.login.trim().toLowerCase()}`, 10, 60))) {
      throw new Problem('rate_limited', L('Thử quá nhiều lần', 'Too many attempts'), L('Đợi một phút rồi thử lại', 'Wait a minute and try again'));
    }
    if (!p?.domain) {
      throw new Problem('invalid_params', L('Nhập tài khoản dạng tên@đơn vị', 'Enter your account as name@organization'),
        L('Ví dụ: nguyenvana@bkav.com — phần sau @ cho biết đơn vị của bạn', 'For example: nguyenvana@bkav.com — the part after @ identifies your organization'));
    }
    const { account, domain } = p as { account: string; domain: string };
    const t = await tenantByDomain(deps, domain);
    if (!t) throw new Problem('not_found', L('Không tìm thấy đơn vị', 'Organization not found'),
      L(`Chưa có đơn vị nào dùng tên miền ${domain}`, `No organization uses the domain ${domain}`));
    const methods = loginMethodsOf(deps, t);
    const exists = await runInTenant(t.ma, () => accountExists(deps, account, `${account}@${domain}`));
    if (!exists && !ssoAutoCreate(deps, t)) {
      throw new Problem('not_found', L('Tài khoản chưa tồn tại', 'Account not found'),
        L(`Tài khoản ${account} chưa có trong ${t.ten}. Liên hệ quản trị của đơn vị.`, `The account ${account} does not exist in ${t.ten}. Contact your organization's administrator.`));
    }
    return {
      tenant: { ma: t.ma, ten: t.ten }, account, methods,
      fill: fillFor(t.login_fill, account, domain),
      // Bộ chọn ô tài khoản / mật khẩu trên trang SSO của đơn vị (Vala Desktop tự điền + khoá ô tài khoản).
      selectors: t.login_selectors ?? null,
      sso_hosts: ssoHostsOf(deps, t),
    };
  });

  app.post<{ Body: { username?: string; password?: string; tenant?: string } }>('/auth/login', {
    schema: { body: loginBodySchema },
  }, async (req) => inLoginTenant(deps, req.body.username!, req.body.tenant, async (account, t) => {
    const row = await checkPortalPassword(deps, account, req.body.password!, emailOf(account, req.body.username!, t.domains));
    return {
      access_token: issuePortalToken(row.id, deps.config.jwtSecret),
      token_type: 'Bearer',
      must_change_password: row.must_change_password,
    };
  }));

  app.post<{ Body: { current_password?: string; new_password?: string } }>('/auth/change-password', {
    onRequest: authenticate(deps),
    schema: { body: { type: 'object', required: ['current_password', 'new_password'], properties: {
      current_password: { type: 'string' }, new_password: { type: 'string', maxLength: 400 } } } },
  }, async (req, reply) => {
    const policy = passwordPolicyError(req.body.new_password!);
    if (policy) throw new Problem('invalid_params', L('Mật khẩu chưa đạt', 'Password does not meet the requirements'), policy);
    const row = await withTenant(deps.writer, (t) => t.one<{ password_hash: string | null }>(
      `SELECT password_hash FROM app_users WHERE id = $1`, [req.user.id]));
    if (!(await verifyPassword(req.body.current_password!, row.password_hash))) {
      throw new Problem('invalid_credentials', L('Mật khẩu hiện tại không đúng', 'Current password is incorrect'));
    }
    const hash = await hashPassword(req.body.new_password!);
    await withTenant(deps.writer, (t) => t.none(
      `UPDATE app_users SET password_hash = $2, password_changed_at = now(), must_change_password = false WHERE id = $1`,
      [req.user.id, hash]));
    return reply.status(204).send();
  });
};

/**
 * Đăng nhập cổng bằng tài khoản/mật khẩu (chuẩn). Mật khẩu chỉ so khớp qua pool writer (app_reader
 * không đọc được password_hash). Khoá tạm thời sau nhiều lần sai để chống dò mật khẩu.
 */
import type { FastifyPluginAsync } from 'fastify';
import { Problem, hashPassword, passwordPolicyError, verifyPassword, withTenant } from '@vala/core';
import { authenticate, issuePortalToken } from '../auth.js';
import type { ApiDeps } from '../deps.js';

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
  username: { type: 'string', maxLength: 200 }, password: { type: 'string', maxLength: 400 } } } as const;

/**
 * Kiểm mật khẩu cổng, có khoá tạm sau nhiều lần sai. Dùng cho đăng nhập cổng và đăng nhập tiện ích.
 * Ném invalid_credentials / rate_limited; trả về người dùng khi đúng.
 */
export async function checkPortalPassword(deps: ApiDeps, rawUsername: string, password: string): Promise<Row> {
  if (!deps.config.loginMethods.includes('password')) throw new Problem('forbidden', 'Đăng nhập bằng mật khẩu đang tắt');
  const username = rawUsername.trim().toLowerCase();
  const fail = () => new Problem('invalid_credentials', 'Sai tài khoản hoặc mật khẩu');

  const row = await withTenant(deps.writer, (t) => t.oneOrNone<Row>(
    `SELECT id, password_hash, is_active, failed_logins, locked_until, must_change_password
       FROM app_users WHERE lower(username) = $1`, [username]));
  // Vẫn kiểm mật khẩu với chuỗi rỗng để thời gian phản hồi không lộ tài khoản có tồn tại hay không.
  if (!row || !row.is_active) { await verifyPassword(password, null); throw fail(); }
  if (row.locked_until && row.locked_until > new Date()) {
    throw new Problem('rate_limited', 'Tài khoản tạm khoá', `Sai mật khẩu quá nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`);
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

export const authRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/auth/config', async () => ({ login_methods: deps.config.loginMethods }));

  app.post<{ Body: { username?: string; password?: string } }>('/auth/login', {
    schema: { body: loginBodySchema },
  }, async (req) => {
    const row = await checkPortalPassword(deps, req.body.username!, req.body.password!);
    return {
      access_token: issuePortalToken(row.id, deps.config.jwtSecret),
      token_type: 'Bearer',
      must_change_password: row.must_change_password,
    };
  });

  app.post<{ Body: { current_password?: string; new_password?: string } }>('/auth/change-password', {
    onRequest: authenticate(deps),
    schema: { body: { type: 'object', required: ['current_password', 'new_password'], properties: {
      current_password: { type: 'string' }, new_password: { type: 'string', maxLength: 400 } } } },
  }, async (req, reply) => {
    const policy = passwordPolicyError(req.body.new_password!);
    if (policy) throw new Problem('invalid_params', 'Mật khẩu chưa đạt', policy);
    const row = await withTenant(deps.writer, (t) => t.one<{ password_hash: string | null }>(
      `SELECT password_hash FROM app_users WHERE id = $1`, [req.user.id]));
    if (!(await verifyPassword(req.body.current_password!, row.password_hash))) {
      throw new Problem('invalid_credentials', 'Mật khẩu hiện tại không đúng');
    }
    const hash = await hashPassword(req.body.new_password!);
    await withTenant(deps.writer, (t) => t.none(
      `UPDATE app_users SET password_hash = $2, password_changed_at = now(), must_change_password = false WHERE id = $1`,
      [req.user.id, hash]));
    return reply.status(204).send();
  });
};

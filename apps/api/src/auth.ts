import type { FastifyReply, FastifyRequest } from 'fastify';
import { L, Problem, withTenant } from '@vala/core';
import type { ApiDeps } from './deps.js';
import { sign, verify } from './tokens.js';

export interface AuthUser {
  id: number;
  ho_ten: string;
  email: string;
  is_ops_admin: boolean;
  /** Đang dùng mật khẩu tạm ⇒ chỉ được gọi /me và đổi mật khẩu. */
  must_change_password: boolean;
  has_password: boolean;
}

/** Khi còn phải đổi mật khẩu, chỉ các đường này được gọi (để hiện màn hình đổi mật khẩu). */
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/v1/me', '/api/v1/auth/change-password']);

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

/**
 * Xác thực người dùng cổng. Bearer luôn là token HS256 của chính cổng (uid = app_user.id), cấp sau khi
 * đăng nhập bằng tài khoản/mật khẩu (routes/auth.ts) hoặc qua Bkav SSO (routes/sso.ts).
 * Cổng không nhận thẳng access token của SSO: token đó chỉ nằm ở máy chủ, trong vault.
 */
export function authenticate(deps: ApiDeps) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!m) throw new Problem('unauthenticated', L('Cần đăng nhập', 'Sign-in required'));
    const payload = verify<{ uid: number; kind?: string }>(m[1]!, deps.config.jwtSecret);
    if (!payload || payload.kind !== 'portal') throw new Problem('unauthenticated', L('Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 'Your sign-in session is invalid or has expired'));
    // Pool writer: pool reader chỉ được đọc một số cột của app_users (không có cột mật khẩu / trạng thái mật khẩu).
    const user = await withTenant(deps.writer, (t) => t.oneOrNone<AuthUser>(
      `SELECT id, ho_ten, email, is_ops_admin, must_change_password, password_hash IS NOT NULL AS has_password
         FROM app_users WHERE id = $1 AND is_active`, [payload.uid]));
    if (!user) throw new Problem('unauthenticated', L('Tài khoản không tồn tại hoặc đã bị khoá', 'The account does not exist or has been locked'));
    if (user.must_change_password && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(req.url.split('?')[0]!)) {
      throw new Problem('password_change_required', L('Cần đổi mật khẩu', 'Password change required'), L('Bạn đang dùng mật khẩu tạm — đổi mật khẩu để tiếp tục', 'You are using a temporary password — change it to continue'));
    }
    req.user = user;
  };
}

export const PORTAL_TOKEN_TTL = 12 * 3600;

export function issuePortalToken(userId: number, secret: string): string {
  return sign({ uid: userId, kind: 'portal' }, secret, PORTAL_TOKEN_TTL);
}

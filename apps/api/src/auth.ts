import type { FastifyReply, FastifyRequest } from 'fastify';
import { Problem, withTenant } from '@vala/core';
import type { ApiDeps } from './deps.js';
import { sign, verify } from './tokens.js';

export interface AuthUser {
  id: number;
  ho_ten: string;
  email: string;
  is_ops_admin: boolean;
}

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
    if (!m) throw new Problem('unauthenticated', 'Cần đăng nhập');
    const payload = verify<{ uid: number; kind?: string }>(m[1]!, deps.config.jwtSecret);
    if (!payload || payload.kind !== 'portal') throw new Problem('unauthenticated', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    const user = await withTenant(deps.reader, (t) => t.oneOrNone<AuthUser>(
      `SELECT id, ho_ten, email, is_ops_admin FROM app_users WHERE id = $1 AND is_active`, [payload.uid]));
    if (!user) throw new Problem('unauthenticated', 'Tài khoản không tồn tại hoặc đã bị khoá');
    req.user = user;
  };
}

export const PORTAL_TOKEN_TTL = 12 * 3600;

export function issuePortalToken(userId: number, secret: string): string {
  return sign({ uid: userId, kind: 'portal' }, secret, PORTAL_TOKEN_TTL);
}

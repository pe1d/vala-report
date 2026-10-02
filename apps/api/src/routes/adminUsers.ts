/**
 * Quản trị — Người dùng cổng: tạo tài khoản (đăng nhập bằng mật khẩu), sửa tên/email, cấp/bỏ quyền quản trị,
 * vô hiệu hoá / kích hoạt lại, đặt lại mật khẩu, mở khoá sau khi nhập sai nhiều lần. Phòng ban (org units) chưa
 * quản lý ở đây.
 *
 * Không xoá hẳn tài khoản: dữ liệu đã lấy về, lịch sử chạy và nhật ký đều tham chiếu tới người dùng ⇒ chỉ vô hiệu
 * hoá. Vô hiệu hoá có hiệu lực ngay: token cổng và token tiện ích đều kiểm tra is_active ở mỗi request, lịch của
 * người đó ngừng chạy. Mật khẩu chỉ lưu dạng băm, không bao giờ trả về.
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Problem, hashPassword, passwordPolicyError, withTenant, type Tx } from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';

const USERNAME = '^[a-z0-9][a-z0-9._-]{2,39}$';
const EMAIL = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

interface UserBody { username?: string; ho_ten?: string; email?: string; password?: string; is_ops_admin?: boolean; is_active?: boolean }

const createSchema = {
  type: 'object', additionalProperties: false, required: ['username', 'ho_ten', 'email', 'password'], properties: {
    username: { type: 'string', pattern: USERNAME }, ho_ten: { type: 'string', minLength: 2, maxLength: 120 },
    email: { type: 'string', pattern: EMAIL, maxLength: 200 }, password: { type: 'string', maxLength: 200 },
    is_ops_admin: { type: 'boolean' },
  },
} as const;
const patchSchema = {
  type: 'object', additionalProperties: false, properties: {
    ho_ten: { type: 'string', minLength: 2, maxLength: 120 }, email: { type: 'string', pattern: EMAIL, maxLength: 200 },
    is_ops_admin: { type: 'boolean' }, is_active: { type: 'boolean' },
  },
} as const;

/** Lỗi trùng tên đăng nhập / email ⇒ thông báo rõ thay vì 500. */
function uniqueError(e: unknown): never {
  const c = (e as { code?: string; constraint?: string }).constraint ?? '';
  if ((e as { code?: string }).code === '23505') {
    throw new Problem('invalid_params', c.includes('email') ? 'Email đã được dùng cho tài khoản khác' : 'Tên đăng nhập đã tồn tại');
  }
  throw e;
}

export const adminUserRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  const userAudit = (t: Tx, req: FastifyRequest, id: number, detail: Record<string, unknown>) =>
    audit(t, req, 'source_change', { type: 'user', id: String(id) }, detail);

  app.get('/admin/users', async () => withTenant(deps.writer, (t) => t.any(
    `SELECT u.id, u.username, u.ho_ten, u.email, u.is_ops_admin, u.is_active, u.must_change_password,
            u.created_at, u.last_login_at, u.password_changed_at,
            (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked,
            u.password_hash IS NOT NULL AS has_password, u.sso_subject IS NOT NULL AS has_sso,
            (SELECT count(*)::int FROM source_grants g WHERE g.app_user_id = u.id AND g.revoked_at IS NULL AND g.session_state = 'active') AS ket_noi,
            (SELECT count(*)::int FROM data_schedules s WHERE s.app_user_id = u.id AND s.is_enabled) AS lich
       FROM app_users u ORDER BY u.is_active DESC, lower(u.ho_ten)`)));

  app.post<{ Body: UserBody }>('/admin/users', { schema: { body: createSchema } }, async (req, reply) => {
    const b = req.body;
    const policy = passwordPolicyError(b.password!);
    if (policy) throw new Problem('invalid_params', 'Mật khẩu chưa đạt', policy);
    const hash = await hashPassword(b.password!);
    const id = await withTenant(deps.writer, async (t) => {
      const r = await t.one<{ id: number }>(
        `INSERT INTO app_users (username, ho_ten, email, is_ops_admin, password_hash, password_changed_at, must_change_password)
         VALUES ($1, $2, $3, $4, $5, now(), true) RETURNING id`,
        [b.username!.toLowerCase(), b.ho_ten!.trim(), b.email!.trim().toLowerCase(), b.is_ops_admin ?? false, hash]).catch(uniqueError);
      await userAudit(t, req, r.id, { op: 'create', username: b.username, is_ops_admin: b.is_ops_admin ?? false });
      return r.id;
    });
    return reply.status(201).send({ id });
  });

  app.patch<{ Params: { id: string }; Body: UserBody }>('/admin/users/:id', { schema: { body: patchSchema } }, async (req) => {
    const id = Number(req.params.id);
    const b = req.body;
    // Không tự khoá mình ra ngoài: không tự vô hiệu hoá, không tự bỏ quyền quản trị.
    if (id === req.user.id && (b.is_active === false || b.is_ops_admin === false)) {
      throw new Problem('invalid_params', 'Không tự vô hiệu hoá hay tự bỏ quyền quản trị của chính mình');
    }
    return withTenant(deps.writer, async (t) => {
      const cur = await t.oneOrNone<{ is_ops_admin: boolean; is_active: boolean }>('SELECT is_ops_admin, is_active FROM app_users WHERE id = $1 FOR UPDATE', [id]);
      if (!cur) throw new Problem('not_found', 'Không có người dùng này');
      // Luôn còn ít nhất một quản trị đang hoạt động.
      if (cur.is_ops_admin && cur.is_active && (b.is_ops_admin === false || b.is_active === false)) {
        const others = await t.one('SELECT count(*)::int AS n FROM app_users WHERE is_ops_admin AND is_active AND id <> $1', [id], (r: { n: number }) => r.n);
        if (!others) throw new Problem('invalid_params', 'Phải còn ít nhất một quản trị đang hoạt động');
      }
      await t.none(
        `UPDATE app_users SET ho_ten = coalesce($2, ho_ten), email = coalesce($3, email),
                is_ops_admin = coalesce($4, is_ops_admin), is_active = coalesce($5, is_active)
          WHERE id = $1`,
        [id, b.ho_ten?.trim() ?? null, b.email?.trim().toLowerCase() ?? null, b.is_ops_admin ?? null, b.is_active ?? null]).catch(uniqueError);
      await userAudit(t, req, id, { op: 'update', fields: Object.keys(b), ...(b.is_ops_admin !== undefined ? { is_ops_admin: b.is_ops_admin } : {}),
        ...(b.is_active !== undefined ? { is_active: b.is_active } : {}) });
      return { id, updated: true };
    });
  });

  /** Đặt mật khẩu tạm cho người dùng (lần đăng nhập tới phải đổi). Mở khoá luôn nếu đang bị khoá. */
  app.post<{ Params: { id: string }; Body: { password: string } }>('/admin/users/:id/password', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['password'], properties: { password: { type: 'string', maxLength: 200 } } } },
  }, async (req) => {
    const id = Number(req.params.id);
    const policy = passwordPolicyError(req.body.password);
    if (policy) throw new Problem('invalid_params', 'Mật khẩu chưa đạt', policy);
    const hash = await hashPassword(req.body.password);
    return withTenant(deps.writer, async (t) => {
      const n = await t.result(
        `UPDATE app_users SET password_hash = $2, password_changed_at = now(), must_change_password = true,
                failed_logins = 0, locked_until = NULL
          WHERE id = $1`, [id, hash], (r) => r.rowCount);
      if (!n) throw new Problem('not_found', 'Không có người dùng này');
      await userAudit(t, req, id, { op: 'reset_password' });
      return { id, must_change_password: true };
    });
  });

  /** Mở khoá tài khoản bị tạm khoá do nhập sai mật khẩu nhiều lần. */
  app.post<{ Params: { id: string } }>('/admin/users/:id/unlock', async (req) => withTenant(deps.writer, async (t) => {
    const id = Number(req.params.id);
    const n = await t.result('UPDATE app_users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [id], (r) => r.rowCount);
    if (!n) throw new Problem('not_found', 'Không có người dùng này');
    await userAudit(t, req, id, { op: 'unlock' });
    return { id, unlocked: true };
  }));
};

import type { FastifyPluginAsync } from 'fastify';
import { L, Problem, langOf, localizeStored, vaultRef, withUserContext, type UserContext } from '@vala/core';
import { loadAllSpecs } from '@vala/core/adapter';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { grantStartUrl } from './sso.js';

const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });

function sourceCapabilities(source: string): string[] {
  const caps = loadAllSpecs().filter((s) => s.source_system === source).flatMap((s) => s.capabilities.map((c) => c.id));
  if (!caps.length) throw new Problem('not_found', L('Không hỗ trợ hệ thống này', 'This system is not supported'));
  return caps;
}

/**
 * Uỷ quyền với hệ thống nguồn (mục 07). Người dùng phải xem được hệ thống nào đang được lấy
 * dữ liệu thay mình, lần cuối lúc nào, và thu hồi bằng một thao tác.
 */
export const grantRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/grants', async (req) => withUserContext(deps.reader, own(req.user.id), async (t) => {
    const rows = await t.any<{ source_system: string; last_error: string | null }>(
      `SELECT ss.code AS source_system, ss.ten,
              coalesce(CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' ELSE g.session_state END, 'pending') AS session_state,
              g.granted_at, g.session_expires_at, coalesce(g.scope_capabilities, '{}') AS scope_capabilities,
              g.last_refresh_at, g.revoked_at, g.auth_method, g.last_error,
              (SELECT max(r.finished_at) FROM crawl_runs r
                WHERE r.app_user_id = $1 AND r.source_system = ss.code AND r.status = 'ok') AS last_success_at,
              (g.id IS NOT NULL AND g.revoked_at IS NULL AND g.session_state = 'active') AS can_crawl
         FROM core.source_systems ss
         LEFT JOIN source_grants g ON g.source_system = ss.code AND g.app_user_id = $1
        WHERE ss.enabled ORDER BY ss.code`, [req.user.id]);
    const lang = langOf(req.headers['accept-language']);
    return rows.map((r) => ({ ...r, last_error: localizeStored(r.last_error, lang), available_capabilities: safeCaps(r.source_system) }));
  }));

  app.post<{ Params: { source: string }; Body: { scope_capabilities?: string[] } | undefined }>('/grants/:source', async (req) => {
    const { source } = req.params;
    const available = sourceCapabilities(source);
    const caps = req.body?.scope_capabilities?.length ? req.body.scope_capabilities : available;
    const unknown = caps.filter((c) => !available.includes(c));
    if (unknown.length) throw new Problem('invalid_params', L('Capability không hợp lệ', 'Invalid capability'), unknown.join(', '));

    if (!deps.config.loginMethods.includes('sso')) {
      throw new Problem('forbidden', L('Uỷ quyền qua SSO đang tắt', 'Authorization via SSO is disabled'), L('Kết nối dữ liệu do quản trị cấu hình', 'Data connections are configured by an admin'));
    }

    await withUserContext(deps.reader, own(req.user.id), (t) => t.none(
      `INSERT INTO source_grants (app_user_id, source_system, scope_capabilities, vault_ref, session_state, auth_method)
       VALUES ($1, $2, $3, $4, 'pending', 'sso')
       ON CONFLICT (app_user_id, source_system) DO UPDATE
         SET scope_capabilities = EXCLUDED.scope_capabilities, auth_method = 'sso',
             session_state = CASE WHEN source_grants.revoked_at IS NULL AND source_grants.session_state = 'active'
                                  THEN 'active' ELSE 'pending' END`,
      [req.user.id, source, caps, vaultRef(deps.config.tenant, req.user.id, source)]));

    // Chuyển sang trang đăng nhập Bkav SSO. Người dùng đang có phiên SSO trên trình duyệt thì SSO
    // trả về ngay, không phải gõ lại mật khẩu.
    return { flow: 'authorization_code', redirect_url: grantStartUrl(deps, { uid: req.user.id, src: source, caps }) };
  });

  app.delete<{ Params: { source: string } }>('/grants/:source', async (req, reply) => {
    const ctx = own(req.user.id);
    const grant = await withUserContext(deps.reader, ctx, (t) => t.oneOrNone<{ vault_ref: string }>(
      'SELECT vault_ref FROM source_grants WHERE app_user_id = $1 AND source_system = $2', [req.user.id, req.params.source]));
    if (grant) {
      // Xoá phiên khỏi vault TRƯỚC. Vault lỗi ⇒ không đánh dấu revoked, người dùng thử lại được;
      // ngược lại sẽ có trạng thái "đã thu hồi" trong khi phiên vẫn nằm trong vault.
      await deps.secrets.destroy(grant.vault_ref);
      const stillActive = await withUserContext(deps.reader, ctx, async (t) => {
        await t.none(
          `UPDATE source_grants SET revoked_at = now(), session_state = 'revoked', last_error = NULL, session_expires_at = NULL
            WHERE app_user_id = $1 AND source_system = $2`, [req.user.id, req.params.source]);
        await audit(t, req, 'revoke', { type: 'source_grant', id: req.params.source });
        return t.one(`SELECT count(*)::int AS n FROM source_grants WHERE app_user_id = $1 AND revoked_at IS NULL`,
          [req.user.id], (r: { n: number }) => r.n);
      });
      // Không còn hệ thống nào được uỷ quyền ⇒ huỷ luôn refresh token SSO (phía SSO và trong vault).
      if (stillActive === 0) await deps.sessions.revokeSso(req.user.id);
    }
    return reply.status(204).send();
  });
};

function safeCaps(source: string): string[] {
  try {
    return sourceCapabilities(source);
  } catch {
    return [];
  }
}

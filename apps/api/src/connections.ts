/**
 * Cấu hình kết nối dữ liệu — dùng chung cho quản trị (cấu hình hộ) và người dùng (tự cấp tài khoản).
 * Bí mật (mật khẩu, cookie hệ thống nguồn) chỉ vào vault; hàm nào ở đây cũng không trả bí mật ra.
 */
import type { FastifyRequest } from 'fastify';
import { AUTH_METHODS, L, Problem, canAutoRenew, isPermanentLoginError, localizeStored, vaultRef, withTenant, type AuthMethod, type Lang } from '@vala/core';
import { loadAllSpecs } from '@vala/core/adapter';
import { audit } from './audit.js';
import type { ApiDeps } from './deps.js';
import { CONSENT_VERSION } from './consent.js';

export interface ConnectionBody {
  auth_method: AuthMethod;
  source_username?: string;
  password?: string;
  cookie?: string;
  scope_capabilities?: string[];
}

export const connectionBodySchema = {
  type: 'object', required: ['auth_method'], properties: {
    auth_method: { type: 'string', enum: AUTH_METHODS },
    source_username: { type: 'string', maxLength: 200 },
    password: { type: 'string', maxLength: 400 },
    cookie: { type: 'string', maxLength: 8000 },
    scope_capabilities: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Danh sách kết nối, lọc theo người dùng nếu có. Không có cột bí mật nào. */
export async function listConnections(deps: ApiDeps, userId?: number, lang: Lang = 'vi') {
  const rows = await withTenant(deps.writer, (t) => t.any<{ last_error: string | null }>(
    `SELECT u.id AS app_user_id, u.ho_ten, u.email, ss.code AS source_system, ss.ten AS source_ten,
            g.auth_method, g.source_username, ss.connection_methods,
            coalesce(CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' ELSE g.session_state END, 'chua_cau_hinh') AS state,
            g.last_error, g.last_refresh_at, g.session_expires_at, g.configured_by = u.id AS self_configured,
            (SELECT max(r.finished_at) FROM crawl_runs r WHERE r.app_user_id = u.id AND r.source_system = ss.code AND r.status = 'ok') AS last_success_at,
            (SELECT c.consented_at FROM source_consents c WHERE c.app_user_id = u.id AND c.source_system = ss.code AND c.version = $2) AS consented_at
       FROM app_users u
       CROSS JOIN core.source_systems ss
       LEFT JOIN source_grants g ON g.app_user_id = u.id AND g.source_system = ss.code
      WHERE u.is_active AND ss.enabled AND ($1::bigint IS NULL OR u.id = $1)
      ORDER BY u.ho_ten, ss.code`, [userId ?? null, CONSENT_VERSION]));
  return rows.map((r) => ({ ...r, last_error: localizeStored(r.last_error, lang) }));
}

export async function configureConnection(
  deps: ApiDeps, req: FastifyRequest, userId: number, source: string, b: ConnectionBody,
): Promise<{ state: string; expires_at: string | null }> {
  const src = await withTenant(deps.writer, (t) => t.oneOrNone<{ connection_methods: AuthMethod[]; mfa: string }>(
    'SELECT connection_methods, mfa FROM core.source_systems WHERE code = $1 AND enabled', [source]));
  if (!src) throw new Problem('not_found', L('Không có hệ thống nguồn này', 'Source system not found'));
  if (b.auth_method === 'password' && src.mfa === 'co') {
    throw new Problem('invalid_params', L('Hệ thống này có xác thực 2 lớp (OTP)', 'This system uses two-factor authentication (OTP)'),
      L('Máy chủ không tự đăng nhập bằng mật khẩu được — kết nối qua tiện ích trình duyệt', 'The server cannot sign in with a password — connect via the browser extension'));
  }
  if (!src.connection_methods.includes(b.auth_method)) {
    throw new Problem('invalid_params', L('Hệ thống này không cho kết nối theo cách đã chọn', 'This system does not allow the selected connection method'),
      L(`cho phép: ${src.connection_methods.join(', ')}`, `allowed: ${src.connection_methods.join(', ')}`));
  }
  if (b.auth_method === 'password' && !deps.connections.supportsPassword(source)) {
    throw new Problem('invalid_params', L('Hệ thống này chưa có cách tự đăng nhập bằng mật khẩu', 'This system does not support password sign-in yet'),
      L('Dùng tiện ích trình duyệt hoặc dán cookie', 'Use the browser extension or paste a cookie'));
  }
  const all = loadAllSpecs().filter((x) => x.source_system === source).flatMap((x) => x.capabilities.map((c) => c.id));
  // Hệ thống tạo trên cổng chưa có capability nào ⇒ phạm vi rỗng (dữ liệu đi qua spider).
  const caps = b.scope_capabilities?.length ? b.scope_capabilities.filter((c) => all.includes(c)) : all;

  let state = 'pending';
  let expiresAt: string | null = null;
  if (b.auth_method === 'password') {
    if (!b.source_username?.trim()) throw new Problem('invalid_params', L('Cần tên đăng nhập hệ thống nguồn', 'Source system username is required'));
    if (!b.password) {
      // Sửa tên/giữ mật khẩu cũ: chỉ cho phép khi đã có mật khẩu trong vault.
      if (!(await deps.connections.hasCredential(userId, source))) throw new Problem('invalid_params', L('Cần mật khẩu hệ thống nguồn', 'Source system password is required'));
    } else {
      await deps.connections.saveCredential(userId, source, { username: b.source_username, password: b.password });
    }
    // Thử đăng nhập ngay để báo đúng/sai luôn.
    try {
      const s = await deps.connections.renew(userId, source, 'password');
      state = 'active';
      expiresAt = s.expires_at ?? null;
    } catch (e) {
      if (isPermanentLoginError(e)) throw e;     // 422: sai mật khẩu / cần OTP
      state = 'pending';                          // lỗi tạm (mạng…): lưu cấu hình, lượt chạy sau thử lại
    }
  } else if (b.auth_method === 'cookie') {
    if (!b.cookie?.trim()) throw new Problem('invalid_params', L('Cần dán chuỗi cookie', 'Please paste the cookie string'));
    await deps.connections.saveCookie(userId, source, b.cookie);
    state = 'active';
  }

  await withTenant(deps.writer, async (t) => {
    await t.none(
      `INSERT INTO source_grants (app_user_id, source_system, scope_capabilities, vault_ref, session_state, auth_method,
                                  source_username, configured_by, session_expires_at, revoked_at, last_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, now())
       ON CONFLICT (app_user_id, source_system) DO UPDATE
         SET scope_capabilities = EXCLUDED.scope_capabilities, session_state = EXCLUDED.session_state,
             auth_method = EXCLUDED.auth_method, source_username = EXCLUDED.source_username,
             configured_by = EXCLUDED.configured_by, session_expires_at = EXCLUDED.session_expires_at,
             revoked_at = NULL, last_error = NULL, updated_at = now()`,
      [userId, source, caps, vaultRef(deps.config.tenant, userId, source), state, b.auth_method,
       b.auth_method === 'password' ? b.source_username!.trim() : null, req.user.id, expiresAt]);
    await audit(t, req, 'grant', { type: 'connection', id: `${userId}/${source}` },
      { auth_method: b.auth_method, by: req.user.id === userId ? 'self' : 'admin' });
  });
  return { state, expires_at: expiresAt };
}

export async function testConnection(deps: ApiDeps, userId: number, source: string, lang: Lang = 'vi') {
  const g = await withTenant(deps.writer, (t) => t.oneOrNone<{ auth_method: AuthMethod }>(
    'SELECT auth_method FROM source_grants WHERE app_user_id = $1 AND source_system = $2 AND revoked_at IS NULL', [userId, source]));
  if (!g) throw new Problem('not_found', L('Kết nối chưa được cấu hình', 'Connection is not configured'));
  try {
    let s: { expires_at?: string };
    if (canAutoRenew(g.auth_method)) {
      s = await deps.connections.renew(userId, source, g.auth_method);
    } else {
      // Cookie dán / tiện ích gửi: không tự lấy lại được ⇒ probe phiên đang có trong vault.
      const cur = await deps.secrets.get(vaultRef(deps.config.tenant, userId, source));
      if (!cur) throw new Problem('session_expired', L('Chưa có phiên trong kho bí mật', 'No session in the secret store'));
      await deps.connections.verifyCookies(source, cur.cookies).catch((e) => {
        if (e instanceof Problem && e.type === 'session_expired') {
          throw new Problem('session_expired', L('Phiên đã hết hạn', 'Session has expired'), g.auth_method === 'extension'
            ? L('Mở hệ thống nguồn trên trình duyệt có tiện ích Vala và đăng nhập lại', 'Open the source system in a browser with the Vala extension and sign in again')
            : L('Dán cookie mới', 'Paste a new cookie'));
        }
        throw e;
      });
      s = { expires_at: cur.expires_at };
    }
    await withTenant(deps.writer, (t) => t.none(
      `UPDATE source_grants SET session_state = 'active', session_expires_at = $3, last_error = NULL, last_refresh_at = now()
        WHERE app_user_id = $1 AND source_system = $2`, [userId, source, s.expires_at ?? null]));
    return { ok: true, expires_at: s.expires_at ?? null };
  } catch (e) {
    const p = e instanceof Problem ? e : new Problem('internal', L('Không kết nối được', 'Could not connect'));
    await withTenant(deps.writer, (t) => t.none(
      `UPDATE source_grants SET last_error = $3,
              session_state = CASE WHEN $4 THEN 'failed' WHEN $5 THEN 'expired' ELSE session_state END
        WHERE app_user_id = $1 AND source_system = $2`, [userId, source, p.title, isPermanentLoginError(e), p.type === 'session_expired' && !canAutoRenew(g.auth_method)]));
    const j = p.toJSON(lang);
    return { ok: false, error: p.type, message: j.title, detail: j.detail };
  }
}

export async function deleteConnection(deps: ApiDeps, req: FastifyRequest, userId: number, source: string) {
  await deps.connections.destroy(userId, source);
  await withTenant(deps.writer, async (t) => {
    await t.none(
      `UPDATE source_grants SET revoked_at = now(), session_state = 'revoked', last_error = NULL, session_expires_at = NULL
        WHERE app_user_id = $1 AND source_system = $2`, [userId, source]);
    await audit(t, req, 'revoke', { type: 'connection', id: `${userId}/${source}` }, { by: req.user.id === userId ? 'self' : 'admin' });
  });
}

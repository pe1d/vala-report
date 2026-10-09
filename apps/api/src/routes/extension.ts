/**
 * Tiện ích trình duyệt Vala (apps/extension). Người dùng đăng nhập eGov/eTask… như mọi ngày; tiện ích
 * đọc đúng các cookie phiên adapter khai (cookies_required) và gửi về đây. Không ai phải dán cookie.
 *
 * Token thiết bị (vxt_…) khác hẳn token cổng: chỉ dùng được ở /ext/*, chỉ gửi được phiên nguồn của
 * CHÍNH người đó, không đọc được báo cáo. Chỉ lưu SHA-256; người dùng thu hồi được từ cổng.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { L, Problem, canAutoRenew, langOf, localizeStored, saveSourceAccount, vaultRef, withTenant, type AuthMethod, type SignedFields, currentSchema, currentTenant, DEFAULT_TENANT } from '@vala/core';
import { loadAllSpecs } from '@vala/core/adapter';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { issuePortalToken, PORTAL_TOKEN_TTL, type AuthUser } from '../auth.js';
import { desktopAppExtRoutes } from './desktopApps.js';
import { desktopErrorExtRoutes } from './desktopErrors.js';
import { notificationExtRoutes } from './notifications.js';
import { autoRefresh } from './dataSchedules.js';
import { consentsFor, giveConsent } from '../consent.js';

declare module 'fastify' {
  interface FastifyRequest {
    extDeviceId?: number;
  }
}

const DEVICE_TTL_DAYS = 180;
const hashToken = (t: string) => createHash('sha256').update(t).digest();

/**
 * Cấp token thiết bị (vxt_…) cho một người dùng — tiện ích đăng nhập bằng mật khẩu (/ext/login), hoặc cổng cấp cho Vala
 * Desktop khi người dùng đã đăng nhập cổng trong ứng dụng (POST /me/extension-devices). Chỉ lưu SHA-256 của token.
 */
async function issueDeviceToken(deps: ApiDeps, req: FastifyRequest, userId: number, deviceName: string | undefined, via: 'desktop') {
  // Mã đơn vị trong token ⇒ hook đơn vị chọn đúng schema trước khi tra token (multi-tenant). Bkav giữ dạng cũ không
  // mã (`vxt_<ngẫu nhiên>` ⇒ bkav): Desktop / tiện ích đã cài kiểm token theo dạng cũ và chỉ phục vụ Bkav.
  const tnt = currentTenant();
  const token = `vxt_${tnt === DEFAULT_TENANT ? '' : `${tnt}.`}${randomBytes(32).toString('base64url')}`;
  const user = await withTenant(deps.writer, async (t) => {
    const d = await t.one<{ id: number }>(
      `INSERT INTO extension_devices (app_user_id, token_hash, ten, expires_at, kind)
       VALUES ($1, $2, $3, now() + make_interval(days => $4), $5) RETURNING id`,
      [userId, hashToken(token), deviceName?.trim() || 'Trình duyệt', DEVICE_TTL_DAYS, via]);
    await audit(t, req, 'login', { type: 'extension_device', id: String(d.id) }, { via }, userId);
    return t.one<{ ho_ten: string; email: string }>('SELECT ho_ten, email FROM app_users WHERE id = $1', [userId]);
  });
  return { token, user };
}

/** Xác thực token thiết bị cho /ext/*. */
function authenticateDevice(deps: ApiDeps) {
  return async (req: FastifyRequest) => {
    const m = /^Bearer (vxt_(?:[a-z][a-z0-9]{1,19}\.)?[\w-]{20,100})$/.exec(req.headers.authorization ?? '');
    if (!m) throw new Problem('unauthenticated', L('Vala Desktop chưa đăng nhập', 'Vala Desktop is not signed in'));
    const row = await withTenant(deps.writer, (t) => t.oneOrNone<AuthUser & { device_id: number; stale: boolean; kind: string }>(
      `SELECT d.id AS device_id, d.kind, u.id, u.ho_ten, u.email, u.is_ops_admin, u.must_change_password, u.password_hash IS NOT NULL AS has_password,
              EXISTS (SELECT 1 FROM core.system_admins s WHERE s.tenant = $2 AND s.user_id = u.id) AS is_system_admin,
              d.last_used_at IS NULL OR d.last_used_at < now() - interval '5 minutes' AS stale
         FROM extension_devices d JOIN app_users u ON u.id = d.app_user_id
        WHERE d.token_hash = $1 AND d.revoked_at IS NULL AND d.expires_at > now() AND u.is_active`, [hashToken(m[1]!), currentTenant()]));
    if (!row) throw new Problem('unauthenticated', L('Vala Desktop đã bị ngắt kết nối hoặc hết hạn', 'Vala Desktop was disconnected or has expired'), L('Đăng nhập lại trong Vala Desktop', 'Sign in again in Vala Desktop'));
    // Tiện ích trình duyệt đã ngừng (08/10/2026 — dùng hoàn toàn Vala Desktop): token cũ của tiện ích không dùng được nữa.
    if (row.kind !== 'desktop') {
      throw new Problem('unauthenticated', L('Tiện ích trình duyệt đã ngừng hỗ trợ', 'The browser extension is no longer supported'),
        L('Cài Vala Desktop và đăng nhập ở đó — ứng dụng tự giữ phiên các hệ thống nguồn', 'Install Vala Desktop and sign in there — it keeps your source-system sessions'));
    }
    if (row.stale) await withTenant(deps.writer, (t) => t.none('UPDATE extension_devices SET last_used_at = now() WHERE id = $1', [row.device_id]));
    req.user = { id: row.id, ho_ten: row.ho_ten, email: row.email, is_ops_admin: row.is_ops_admin,
      must_change_password: row.must_change_password, has_password: row.has_password, is_system_admin: row.is_system_admin };
    req.extDeviceId = row.device_id;
  };
}

interface GrantRow { auth_method: AuthMethod; session_state: string; revoked_at: Date | null }
/** Kết nối đang do hệ thống tự đăng nhập (mật khẩu/SSO) và còn tốt ⇒ tiện ích không ghi đè. */
const managed = (g: GrantRow | null) => !!g && !g.revoked_at && canAutoRenew(g.auth_method) && g.session_state === 'active';

/** /ext/* — chỉ dành cho token thiết bị. */
export const extensionRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.addHook('onRequest', authenticateDevice(deps));

  app.get('/ext/me', async (req) => ({ ho_ten: req.user.ho_ten, email: req.user.email }));
  // Danh mục ứng dụng + bố cục của người dùng (Vala Desktop).
  await app.register(desktopAppExtRoutes(deps));
  // Báo lỗi của Vala Desktop (routes/desktopErrors.ts).
  await app.register(desktopErrorExtRoutes(deps));
  await app.register(notificationExtRoutes(deps));

  /**
   * Vala Desktop đăng nhập ở màn hình đăng nhập của ứng dụng ⇒ tab Báo cáo (cổng) lấy phiên từ đây qua cầu nối, người
   * dùng không đăng nhập lần nữa. Chỉ token của Desktop (không phải tiện ích trình duyệt) đổi được.
   */
  app.post('/ext/portal-token', async (req) => {
    const kind = await withTenant(deps.writer, (t) => t.oneOrNone<{ kind: string }>(
      'SELECT kind FROM extension_devices WHERE id = $1', [req.extDeviceId]));
    if (kind?.kind !== 'desktop') throw new Problem('forbidden', L('Chỉ Vala Desktop dùng được', 'Only Vala Desktop can use this'));
    if (req.user.must_change_password) throw new Problem('password_change_required', L('Cần đổi mật khẩu', 'Password change required'));
    return { access_token: issuePortalToken(req.user.id, deps.config.jwtSecret), expires_in: PORTAL_TOKEN_TTL };
  });

  /**
   * Người dùng vừa làm việc trên một hệ thống nguồn (vd xử lý văn bản trên eGov) rồi rời tab ⇒ tiện ích báo về để lấy
   * lại dữ liệu ngay, lúc quay sang cổng Vala số liệu đã mới. Cùng luật với tự cập nhật khi mở báo cáo (ngưỡng ngắn hơn).
   */
  app.post<{ Params: { source: string } }>('/ext/sources/:source/refresh', async (req) => {
    if (!deps.sources.get(req.params.source)) throw new Problem('not_found', L('Không có hệ thống nguồn này', 'Source system not found'));
    return { sources: await autoRefresh(deps, req, req.user.id, { source_system: req.params.source }, 'extension') };
  });

  /** Người dùng xác nhận đồng ý ngay trong tiện ích (trước lần kết nối đầu tiên). */
  app.post<{ Params: { source: string } }>('/ext/sources/:source/consent', async (req) => giveConsent(deps, req, req.user.id, req.params.source, 'extension'));

  /**
   * Gói kịch bản Vala Desktop đang bật, kèm chữ ký Ed25519 từng gói và khoá công khai để ứng dụng kiểm. ETag theo
   * (mã, version) ⇒ ứng dụng hỏi định kỳ, không đổi thì nhận 304 không kèm nội dung.
   */
  app.get('/ext/desktop-packages', async (req, reply) => {
    const rows = await withTenant(deps.writer, (t) => t.any<SignedFields & { ten: string; source_system: string | null }>(
      'SELECT code, ten, source_system, version, matches, css, script FROM desktop_packages WHERE is_enabled ORDER BY code'));
    const key = deps.packageSigner.publicKey;
    const etag = `"${createHash('sha256').update(key).update(JSON.stringify(rows.map((r) => [r.code, r.version]))).digest('base64url').slice(0, 27)}"`;
    reply.header('etag', etag).header('cache-control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return reply.status(304).send();
    return {
      public_key: key,
      packages: rows.map((r) => ({ ...r, signature: deps.packageSigner.sign(r) })),
    };
  });

  /** Hệ thống nguồn tiện ích cần theo dõi: origin để đọc cookie, đúng tên cookie phiên, trạng thái kết nối. */
  app.get('/ext/sources', async (req) => {
    const rows = await withTenant(deps.writer, (t) => t.any<GrantRow & { code: string; ten: string; last_push_at: Date | null; last_error: string | null }>(
      `SELECT ss.code, ss.ten, g.auth_method, g.revoked_at, g.last_push_at, g.last_error, ss.connection_methods,
              coalesce(CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' ELSE g.session_state END, 'chua_cau_hinh') AS session_state
         FROM source_systems ss
         LEFT JOIN source_grants g ON g.app_user_id = $1 AND g.source_system = ss.code
        WHERE ss.enabled AND 'extension' = ANY(ss.connection_methods) ORDER BY ss.code`, [req.user.id]));
    const consents = await consentsFor(deps, req.user.id);
    const lang = langOf(req.headers['accept-language']);
    const out = [];
    for (const r of rows) {
      let cookieNames: string[];
      try { cookieNames = deps.connections.cookieNames(r.code); } catch { continue; }   // nguồn chưa có adapter
      if (!cookieNames.length) continue;
      const { baseUrl, loginHosts } = await deps.sourceInfo(r.code);
      out.push({
        code: r.code, ten: r.ten, origin: new URL(baseUrl).origin, login_url: baseUrl, cookie_names: cookieNames,
        // Host trang đăng nhập (vd iam.bkav.com): Vala Desktop chỉ tự điền mật khẩu đã lưu trên đúng các host này.
        login_hosts: loginHosts.map((h) => (h.includes('://') ? new URL(h).host : h)),
        cookie_groups: deps.connections.cookieGroups(r.code),
        stable_cookies: deps.connections.stableCookies(r.code),
        permission_origins: deps.connections.permissionOrigins(r.code, baseUrl),
        cookie_domain: deps.connections.cookieDomain(r.code, baseUrl),
        state: r.session_state, auth_method: r.auth_method ?? null, last_push_at: r.last_push_at, last_error: localizeStored(r.last_error, lang),
        managed: managed(r.auth_method ? r : null),
        consented: consents.has(r.code),
      });
    }
    return out;
  });

  /**
   * Tiện ích gửi phiên. Chỉ nhận đúng cookies_required, probe ngay (phiên sống + thuộc tài khoản nguồn nào)
   * rồi mới lưu vault. Kết nối mật khẩu/SSO đang tốt thì bỏ qua — hệ thống đã tự lo.
   *
   * Cookie định danh (stable_cookies, vd meId/companyId của eTask) tiện ích chỉ đọc được khi đang mở trang nguồn:
   * gửi thiếu thì dùng lại giá trị của phiên đang lưu của chính người này (kết nối tiện ích, chưa thu hồi).
   * `expires`: thời hạn cookie (giây epoch, KHÔNG có giá trị cookie) ⇒ lưu session_expires_at để biết trước khi hết hạn.
   */
  app.put<{ Params: { source: string }; Body: { cookies: Record<string, string>; expires?: Record<string, number> } }>('/ext/sources/:source/session', {
    schema: { body: { type: 'object', required: ['cookies'], properties: {
      cookies: { type: 'object', maxProperties: 30, additionalProperties: { type: 'string', maxLength: 4096 } },
      expires: { type: 'object', maxProperties: 30, additionalProperties: { type: 'number' } } } } },
  }, async (req) => {
    const userId = req.user.id;
    const source = req.params.source;
    const src = await withTenant(deps.writer, (t) => t.oneOrNone(
      `SELECT 1 FROM source_systems WHERE code = $1 AND enabled AND 'extension' = ANY(connection_methods)`, [source]));
    if (!src) throw new Problem('not_found', L('Hệ thống nguồn này không nhận phiên từ tiện ích', 'This source system does not accept sessions from the browser extension'));
    if (!(await deps.limiter.take(`ext:${userId}:${source}`, 5))) throw new Problem('rate_limited', L('Gửi phiên quá dày, thử lại sau vài giây', 'Sessions are being sent too often, try again in a few seconds'));

    const g = await withTenant(deps.writer, (t) => t.oneOrNone<GrantRow>(
      'SELECT auth_method, session_state, revoked_at FROM source_grants WHERE app_user_id = $1 AND source_system = $2', [userId, source]));
    if (managed(g)) return { status: 'skipped', reason: 'managed', message: langOf(req.headers['accept-language']) === 'en'
      ? 'This connection uses a username/password or SSO; the system obtains sessions automatically'
      : 'Kết nối đang dùng tài khoản/mật khẩu hoặc SSO, hệ thống tự lấy phiên' };

    // Bổ sung cookie định danh chỉ khi kết nối hiện tại của người này là qua tiện ích (không lấy của kết nối khác).
    const canFill = !!g && g.auth_method === 'extension' && g.revoked_at === null;
    const { cookies: raw, filled } = canFill ? await deps.connections.fillStableCookies(userId, source, req.body.cookies) : { cookies: req.body.cookies, filled: [] as string[] };
    // Phiên trên trình duyệt chưa đăng nhập / đã hết hạn ⇒ session_expired (409), không ghi gì.
    const { cookies, session } = await deps.connections.verifyCookies(source, raw).catch((e) => {
      // Chỉ ghi tên cookie và lý do — không bao giờ ghi giá trị.
      req.log.warn({ source, user: userId, names: Object.keys(req.body.cookies), filled, reason: (e as Problem).detail ?? (e as Error).message }, 'tiện ích gửi phiên không dùng được');
      const stable = deps.connections.stableCookies(source).filter((n) => !req.body.cookies[n] && !filled.includes(n));
      if (e instanceof Problem && e.type === 'session_expired' && stable.length) {
        throw new Problem('session_expired', L('Cần mở trang hệ thống nguồn một lần', 'Open the source system page once'),
          L(`Mở ${source} trên trình duyệt để tiện ích đọc được ${stable.join(', ')}`, `Open ${source} in the browser so the extension can read ${stable.join(', ')}`));
      }
      throw e;
    });
    await saveSourceAccount(deps.writer, { source, userId }, session);          // puid đã thuộc người khác ⇒ 403
    await deps.connections.saveSession(userId, source, cookies);
    // Thời hạn phiên = thời hạn sớm nhất trong các cookie phiên trình duyệt vừa gửi (bỏ qua giá trị vô lý).
    const now = Date.now() / 1000;
    const exps = Object.entries(req.body.expires ?? {})
      .filter(([n, v]) => n in cookies && !filled.includes(n) && Number.isFinite(v) && v > now - 86_400 && v < now + 400 * 86_400)
      .map(([, v]) => v);
    const expiresAt = exps.length ? new Date(Math.min(...exps) * 1000) : null;

    const all = loadAllSpecs().filter((x) => x.source_system === source).flatMap((x) => x.capabilities.map((c) => c.id));
    const changed = !g || g.revoked_at !== null || g.auth_method !== 'extension' || g.session_state !== 'active';
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `INSERT INTO source_grants (app_user_id, source_system, scope_capabilities, vault_ref, session_state, auth_method,
                                    source_username, configured_by, session_expires_at, last_push_at, last_refresh_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', 'extension', NULL, $1, $5, now(), now(), now())
         ON CONFLICT (app_user_id, source_system) DO UPDATE
           SET session_state = 'active', auth_method = 'extension', source_username = NULL, configured_by = $1,
               session_expires_at = EXCLUDED.session_expires_at, revoked_at = NULL, last_error = NULL, refresh_fail_count = 0,
               last_push_at = now(), last_refresh_at = now(), updated_at = now(),
               scope_capabilities = CASE WHEN source_grants.auth_method = 'extension' AND source_grants.revoked_at IS NULL
                                         THEN source_grants.scope_capabilities ELSE EXCLUDED.scope_capabilities END`,
        [userId, source, all, vaultRef(currentSchema(), userId, source), expiresAt]);
      // Audit khi kết nối bắt đầu/đổi cách lấy; các lần gửi lại cùng cách chỉ cập nhật last_push_at.
      if (changed) await audit(t, req, 'grant', { type: 'connection', id: `${userId}/${source}` }, { auth_method: 'extension', by: 'self', device: req.extDeviceId });
    });
    return { status: 'active', filled, expires_at: expiresAt };
  });

  /**
   * Dò cookie phiên: tiện ích gửi TẠM mọi cookie của tên miền nguồn (người dùng bấm nút, đồng ý rõ ràng).
   * Máy chủ chỉ probe (đọc trang, không ghi), trả về TÊN các cookie thật sự cần — không lưu, không log giá trị.
   */
  app.post<{ Params: { source: string }; Body: { cookies: Record<string, string> } }>('/ext/sources/:source/discover', {
    schema: { body: { type: 'object', required: ['cookies'], properties: {
      cookies: { type: 'object', minProperties: 1, maxProperties: 40, additionalProperties: { type: 'string', maxLength: 8192 } } } } },
  }, async (req) => {
    const src = await withTenant(deps.writer, (t) => t.oneOrNone('SELECT 1 FROM source_systems WHERE code = $1 AND enabled', [req.params.source]));
    if (!src) throw new Problem('not_found', L('Không có hệ thống nguồn này', 'Source system not found'));
    if (!(await deps.limiter.take(`ext-discover:${req.user.id}`, 60))) throw new Problem('rate_limited', L('Mỗi phút chỉ dò một lần', 'Only one detection per minute'));
    const r = await deps.connections.discoverCookies(req.params.source, req.body.cookies);
    req.log.info({ source: req.params.source, user: req.user.id, sent: Object.keys(req.body.cookies), result: r }, 'dò cookie phiên');
    const out = r.ok ? r : { ...r, detail: localizeStored(r.detail, langOf(req.headers['accept-language'])) };
    return { ...out, expected: deps.connections.cookieGroups(req.params.source) };
  });

  /** Tiện ích đăng xuất: thu hồi token của chính thiết bị này. */
  app.post('/ext/logout', async (req, reply) => {
    await withTenant(deps.writer, (t) => t.none('UPDATE extension_devices SET revoked_at = now() WHERE id = $1', [req.extDeviceId]));
    return reply.status(204).send();
  });
};

/** /me/extension-devices — người dùng xem và thu hồi các máy đã đăng nhập Vala Desktop (token cổng). */
export const extensionDeviceRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /**
   * Vala Desktop: người dùng đã đăng nhập cổng ngay trong ứng dụng (tab Báo cáo — mật khẩu hoặc SSO) ⇒ cổng cấp luôn token
   * thiết bị cho ứng dụng qua cầu nối, người dùng không phải đăng nhập lần nữa. Token chỉ trả cho chính người đang đăng nhập.
   */
  app.post<{ Body: { device_name?: string } }>('/me/extension-devices', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { device_name: { type: 'string', maxLength: 100 } } } },
  }, async (req) => {
    if (!(await deps.limiter.take(`desktop-device:${req.user.id}`, 10))) {
      throw new Problem('rate_limited', L('Vừa cấp quyền cho ứng dụng, thử lại sau vài giây', 'The app was just authorized, try again in a few seconds'));
    }
    return issueDeviceToken(deps, req, req.user.id, req.body?.device_name, 'desktop');
  });

  app.get('/me/extension-devices', async (req) => {
    const rows = await withTenant(deps.writer, (t) => t.any<{ ten: string }>(
      `SELECT id, ten, created_at, last_used_at, expires_at FROM extension_devices
        WHERE app_user_id = $1 AND kind = 'desktop' AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`, [req.user.id]));
    // Tên mặc định khi tiện ích không gửi device_name.
    const en = langOf(req.headers['accept-language']) === 'en';
    return rows.map((r) => (en && r.ten === 'Trình duyệt' ? { ...r, ten: 'Browser' } : r));
  });

  app.delete<{ Params: { id: string } }>('/me/extension-devices/:id', async (req, reply) => {
    const r = await withTenant(deps.writer, (t) => t.result(
      'UPDATE extension_devices SET revoked_at = now() WHERE id = $1 AND app_user_id = $2 AND revoked_at IS NULL',
      [Number(req.params.id), req.user.id]));
    if (!r.rowCount) throw new Problem('not_found', L('Không có thiết bị này', 'Device not found'));
    return reply.status(204).send();
  });
};

/**
 * Gói kịch bản Vala Desktop (quản trị vận hành): CSS + JS chạy trong trang hệ thống nguồn — sửa lỗi giao diện khi nhúng
 * và khai báo thao tác có tên. Lưu CSDL, mỗi lần đổi nội dung tăng version + lưu lịch sử, mọi lần sửa ghi audit.
 * Ứng dụng tải qua GET /ext/desktop-packages (routes/extension.ts), gói đã ký.
 */
import { Script } from 'node:vm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { isValidMatch, keyFingerprint, L, langOf, Problem, withTenant, type AuthMethod, type SignedFields, type Tx } from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';

interface PackageBody {
  ten: string; mo_ta?: string | null; source_system?: string | null; matches: string[];
  css?: string; script?: string; is_enabled?: boolean; ghi_chu?: string;
}
const packageBodySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    ten: { type: 'string', minLength: 1, maxLength: 200 },
    mo_ta: { type: ['string', 'null'], maxLength: 1000 },
    source_system: { type: ['string', 'null'], maxLength: 64 },
    matches: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 300 } },
    css: { type: 'string', maxLength: 200_000 },
    script: { type: 'string', maxLength: 500_000 },
    is_enabled: { type: 'boolean' },
    ghi_chu: { type: 'string', maxLength: 500 },
  },
} as const;
const BODY_LIMIT = 1024 * 1024;

export interface PackageRow extends SignedFields {
  ten: string; mo_ta: string | null; source_system: string | null; is_enabled: boolean; updated_at: Date;
}

/** Kiểm mẫu địa chỉ + cú pháp JS (chỉ biên dịch, KHÔNG chạy) để quản trị thấy lỗi ngay khi lưu thay vì trên máy người dùng. */
function validate(b: Partial<PackageBody>) {
  const bad = b.matches?.filter((m) => !isValidMatch(m.trim())) ?? [];
  if (bad.length) {
    throw new Problem('invalid_params', L('Mẫu địa chỉ trang không hợp lệ', 'Invalid page address pattern'),
      L(`${bad.join(', ')} — dạng đúng: https://egov.bkav.com/* hoặc https://*.bkav.com/duong-dan/*`,
        `${bad.join(', ')} — expected e.g. https://egov.bkav.com/* or https://*.bkav.com/path/*`));
  }
  if (b.script) {
    try { new Script(`(async function (vala) {\n${b.script}\n})`, { filename: 'kich-ban.js' }); } catch (e) {
      throw new Problem('invalid_params', L('Kịch bản có lỗi cú pháp', 'The script has a syntax error'), (e as Error).message);
    }
  }
}

function dbError(e: { code?: string; constraint?: string }): never {
  if (e.code === '23505') throw new Problem('invalid_params', L('Mã gói đã tồn tại', 'Package code already exists'));
  if (e.code === '23503') throw new Problem('invalid_params', L('Không có hệ thống nguồn này', 'Source system not found'));
  if (e.code === '23514') throw new Problem('invalid_params', L('Dữ liệu gói không hợp lệ', 'Invalid package data'), e.constraint);
  throw e;
}

async function getPackage(t: Tx, code: string): Promise<PackageRow> {
  const row = await t.oneOrNone<PackageRow>('SELECT * FROM desktop_packages WHERE code = $1', [code]);
  if (!row) throw new Problem('not_found', L('Không có gói kịch bản này', 'Script package not found'));
  return row;
}

/** Lưu bản hiện hành vào lịch sử (gọi sau mỗi lần nội dung đổi). */
const saveVersion = (t: Tx, req: FastifyRequest, p: SignedFields, note?: string) => t.none(
  `INSERT INTO desktop_package_versions (code, version, matches, css, script, ghi_chu, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [p.code, p.version, p.matches, p.css, p.script, note?.trim() || null, req.user.id]);

const cleanMatches = (m: string[]) => [...new Set(m.map((x) => x.trim()))];

export const adminDesktopRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/admin/desktop-packages', async () => {
    const packages = await withTenant(deps.writer, (t) => t.any(
      `SELECT p.code, p.ten, p.mo_ta, p.source_system, ss.ten AS source_ten, p.matches, p.version, p.is_enabled, p.updated_at,
              u.ho_ten AS updated_by, length(p.css) AS css_bytes, length(p.script) AS script_bytes
         FROM desktop_packages p LEFT JOIN core.source_systems ss ON ss.code = p.source_system
         LEFT JOIN app_users u ON u.id = p.updated_by ORDER BY p.code`));
    return { key_fingerprint: keyFingerprint(deps.packageSigner.publicKey), packages };
  });

  app.get<{ Params: { code: string } }>('/admin/desktop-packages/:code', async (req) => withTenant(deps.writer, async (t) => {
    const p = await getPackage(t, req.params.code);
    const versions = await t.any(
      `SELECT v.version, v.ghi_chu, v.created_at, u.ho_ten AS created_by, length(v.css) + length(v.script) AS bytes
         FROM desktop_package_versions v LEFT JOIN app_users u ON u.id = v.created_by
        WHERE v.code = $1 ORDER BY v.version DESC LIMIT 100`, [p.code]);
    return { ...p, versions };
  }));

  app.get<{ Params: { code: string; version: string } }>('/admin/desktop-packages/:code/versions/:version', async (req) => {
    const v = await withTenant(deps.writer, (t) => t.oneOrNone(
      'SELECT code, version, matches, css, script, ghi_chu, created_at FROM desktop_package_versions WHERE code = $1 AND version = $2',
      [req.params.code, Number(req.params.version)]));
    if (!v) throw new Problem('not_found', L('Không có phiên bản này', 'Version not found'));
    return v;
  });

  app.post<{ Body: PackageBody & { code: string } }>('/admin/desktop-packages', {
    bodyLimit: BODY_LIMIT,
    schema: { body: { ...packageBodySchema, required: ['code', 'ten', 'matches'],
      properties: { ...packageBodySchema.properties, code: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,62}$' } } } },
  }, async (req, reply) => {
    const b = req.body;
    validate(b);
    const p: SignedFields = { code: b.code, version: 1, matches: cleanMatches(b.matches), css: b.css ?? '', script: b.script ?? '' };
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `INSERT INTO desktop_packages (code, ten, mo_ta, source_system, matches, css, script, version, is_enabled, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9)`,
        [p.code, b.ten, b.mo_ta ?? null, b.source_system || null, p.matches, p.css, p.script, b.is_enabled ?? true, req.user.id]).catch(dbError);
      await saveVersion(t, req, p, b.ghi_chu);
      await audit(t, req, 'source_change', { type: 'desktop_package', id: p.code }, { op: 'create', version: 1, bytes: p.css.length + p.script.length });
    });
    return reply.status(201).send({ code: p.code, version: 1 });
  });

  /** Sửa gói. Đổi nội dung (mẫu địa chỉ / CSS / JS) ⇒ version + 1, ứng dụng tải bản mới ở lần kiểm kế tiếp. */
  app.patch<{ Params: { code: string }; Body: Partial<PackageBody> }>('/admin/desktop-packages/:code', {
    bodyLimit: BODY_LIMIT, schema: { body: packageBodySchema },
  }, async (req) => {
    const b = req.body;
    validate(b);
    return withTenant(deps.writer, async (t) => {
      const cur = await getPackage(t, req.params.code);
      const next: SignedFields = {
        code: cur.code, version: cur.version,
        matches: b.matches ? cleanMatches(b.matches) : cur.matches, css: b.css ?? cur.css, script: b.script ?? cur.script,
      };
      const changed = next.css !== cur.css || next.script !== cur.script || next.matches.join('\n') !== cur.matches.join('\n');
      if (changed) next.version = cur.version + 1;
      await t.none(
        `UPDATE desktop_packages SET ten = $2, mo_ta = $3, source_system = $4, matches = $5, css = $6, script = $7, version = $8,
                is_enabled = $9, updated_at = now(), updated_by = $10 WHERE code = $1`,
        [cur.code, b.ten ?? cur.ten, b.mo_ta !== undefined ? b.mo_ta : cur.mo_ta, b.source_system !== undefined ? b.source_system || null : cur.source_system,
         next.matches, next.css, next.script, next.version, b.is_enabled ?? cur.is_enabled, req.user.id]).catch(dbError);
      if (changed) await saveVersion(t, req, next, b.ghi_chu);
      await audit(t, req, 'source_change', { type: 'desktop_package', id: cur.code },
        { op: changed ? 'edit_code' : 'edit', version: next.version, ...(b.is_enabled !== undefined ? { is_enabled: b.is_enabled } : {}) });
      return { code: cur.code, version: next.version, changed };
    });
  });

  /** Quay về bản cũ = tạo bản MỚI có nội dung của bản cũ (version luôn tăng, ứng dụng mới nhận ra có thay đổi). */
  app.post<{ Params: { code: string }; Body: { version: number } }>('/admin/desktop-packages/:code/rollback', {
    schema: { body: { type: 'object', required: ['version'], properties: { version: { type: 'integer', minimum: 1 } } } },
  }, async (req) => withTenant(deps.writer, async (t) => {
    const cur = await getPackage(t, req.params.code);
    const old = await t.oneOrNone<SignedFields>('SELECT code, version, matches, css, script FROM desktop_package_versions WHERE code = $1 AND version = $2',
      [cur.code, req.body.version]);
    if (!old) throw new Problem('not_found', L('Không có phiên bản này', 'Version not found'));
    const next: SignedFields = { ...old, version: cur.version + 1 };
    await t.none('UPDATE desktop_packages SET matches = $2, css = $3, script = $4, version = $5, updated_at = now(), updated_by = $6 WHERE code = $1',
      [cur.code, next.matches, next.css, next.script, next.version, req.user.id]);
    const lang = langOf(req.headers['accept-language']);
    await saveVersion(t, req, next, lang === 'en' ? `Restored from version ${old.version}` : `Quay về bản ${old.version}`);
    await audit(t, req, 'source_change', { type: 'desktop_package', id: cur.code }, { op: 'rollback', from: old.version, version: next.version });
    return { code: cur.code, version: next.version };
  }));

  /**
   * Chạy thử trên MÁY CHỦ (runner, Chromium không giao diện) cho một người dùng: mở trang hệ thống nguồn của gói bằng phiên
   * người đó trong kho bí mật, chèn cùng các gói như Vala Desktop, chạy thao tác (không có action ⇒ liệt kê thao tác).
   * Chạy bằng bản đã lưu. Ghi audit (không ghi tham số / kết quả).
   */
  app.post<{ Params: { code: string }; Body: { user_id: number; action?: string; args?: Record<string, unknown> } }>('/admin/desktop-packages/:code/run-server', {
    schema: { body: { type: 'object', required: ['user_id'], additionalProperties: false, properties: {
      user_id: { type: 'integer' }, action: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,62}$' }, args: { type: 'object' } } } },
  }, async (req) => {
    const runner = deps.config.runnerUrl;
    if (!runner) {
      throw new Problem('internal', L('Máy chủ chưa bật runner chạy kịch bản', 'The script runner is not enabled on the server'),
        L('Đặt RUNNER_URL trong .env (xem docs/kich-ban-desktop.md)', 'Set RUNNER_URL in .env (see docs/kich-ban-desktop.md)'));
    }
    const { pkg, all, grant } = await withTenant(deps.writer, async (t) => {
      const p = await getPackage(t, req.params.code);
      if (!p.source_system) throw new Problem('invalid_params', L('Gói chưa gắn hệ thống nguồn', 'The package is not linked to a source system'));
      const g = await t.oneOrNone<{ auth_method: AuthMethod }>(
        `SELECT auth_method FROM source_grants WHERE app_user_id = $1 AND source_system = $2 AND revoked_at IS NULL`, [req.body.user_id, p.source_system]);
      if (!g) throw new Problem('grant_required', L('Người dùng này chưa kết nối hệ thống nguồn của gói', 'This user has not connected the package’s source system'));
      const others = await t.any<SignedFields>('SELECT code, version, matches, css, script FROM desktop_packages WHERE is_enabled AND code <> $1', [p.code]);
      await audit(t, req, 'run_now', { type: 'desktop_package', id: p.code }, { where: 'server', user_id: req.body.user_id, action: req.body.action ?? null, version: p.version });
      return { pkg: p, all: [p, ...others], grant: g };
    });
    const source = pkg.source_system!;
    const session = await deps.connections.sessionFor(req.body.user_id, source, grant.auth_method);
    const { baseUrl } = await deps.sourceInfo(source);
    const domain = deps.connections.cookieDomain(source, baseUrl);
    const host = new URL(baseUrl).hostname;
    const cookies = Object.entries(session.cookies).map(([name, value]) => (domain !== host ? { name, value, domain: `.${domain}` } : { name, value, url: baseUrl }));
    let res: Response;
    try {
      res = await fetch(`${runner}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.config.internalToken}` },
        body: JSON.stringify({ url: baseUrl, cookies, packages: all.map((p) => ({ code: p.code, version: p.version, matches: p.matches, css: p.css, script: p.script })),
          action: req.body.action, args: req.body.args ?? {}, timeout_ms: 90_000 }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      throw new Problem('internal', L('Không gọi được runner', 'Could not reach the script runner'), (e as Error).message);
    }
    if (res.status === 429) throw new Problem('internal', L('Runner đang bận, thử lại sau ít phút', 'The runner is busy, try again in a few minutes'));
    if (!res.ok) throw new Problem('internal', L('Runner lỗi', 'Runner error'), `HTTP ${res.status}`);
    return res.json();
  });

  app.delete<{ Params: { code: string } }>('/admin/desktop-packages/:code', async (req, reply) => {
    await withTenant(deps.writer, async (t) => {
      const cur = await getPackage(t, req.params.code);
      await audit(t, req, 'source_change', { type: 'desktop_package', id: cur.code }, { op: 'delete', version: cur.version });
      await t.none('DELETE FROM desktop_packages WHERE code = $1', [cur.code]);
    });
    return reply.status(204).send();
  });
};

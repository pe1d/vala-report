/**
 * Quản trị — Hệ thống nguồn. MỌI hệ thống (kể cả hệ thống có sẵn lúc cài) cấu hình trong CSDL, không trong code:
 *   - cấu hình đầy đủ (adapter YAML): xác thực, endpoint được phép, cách lấy + chuẩn hoá dữ liệu, bảng đích,
 *     thẻ Tổng quan — sửa ngay trên cổng, máy chủ kiểm tra (parseSpec) trước khi lưu;
 *   - cấu hình nhanh (auth_profile): chỉ phiên đăng nhập, cho hệ thống mới chưa có spider.
 * Không xoá hệ thống: dữ liệu, lịch sử chạy và kết nối tham chiếu tới; tắt thay cho xoá.
 */
import type { FastifyPluginAsync } from 'fastify';
import { Problem, ensureRecordIndexes, withTenant, type AuthMethod, type SourceRow } from '@vala/core';
import { AuthProfileSchema, parseSpec, registerSpecs, type AdapterSpec } from '@vala/core/adapter';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';

const METHODS: AuthMethod[] = ['extension', 'cookie', 'password', 'sso'];

interface SourceBody {
  code?: string;
  ten?: string;
  mo_ta?: string | null;
  base_url?: string;
  enabled?: boolean;
  connection_methods?: AuthMethod[];
  auth_profile?: unknown;
  adapter_yaml?: string;
}

/** Kiểm tra YAML adapter; lỗi ⇒ 422 kèm thông báo dễ đọc (zod / YAML / ràng buộc). */
function parseAdapter(code: string, yaml: string): AdapterSpec {
  let spec: AdapterSpec;
  try {
    spec = parseSpec(yaml);
  } catch (e) {
    const err = e as { issues?: Array<{ path: Array<string | number>; message: string }>; message: string };
    const detail = err.issues?.length
      ? err.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : err.message.split('\n').slice(0, 6).join(' ');
    throw new Problem('invalid_params', 'Cấu hình adapter chưa hợp lệ', detail.slice(0, 800));
  }
  if (spec.source_system !== code) {
    throw new Problem('invalid_params', 'Cấu hình adapter chưa hợp lệ', `adapter.source_system phải là '${code}' (đang là '${spec.source_system}')`);
  }
  return spec;
}

/** Tóm tắt adapter cho trang quản trị. */
const summarize = (s: AdapterSpec) => ({
  id: s.id, version: s.version, allowed_endpoints: s.allowed_endpoints.length,
  password_login: !!s.auth.password_login, sso_bootstrap: !!s.auth.bootstrap,
  capabilities: s.capabilities.map((c) => ({ id: c.id, ten: c.ten, sink: c.sink?.table ?? null })),
});

const bodySchema = {
  type: 'object', additionalProperties: false, properties: {
    code: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,29}$' },
    ten: { type: 'string', minLength: 2, maxLength: 120 },
    mo_ta: { type: ['string', 'null'], maxLength: 500 },
    base_url: { type: 'string', maxLength: 300 },
    enabled: { type: 'boolean' },
    connection_methods: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: METHODS } },
    auth_profile: { type: 'object' },
    adapter_yaml: { type: 'string', minLength: 20, maxLength: 200_000 },
  },
} as const;

/** Chỉ https (http cho localhost và tên miền .test dành riêng cho thử nghiệm). Trả origin + path gốc, bỏ query/fragment. */
function normalizeBaseUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Problem('invalid_params', 'Địa chỉ không hợp lệ', raw); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.test');
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Problem('invalid_params', 'Địa chỉ phải dùng https://');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

function parseProfile(raw: unknown) {
  const p = AuthProfileSchema.safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0]!;
    throw new Problem('invalid_params', 'Cấu hình phiên chưa hợp lệ', `${i.path.join('.') || 'auth_profile'}: ${i.message}`);
  }
  return p.data;
}

export const adminSourceRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /** Cách kết nối hệ thống này thực sự hỗ trợ (theo adapter / hồ sơ). */
  const supported = (code: string, portal: boolean): AuthMethod[] => {
    if (portal) return ['extension', 'cookie'];
    const out: AuthMethod[] = ['extension', 'cookie'];
    if (deps.connections.supportsPassword(code)) out.push('password');
    try { if (deps.connections.spec(code).auth.bootstrap) out.push('sso'); } catch { /* chưa có adapter */ }
    return out;
  };

  const view = async (r: SourceRow, counts: Record<string, { conns: number; spiders: number; reports: number }>) => {
    const portal = !r.adapter_yaml && !!r.auth_profile;
    let adapter: ReturnType<typeof summarize> | null = null;
    try { if (r.adapter_yaml) adapter = summarize(deps.connections.spec(r.code)); } catch { /* lỗi đã nằm trong registry.errors */ }
    let auth: unknown = null;
    try {
      const s = deps.connections.spec(r.code);
      auth = { cookie_groups: deps.connections.cookieGroups(r.code), cookies_optional: s.auth.cookies_optional ?? [],
        cookie_domain: s.auth.cookie_domain ?? null, probe_path: s.auth.session_probe.request.path };
    } catch { /* chưa có adapter và chưa có hồ sơ */ }
    const info = await deps.sourceInfo(r.code);
    return {
      code: r.code, ten: r.ten, mo_ta: r.mo_ta, base_url: r.base_url, effective_base_url: info.baseUrl, enabled: r.enabled,
      connection_methods: r.connection_methods, supported_methods: supported(r.code, portal),
      managed_by: portal ? 'portal' : 'adapter', auth_profile: portal ? r.auth_profile : null, auth, updated_at: r.updated_at,
      adapter, adapter_updated_at: r.adapter_updated_at, adapter_error: deps.sources.errors.get(r.code) ?? null,
      ...(counts[r.code] ?? { conns: 0, spiders: 0, reports: 0 }),
    };
  };

  const counts = () => withTenant(deps.writer, async (t) => {
    const rows = await t.any<{ code: string; conns: number; spiders: number; reports: number }>(
      `SELECT ss.code,
              (SELECT count(*)::int FROM source_grants g WHERE g.source_system = ss.code AND g.revoked_at IS NULL AND g.session_state = 'active') AS conns,
              (SELECT count(*)::int FROM core.crawl_spiders sp WHERE sp.source_system = ss.code) AS spiders,
              (SELECT count(*)::int FROM report_catalog rc WHERE rc.source_system = ss.code AND rc.is_active) AS reports
         FROM core.source_systems ss`);
    return Object.fromEntries(rows.map((r) => [r.code, r]));
  });

  app.get('/admin/sources', async () => {
    const c = await counts();
    return Promise.all(deps.sources.list().map((r) => view(r, c)));
  });

  app.post<{ Body: SourceBody }>('/admin/sources', { schema: { body: { ...bodySchema, required: ['code', 'ten', 'base_url'] } } }, async (req, reply) => {
    const b = req.body;
    const code = b.code!;
    if (deps.sources.get(code)) throw new Problem('invalid_params', 'Mã hệ thống đã tồn tại', code);
    if (!b.auth_profile === !b.adapter_yaml) throw new Problem('invalid_params', 'Cần đúng một trong hai: cấu hình nhanh (phiên đăng nhập) hoặc cấu hình adapter đầy đủ');
    const profile = b.auth_profile ? parseProfile(b.auth_profile) : null;
    const spec = b.adapter_yaml ? parseAdapter(code, b.adapter_yaml) : null;
    const ok: AuthMethod[] = spec
      ? ['extension', 'cookie', ...(spec.auth.password_login ? ['password' as const] : []), ...(spec.auth.bootstrap ? ['sso' as const] : [])]
      : ['extension', 'cookie'];
    const methods = b.connection_methods ?? ok.filter((m) => m !== 'sso');
    const bad = methods.filter((m) => !ok.includes(m));
    if (bad.length) throw new Problem('invalid_params', 'Hệ thống này không hỗ trợ cách kết nối đã chọn',
      `${bad.join(', ')} cần adapter có cách tự đăng nhập (password_login / bootstrap)`);
    const baseUrl = normalizeBaseUrl(b.base_url!);
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `INSERT INTO core.source_systems (code, ten, mo_ta, base_url, auth_mode, auth_profile, adapter_yaml, adapter_updated_at,
                                          adapter_updated_by, connection_methods, created_by)
         VALUES ($1, $2, $3, $4, 'delegated_session', $5, $6, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END, $7, $8, $7)`,
        [code, b.ten!.trim(), b.mo_ta?.trim() || null, baseUrl, profile ? JSON.stringify(profile) : null, b.adapter_yaml ?? null, req.user.id, methods]);
      if (spec) await registerSpecs(t, [spec]);
      await audit(t, req, 'source_change', { type: 'source_system', id: code }, { op: 'create', base_url: baseUrl, kind: spec ? 'adapter' : 'profile' });
    });
    await deps.sources.reload();
    return reply.status(201).send(await view(deps.sources.get(code)!, await counts()));
  });

  app.patch<{ Params: { code: string }; Body: SourceBody }>('/admin/sources/:code', { schema: { body: bodySchema } }, async (req) => {
    const cur = deps.sources.get(req.params.code);
    if (!cur) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    const b = req.body;
    if (b.code && b.code !== cur.code) throw new Problem('invalid_params', 'Không đổi được mã hệ thống');
    if (b.adapter_yaml !== undefined) throw new Problem('invalid_params', 'Sửa cấu hình adapter qua PUT /admin/sources/:code/adapter');
    const portal = !cur.adapter_yaml && !!cur.auth_profile;
    if (b.auth_profile !== undefined && !portal) {
      throw new Problem('invalid_params', 'Hệ thống này dùng cấu hình adapter đầy đủ', 'Sửa phần auth trong cấu hình adapter');
    }
    const profile = b.auth_profile !== undefined ? parseProfile(b.auth_profile) : undefined;
    if (b.connection_methods) {
      const ok = supported(cur.code, portal);
      const bad = b.connection_methods.filter((m) => !ok.includes(m));
      if (bad.length) throw new Problem('invalid_params', 'Hệ thống này không hỗ trợ cách kết nối đã chọn', `không hỗ trợ: ${bad.join(', ')}`);
    }
    const baseUrl = b.base_url !== undefined ? normalizeBaseUrl(b.base_url) : undefined;
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `UPDATE core.source_systems SET
            ten = coalesce($2, ten), mo_ta = CASE WHEN $3::boolean THEN $4 ELSE mo_ta END, base_url = coalesce($5, base_url),
            enabled = coalesce($6, enabled), connection_methods = coalesce($7, connection_methods),
            auth_profile = coalesce($8, auth_profile), updated_at = now()
          WHERE code = $1`,
        [cur.code, b.ten?.trim() ?? null, b.mo_ta !== undefined, b.mo_ta?.trim() || null, baseUrl ?? null,
         b.enabled ?? null, b.connection_methods ?? null, profile ? JSON.stringify(profile) : null]);
      await audit(t, req, 'source_change', { type: 'source_system', id: cur.code },
        { op: 'update', fields: Object.keys(b) });
    });
    await deps.sources.reload();
    return view(deps.sources.get(cur.code)!, await counts());
  });

  // ---- cấu hình adapter đầy đủ (YAML) ----
  app.get<{ Params: { code: string } }>('/admin/sources/:code/adapter', async (req) => {
    const cur = deps.sources.get(req.params.code);
    if (!cur) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    return { code: cur.code, yaml: cur.adapter_yaml, updated_at: cur.adapter_updated_at, error: deps.sources.errors.get(cur.code) ?? null };
  });

  /** Kiểm tra mà không lưu — nút "Kiểm tra" trên trang. */
  app.post<{ Params: { code: string }; Body: { yaml: string } }>('/admin/sources/:code/adapter/validate', {
    schema: { body: { type: 'object', required: ['yaml'], properties: { yaml: { type: 'string', maxLength: 200_000 } } } },
  }, async (req) => {
    if (!deps.sources.get(req.params.code)) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    return { ok: true, summary: summarize(parseAdapter(req.params.code, req.body.yaml)) };
  });

  /**
   * Lưu cấu hình adapter. Thay cấu hình nhanh (nếu có). Cách kết nối không còn được hỗ trợ bị bỏ khỏi
   * connection_methods. Ghi core.adapters (bản đang dùng) và audit; các tiến trình khác thấy trong ≤ 1 phút.
   */
  app.put<{ Params: { code: string }; Body: { yaml: string } }>('/admin/sources/:code/adapter', {
    schema: { body: { type: 'object', required: ['yaml'], properties: { yaml: { type: 'string', minLength: 20, maxLength: 200_000 } } } },
  }, async (req) => {
    const cur = deps.sources.get(req.params.code);
    if (!cur) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    const spec = parseAdapter(cur.code, req.body.yaml);
    const ok: AuthMethod[] = ['extension', 'cookie', ...(spec.auth.password_login ? ['password' as const] : []), ...(spec.auth.bootstrap ? ['sso' as const] : [])];
    const methods = cur.connection_methods.filter((m) => ok.includes(m));
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `UPDATE core.source_systems SET adapter_yaml = $2, auth_profile = NULL, adapter_updated_at = now(), adapter_updated_by = $3,
                connection_methods = $4, updated_at = now() WHERE code = $1`,
        [cur.code, req.body.yaml, req.user.id, methods.length ? methods : ['extension', 'cookie']]);
      await registerSpecs(t, [spec]);
      await audit(t, req, 'source_change', { type: 'source_system', id: cur.code }, { op: 'adapter', id: spec.id, version: spec.version });
    });
    await deps.sources.reload();
    // Trường mới khai `index: true` ⇒ tạo chỉ mục ngay (hàm CSDL tự kiểm định danh, gọi lại nhiều lần an toàn).
    await ensureRecordIndexes(deps.writer, [spec]);
    return view(deps.sources.get(cur.code)!, await counts());
  });
};

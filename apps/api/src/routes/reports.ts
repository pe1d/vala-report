import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  L, Problem, allowedScopes, langOf, loadMemberships, resolveUserContext, withTenant, withUserContext, type Scope, type Tx,
} from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { toXlsx } from '../export.js';
import { computeFreshness, type Freshness } from '../freshness.js';
import { validateParams } from '../params.js';
import { localizeParamSchema, paramOptions, runDefinition } from '../reports/defined.js';
import type { ReportOutput } from '../reports/index.js';

interface CatalogRow {
  code: string;
  ten: string;
  mo_ta: string | null;
  source_system: string;
  capability: string;
  param_schema: object;
  default_params: object;
  view_template: string;
  required_scope: 'ca_nhan' | 'don_vi' | 'toan_don_vi';
  /** Định nghĩa báo cáo cấu hình (reports/defined.ts). Mọi báo cáo đều là báo cáo cấu hình. */
  definition: unknown | null;
}

export async function loadCatalogEntry(t: Tx, code: string): Promise<CatalogRow> {
  const r = await t.oneOrNone<CatalogRow>('SELECT * FROM report_catalog WHERE code = $1 AND is_active', [code]);
  if (!r || !r.definition) throw new Problem('not_found', L('Không có báo cáo này', 'Report not found'));
  return r;
}

interface RunBody {
  params?: Record<string, unknown>;
  scope?: Scope;
  page?: number;
  page_size?: number;
  /** Tìm trong bảng kết quả. */
  q?: string;
}

/**
 * Chạy một báo cáo cho người đang gọi. Trình tự bắt buộc:
 *   kiểm tham số → tính phạm vi (scope_denied nếu không đủ quyền) → mở transaction với ngữ cảnh RLS
 *   → ghi audit → truy vấn → kèm freshness. Không bao giờ chạm hệ thống nguồn.
 */
export async function runReport(deps: ApiDeps, req: FastifyRequest, code: string, body: RunBody, action: 'view_report' | 'export', maxPageSize: number) {
  const entry = await withTenant(deps.reader, (t) => loadCatalogEntry(t, code));
  const scope: Scope = body.scope ?? (entry.required_scope === 'ca_nhan' ? 'ca_nhan' : 'don_vi');
  if (entry.required_scope !== 'ca_nhan' && scope !== 'don_vi') {
    throw new Problem('scope_denied', L('Báo cáo này chỉ xem được ở phạm vi đơn vị', 'This report can only be viewed at unit scope'));
  }
  const params = validateParams(code, entry.param_schema, entry.default_params, body.params);
  const page = Math.max(1, Math.trunc(body.page ?? 1));
  const pageSize = Math.min(maxPageSize, Math.max(1, Math.trunc(body.page_size ?? 50)));
  const q = typeof body.q === 'string' && body.q.trim() ? body.q.trim().slice(0, 200) : undefined;
  const ctx = await resolveUserContext(deps.reader, req.user.id, scope);
  const lang = langOf(req.headers['accept-language']);

  return withUserContext(deps.reader, ctx, async (t) => {
    const freshness = await computeFreshness(t, req.user.id, entry.source_system, scope, lang);
    if (scope === 'ca_nhan' && freshness.status === 'no_grant' && !freshness.last_success_at) {
      throw new Problem('grant_required', L('Cần uỷ quyền lấy dữ liệu', 'Data fetching must be authorized'),
        L(`Chưa uỷ quyền ${entry.source_system}`, `${entry.source_system} is not authorized`), { source_system: entry.source_system });
    }
    await audit(t, req, action, { type: 'report', id: code }, { scope, params, page, page_size: pageSize, ...(q ? { q } : {}) });
    const input = { params, scope, page, pageSize, q };
    const out: ReportOutput = await runDefinition(t, entry.source_system, entry.definition, input, lang);
    return { entry, scope, params, freshness, out, page, pageSize };
  });
}

export const reportRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/reports', async (req) => {
    const scopes = allowedScopes(await withTenant(deps.reader, (t) => loadMemberships(t, req.user.id)));
    return withUserContext(deps.reader, { userId: req.user.id, scope: 'ca_nhan', orgUnitsAllowed: [] }, async (t) => {
      const rows = await t.any<CatalogRow & { requires_grant: boolean }>(
        `SELECT rc.code, rc.ten, rc.mo_ta, rc.source_system, (SELECT ss.ten FROM source_systems ss WHERE ss.code = rc.source_system) AS source_ten, rc.param_schema, rc.default_params, rc.view_template, rc.required_scope,
                NOT EXISTS (SELECT 1 FROM source_grants g WHERE g.app_user_id = $1 AND g.source_system = rc.source_system
                             AND g.revoked_at IS NULL AND g.session_state = 'active') AS requires_grant
           FROM report_catalog rc WHERE rc.is_active ORDER BY rc.ten`, [req.user.id]);
      const lang = langOf(req.headers['accept-language']);
      return rows.filter((r) => r.required_scope === 'ca_nhan' || scopes.includes('don_vi'))
        .map((r) => ({ ...r, param_schema: localizeParamSchema(r.param_schema, lang) }));
    });
  });

  app.post<{ Params: { code: string }; Body: RunBody }>('/reports/:code/preview', async (req) => {
    const r = await runReport(deps, req, req.params.code, req.body ?? {}, 'view_report', 500);
    return { ...r.out, page: r.page, page_size: r.pageSize, scope: r.scope, freshness: r.freshness };
  });

  app.post<{ Params: { code: string }; Body: RunBody & { format?: 'xlsx' | 'pdf' } }>('/reports/:code/export', async (req, reply) => {
    const format = req.body?.format ?? 'xlsx';
    if (format !== 'xlsx') throw new Problem('invalid_params', L('Định dạng chưa hỗ trợ', 'Format not supported'), L('Bản hiện tại chỉ xuất Excel (xlsx)', 'This version only exports Excel (xlsx)'));
    const r = await runReport(deps, req, req.params.code, { ...req.body, page: 1, page_size: 10_000 }, 'export', 10_000);
    const buf = await toXlsx(r.entry.ten, r.out, r.freshness as Freshness, r.scope, langOf(req.headers['accept-language']));
    const filename = `${r.entry.code}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buf);
  });

  /** Lựa chọn cho tham số lọc có x-options — lấy từ dữ liệu người xem được thấy (RLS), không viết cứng. */
  app.get<{ Params: { code: string; param: string }; Querystring: { scope?: Scope } }>('/reports/:code/options/:param', async (req) => {
    const entry = await withTenant(deps.reader, (t) => loadCatalogEntry(t, req.params.code));
    const prop = (entry.param_schema as { properties?: Record<string, Record<string, unknown>> }).properties?.[req.params.param];
    if (!prop?.['x-options']) throw new Problem('not_found', L('Tham số này không có danh sách lựa chọn', 'This parameter has no list of options'));
    const ctx = await resolveUserContext(deps.reader, req.user.id, req.query.scope ?? 'ca_nhan');
    return withUserContext(deps.reader, ctx, (t) => paramOptions(t, entry.source_system, entry.definition, prop['x-options'], langOf(req.headers['accept-language'])));
  });

  app.get<{ Querystring: { source_system?: string; scope?: Scope } }>('/freshness', async (req) => {
    const scope = req.query.scope ?? 'ca_nhan';
    const ctx = await resolveUserContext(deps.reader, req.user.id, scope);
    if (!req.query.source_system) throw new Problem('invalid_params', L('Cần tham số source_system', 'The source_system parameter is required'));
    return withUserContext(deps.reader, ctx, (t) => computeFreshness(t, req.user.id, req.query.source_system!, scope, langOf(req.headers['accept-language'])));
  });
};

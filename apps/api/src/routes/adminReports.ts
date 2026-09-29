/**
 * Quản trị — Cấu hình báo cáo. Tạo báo cáo mới trên dữ liệu của bất kỳ hệ thống nguồn nào (văn bản, công việc,
 * dữ liệu chung) mà không viết code/SQL, chọn có hiện trên Tổng quan không. Báo cáo viết trong code (có sẵn)
 * chỉ sửa được tên, mô tả, bật/tắt, hiện trên Tổng quan và thứ tự.
 */
import type { FastifyPluginAsync } from 'fastify';
import { Problem, resolveUserContext, withTenant, withUserContext, type Scope } from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { checkDefinition, datasetFields, runDefinition, sourceDatasets, type Dataset } from '../reports/defined.js';
import { REPORTS } from '../reports/index.js';

interface ReportBody {
  code?: string;
  ten?: string;
  mo_ta?: string | null;
  source_system?: string;
  required_scope?: 'ca_nhan' | 'don_vi';
  is_active?: boolean;
  show_on_dashboard?: boolean;
  dashboard_order?: number;
  definition?: unknown;
}

const bodySchema = {
  type: 'object', additionalProperties: false, properties: {
    code: { type: 'string', pattern: '^[a-z][a-z0-9_]{2,59}$' },
    ten: { type: 'string', minLength: 2, maxLength: 150 },
    mo_ta: { type: ['string', 'null'], maxLength: 500 },
    source_system: { type: 'string', maxLength: 30 },
    required_scope: { type: 'string', enum: ['ca_nhan', 'don_vi'] },
    is_active: { type: 'boolean' },
    show_on_dashboard: { type: 'boolean' },
    dashboard_order: { type: 'integer', minimum: 0, maximum: 10_000 },
    definition: { type: 'object' },
  },
} as const;

export const adminReportRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /** Capability ghi vào kho cho tập dữ liệu + spider tương ứng (nếu có) — để lịch chạy và "lấy ngay" biết đường. */
  const wiring = async (source: string, dataset: Dataset, capability?: string) => {
    const ds = sourceDatasets(source).filter((d) => d.dataset === dataset && (!capability || d.capability === capability));
    if (!ds.length) throw new Problem('invalid_params', 'Hệ thống này không có tập dữ liệu đã chọn', `${source}: ${dataset}${capability ? `/${capability}` : ''}`);
    const spider = dataset === 'records' ? null : await withTenant(deps.writer, (t) => t.oneOrNone(
      `SELECT code FROM core.crawl_spiders WHERE source_system = $1 AND entity = $2 AND is_enabled ORDER BY code LIMIT 1`,
      [source, dataset], (r: { code: string } | null) => r?.code ?? null));
    return { capability: ds[0]!.capability, spider_code: spider };
  };

  app.get('/admin/reports', async () => withTenant(deps.writer, async (t) => {
    const rows = await t.any<{ code: string; definition: unknown }>(
      `SELECT rc.code, rc.ten, rc.mo_ta, rc.source_system, ss.ten AS source_ten, rc.capability, rc.view_template, rc.required_scope,
              rc.is_active, rc.show_on_dashboard, rc.dashboard_order, rc.definition, rc.spider_code, rc.updated_at,
              (SELECT count(*)::int FROM report_subscriptions s WHERE s.report_code = rc.code AND s.is_enabled) AS lich
         FROM report_catalog rc JOIN core.source_systems ss ON ss.code = rc.source_system
        ORDER BY rc.dashboard_order, rc.ten`);
    return rows.map((r) => ({ ...r, kind: r.definition ? 'config' : REPORTS[r.code] ? 'code' : 'missing' }));
  }));

  /** Tập dữ liệu của một hệ thống + trường của tập đang chọn — cho form dựng báo cáo. */
  app.get<{ Querystring: { source: string; dataset?: Dataset; capability?: string } }>('/admin/report-fields', async (req) => {
    if (!deps.sources.get(req.query.source)) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    const datasets = sourceDatasets(req.query.source);
    const pick = req.query.dataset ? datasets.find((d) => d.dataset === req.query.dataset && (!req.query.capability || d.capability === req.query.capability)) : datasets[0];
    const fields = pick ? datasetFields(pick.dataset, req.query.source, pick.capability).map(({ name, label, type }) => ({ name, label, type })) : [];
    return { datasets, selected: pick ?? null, fields };
  });

  /** Xem thử định nghĩa trên dữ liệu MÀ QUẢN TRỊ ĐƯỢC XEM (RLS như mọi người) — không lưu. */
  app.post<{ Body: { source_system: string; definition: unknown; scope?: Scope; params?: Record<string, unknown> } }>('/admin/reports/preview', {
    schema: { body: { type: 'object', required: ['source_system', 'definition'], properties: {
      source_system: { type: 'string' }, definition: { type: 'object' }, scope: { type: 'string', enum: ['ca_nhan', 'don_vi'] }, params: { type: 'object' } } } },
  }, async (req) => {
    const { def, default_params } = checkDefinition(req.body.source_system, req.body.definition);
    const ctx = await resolveUserContext(deps.reader, req.user.id, req.body.scope ?? 'ca_nhan');
    return withUserContext(deps.reader, ctx, async (t) => {
      await audit(t, req, 'view_report', { type: 'report_preview', id: req.body.source_system }, { scope: ctx.scope });
      return runDefinition(t, req.body.source_system, def, { params: { ...default_params, ...req.body.params }, scope: ctx.scope, page: 1, pageSize: 50 });
    });
  });

  app.post<{ Body: ReportBody }>('/admin/reports', {
    schema: { body: { ...bodySchema, required: ['code', 'ten', 'source_system', 'definition'] } },
  }, async (req, reply) => {
    const b = req.body;
    if (!deps.sources.get(b.source_system!)) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    const exists = await withTenant(deps.writer, (t) => t.oneOrNone('SELECT 1 FROM report_catalog WHERE code = $1', [b.code]));
    if (exists || REPORTS[b.code!]) throw new Problem('invalid_params', 'Mã báo cáo đã tồn tại', b.code);
    const c = checkDefinition(b.source_system!, b.definition);
    const w = await wiring(b.source_system!, c.def.dataset, c.def.capability);
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `INSERT INTO report_catalog (code, ten, mo_ta, source_system, capability, param_schema, default_params, view_template,
                                     required_scope, definition, spider_code, show_on_dashboard, dashboard_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [b.code, b.ten!.trim(), b.mo_ta?.trim() || null, b.source_system, w.capability, JSON.stringify(c.param_schema), JSON.stringify(c.default_params),
         c.view_template, b.required_scope ?? 'ca_nhan', JSON.stringify(c.def), w.spider_code, b.show_on_dashboard ?? true, b.dashboard_order ?? 100, req.user.id]);
      await audit(t, req, 'source_change', { type: 'report', id: b.code }, { op: 'create', source: b.source_system, dataset: c.def.dataset });
    });
    return reply.status(201).send({ code: b.code, view_template: c.view_template, capability: w.capability, spider_code: w.spider_code });
  });

  app.patch<{ Params: { code: string }; Body: ReportBody }>('/admin/reports/:code', { schema: { body: bodySchema } }, async (req) => {
    const cur = await withTenant(deps.writer, (t) => t.oneOrNone<{ source_system: string; definition: unknown }>(
      'SELECT source_system, definition FROM report_catalog WHERE code = $1', [req.params.code]));
    if (!cur) throw new Problem('not_found', 'Không có báo cáo này');
    const b = req.body;
    if (b.code && b.code !== req.params.code) throw new Problem('invalid_params', 'Không đổi được mã báo cáo');
    if (!cur.definition && (b.definition !== undefined || b.source_system !== undefined)) {
      throw new Problem('invalid_params', 'Báo cáo này viết trong code', 'Chỉ sửa được tên, mô tả, bật/tắt, hiện trên Tổng quan và thứ tự');
    }
    const source = b.source_system ?? cur.source_system;
    if (!deps.sources.get(source)) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    const c = b.definition !== undefined || b.source_system !== undefined ? checkDefinition(source, b.definition ?? cur.definition) : null;
    const w = c ? await wiring(source, c.def.dataset, c.def.capability) : null;
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `UPDATE report_catalog SET
            ten = coalesce($2, ten), mo_ta = CASE WHEN $3::boolean THEN $4 ELSE mo_ta END,
            is_active = coalesce($5, is_active), show_on_dashboard = coalesce($6, show_on_dashboard), dashboard_order = coalesce($7, dashboard_order),
            required_scope = coalesce($8, required_scope),
            source_system = coalesce($9, source_system), capability = coalesce($10, capability), param_schema = coalesce($11, param_schema),
            default_params = coalesce($12, default_params), view_template = coalesce($13, view_template), definition = coalesce($14, definition),
            spider_code = CASE WHEN $15::boolean THEN $16 ELSE spider_code END, updated_at = now()
          WHERE code = $1`,
        [req.params.code, b.ten?.trim() ?? null, b.mo_ta !== undefined, b.mo_ta?.trim() || null, b.is_active ?? null, b.show_on_dashboard ?? null,
         b.dashboard_order ?? null, b.required_scope ?? null, c ? source : null, w?.capability ?? null,
         c ? JSON.stringify(c.param_schema) : null, c ? JSON.stringify(c.default_params) : null, c?.view_template ?? null,
         c ? JSON.stringify(c.def) : null, !!w, w?.spider_code ?? null]);
      await audit(t, req, 'source_change', { type: 'report', id: req.params.code }, { op: 'update', fields: Object.keys(b) });
    });
    return { code: req.params.code, updated: true };
  });
};

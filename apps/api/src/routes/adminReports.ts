/**
 * Quản trị — Cấu hình báo cáo. Tạo báo cáo mới trên dữ liệu của bất kỳ hệ thống nguồn nào (văn bản, công việc,
 * dữ liệu chung) mà không viết code/SQL, chọn có hiện trên Tổng quan không. Mọi báo cáo đều là báo cáo cấu hình:
 * sửa được toàn bộ định nghĩa, và xoá được (kèm lịch chạy của nó).
 */
import type { FastifyPluginAsync } from 'fastify';
import { Problem, resolveUserContext, withTenant, withUserContext, type Scope } from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { checkDefinition, datasetFields, runDefinition, sourceDatasets, type Dataset } from '../reports/defined.js';

interface ReportBody {
  code?: string;
  ten?: string;
  mo_ta?: string | null;
  source_system?: string;
  required_scope?: 'ca_nhan' | 'don_vi';
  is_active?: boolean;
  show_on_dashboard?: boolean;
  dashboard_order?: number;
  /** Tab trên Tổng quan (dashboard_tabs.id); null = tab "Báo cáo của bạn". */
  dashboard_tab?: number | null;
  /** Độ rộng khối: 1..3 phần ba hàng. */
  dashboard_width?: number;
  definition?: unknown;
}

interface TabBody { ten?: string; source_system?: string | null; thu_tu?: number; is_active?: boolean }
const tabSchema = {
  type: 'object', additionalProperties: false, properties: {
    ten: { type: 'string', minLength: 1, maxLength: 60 },
    source_system: { type: ['string', 'null'], maxLength: 30 },
    thu_tu: { type: 'integer', minimum: 0, maximum: 10_000 },
    is_active: { type: 'boolean' },
  },
} as const;

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
    dashboard_tab: { type: ['integer', 'null'] },
    dashboard_width: { type: 'integer', minimum: 1, maximum: 3 },
    definition: { type: 'object' },
  },
} as const;

export const adminReportRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /** Capability ghi vào kho cho tập dữ liệu + spider tương ứng (nếu có) — để lịch chạy và "lấy ngay" biết đường. */
  const wiring = async (source: string, dataset: Dataset, capability?: string) => {
    const ds = sourceDatasets(source).filter((d) => d.dataset === dataset && (!capability || d.capability === capability));
    if (!ds.length) throw new Problem('invalid_params', 'Hệ thống này không có tập dữ liệu đã chọn', `${source}: ${dataset}${capability ? `/${capability}` : ''}`);
    // Spider lấy dữ liệu cho hệ thống này (nếu có) — để "Chạy ngay"/lịch chạy biết đường chạy spider trên Crawlab.
    // Không có spider ⇒ worker chạy các bước lấy dữ liệu khai trong cấu hình adapter.
    const spider = await withTenant(deps.writer, (t) => t.oneOrNone(
      `SELECT code FROM core.crawl_spiders WHERE source_system = $1 AND is_enabled ORDER BY code LIMIT 1`,
      [source], (r: { code: string } | null) => r?.code ?? null));
    return { capability: ds[0]!.capability, spider_code: spider };
  };

  app.get('/admin/reports', async () => withTenant(deps.writer, async (t) => {
    const rows = await t.any<{ code: string; definition: unknown }>(
      `SELECT rc.code, rc.ten, rc.mo_ta, rc.source_system, ss.ten AS source_ten, rc.capability, rc.view_template, rc.required_scope,
              rc.is_active, rc.show_on_dashboard, rc.dashboard_order, rc.dashboard_tab, rc.dashboard_width, rc.definition, rc.spider_code, rc.updated_at,
              (SELECT count(*)::int FROM report_subscriptions s WHERE s.report_code = rc.code AND s.is_enabled) AS lich
         FROM report_catalog rc JOIN core.source_systems ss ON ss.code = rc.source_system
        ORDER BY rc.dashboard_order, rc.ten`);
    // Mọi báo cáo là báo cáo cấu hình; 'missing' = dòng cũ chưa có định nghĩa (cần sửa hoặc xoá).
    return rows.map((r) => ({ ...r, kind: r.definition ? 'config' : 'missing' }));
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

  /** Tab được chọn phải tồn tại — báo lỗi rõ thay vì lỗi khoá ngoại. */
  const checkTab = async (id: number | null | undefined) => {
    if (id === null || id === undefined) return;
    const ok = await withTenant(deps.writer, (t) => t.oneOrNone('SELECT 1 FROM dashboard_tabs WHERE id = $1', [id]));
    if (!ok) throw new Problem('invalid_params', 'Không có tab Tổng quan này', String(id));
  };

  app.post<{ Body: ReportBody }>('/admin/reports', {
    schema: { body: { ...bodySchema, required: ['code', 'ten', 'source_system', 'definition'] } },
  }, async (req, reply) => {
    const b = req.body;
    if (!deps.sources.get(b.source_system!)) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    const exists = await withTenant(deps.writer, (t) => t.oneOrNone('SELECT 1 FROM report_catalog WHERE code = $1', [b.code]));
    if (exists) throw new Problem('invalid_params', 'Mã báo cáo đã tồn tại', b.code);
    const c = checkDefinition(b.source_system!, b.definition);
    const w = await wiring(b.source_system!, c.def.dataset, c.def.capability);
    await checkTab(b.dashboard_tab);
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `INSERT INTO report_catalog (code, ten, mo_ta, source_system, capability, param_schema, default_params, view_template,
                                     required_scope, definition, spider_code, show_on_dashboard, dashboard_order, dashboard_tab, dashboard_width, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [b.code, b.ten!.trim(), b.mo_ta?.trim() || null, b.source_system, w.capability, JSON.stringify(c.param_schema), JSON.stringify(c.default_params),
         c.view_template, b.required_scope ?? 'ca_nhan', JSON.stringify(c.def), w.spider_code, b.show_on_dashboard ?? true, b.dashboard_order ?? 100,
         b.dashboard_tab ?? null, b.dashboard_width ?? 3, req.user.id]);
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
    const source = b.source_system ?? cur.source_system;
    if (!deps.sources.get(source)) throw new Problem('not_found', 'Không có hệ thống nguồn này');
    const c = b.definition !== undefined || b.source_system !== undefined ? checkDefinition(source, b.definition ?? cur.definition) : null;
    const w = c ? await wiring(source, c.def.dataset, c.def.capability) : null;
    await checkTab(b.dashboard_tab);
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `UPDATE report_catalog SET
            ten = coalesce($2, ten), mo_ta = CASE WHEN $3::boolean THEN $4 ELSE mo_ta END,
            is_active = coalesce($5, is_active), show_on_dashboard = coalesce($6, show_on_dashboard), dashboard_order = coalesce($7, dashboard_order),
            required_scope = coalesce($8, required_scope),
            source_system = coalesce($9, source_system), capability = coalesce($10, capability), param_schema = coalesce($11, param_schema),
            default_params = coalesce($12, default_params), view_template = coalesce($13, view_template), definition = coalesce($14, definition),
            spider_code = CASE WHEN $15::boolean THEN $16 ELSE spider_code END,
            dashboard_tab = CASE WHEN $17::boolean THEN $18::int ELSE dashboard_tab END, dashboard_width = coalesce($19, dashboard_width),
            updated_at = now()
          WHERE code = $1`,
        [req.params.code, b.ten?.trim() ?? null, b.mo_ta !== undefined, b.mo_ta?.trim() || null, b.is_active ?? null, b.show_on_dashboard ?? null,
         b.dashboard_order ?? null, b.required_scope ?? null, c ? source : null, w?.capability ?? null,
         c ? JSON.stringify(c.param_schema) : null, c ? JSON.stringify(c.default_params) : null, c?.view_template ?? null,
         c ? JSON.stringify(c.def) : null, !!w, w?.spider_code ?? null, b.dashboard_tab !== undefined, b.dashboard_tab ?? null, b.dashboard_width ?? null]);
      await audit(t, req, 'source_change', { type: 'report', id: req.params.code }, { op: 'update', fields: Object.keys(b) });
    });
    return { code: req.params.code, updated: true };
  });

  /** Xoá hẳn một báo cáo cùng các lịch chạy của nó (một transaction). Dữ liệu đã lấy về không bị ảnh hưởng. */
  app.delete<{ Params: { code: string } }>('/admin/reports/:code', async (req) => {
    return withTenant(deps.writer, async (t) => {
      const cur = await t.oneOrNone<{ ten: string }>('SELECT ten FROM report_catalog WHERE code = $1', [req.params.code]);
      if (!cur) throw new Problem('not_found', 'Không có báo cáo này');
      const subs = await t.result('DELETE FROM report_subscriptions WHERE report_code = $1', [req.params.code], (r) => r.rowCount);
      await t.none('DELETE FROM report_catalog WHERE code = $1', [req.params.code]);
      await audit(t, req, 'source_change', { type: 'report', id: req.params.code }, { op: 'delete', ten: cur.ten, subscriptions_deleted: subs });
      return { code: req.params.code, deleted: true, subscriptions_deleted: subs };
    });
  });

  // ---- Tab trên Tổng quan ---------------------------------------------------------------------
  app.get('/admin/dashboard-tabs', async () => withTenant(deps.writer, (t) => t.any(
    `SELECT dt.id, dt.ten, dt.source_system, ss.ten AS source_ten, dt.thu_tu, dt.is_active, dt.updated_at,
            (SELECT count(*)::int FROM report_catalog rc WHERE rc.dashboard_tab = dt.id AND rc.show_on_dashboard) AS khoi
       FROM dashboard_tabs dt LEFT JOIN core.source_systems ss ON ss.code = dt.source_system
      ORDER BY dt.thu_tu, dt.id`)));

  const checkTabSource = (source: string | null | undefined) => {
    if (source && !deps.sources.get(source)) throw new Problem('not_found', 'Không có hệ thống nguồn này', source);
  };

  app.post<{ Body: TabBody }>('/admin/dashboard-tabs', { schema: { body: { ...tabSchema, required: ['ten'] } } }, async (req, reply) => {
    const b = req.body;
    checkTabSource(b.source_system);
    const id = await withTenant(deps.writer, async (t) => {
      const r = await t.one<{ id: number }>(
        `INSERT INTO dashboard_tabs (ten, source_system, thu_tu, is_active, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [b.ten!.trim(), b.source_system ?? null, b.thu_tu ?? 100, b.is_active ?? true, req.user.id]);
      await audit(t, req, 'source_change', { type: 'dashboard_tab', id: String(r.id) }, { op: 'create', ten: b.ten });
      return r.id;
    });
    return reply.status(201).send({ id });
  });

  app.patch<{ Params: { id: string }; Body: TabBody }>('/admin/dashboard-tabs/:id', { schema: { body: tabSchema } }, async (req) => {
    const b = req.body;
    checkTabSource(b.source_system);
    return withTenant(deps.writer, async (t) => {
      const n = await t.result(
        `UPDATE dashboard_tabs SET ten = coalesce($2, ten), source_system = CASE WHEN $3::boolean THEN $4 ELSE source_system END,
                thu_tu = coalesce($5, thu_tu), is_active = coalesce($6, is_active), updated_at = now(), updated_by = $7
          WHERE id = $1`,
        [Number(req.params.id), b.ten?.trim() ?? null, b.source_system !== undefined, b.source_system ?? null, b.thu_tu ?? null, b.is_active ?? null, req.user.id],
        (r) => r.rowCount);
      if (!n) throw new Problem('not_found', 'Không có tab này');
      await audit(t, req, 'source_change', { type: 'dashboard_tab', id: req.params.id }, { op: 'update', fields: Object.keys(b) });
      return { id: Number(req.params.id), updated: true };
    });
  });

  /** Xoá tab: các khối trong tab chuyển về tab "Báo cáo của bạn" (báo cáo không bị xoá). */
  app.delete<{ Params: { id: string } }>('/admin/dashboard-tabs/:id', async (req) => withTenant(deps.writer, async (t) => {
    const moved = await t.result('UPDATE report_catalog SET dashboard_tab = NULL WHERE dashboard_tab = $1', [Number(req.params.id)], (r) => r.rowCount);
    const n = await t.result('DELETE FROM dashboard_tabs WHERE id = $1', [Number(req.params.id)], (r) => r.rowCount);
    if (!n) throw new Problem('not_found', 'Không có tab này');
    await audit(t, req, 'source_change', { type: 'dashboard_tab', id: req.params.id }, { op: 'delete', reports_moved: moved });
    return { id: Number(req.params.id), deleted: true, reports_moved: moved };
  }));
};

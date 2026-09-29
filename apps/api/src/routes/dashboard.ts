/**
 * Tổng quan (dashboard): mọi báo cáo người dùng xem được, mỗi báo cáo một ô kèm số liệu tóm tắt và
 * tình trạng nguồn dữ liệu — để giao diện hiện đúng nút: "Kết nối", "Kết nối lại", "Lấy dữ liệu ngay".
 * Mỗi ô chạy báo cáo qua đúng đường runReport (RLS + audit), không bao giờ chạm hệ thống nguồn.
 */
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Problem, allowedScopes, loadMemberships, withTenant, withUserContext, type Scope, type Tx } from '@vala/core';
import { loadAllSpecs } from '@vala/core/adapter';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { runReport } from './reports.js';

const RUN_NOW_WINDOW_S = 600;   // "Đồng bộ ngay": mỗi hệ thống một lần / 10 phút cho mỗi người dùng

type WidgetStatus = 'ok' | 'chua_co_du_lieu' | 'can_ket_noi' | 'het_han' | 'loi';

const TODAY = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const DONE = `t.trang_thai = 'Đã hoàn thành'`;

interface FolderKpi { label: string; match: string; warn_if_positive: boolean }

/** Số liệu văn bản của chính người xem từ MỘT hệ thống nguồn — chạy dưới RLS phạm vi cá nhân. */
async function documentStats(t: Tx, source: string, kpis: FolderKpi[]) {
  const k = await t.one<{ tong: number; thang_nay: number; thang_truoc: number; so_thu_muc: number }>(
    `SELECT count(*)::int AS tong,
            count(*) FILTER (WHERE date_trunc('month', ngay_nhan) = date_trunc('month', ${TODAY}))::int AS thang_nay,
            count(*) FILTER (WHERE date_trunc('month', ngay_nhan) = date_trunc('month', ${TODAY}) - interval '1 month')::int AS thang_truoc,
            count(DISTINCT node_id)::int AS so_thu_muc
       FROM documents WHERE valid_to IS NULL AND source_system = $1`, [source]);
  // Thẻ KPI theo thư mục: khai trong cấu hình adapter (dashboard.folder_kpis), không viết trong code.
  const folderKpis = [];
  for (const f of kpis) {
    const value = await t.one(`SELECT count(*)::int AS n FROM documents WHERE valid_to IS NULL AND source_system = $1 AND node_ten ILIKE $2`,
      [source, f.match], (r: { n: number }) => r.n);
    folderKpis.push({ label: f.label, value, warn: f.warn_if_positive && value > 0 });
  }
  const byMonth = await t.any<{ thang: string; so: number }>(
    `SELECT to_char(m, 'YYYY-MM') AS thang, count(d.id)::int AS so
       FROM generate_series(date_trunc('month', ${TODAY}) - interval '11 months', date_trunc('month', ${TODAY}), interval '1 month') m
       LEFT JOIN documents d ON d.valid_to IS NULL AND d.source_system = $1 AND date_trunc('month', d.ngay_nhan) = m
      GROUP BY m ORDER BY m`, [source]);
  const byFolder = await t.any<{ thu_muc: string; so: number }>(
    `SELECT coalesce(node_ten, 'Không rõ') AS thu_muc, count(*)::int AS so FROM documents WHERE valid_to IS NULL AND source_system = $1
      GROUP BY 1 ORDER BY so DESC, thu_muc LIMIT 10`, [source]);
  const byDay = await t.any<{ ngay: string; so: number }>(
    `SELECT to_char(ngay_nhan, 'YYYY-MM-DD') AS ngay, count(*)::int AS so FROM documents
      WHERE valid_to IS NULL AND source_system = $1 AND ngay_nhan > ${TODAY} - 182 GROUP BY 1 ORDER BY 1`, [source]);
  return { ...k, folder_kpis: folderKpis, by_month: byMonth, by_folder: byFolder, by_day: byDay };
}

/** Số liệu việc của chính người xem từ MỘT hệ thống nguồn. */
async function taskStats(t: Tx, source: string) {
  const k = await t.one<{ tong: number; qua_han: number; den_han_hom_nay: number; den_han_7: number; dang_lam: number; hoan_thanh: number; xong_thang_nay: number }>(
    `SELECT count(*)::int AS tong,
            count(*) FILTER (WHERE han_hoan_thanh < ${TODAY} AND NOT ${DONE})::int AS qua_han,
            count(*) FILTER (WHERE han_hoan_thanh = ${TODAY} AND NOT ${DONE})::int AS den_han_hom_nay,
            count(*) FILTER (WHERE han_hoan_thanh BETWEEN ${TODAY} AND ${TODAY} + 7 AND NOT ${DONE})::int AS den_han_7,
            count(*) FILTER (WHERE trang_thai = 'Đang thực hiện')::int AS dang_lam,
            count(*) FILTER (WHERE ${DONE})::int AS hoan_thanh,
            count(*) FILTER (WHERE ${DONE} AND date_trunc('month', ngay_hoan_thanh) = date_trunc('month', ${TODAY}))::int AS xong_thang_nay
       FROM tasks t WHERE valid_to IS NULL AND source_system = $1`, [source]);
  const byStatus = await t.any<{ trang_thai: string; so: number }>(
    `SELECT * FROM (
       SELECT coalesce(trang_thai, 'Không rõ') AS trang_thai, count(*)::int AS so
         FROM tasks t WHERE valid_to IS NULL AND source_system = $1 GROUP BY 1) x
      ORDER BY array_position(ARRAY['Việc mới tạo','Việc cần làm','Đang thực hiện','Chờ duyệt','Đã hoàn thành'], x.trang_thai) NULLS LAST, so DESC`, [source]);
  const dueNext = await t.any<{ ngay: string; so: number }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS ngay, count(t.id)::int AS so
       FROM generate_series(${TODAY}, ${TODAY} + 13, interval '1 day') d
       LEFT JOIN tasks t ON t.valid_to IS NULL AND t.source_system = $1 AND t.han_hoan_thanh = d::date AND NOT ${DONE}
      GROUP BY d ORDER BY d`, [source]);
  return { ...k, ty_le_hoan_thanh: k.tong ? k.hoan_thanh / k.tong : null, by_status: byStatus, due_next_14: dueNext };
}

/** Capability có sink của một hệ thống — worker lấy dữ liệu được theo cấu hình adapter, không cần spider. */
const workerCaps = (source: string) => loadAllSpecs()
  .filter((s) => s.source_system === source)
  .flatMap((s) => s.capabilities.filter((c) => c.sink).map((c) => c.id));

export const dashboardRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /**
   * Số liệu tổng hợp cho phần đầu Tổng quan (thẻ KPI + biểu đồ), dữ liệu của CHÍNH người xem.
   * Chạy trên pool reader với RLS phạm vi cá nhân và ghi audit như mọi lần xem báo cáo.
   */
  app.get('/dashboard/overview', async (req) => {
    const grants = await withTenant(deps.writer, (t) => t.any<{ source_system: string; state: string }>(
      `SELECT source_system, CASE WHEN revoked_at IS NOT NULL THEN 'revoked' ELSE session_state END AS state
         FROM source_grants WHERE app_user_id = $1`, [req.user.id]));
    const state = (s: string) => grants.find((g) => g.source_system === s)?.state ?? 'chua_cau_hinh';
    // Hệ thống nào có phần Văn bản / Công việc là do cấu hình adapter (capability có sink tới bảng đó) quyết định.
    const withSink = (table: 'documents' | 'tasks') => loadAllSpecs()
      .filter((sp) => deps.sources.get(sp.source_system)?.enabled && sp.capabilities.some((c) => c.sink?.table === table));
    const src = (code: string) => ({ code, ten: deps.sources.get(code)?.ten ?? code, state: state(code), enabled: true });
    const data = await withUserContext(deps.reader, { userId: req.user.id, scope: 'ca_nhan', orgUnitsAllowed: [] }, async (t) => {
      await audit(t, req, 'view_report', { type: 'dashboard', id: 'overview' }, { scope: 'ca_nhan' });
      const documents = [];
      for (const sp of withSink('documents')) {
        documents.push({ source: src(sp.source_system), ...await documentStats(t, sp.source_system, sp.dashboard?.folder_kpis ?? []) });
      }
      const tasks = [];
      for (const sp of withSink('tasks')) tasks.push({ source: src(sp.source_system), ...await taskStats(t, sp.source_system) });
      return { documents, tasks };
    });
    return { today: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }), ...data };
  });

  app.get('/dashboard', async (req) => {
    const scopes = allowedScopes(await withTenant(deps.reader, (t) => loadMemberships(t, req.user.id)));
    const { catalog, grants } = await withTenant(deps.writer, async (t) => ({
      catalog: await t.any<{ code: string; ten: string; mo_ta: string | null; source_system: string; view_template: string; required_scope: string; spider_code: string | null }>(
        `SELECT rc.code, rc.ten, rc.mo_ta, rc.source_system, rc.view_template, rc.required_scope, rc.spider_code
           FROM report_catalog rc JOIN core.source_systems ss ON ss.code = rc.source_system
          WHERE rc.is_active AND ss.enabled AND rc.show_on_dashboard
          ORDER BY rc.dashboard_order, rc.view_template = 'tong_hop' DESC, rc.ten`),
      grants: await t.any<{ source_system: string; state: string; auth_method: string | null }>(
        `SELECT source_system, CASE WHEN revoked_at IS NOT NULL THEN 'revoked' ELSE session_state END AS state, auth_method
           FROM source_grants WHERE app_user_id = $1`, [req.user.id]),
    }));
    const conn = new Map(grants.map((g) => [g.source_system, g]));

    const widgets = [];
    for (const rc of catalog) {
      if (rc.required_scope !== 'ca_nhan' && !scopes.includes('don_vi')) continue;
      const scope: Scope = rc.required_scope === 'ca_nhan' ? 'ca_nhan' : 'don_vi';
      const g = conn.get(rc.source_system);
      const state = g?.state ?? 'chua_cau_hinh';
      const base = {
        code: rc.code, ten: rc.ten, mo_ta: rc.mo_ta, view_template: rc.view_template, scope,
        source_system: rc.source_system, source_ten: deps.sources.get(rc.source_system)?.ten ?? rc.source_system,
        // Lấy ngay được khi đã kết nối và có đường lấy dữ liệu: spider, hoặc bước lấy dữ liệu trong cấu hình adapter.
        connection_state: state, can_run_now: state === 'active' && (!!rc.spider_code || workerCaps(rc.source_system).length > 0),
      };
      try {
        const r = await runReport(deps, req, rc.code, { scope, page: 1, page_size: 5 }, 'view_report', 5);
        const hasData = r.out.total_rows > 0 || (r.out.tiles ?? []).some((x) => x.value > 0) || (r.out.chart_rows ?? []).length > 0;
        const status: WidgetStatus = state === 'expired' || state === 'failed' ? 'het_han'
          : hasData ? 'ok' : state === 'active' ? 'chua_co_du_lieu' : 'can_ket_noi';
        widgets.push({
          ...base, status, has_data: hasData, freshness: r.freshness, total_rows: r.out.total_rows,
          tiles: r.out.tiles ?? null, charts: r.out.charts ?? null,
          chart_rows: (r.out.chart_rows ?? r.out.rows).slice(0, 12), columns: r.out.columns.slice(0, 4), rows: r.out.rows.slice(0, 5),
        });
      } catch (e) {
        if (e instanceof Problem && e.type === 'grant_required') {
          widgets.push({ ...base, status: state === 'expired' || state === 'failed' ? 'het_han' : 'can_ket_noi', has_data: false });
        } else if (e instanceof Problem && e.type === 'scope_denied') {
          continue;
        } else {
          req.log.error({ err: e, report: rc.code }, 'ô tổng quan lỗi');
          widgets.push({ ...base, status: 'loi' as WidgetStatus, has_data: false, message: e instanceof Problem ? e.title : 'Lỗi hệ thống' });
        }
      }
    }
    return { widgets };
  });

  /**
   * Lấy dữ liệu ngay cho CHÍNH người gọi từ một hệ thống nguồn (vd vừa kết nối xong trên Tổng quan):
   * chạy mọi spider của nguồn đó trên Crawlab, chỉ cho người này. Mỗi nguồn một lần / 10 phút.
   */
  app.post<{ Params: { source: string } }>('/me/sources/:source/run-now', async (req, reply) => {
    const source = req.params.source;
    const g = await withTenant(deps.writer, (t) => t.oneOrNone<{ state: string }>(
      `SELECT CASE WHEN revoked_at IS NOT NULL THEN 'revoked' ELSE session_state END AS state
         FROM source_grants WHERE app_user_id = $1 AND source_system = $2`, [req.user.id, source]));
    if (g?.state === 'expired' || g?.state === 'failed') throw new Problem('session_expired', 'Phiên đã hết hạn', 'Kết nối lại rồi thử lại', { source_system: source });
    if (g?.state !== 'active') throw new Problem('grant_required', 'Cần kết nối hệ thống này trước', undefined, { source_system: source });
    if (!(await deps.limiter.take(`run-now-src:${req.user.id}:${source}`, RUN_NOW_WINDOW_S))) {
      throw new Problem('rate_limited', 'Vừa lấy dữ liệu gần đây', 'Mỗi hệ thống chỉ lấy ngay được một lần trong 10 phút');
    }
    const spiders = await withTenant(deps.writer, (t) => t.any<{ code: string; crawlab_spider_id: string | null }>(
      `SELECT code, crawlab_spider_id FROM core.crawl_spiders WHERE source_system = $1 AND is_enabled`, [source]));
    await withTenant(deps.writer, (t) => audit(t, req, 'run_now', { type: 'source', id: source }));
    if (deps.crawlab && spiders.some((s) => s.crawlab_spider_id)) {
      const ids: string[] = [];
      for (const s of spiders) if (s.crawlab_spider_id) ids.push(...await deps.crawlab.runSpider(s.crawlab_spider_id, `--user ${req.user.id}`));
      return reply.status(202).send({ executor: 'crawlab', queued: ids.length });
    }
    // Không có spider: worker chạy thẳng các bước lấy dữ liệu khai trong cấu hình adapter (mọi capability có sink).
    const caps = workerCaps(source).map((capability) => ({ capability }));
    if (!caps.length) throw new Problem('invalid_params', 'Hệ thống này chưa có cách lấy dữ liệu', 'Cấu hình adapter chưa có capability nào ghi vào kho (sink)');
    // Chạy thẳng cho người này (không qua lịch: người dùng có thể chưa đặt lịch nào).
    const runKey = randomUUID();
    await deps.queue.addBulk(caps.map((c) => ({
      name: `${source}.${c.capability}`,
      data: { source, capability: c.capability, userId: req.user.id, trigger: 'manual' as const, crawlabRunId: runKey },
      opts: { jobId: `${runKey}_${c.capability}`, attempts: 1, removeOnComplete: 5000, removeOnFail: 5000 },
    })));
    return reply.status(202).send({ executor: 'worker', queued: caps.length });
  });
};

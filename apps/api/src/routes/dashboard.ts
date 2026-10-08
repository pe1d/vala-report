/**
 * Tổng quan (dashboard): các TAB do quản trị cấu hình (dashboard_tabs), mỗi tab gồm các KHỐI là báo cáo cấu hình
 * (report_catalog.dashboard_tab); báo cáo hiện trên Tổng quan mà không thuộc tab nào vào tab "Báo cáo của bạn".
 * Mỗi khối kèm tình trạng nguồn dữ liệu — để giao diện hiện đúng nút: "Kết nối", "Kết nối lại", "Lấy dữ liệu ngay".
 * Mỗi khối chạy báo cáo qua đúng đường runReport (RLS + audit), không bao giờ chạm hệ thống nguồn.
 */
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { allowedScopes, L, langOf, launchSpider, loadMemberships, Problem, withTenant, type Scope, currentTenant } from '@vala/core';
import { loadAllSpecs } from '@vala/core/adapter';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { runReport } from './reports.js';

const RUN_NOW_WINDOW_S = 600;   // "Đồng bộ ngay": mỗi hệ thống một lần / 10 phút cho mỗi người dùng

/** trong = đã lấy dữ liệu thành công nhưng không bản ghi nào khớp điều kiện/khoảng thời gian của báo cáo (KHÔNG phải lỗi kết nối). */
type WidgetStatus = 'ok' | 'trong' | 'chua_co_du_lieu' | 'can_ket_noi' | 'het_han' | 'loi';

/** Capability có sink của một hệ thống — worker lấy dữ liệu được theo cấu hình adapter, không cần spider. */
const workerCaps = (source: string) => loadAllSpecs()
  .filter((s) => s.source_system === source)
  .flatMap((s) => s.capabilities.filter((c) => c.sink).map((c) => c.id));

export const dashboardRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/dashboard', async (req) => {
    const scopes = allowedScopes(await withTenant(deps.reader, (t) => loadMemberships(t, req.user.id)));
    const { catalog, tabs, grants } = await withTenant(deps.writer, async (t) => ({
      catalog: await t.any<{ code: string; ten: string; mo_ta: string | null; source_system: string; view_template: string; required_scope: string;
                             spider_code: string | null; dashboard_tab: number | null; dashboard_width: number }>(
        `SELECT rc.code, rc.ten, rc.mo_ta, rc.source_system, rc.view_template, rc.required_scope, rc.spider_code,
                CASE WHEN dt.is_active THEN rc.dashboard_tab END AS dashboard_tab, rc.dashboard_width
           FROM report_catalog rc JOIN source_systems ss ON ss.code = rc.source_system
           LEFT JOIN dashboard_tabs dt ON dt.id = rc.dashboard_tab
          WHERE rc.is_active AND ss.enabled AND rc.show_on_dashboard
          ORDER BY rc.dashboard_order, rc.view_template = 'tong_hop' DESC, rc.ten`),
      tabs: await t.any<{ id: number; ten: string; source_system: string | null }>(
        `SELECT dt.id, dt.ten, dt.source_system FROM dashboard_tabs dt
           LEFT JOIN source_systems ss ON ss.code = dt.source_system
          WHERE dt.is_active AND (dt.source_system IS NULL OR ss.enabled) ORDER BY dt.thu_tu, dt.id`),
      grants: await t.any<{ source_system: string; state: string; auth_method: string | null }>(
        `SELECT source_system, CASE WHEN revoked_at IS NOT NULL THEN 'revoked' ELSE session_state END AS state, auth_method
           FROM source_grants WHERE app_user_id = $1`, [req.user.id]),
    }));
    const conn = new Map(grants.map((g) => [g.source_system, g]));
    const stateOf = (source: string) => conn.get(source)?.state ?? 'chua_cau_hinh';
    const canRunNow = (source: string, spider: string | null) => stateOf(source) === 'active' && (!!spider || workerCaps(source).length > 0);

    const widgets: Array<Record<string, unknown> & { tab: number | null; source_system: string; can_run_now: boolean }> = [];
    for (const rc of catalog) {
      if (rc.required_scope !== 'ca_nhan' && !scopes.includes('don_vi')) continue;
      const scope: Scope = rc.required_scope === 'ca_nhan' ? 'ca_nhan' : 'don_vi';
      const state = stateOf(rc.source_system);
      const base = {
        code: rc.code, ten: rc.ten, mo_ta: rc.mo_ta, view_template: rc.view_template, scope,
        tab: rc.dashboard_tab, width: rc.dashboard_width,
        source_system: rc.source_system, source_ten: deps.sources.get(rc.source_system)?.ten ?? rc.source_system,
        // Lấy ngay được khi đã kết nối và có đường lấy dữ liệu: spider, hoặc bước lấy dữ liệu trong cấu hình adapter.
        connection_state: state, can_run_now: canRunNow(rc.source_system, rc.spider_code),
      };
      try {
        const r = await runReport(deps, req, rc.code, { scope, page: 1, page_size: 5 }, 'view_report', 5);
        // Đã từng lấy dữ liệu thành công ⇒ kết quả rỗng là do điều kiện lọc / khoảng thời gian của báo cáo, không phải do
        // kết nối: thẻ KPI = 0 vẫn là số liệu thật (vd "0 văn bản quá hạn"); bảng/biểu đồ rỗng ⇒ "không có bản ghi khớp".
        const fetched = !!r.freshness.last_success_at;
        const hasRows = r.out.total_rows > 0 || (r.out.tiles ?? []).some((x) => x.value > 0) || (r.out.chart_rows ?? []).length > 0;
        const hasData = hasRows || (fetched && (r.out.tiles ?? []).length > 0);
        const status: WidgetStatus = state === 'expired' || state === 'failed' ? 'het_han'
          : hasData ? 'ok' : fetched ? 'trong' : state === 'active' ? 'chua_co_du_lieu' : 'can_ket_noi';
        widgets.push({
          ...base, status, has_data: hasData, freshness: r.freshness, total_rows: r.out.total_rows,
          tiles: r.out.tiles ?? null, charts: r.out.charts ?? null,
          chart_rows: r.out.chart_rows ?? r.out.rows, columns: r.out.columns.slice(0, 5), rows: r.out.rows.slice(0, 5),
        });
      } catch (e) {
        if (e instanceof Problem && e.type === 'grant_required') {
          widgets.push({ ...base, status: state === 'expired' || state === 'failed' ? 'het_han' : 'can_ket_noi', has_data: false });
        } else if (e instanceof Problem && e.type === 'scope_denied') {
          continue;
        } else {
          req.log.error({ err: e, report: rc.code }, 'ô tổng quan lỗi');
          widgets.push({ ...base, status: 'loi' as WidgetStatus, has_data: false, message: e instanceof Problem ? e.toJSON(langOf(req.headers['accept-language'])).title
            : langOf(req.headers['accept-language']) === 'en' ? 'System error' : 'Lỗi hệ thống' });
        }
      }
    }
    return {
      tabs: tabs.map((tb) => ({
        id: tb.id, ten: tb.ten,
        source: tb.source_system ? {
          code: tb.source_system, ten: deps.sources.get(tb.source_system)?.ten ?? tb.source_system, state: stateOf(tb.source_system),
          can_run_now: canRunNow(tb.source_system, null) || widgets.some((w) => w.tab === tb.id && w.source_system === tb.source_system && w.can_run_now),
        } : null,
      })),
      widgets,
    };
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
    if (g?.state === 'expired' || g?.state === 'failed') throw new Problem('session_expired', L('Phiên đã hết hạn', 'Session has expired'), L('Kết nối lại rồi thử lại', 'Reconnect and try again'), { source_system: source });
    if (g?.state !== 'active') throw new Problem('grant_required', L('Cần kết nối hệ thống này trước', 'Connect this system first'), undefined, { source_system: source });
    if (!(await deps.limiter.take(`run-now-src:${req.user.id}:${source}`, RUN_NOW_WINDOW_S))) {
      throw new Problem('rate_limited', L('Vừa lấy dữ liệu gần đây', 'Data was fetched recently'), L('Mỗi hệ thống chỉ lấy ngay được một lần trong 10 phút', 'Each system can be fetched on demand only once every 10 minutes'));
    }
    const spiders = await withTenant(deps.writer, (t) => t.any<{ code: string; crawlab_spider_id: string | null }>(
      `SELECT code, crawlab_spider_id FROM crawl_spiders WHERE source_system = $1 AND is_enabled`, [source]));
    await withTenant(deps.writer, (t) => audit(t, req, 'run_now', { type: 'source', id: source }));
    if (deps.crawlab && spiders.some((s) => s.crawlab_spider_id)) {
      const ids: string[] = [];
      // launchSpider: kiểm tra/khôi phục mã spider trên Crawlab, ghi lượt khởi chạy (lỗi ⇒ hiện ở Nhật ký chạy).
      for (const s of spiders) if (s.crawlab_spider_id) ids.push(...await launchSpider(deps.writer, deps.crawlab, { spiderCode: s.code, userId: req.user.id, trigger: 'manual' }));
      return reply.status(202).send({ executor: 'crawlab', queued: ids.length });
    }
    // Không có spider: worker chạy thẳng các bước lấy dữ liệu khai trong cấu hình adapter (mọi capability có sink).
    const caps = workerCaps(source).map((capability) => ({ capability }));
    if (!caps.length) throw new Problem('invalid_params', L('Hệ thống này chưa có cách lấy dữ liệu', 'This system has no way to fetch data yet'), L('Cấu hình adapter chưa có capability nào ghi vào kho (sink)', 'The adapter config has no capability that writes to the store (sink)'));
    // Chạy thẳng cho người này (không qua lịch: người dùng có thể chưa đặt lịch nào).
    const runKey = randomUUID();
    await deps.queue.addBulk(caps.map((c) => ({
      name: `${source}.${c.capability}`,
      data: { tenant: currentTenant(), source, capability: c.capability, userId: req.user.id, trigger: 'manual' as const, crawlabRunId: runKey },
      opts: { jobId: `${runKey}_${c.capability}`, attempts: 1, removeOnComplete: 5000, removeOnFail: 5000 },
    })));
    return reply.status(202).send({ executor: 'worker', queued: caps.length });
  });
};

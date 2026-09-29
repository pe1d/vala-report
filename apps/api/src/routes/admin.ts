/**
 * Khu quản trị (is_ops_admin):
 *   - Kết nối dữ liệu: cấu hình hộ người dùng (tài khoản/mật khẩu hoặc cookie hệ thống nguồn).
 *   - Script crawl: danh sách spider, đồng bộ repo → Crawlab, chạy thử cho một người.
 * Bí mật chỉ vào vault; không endpoint nào trả lại mật khẩu hay cookie.
 */
import type { FastifyPluginAsync } from 'fastify';
import { Problem, getSpider, syncCrawlab, withTenant } from '@vala/core';
import { configureConnection, connectionBodySchema, deleteConnection, listConnections, testConnection, type ConnectionBody } from '../connections.js';
import type { ApiDeps } from '../deps.js';
import { adminReportRoutes } from './adminReports.js';
import { adminSourceRoutes } from './adminSources.js';

export const adminRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/v1/admin/')) return;
    if (!req.user?.is_ops_admin) throw new Problem('forbidden', 'Chỉ dành cho quản trị');
  });

  await app.register(adminSourceRoutes(deps));                 // hệ thống nguồn (thêm/sửa)
  await app.register(adminReportRoutes(deps));                 // cấu hình báo cáo (không viết code)

  // ---- kết nối dữ liệu ----
  app.get('/admin/connections', async () => listConnections(deps));

  app.put<{ Params: { userId: string; source: string }; Body: ConnectionBody }>('/admin/connections/:userId/:source', {
    schema: { body: connectionBodySchema },
  }, async (req) => {
    const userId = Number(req.params.userId);
    const u = await withTenant(deps.writer, (t) => t.oneOrNone('SELECT 1 FROM app_users WHERE id = $1 AND is_active', [userId]));
    if (!u) throw new Problem('not_found', 'Không có người dùng này');
    const r = await configureConnection(deps, req, userId, req.params.source, req.body);
    return { app_user_id: userId, source_system: req.params.source, auth_method: req.body.auth_method, ...r };
  });

  app.post<{ Params: { userId: string; source: string } }>('/admin/connections/:userId/:source/test',
    async (req) => testConnection(deps, Number(req.params.userId), req.params.source));

  app.delete<{ Params: { userId: string; source: string } }>('/admin/connections/:userId/:source', async (req, reply) => {
    await deleteConnection(deps, req, Number(req.params.userId), req.params.source);
    return reply.status(204).send();
  });

  // ---- script crawl (Crawlab) ----
  app.get('/admin/spiders', async () => {
    const spiders = await withTenant(deps.writer, (t) => t.any(
      `SELECT sp.code, sp.ten, sp.mo_ta, sp.source_system, ss.ten AS source_ten, sp.entity, sp.is_enabled,
              sp.crawlab_spider_id, sp.synced_at,
              (SELECT count(*)::int FROM core.spider_schedules sc WHERE sc.spider_code = sp.code AND sc.crawlab_schedule_id IS NOT NULL) AS schedules,
              (SELECT count(DISTINCT rs.app_user_id)::int FROM report_subscriptions rs JOIN report_catalog rc ON rc.code = rs.report_code
                WHERE rc.spider_code = sp.code AND rs.is_enabled) AS subscribers,
              (SELECT json_build_object('status', r.status, 'started_at', r.started_at, 'error_code', r.error_code)
                 FROM crawl_runs r WHERE r.spider_code = sp.code ORDER BY r.started_at DESC LIMIT 1) AS last_run
         FROM core.crawl_spiders sp JOIN core.source_systems ss ON ss.code = sp.source_system
        ORDER BY sp.code`));
    return { crawlab_url: deps.config.crawlabWebUrl ?? null, crawlab_configured: !!deps.crawlab, spiders };
  });

  app.post('/admin/spiders/sync', async () => {
    if (!deps.crawlab) throw new Problem('internal', 'Chưa cấu hình Crawlab', 'Đặt CRAWLAB_URL trong .env');
    try {
      return await syncCrawlab(deps.writer, deps.crawlab, { apiUrlForSpiders: deps.config.spiderApiUrl, internalToken: deps.config.internalToken });
    } catch (e) {
      // Hiện đúng nguyên nhân cho quản trị (vd dịch vụ file của Crawlab chưa sẵn sàng sau khi khởi động).
      throw new Problem('internal', 'Đồng bộ Crawlab không thành công', (e as Error).message.slice(0, 400));
    }
  });

  app.patch<{ Params: { code: string }; Body: { is_enabled: boolean } }>('/admin/spiders/:code', {
    schema: { body: { type: 'object', required: ['is_enabled'], properties: { is_enabled: { type: 'boolean' } } } },
  }, async (req) => {
    await getSpider(deps.writer, req.params.code);
    await withTenant(deps.writer, (t) => t.none('UPDATE core.crawl_spiders SET is_enabled = $2 WHERE code = $1', [req.params.code, req.body.is_enabled]));
    return { code: req.params.code, is_enabled: req.body.is_enabled, note: 'Bấm "Đồng bộ Crawlab" để bật/tắt lịch bên Crawlab' };
  });

  /** Chạy thử spider cho một người dùng ngay bây giờ (không cần người đó đặt lịch). */
  app.post<{ Params: { code: string }; Body: { user_id: number } }>('/admin/spiders/:code/run', {
    schema: { body: { type: 'object', required: ['user_id'], properties: { user_id: { type: 'integer' } } } },
  }, async (req, reply) => {
    if (!deps.crawlab) throw new Problem('internal', 'Chưa cấu hình Crawlab');
    const sp = await getSpider(deps.writer, req.params.code);
    if (!sp.crawlab_spider_id) throw new Problem('invalid_params', 'Spider chưa đồng bộ lên Crawlab', 'Bấm "Đồng bộ Crawlab" trước');
    const tasks = await deps.crawlab.runSpider(sp.crawlab_spider_id, `--user ${req.body.user_id}`)
      .catch((e: Error) => { throw new Problem('internal', 'Crawlab không chạy được spider', e.message.slice(0, 400)); });
    return reply.status(202).send({ crawlab_task_ids: tasks });
  });
};

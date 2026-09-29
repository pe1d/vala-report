import type { FastifyPluginAsync } from 'fastify';
import { Problem, fanOut, isPreset, nextRuns, withTenant, withUserContext, type UserContext } from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { validateParams } from '../params.js';
import { loadCatalogEntry } from './reports.js';

const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });
const RUN_NOW_WINDOW_S = 300;

/**
 * Lịch chạy (mục 05): chỉ nhận schedule_preset, không nhận cron. Đổi lịch = đổi preset trong
 * report_subscriptions; KHÔNG gọi Crawlab — task Crawlab là tĩnh (core.crawl_tasks).
 */
export const subscriptionRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  const list = (userId: number, id?: number) => withUserContext(deps.reader, own(userId), (t) => t.any(
    `SELECT rs.id, rs.report_code, rc.ten AS report_ten, rs.params, rs.schedule_preset, rs.is_enabled,
            rs.next_run_at, rs.last_run_at,
            (SELECT r.status FROM crawl_runs r
              WHERE r.app_user_id = rs.app_user_id AND r.source_system = rc.source_system AND r.capability = rc.capability
              ORDER BY r.started_at DESC LIMIT 1) AS last_status
       FROM report_subscriptions rs JOIN report_catalog rc ON rc.code = rs.report_code
      WHERE rs.app_user_id = $1 AND ($2::bigint IS NULL OR rs.id = $2)
      ORDER BY rs.created_at DESC`, [userId, id ?? null]));

  app.get('/subscriptions', async (req) => list(req.user.id));

  app.post<{ Body: { report_code: string; params?: Record<string, unknown>; schedule_preset: string } }>('/subscriptions', {
    schema: { body: { type: 'object', required: ['report_code', 'schedule_preset'],
      properties: { report_code: { type: 'string' }, params: { type: 'object' }, schedule_preset: { type: 'string' } } } },
  }, async (req, reply) => {
    const { report_code, schedule_preset } = req.body;
    if (!isPreset(schedule_preset)) throw new Problem('invalid_params', 'Lịch không hợp lệ', 'Chỉ chọn từ danh sách lịch có sẵn');
    const entry = await withTenant(deps.reader, (t) => loadCatalogEntry(t, report_code));
    const params = validateParams(report_code, entry.param_schema, entry.default_params, req.body.params);
    const id = await withUserContext(deps.reader, own(req.user.id), async (t) => {
      const newId = await t.one(
        `INSERT INTO report_subscriptions (app_user_id, report_code, params, schedule_preset, next_run_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, report_code, JSON.stringify(params), schedule_preset, nextRuns(schedule_preset)[0]], (r: { id: number }) => r.id);
      await audit(t, req, 'schedule_change', { type: 'subscription', id: String(newId) }, { op: 'create', report_code, schedule_preset });
      return newId;
    });
    return reply.status(201).send((await list(req.user.id, id))[0]);
  });

  app.patch<{ Params: { id: string }; Body: { schedule_preset?: string; params?: Record<string, unknown>; is_enabled?: boolean } }>(
    '/subscriptions/:id', async (req) => {
      const id = Number(req.params.id);
      const b = req.body ?? {};
      if (b.schedule_preset !== undefined && !isPreset(b.schedule_preset)) throw new Problem('invalid_params', 'Lịch không hợp lệ');
      await withUserContext(deps.reader, own(req.user.id), async (t) => {
        const cur = await t.oneOrNone<{ report_code: string; schedule_preset: string }>(
          'SELECT report_code, schedule_preset FROM report_subscriptions WHERE id = $1', [id]);
        if (!cur) throw new Problem('not_found', 'Không có lịch này');
        let params: Record<string, unknown> | null = null;
        if (b.params !== undefined) {
          const entry = await loadCatalogEntry(t, cur.report_code);
          params = validateParams(cur.report_code, entry.param_schema, entry.default_params, b.params);
        }
        const preset = (b.schedule_preset ?? cur.schedule_preset) as Parameters<typeof nextRuns>[0];
        await t.none(
          `UPDATE report_subscriptions
              SET schedule_preset = $2, params = coalesce($3, params), is_enabled = coalesce($4, is_enabled), next_run_at = $5
            WHERE id = $1`,
          [id, preset, params ? JSON.stringify(params) : null, b.is_enabled ?? null, nextRuns(preset)[0]]);
        await audit(t, req, 'schedule_change', { type: 'subscription', id: String(id) }, { op: 'update', ...b });
      });
      return (await list(req.user.id, id))[0];
    });

  app.delete<{ Params: { id: string } }>('/subscriptions/:id', async (req, reply) => {
    const id = Number(req.params.id);
    await withUserContext(deps.reader, own(req.user.id), async (t) => {
      const n = await t.result('DELETE FROM report_subscriptions WHERE id = $1', [id], (r) => r.rowCount);
      if (!n) throw new Problem('not_found', 'Không có lịch này');
      await audit(t, req, 'schedule_change', { type: 'subscription', id: String(id) }, { op: 'delete' });
    });
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/subscriptions/:id/run-now', async (req, reply) => {
    const id = Number(req.params.id);
    const sub = await withUserContext(deps.reader, own(req.user.id), (t) => t.oneOrNone<{
      schedule_preset: string; source_system: string; capability: string; grant_state: string | null; is_enabled: boolean;
      spider_code: string | null; crawlab_spider_id: string | null;
    }>(
      `SELECT rs.schedule_preset, rs.is_enabled, rc.source_system, rc.capability, rc.spider_code, sp.crawlab_spider_id,
              CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' ELSE g.session_state END AS grant_state
         FROM report_subscriptions rs JOIN report_catalog rc ON rc.code = rs.report_code
         LEFT JOIN source_grants g ON g.app_user_id = rs.app_user_id AND g.source_system = rc.source_system
         LEFT JOIN core.crawl_spiders sp ON sp.code = rc.spider_code
        WHERE rs.id = $1`, [id]));
    if (!sub) throw new Problem('not_found', 'Không có lịch này');
    if (sub.grant_state === 'expired') throw new Problem('session_expired', 'Phiên uỷ quyền đã hết hạn', undefined, { source_system: sub.source_system });
    if (sub.grant_state !== 'active') throw new Problem('grant_required', 'Cần uỷ quyền lấy dữ liệu', undefined, { source_system: sub.source_system });
    if (!sub.is_enabled) throw new Problem('invalid_params', 'Lịch đang tắt');
    if (!(await deps.limiter.take(`run-now:${id}`, RUN_NOW_WINDOW_S))) {
      throw new Problem('rate_limited', 'Vừa chạy gần đây', 'Mỗi lịch chỉ chạy ngay được một lần trong 5 phút');
    }
    await withUserContext(deps.reader, own(req.user.id), (t) => audit(t, req, 'run_now', { type: 'subscription', id: String(id) }));
    // Báo cáo lấy dữ liệu bằng spider Python ⇒ chạy spider trên Crawlab, riêng cho người này.
    if (sub.spider_code && deps.crawlab) {
      if (!sub.crawlab_spider_id) throw new Problem('internal', 'Spider chưa được đồng bộ lên Crawlab', 'Quản trị cần bấm "Đồng bộ Crawlab"');
      const tasks = await deps.crawlab.runSpider(sub.crawlab_spider_id, `--user ${req.user.id} --preset ${sub.schedule_preset}`);
      return reply.status(202).send({ run_key: tasks[0] ?? null, queued: 1, executor: 'crawlab' });
    }
    // Không có Crawlab (test, hoặc adapter chạy trong worker nội bộ).
    const res = await fanOut(deps.writer, deps.queue as never, {
      source: sub.source_system, capability: sub.capability, preset: sub.schedule_preset,
      onlyUserId: req.user.id, trigger: 'manual',
    });
    return reply.status(202).send({ run_key: res.runKey, queued: res.users, executor: 'worker' });
  });
};

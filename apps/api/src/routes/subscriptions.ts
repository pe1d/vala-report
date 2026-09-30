import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  Problem, SCHEDULE_TEMPLATES, describeSchedule, nextScheduleRuns, parseSchedule, withTenant, withUserContext,
  type Schedule, type UserContext,
} from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { validateParams } from '../params.js';
import { loadCatalogEntry } from './reports.js';

const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });
const RUN_NOW_WINDOW_S = 300;
/** Mỗi người tối đa bao nhiêu lịch đang bật (chống đặt quá nhiều lịch dồn lên hệ thống nguồn). */
const MAX_ENABLED_PER_USER = Number(process.env.MAX_SUBSCRIPTIONS_PER_USER ?? 10);

/**
 * Lịch chạy do người dùng tự đặt (giờ tuỳ ý, theo thứ, hàng tháng, nhiều lần trong ngày, một lần). Nhận lịch CÓ CẤU
 * TRÚC (core/schedule.ts), không nhận cron. Đổi lịch KHÔNG gọi Crawlab — worker hẹn giờ theo next_run_at.
 */
export const subscriptionRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  const list = async (userId: number, id?: number) => {
    const rows = await withUserContext(deps.reader, own(userId), (t) => t.any<{ schedule: Schedule }>(
      `SELECT rs.id, rs.report_code, rc.ten AS report_ten, rc.source_system, rs.params, rs.schedule, rs.is_enabled,
              rs.next_run_at, rs.last_run_at,
              (SELECT r.status FROM crawl_runs r
                WHERE r.app_user_id = rs.app_user_id AND r.source_system = rc.source_system
                  AND r.capability = coalesce(rc.spider_code, rc.capability)
                ORDER BY r.started_at DESC LIMIT 1) AS last_status
         FROM report_subscriptions rs JOIN report_catalog rc ON rc.code = rs.report_code
        WHERE rs.app_user_id = $1 AND ($2::bigint IS NULL OR rs.id = $2)
        ORDER BY rs.created_at DESC`, [userId, id ?? null]));
    return rows.map((r) => ({ ...r, schedule_label: safeLabel(r.schedule) }));
  };
  const enabledCount = (userId: number, exceptId?: number) => withUserContext(deps.reader, own(userId), (t) => t.one(
    'SELECT count(*)::int AS n FROM report_subscriptions WHERE app_user_id = $1 AND is_enabled AND ($2::bigint IS NULL OR id <> $2)',
    [userId, exceptId ?? null], (r: { n: number }) => r.n));
  const tooMany = () => new Problem('invalid_params', 'Đã đủ số lịch', `Mỗi người tối đa ${MAX_ENABLED_PER_USER} lịch đang bật — tắt hoặc xoá bớt lịch cũ`);
  /** Nhận lịch mới, hoặc mã mẫu cũ (schedule_preset) để các phiên bản giao diện cũ vẫn đặt được. */
  const scheduleFrom = (b: { schedule?: unknown; schedule_preset?: string }): Schedule => {
    if (b.schedule !== undefined) return parseSchedule(b.schedule);
    const tpl = SCHEDULE_TEMPLATES.find((x) => x.code === b.schedule_preset);
    if (!tpl) throw new Problem('invalid_params', 'Lịch chưa hợp lệ', 'Cần chọn lịch');
    return tpl.schedule;
  };

  app.get('/subscriptions', async (req) => list(req.user.id));

  app.post<{ Body: { report_code: string; params?: Record<string, unknown>; schedule?: unknown; schedule_preset?: string } }>('/subscriptions', {
    schema: { body: { type: 'object', required: ['report_code'], properties: {
      report_code: { type: 'string' }, params: { type: 'object' }, schedule: { type: 'object' }, schedule_preset: { type: 'string' } } } },
  }, async (req, reply) => {
    const { report_code } = req.body;
    const schedule = scheduleFrom(req.body);
    if ((await enabledCount(req.user.id)) >= MAX_ENABLED_PER_USER) throw tooMany();
    const entry = await withTenant(deps.reader, (t) => loadCatalogEntry(t, report_code));
    const params = validateParams(report_code, entry.param_schema, entry.default_params, req.body.params);
    const id = await withUserContext(deps.reader, own(req.user.id), async (t) => {
      const newId = await t.one(
        `INSERT INTO report_subscriptions (app_user_id, report_code, params, schedule, next_run_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, report_code, JSON.stringify(params), JSON.stringify(schedule), nextScheduleRuns(schedule)[0] ?? null], (r: { id: number }) => r.id);
      await audit(t, req, 'schedule_change', { type: 'subscription', id: String(newId) }, { op: 'create', report_code, schedule });
      return newId;
    });
    return reply.status(201).send((await list(req.user.id, id))[0]);
  });

  app.patch<{ Params: { id: string }; Body: { schedule?: unknown; schedule_preset?: string; params?: Record<string, unknown>; is_enabled?: boolean } }>(
    '/subscriptions/:id', async (req) => {
      const id = Number(req.params.id);
      const b = req.body ?? {};
      const newSchedule = b.schedule !== undefined || b.schedule_preset !== undefined ? scheduleFrom(b) : null;
      await withUserContext(deps.reader, own(req.user.id), async (t) => {
        const cur = await t.oneOrNone<{ report_code: string; schedule: Schedule; is_enabled: boolean }>(
          'SELECT report_code, schedule, is_enabled FROM report_subscriptions WHERE id = $1', [id]);
        if (!cur) throw new Problem('not_found', 'Không có lịch này');
        const enabling = b.is_enabled === true && !cur.is_enabled;
        if (enabling && (await enabledCount(req.user.id, id)) >= MAX_ENABLED_PER_USER) throw tooMany();
        let params: Record<string, unknown> | null = null;
        if (b.params !== undefined) {
          const entry = await loadCatalogEntry(t, cur.report_code);
          params = validateParams(cur.report_code, entry.param_schema, entry.default_params, b.params);
        }
        // Bật lại lịch một lần đã qua giờ ⇒ báo rõ, không lặng lẽ không chạy.
        const schedule = newSchedule ?? (enabling ? parseSchedule(cur.schedule) : cur.schedule);
        const next = newSchedule || enabling ? nextScheduleRuns(schedule)[0] ?? null : undefined;
        await t.none(
          `UPDATE report_subscriptions
              SET schedule = $2, params = coalesce($3, params), is_enabled = coalesce($4, is_enabled),
                  next_run_at = CASE WHEN $5 THEN $6::timestamptz ELSE next_run_at END
            WHERE id = $1`,
          [id, JSON.stringify(schedule), params ? JSON.stringify(params) : null, b.is_enabled ?? (newSchedule ? true : null),
           next !== undefined, next ?? null]);
        await audit(t, req, 'schedule_change', { type: 'subscription', id: String(id) },
          { op: 'update', ...(newSchedule ? { schedule: newSchedule } : {}), ...(b.is_enabled !== undefined ? { is_enabled: b.is_enabled } : {}), ...(params ? { params } : {}) });
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

  /** Chạy ngay một lịch cho chính người gọi (không đổi giờ hẹn). */
  app.post<{ Params: { id: string } }>('/subscriptions/:id/run-now', async (req, reply) => {
    const id = Number(req.params.id);
    const sub = await withUserContext(deps.reader, own(req.user.id), (t) => t.oneOrNone<{
      source_system: string; capability: string; grant_state: string | null; spider_code: string | null; crawlab_spider_id: string | null;
    }>(
      `SELECT rc.source_system, rc.capability, rc.spider_code, sp.crawlab_spider_id,
              CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' ELSE g.session_state END AS grant_state
         FROM report_subscriptions rs JOIN report_catalog rc ON rc.code = rs.report_code
         LEFT JOIN source_grants g ON g.app_user_id = rs.app_user_id AND g.source_system = rc.source_system
         LEFT JOIN core.crawl_spiders sp ON sp.code = rc.spider_code
        WHERE rs.id = $1`, [id]));
    if (!sub) throw new Problem('not_found', 'Không có lịch này');
    if (sub.grant_state === 'expired') throw new Problem('session_expired', 'Phiên uỷ quyền đã hết hạn', undefined, { source_system: sub.source_system });
    if (sub.grant_state !== 'active') throw new Problem('grant_required', 'Cần uỷ quyền lấy dữ liệu', undefined, { source_system: sub.source_system });
    if (!(await deps.limiter.take(`run-now:${id}`, RUN_NOW_WINDOW_S))) {
      throw new Problem('rate_limited', 'Vừa chạy gần đây', 'Mỗi lịch chỉ chạy ngay được một lần trong 5 phút');
    }
    await withUserContext(deps.reader, own(req.user.id), (t) => audit(t, req, 'run_now', { type: 'subscription', id: String(id) }));
    // Báo cáo lấy dữ liệu bằng spider Python ⇒ chạy spider trên Crawlab, riêng cho người này.
    if (sub.spider_code && deps.crawlab) {
      if (!sub.crawlab_spider_id) throw new Problem('internal', 'Spider chưa được đồng bộ lên Crawlab', 'Quản trị cần bấm "Đồng bộ Crawlab"');
      const tasks = await deps.crawlab.runSpider(sub.crawlab_spider_id, `--user ${req.user.id} --trigger manual`);
      return reply.status(202).send({ run_key: tasks[0] ?? null, queued: 1, executor: 'crawlab' });
    }
    // Không có spider: worker chạy các bước lấy dữ liệu trong cấu hình adapter, riêng cho người này.
    const runKey = randomUUID();
    await deps.queue.addBulk([{
      name: `${sub.source_system}.${sub.capability}`,
      data: { source: sub.source_system, capability: sub.capability, userId: req.user.id, trigger: 'manual' as const, crawlabRunId: runKey },
      opts: { jobId: `${runKey}_${req.user.id}`, attempts: 1, removeOnComplete: 5000, removeOnFail: 5000 },
    }]);
    return reply.status(202).send({ run_key: runKey, queued: 1, executor: 'worker' });
  });
};

function safeLabel(s: Schedule): string {
  try { return describeSchedule(s); } catch { return 'Lịch không hợp lệ'; }
}

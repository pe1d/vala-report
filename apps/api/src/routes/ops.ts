import type { FastifyPluginAsync } from 'fastify';
import { Problem, withTenant } from '@vala/core';
import type { ApiDeps } from '../deps.js';

/** Màn hình vận hành: đọc qua pool writer (thấy mọi người) ⇒ kiểm tra is_ops_admin TRƯỚC khi truy vấn. */
export const opsRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get<{ Querystring: { status?: string; source_system?: string; from?: string; limit?: string } }>('/ops/runs', async (req) => {
    if (!req.user.is_ops_admin) throw new Problem('forbidden', 'Chỉ dành cho kỹ sư vận hành');
    const q = req.query;
    return withTenant(deps.writer, (t) => t.any(
      `SELECT r.id, r.source_system, r.capability, r.adapter_version, r.app_user_id, u.ho_ten, r.trigger_type,
              r.started_at, r.finished_at, r.status, r.records_seen, r.records_changed, r.http_calls, r.error_code, r.error_detail
         FROM crawl_runs r LEFT JOIN app_users u ON u.id = r.app_user_id
        WHERE ($1::text IS NULL OR r.status = $1) AND ($2::text IS NULL OR r.source_system = $2)
          AND ($3::timestamptz IS NULL OR r.started_at >= $3)
        ORDER BY r.started_at DESC LIMIT $4`,
      [q.status ?? null, q.source_system ?? null, q.from ?? null, Math.min(Number(q.limit ?? 200) || 200, 1000)]));
  });

  app.get('/ops/health', async (req) => {
    if (!req.user.is_ops_admin) throw new Problem('forbidden', 'Chỉ dành cho kỹ sư vận hành');
    return withTenant(deps.writer, (t) => t.one(
      `SELECT
         (SELECT count(*) FILTER (WHERE status = 'failed')::float / nullif(count(*), 0)
            FROM crawl_runs WHERE started_at > now() - interval '1 hour') AS failed_ratio_1h,
         (SELECT count(*) FILTER (WHERE session_state = 'expired')::float / nullif(count(*), 0)
            FROM source_grants WHERE revoked_at IS NULL) AS expired_ratio,
         (SELECT count(*) FROM crawl_runs WHERE error_code = 'schema_drift' AND started_at > now() - interval '24 hours')::int AS drift_24h,
         (SELECT count(*) FROM source_grants g WHERE g.revoked_at IS NULL AND g.session_state = 'active'
             AND NOT EXISTS (SELECT 1 FROM crawl_runs r WHERE r.app_user_id = g.app_user_id AND r.source_system = g.source_system
                              AND r.status = 'ok' AND r.finished_at > now() - interval '48 hours'))::int AS users_no_success_48h,
         -- Lịch đã quá giờ (trừ 10 phút rải giờ + nhịp 1 phút) mà bộ hẹn giờ chưa xử lý ⇒ worker đang ngừng.
         (SELECT count(*) FROM report_subscriptions rs
            JOIN report_catalog rc ON rc.code = rs.report_code AND rc.is_active
            JOIN core.source_systems ss ON ss.code = rc.source_system AND ss.enabled
            JOIN app_users au ON au.id = rs.app_user_id AND au.is_active
           WHERE rs.is_enabled AND rs.next_run_at < now() - interval '10 minutes')::int AS overdue_schedules,
         -- Lượt spider hỏng ngay trong Crawlab (không tới được Vala) 24 giờ qua.
         (SELECT count(*) FROM crawl_runs WHERE error_code IN ('spider_not_started', 'spider_launch_failed', 'spider_not_synced')
             AND started_at > now() - interval '24 hours')::int AS launch_failures_24h,
         (SELECT jsonb_build_object('at', at, 'info', info) FROM core.service_heartbeats WHERE name = 'worker') AS worker,
         (SELECT jsonb_build_object('at', at, 'info', info) FROM core.service_heartbeats WHERE name = 'crawlab') AS crawlab`));
  });
};

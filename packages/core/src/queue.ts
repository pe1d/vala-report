import { randomUUID } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { findSpec, loadAllSpecs, type AdapterSpec } from './adapter/index.js';
import { withTenant, type Db } from './db/index.js';
import { env } from './env.js';
import { isPreset, nextRuns } from './presets.js';
import type { CrawlJob, TriggerType } from './ingest/crawl.js';

export const CRAWL_QUEUE = 'crawl';
export const MAINTENANCE_QUEUE = 'maintenance';
/** Tối đa bao nhiêu người dùng chạy song song trên toàn hệ thống (mục 02). */
export const CRAWL_CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY ?? 5);
export const FANOUT_WINDOW_MS = Number(process.env.FANOUT_WINDOW_MS ?? 30 * 60_000);

export function redisConnection(url = env('REDIS_URL')): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

export function crawlQueue(connection = redisConnection()) {
  return new Queue<CrawlJob>(CRAWL_QUEUE, { connection });
}

export function maintenanceQueue(connection = redisConnection()) {
  return new Queue(MAINTENANCE_QUEUE, { connection });
}

/** Đổi ":capability" trong selector của spec thành tham số có tên của pg-promise (bỏ qua "::cast"). */
export function bindSelector(sql: string): string {
  return sql.replace(/(?<!:):([a-z_][a-z0-9_]*)/g, '$<$1>');
}

/**
 * Ai cần crawl cho (hệ thống × capability × preset): người có lịch bật cho một báo cáo dùng capability đó
 * và có kết nối còn hiệu lực trong phạm vi đã đồng ý. Cố định trong code — cấu hình adapter sửa được trên
 * cổng nên không được mang SQL (mục scheduling.selector trong YAML cũ bị bỏ qua).
 */
export const FANOUT_SELECTOR = `
  SELECT DISTINCT s.app_user_id
    FROM report_subscriptions rs
    JOIN report_catalog rc ON rc.code = rs.report_code
    JOIN source_grants  s  ON s.app_user_id = rs.app_user_id AND s.source_system = rc.source_system
   WHERE rc.source_system = :source AND rc.capability = :capability
     AND rs.schedule_preset = :preset AND rs.is_enabled
     AND s.revoked_at IS NULL AND s.session_state = 'active'
     AND rc.capability = ANY(s.scope_capabilities)`;

export async function selectFanOutUsers(
  writer: Db, spec: AdapterSpec, capability: string, preset: string, onlyUserId?: number,
): Promise<number[]> {
  const sql = `SELECT app_user_id FROM (${bindSelector(FANOUT_SELECTOR)}) sel
                WHERE $<only>::bigint IS NULL OR app_user_id = $<only>::bigint
                ORDER BY app_user_id`;
  return withTenant(writer, (t) =>
    t.map(sql, { source: spec.source_system, capability, preset, only: onlyUserId ?? null }, (r: { app_user_id: number }) => r.app_user_id));
}

export interface FanOutRequest {
  source: string;
  capability: string;
  preset: string;
  trigger?: TriggerType;
  crawlabTaskId?: string;
  crawlabRunId?: string;
  onlyUserId?: number;
  windowMs?: number;
}

export interface FanOutResult {
  runKey: string;
  users: number;
}

/**
 * Mỗi người dùng đủ điều kiện một job, rải đều trong cửa sổ để không tạo đỉnh tải lên
 * hệ thống nguồn. jobId gắn với runKey ⇒ Crawlab gọi lại cùng runKey không đẩy trùng.
 */
export async function fanOut(writer: Db, queue: Queue<CrawlJob>, req: FanOutRequest): Promise<FanOutResult> {
  const spec = findSpec(req.source, req.capability, loadAllSpecs());
  const users = await selectFanOutUsers(writer, spec, req.capability, req.preset, req.onlyUserId);
  const runKey = req.crawlabRunId ?? randomUUID();
  const window = req.onlyUserId ? 0 : req.windowMs ?? FANOUT_WINDOW_MS;
  const step = users.length > 1 ? window / users.length : 0;
  await queue.addBulk(users.map((userId, i) => ({
    name: `${req.source}.${req.capability}`,
    data: {
      source: req.source, capability: req.capability, userId, preset: req.preset,
      trigger: req.trigger ?? 'schedule', crawlabTaskId: req.crawlabTaskId, crawlabRunId: runKey,
    },
    opts: {
      jobId: `${runKey}_${userId}`,
      delay: Math.round(i * step),
      attempts: 1,               // lỗi phiên không tự khỏi khi thử lại; lần chạy lịch sau sẽ thử
      removeOnComplete: 5000,
      removeOnFail: 5000,
    },
  })));
  return { runKey, users: users.length };
}

/**
 * Lịch chạy của báo cáo KHÔNG có spider (hệ thống quản trị thêm, lấy dữ liệu theo các bước khai trong adapter):
 * worker gọi mỗi phút, tìm lịch đến hạn, dời next_run_at NGAY (để lỗi không làm chạy lặp mỗi phút) rồi đẩy
 * job crawl cho đúng người đó. Báo cáo có spider thì Crawlab lo, không đi qua đây.
 */
export async function enqueueDueSubscriptions(writer: Db, queue: Pick<Queue<CrawlJob>, 'addBulk'>, now = new Date()): Promise<number> {
  const due = await withTenant(writer, async (t) => {
    const rows = await t.any<{ id: number; app_user_id: number; schedule_preset: string; source_system: string; capability: string }>(
      `SELECT rs.id, rs.app_user_id, rs.schedule_preset, rc.source_system, rc.capability
         FROM report_subscriptions rs
         JOIN report_catalog rc ON rc.code = rs.report_code
         JOIN core.source_systems ss ON ss.code = rc.source_system AND ss.enabled
         JOIN source_grants g ON g.app_user_id = rs.app_user_id AND g.source_system = rc.source_system
        WHERE rs.is_enabled AND rc.is_active AND rc.spider_code IS NULL
          AND g.revoked_at IS NULL AND g.session_state = 'active'
          AND (rs.next_run_at IS NULL OR rs.next_run_at <= $1)
        FOR UPDATE OF rs SKIP LOCKED`, [now]);
    for (const r of rows) {
      const next = isPreset(r.schedule_preset) ? nextRuns(r.schedule_preset, 1, now)[0] ?? null : null;
      await t.none('UPDATE report_subscriptions SET next_run_at = $2 WHERE id = $1', [r.id, next]);
    }
    return rows;
  });
  // Một job cho mỗi (người × hệ thống × capability), dù người đó có nhiều lịch trùng giờ.
  const seen = new Set<string>();
  const specs = loadAllSpecs();
  const jobs = [];
  const tick = now.toISOString().slice(0, 16);
  for (const r of due) {
    const k = `${r.app_user_id}:${r.source_system}:${r.capability}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const spec = specs.find((s) => s.source_system === r.source_system && s.capabilities.some((c) => c.id === r.capability && c.sink));
    if (!spec) continue;           // hệ thống chỉ có cấu hình nhanh: chưa lấy dữ liệu được
    jobs.push({
      name: `${r.source_system}.${r.capability}`,
      data: { source: r.source_system, capability: r.capability, userId: r.app_user_id, preset: r.schedule_preset, trigger: 'schedule' as const },
      opts: { jobId: `due_${k}_${tick}`.replace(/[^\w-]/g, '_'), attempts: 1, removeOnComplete: 5000, removeOnFail: 5000 },
    });
  }
  if (jobs.length) await queue.addBulk(jobs);
  return jobs.length;
}

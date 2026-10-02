import { randomUUID } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { findSpec, loadAllSpecs, type AdapterSpec } from './adapter/index.js';
import { withTenant, type Db } from './db/index.js';
import { env } from './env.js';
import type { CrawlabClient } from './crawlab.js';
import { JITTER_SQL, ScheduleSchema, nextScheduleRuns, type Schedule } from './schedule.js';
import { launchSpider } from './spiderOps.js';
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
 * Ai cần crawl cho (hệ thống × capability): người có lịch lấy dữ liệu (data_schedules) đang bật cho capability đó
 * (do worker chạy, không qua spider) và có kết nối còn hiệu lực trong phạm vi đã đồng ý. `preset` của API cũ không
 * còn ý nghĩa (lịch giờ do bộ hẹn giờ của worker quản lý) — giữ tham số để lời gọi cũ không vỡ. Cố định trong code —
 * cấu hình adapter sửa được trên cổng nên không được mang SQL.
 */
export const FANOUT_SELECTOR = `
  SELECT DISTINCT s.app_user_id
    FROM data_schedules ds
    JOIN source_grants  s  ON s.app_user_id = ds.app_user_id AND s.source_system = ds.source_system
   WHERE ds.source_system = :source AND ds.capability = :capability AND ds.spider_code IS NULL
     AND ds.is_enabled
     AND s.revoked_at IS NULL AND s.session_state = 'active'
     AND ds.capability = ANY(s.scope_capabilities)`;

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

/** Mỗi hệ thống nguồn tối đa bao nhiêu người được bắt đầu lấy dữ liệu trong một phút; phần dư chờ phút sau. */
export const MAX_STARTS_PER_SOURCE_PER_MINUTE = Number(process.env.MAX_STARTS_PER_SOURCE_PER_MINUTE ?? 20);
/** Cùng một người × hệ thống: đã có lượt chạy (đang chạy / thành công) gần hơn khoảng này thì bỏ qua lượt theo lịch. */
export const SCHEDULE_MIN_GAP_MINUTES = Number(process.env.SCHEDULE_MIN_GAP_MINUTES ?? 50);

export interface DueScheduleResult { due: number; started: number; skipped: number; deferred: number }


/**
 * Bộ hẹn giờ lịch lấy dữ liệu (data_schedules — mỗi người × một nguồn dữ liệu; worker gọi mỗi phút).
 * Với mỗi lịch đến hạn (giờ đặt + độ lệch rải giờ):
 *   (giờ đặt + 0…4 phút rải giờ, xem jitterMinutes)
 *   1. dời next_run_at sang lần kế tiếp NGAY trong cùng transaction (lỗi không làm chạy lặp mỗi phút);
 *      lịch một lần thì tự tắt;
 *   2. gộp: nhiều lịch của cùng người × hệ thống × cách lấy dữ liệu trong cùng phút ⇒ một lượt;
 *   3. bỏ qua nếu kết nối không còn hiệu lực, hoặc người đó vừa có lượt chạy trong SCHEDULE_MIN_GAP_MINUTES;
 *   4. giới hạn số lượt bắt đầu mỗi hệ thống mỗi phút — lịch vượt hạn mức để nguyên, phút sau chạy tiếp;
 *   5. báo cáo có spider ⇒ chạy spider trên Crawlab cho ĐÚNG người đó (--user); không có ⇒ job crawl của worker.
 */
export async function runDueSchedules(
  writer: Db, queue: Pick<Queue<CrawlJob>, 'addBulk'>, crawlab: CrawlabClient | null, now = new Date(),
  log: (msg: string, meta?: Record<string, unknown>) => void = () => {},
): Promise<DueScheduleResult> {
  type Row = {
    id: number; app_user_id: number; schedule: unknown; next_run_at: Date | null;
    source_system: string; capability: string | null; spider_code: string | null; crawlab_spider_id: string | null; spider_enabled: boolean | null;
    grant_state: string | null;
  };
  const res: DueScheduleResult = { due: 0, started: 0, skipped: 0, deferred: 0 };
  const plan = await withTenant(writer, async (t) => {
    const rows = await t.any<Row>(
      `SELECT ds.id, ds.app_user_id, ds.schedule, ds.next_run_at, ds.source_system, ds.capability, ds.spider_code,
              sp.crawlab_spider_id, sp.is_enabled AS spider_enabled,
              CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' ELSE g.session_state END AS grant_state
         FROM data_schedules ds
         JOIN core.source_systems ss ON ss.code = ds.source_system AND ss.enabled
         JOIN app_users au ON au.id = ds.app_user_id AND au.is_active     -- người dùng bị vô hiệu hoá: lịch ngừng chạy
         LEFT JOIN source_grants g ON g.app_user_id = ds.app_user_id AND g.source_system = ds.source_system
         LEFT JOIN core.crawl_spiders sp ON sp.code = ds.spider_code
        WHERE ds.is_enabled
          AND (ds.next_run_at IS NULL
               OR ds.next_run_at + ${JITTER_SQL} <= $1)
        ORDER BY ds.next_run_at NULLS FIRST, ds.id
        FOR UPDATE OF ds SKIP LOCKED`, [now]);
    const starts = new Map<string, number>();      // hệ thống ⇒ số lượt đã bắt đầu trong phút này
    const keys = new Map<string, Row>();            // người × hệ thống × cách lấy ⇒ một lượt
    for (const r of rows) {
      let sched: Schedule;
      try { sched = ScheduleSchema.parse(r.schedule); } catch {
        await t.none('UPDATE data_schedules SET is_enabled = false, next_run_at = NULL WHERE id = $1', [r.id]);
        log('lịch hỏng — đã tắt', { id: r.id });
        continue;
      }
      // Lịch vừa bật / vừa sửa chưa có next_run_at: chỉ tính lần kế tiếp, chưa chạy.
      if (!r.next_run_at && sched.kind !== 'mot_lan') {
        await t.none('UPDATE data_schedules SET next_run_at = $2 WHERE id = $1', [r.id, nextScheduleRuns(sched, 1, now)[0] ?? null]);
        continue;
      }
      res.due++;
      const key = `${r.app_user_id}:${r.source_system}:${r.spider_code ?? r.capability}`;
      const runnable = r.grant_state === 'active' && (r.spider_code ? r.spider_enabled !== false : true);
      if (runnable && !keys.has(key) && (starts.get(r.source_system) ?? 0) >= MAX_STARTS_PER_SOURCE_PER_MINUTE) {
        res.deferred++;                              // để nguyên — phút sau chạy
        continue;
      }
      const next = sched.kind === 'mot_lan' ? null : nextScheduleRuns(sched, 1, now)[0] ?? null;
      await t.none(
        `UPDATE data_schedules SET next_run_at = $2, is_enabled = CASE WHEN $3 THEN false ELSE is_enabled END WHERE id = $1`,
        [r.id, next, sched.kind === 'mot_lan']);
      if (!runnable) { res.skipped++; continue; }
      if (keys.has(key)) continue;                   // đã gộp vào lượt của lịch khác
      const recent = await t.oneOrNone(
        `SELECT 1 FROM crawl_runs WHERE app_user_id = $1 AND source_system = $2 AND status IN ('running', 'ok')
            AND started_at > $3::timestamptz - make_interval(mins => $4) LIMIT 1`,
        [r.app_user_id, r.source_system, now, SCHEDULE_MIN_GAP_MINUTES]);
      if (recent) { res.skipped++; continue; }
      keys.set(key, r);
      starts.set(r.source_system, (starts.get(r.source_system) ?? 0) + 1);
    }
    return [...keys.values()];
  });

  const jobs = [];
  const specs = loadAllSpecs();
  const tick = now.toISOString().slice(0, 16);
  for (const r of plan) {
    if (r.spider_code) {
      if (!crawlab) { res.skipped++; log('lịch cần spider nhưng chưa cấu hình Crawlab', { spider: r.spider_code }); continue; }
      try {
        // Kiểm tra/khôi phục mã spider trên Crawlab, chạy, ghi lượt khởi chạy; lỗi ⇒ đã ghi vào Nhật ký chạy.
        await launchSpider(writer, crawlab, { spiderCode: r.spider_code, userId: r.app_user_id, trigger: 'schedule' });
        res.started++;
      } catch (e) {
        res.skipped++;
        log('không chạy được spider theo lịch', { spider: r.spider_code, user: r.app_user_id, error: (e as Error).message });
      }
      continue;
    }
    const capability = r.capability!;               // không có spider ⇒ lịch theo capability (ràng buộc CSDL)
    const spec = specs.find((s) => s.source_system === r.source_system && s.capabilities.some((c) => c.id === capability && c.sink));
    if (!spec) { res.skipped++; continue; }        // hệ thống chỉ có cấu hình nhanh: chưa lấy dữ liệu được
    const k = `${r.app_user_id}:${r.source_system}:${capability}`;
    jobs.push({
      name: `${r.source_system}.${capability}`,
      data: { source: r.source_system, capability, userId: r.app_user_id, trigger: 'schedule' as const },
      opts: { jobId: `due_${k}_${tick}`.replace(/[^\w-]/g, '_'), attempts: 1, removeOnComplete: 5000, removeOnFail: 5000 },
    });
  }
  if (jobs.length) { await queue.addBulk(jobs); res.started += jobs.length; }
  return res;
}

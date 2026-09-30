/**
 * Vận hành spider trên Crawlab — để những lỗi xảy ra NGAY trong Crawlab (trước khi spider kịp gọi Vala) không còn
 * "biến mất":
 *   - launchSpider: mọi lần bảo Crawlab chạy spider đều đi qua đây — kiểm tra/khôi phục mã spider trên Crawlab,
 *     chạy, ghi core.spider_launches; Crawlab từ chối ⇒ ghi ngay một lượt lỗi vào crawl_runs.
 *   - checkSpiderLaunches: lượt đã khởi chạy mà quá vài phút spider vẫn chưa gọi Vala ⇒ lấy lý do từ log Crawlab,
 *     ghi lượt lỗi (Nhật ký chạy trên trang Vận hành); lỗi do thiếu file ⇒ khôi phục mã spider cho lần sau.
 *   - checkCrawlabHealth / heartbeat: worker ghi tình trạng worker + Crawlab để trang Vận hành hiện ra.
 * Mã spider luôn lấy từ CSDL (spiderFiles) — Crawlab mất file (vd khởi động lại) thì tự đẩy lại, không cần bấm tay.
 */
import { loadAllSpecs } from './adapter/index.js';
import { spiderFiles, type CrawlabClient } from './crawlab.js';
import { withTenant, type Db } from './db/index.js';
import { Problem } from './errors.js';
import { getSpider, type SpiderRow } from './ingest/spider.js';

/** Sau khoảng này mà spider chưa gọi Vala (và task Crawlab không còn chạy) ⇒ coi là không khởi chạy được. */
const REPORT_GRACE_MS = 3 * 60_000;
/** Task còn "đang chạy" trên Crawlab quá lâu mà vẫn chưa gọi Vala ⇒ cũng ghi lỗi. */
const STUCK_MS = 20 * 60_000;

type Trigger = 'schedule' | 'manual';

/**
 * Mã spider trên Crawlab có khớp bản trong CSDL không (main.py) và SDK của phiên bản đang chạy (vala_sdk.py):
 * thiếu (vd Crawlab khởi động lại) hoặc khác (vừa cập nhật SDK / sửa mã trên cổng) ⇒ đẩy lại. Trả tên file đã đẩy.
 */
export async function ensureSpiderFiles(client: CrawlabClient, row: SpiderRow): Promise<string[]> {
  if (!row.crawlab_spider_id) return [];
  const id = row.crawlab_spider_id;
  const have = new Set((await client.listFiles(id)).map((f) => f.name));
  const files = spiderFiles(row);
  const pushed: string[] = [];
  for (const [n, content] of Object.entries(files)) {
    if (have.has(n) && (await client.getFile(id, n)) === content) continue;
    await client.saveFile(id, n, content);
    pushed.push(n);
  }
  return pushed;
}

/** Ghi một lượt lỗi vào crawl_runs cho lần chạy spider không tới được Vala (hiện ở Nhật ký chạy). */
export async function recordSpiderFailure(
  db: Db, row: SpiderRow, userId: number | null, trigger: Trigger, code: string, detail: string, taskId: string | null = null,
): Promise<void> {
  const version = loadAllSpecs().find((s) => s.source_system === row.source_system)?.version ?? '-';
  await withTenant(db, (t) => t.none(
    `INSERT INTO crawl_runs (source_system, capability, adapter_version, app_user_id, crawlab_task_id, trigger_type, spider_code,
                             status, finished_at, error_code, error_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $2, 'failed', now(), $7, $8)`,
    [row.source_system, row.code, version, userId, taskId, trigger, code, detail.slice(0, 500)]));
}

/**
 * Bảo Crawlab chạy spider cho MỘT người. Trước khi chạy: kiểm tra mã spider trên Crawlab còn đủ file (thiếu thì đẩy lại
 * từ CSDL). Crawlab từ chối / không liên lạc được ⇒ ghi lượt lỗi rồi báo lỗi cho nơi gọi.
 */
export async function launchSpider(db: Db, client: CrawlabClient, opts: { spiderCode: string; userId: number; trigger: Trigger }): Promise<string[]> {
  const row = await getSpider(db, opts.spiderCode);
  if (!row.crawlab_spider_id) {
    await recordSpiderFailure(db, row, opts.userId, opts.trigger, 'spider_not_synced', 'Spider chưa được đồng bộ lên Crawlab — quản trị bấm "Đồng bộ Crawlab"');
    throw new Problem('internal', 'Spider chưa được đồng bộ lên Crawlab', 'Quản trị cần bấm "Đồng bộ Crawlab"');
  }
  await ensureSpiderFiles(client, row).catch(() => []);     // không liên lạc được sẽ lộ ra ở bước chạy ngay dưới
  let tasks: string[];
  try {
    tasks = await client.runSpider(row.crawlab_spider_id, `--user ${opts.userId} --trigger ${opts.trigger}`);
  } catch (e) {
    const msg = `Crawlab không chạy được spider: ${(e as Error).message}`;
    await recordSpiderFailure(db, row, opts.userId, opts.trigger, 'spider_launch_failed', msg);
    throw new Problem('internal', 'Không chạy được spider trên Crawlab', msg.slice(0, 300));
  }
  await withTenant(db, async (t) => {
    for (const id of tasks.length ? tasks : [null]) {
      await t.none(`INSERT INTO core.spider_launches (spider_code, app_user_id, crawlab_task_id, trigger_type) VALUES ($1, $2, $3, $4)`,
        [row.code, opts.userId, id, opts.trigger]);
    }
  });
  return tasks;
}

/** Spider đã gọi Vala (bắt đầu lượt chạy) ⇒ lượt khởi chạy tương ứng coi như tới nơi. */
export async function markSpiderLaunchReported(db: Db, crawlabTaskId: string | undefined): Promise<void> {
  if (!crawlabTaskId) return;
  await withTenant(db, (t) => t.none(
    `UPDATE core.spider_launches SET status = 'reported', checked_at = now() WHERE crawlab_task_id = $1 AND status = 'launched'`, [crawlabTaskId]));
}

/** Dòng log Crawlab nói rõ nhất lý do hỏng (vd "can't open file … main.py"), không có thì trạng thái task. */
async function failureReason(client: CrawlabClient, taskId: string | null, status: string | null, taskError?: string): Promise<string> {
  if (taskId) {
    const logs = await client.taskLogs(taskId).catch(() => [] as string[]);
    const hit = [...logs].reverse().find((l) => /error|exception|traceback|can't|cannot|no such file|not found|denied/i.test(l));
    if (hit) return `Crawlab: ${hit.trim()}`;
  }
  if (taskError) return `Crawlab: ${taskError}`;
  return `Spider không gọi tới Vala${status ? ` (task Crawlab: ${status})` : ''}`;
}

/**
 * Lượt khởi chạy quá hạn mà spider chưa gọi Vala ⇒ ghi lượt lỗi kèm lý do lấy từ Crawlab. Lỗi thiếu file ⇒ đẩy lại mã
 * spider để lần sau chạy được. Worker gọi mỗi phút.
 */
export async function checkSpiderLaunches(db: Db, client: CrawlabClient, now = new Date()): Promise<{ failed: number }> {
  const rows = await withTenant(db, (t) => t.any<{ id: number; spider_code: string; app_user_id: number | null; crawlab_task_id: string | null; trigger_type: Trigger; launched_at: Date }>(
    `SELECT id, spider_code, app_user_id, crawlab_task_id, trigger_type, launched_at FROM core.spider_launches
      WHERE status = 'launched' AND launched_at < $1::timestamptz - make_interval(secs => $2) ORDER BY id LIMIT 50`,
    [now, REPORT_GRACE_MS / 1000]));
  let failed = 0;
  for (const l of rows) {
    const task = l.crawlab_task_id ? await client.getTask(l.crawlab_task_id).catch(() => null) : null;
    const status = task?.status ?? null;
    const running = status !== null && ['pending', 'running', 'assigned'].includes(status);
    if (running && now.getTime() - l.launched_at.getTime() < STUCK_MS) continue;     // còn đang chạy — đợi thêm
    const row = await getSpider(db, l.spider_code).catch(() => null);
    if (!row) continue;
    const reason = await failureReason(client, l.crawlab_task_id, status, task?.error);
    await recordSpiderFailure(db, row, l.app_user_id, l.trigger_type, 'spider_not_started', reason, l.crawlab_task_id);
    await withTenant(db, (t) => t.none(`UPDATE core.spider_launches SET status = 'failed', checked_at = now(), error = $2 WHERE id = $1`, [l.id, reason.slice(0, 500)]));
    if (/no such file|main\.py/i.test(reason)) await ensureSpiderFiles(client, row).catch(() => []);
    failed++;
  }
  return { failed };
}

/** Ghi "còn sống" của một dịch vụ (worker) hoặc kết quả kiểm tra (crawlab) — trang Vận hành đọc. */
export async function heartbeat(db: Db, name: string, info: Record<string, unknown> = {}): Promise<void> {
  await withTenant(db, (t) => t.none(
    `INSERT INTO core.service_heartbeats (name, at, info) VALUES ($1, now(), $2)
     ON CONFLICT (name) DO UPDATE SET at = now(), info = EXCLUDED.info`, [name, JSON.stringify(info)]));
}

/**
 * Kiểm tra Crawlab: liên lạc được không, spider đã đồng bộ nào thiếu file (thiếu thì đẩy lại ngay). Ghi kết quả vào
 * heartbeat 'crawlab'. Worker gọi lúc khởi động và định kỳ.
 */
export async function checkCrawlabHealth(db: Db, client: CrawlabClient | null): Promise<Record<string, unknown>> {
  if (!client) {
    const info = { configured: false };
    await heartbeat(db, 'crawlab', info);
    return info;
  }
  let info: Record<string, unknown>;
  try {
    await client.listSpiders();
    const spiders = await withTenant(db, (t) => t.any<SpiderRow>('SELECT * FROM core.crawl_spiders WHERE is_enabled AND crawlab_spider_id IS NOT NULL'));
    const restored: string[] = [];
    const errors: string[] = [];
    for (const s of spiders) {
      try { if ((await ensureSpiderFiles(client, s)).length) restored.push(s.code); } catch (e) { errors.push(`${s.code}: ${(e as Error).message.slice(0, 120)}`); }
    }
    info = { configured: true, reachable: true, spiders: spiders.length, restored, errors };
  } catch (e) {
    info = { configured: true, reachable: false, error: (e as Error).message.slice(0, 200) };
  }
  await heartbeat(db, 'crawlab', info);
  return info;
}

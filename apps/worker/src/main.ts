/**
 * Worker: tiêu thụ hàng đợi Redis, mỗi job = một người dùng, chạy adapter.
 * Không nhận request từ ngoài. Kết nối CSDL bằng pool writer (BYPASSRLS) vì ghi thay nhiều người.
 */
import { Worker } from 'bullmq';
import {
  CRAWL_CONCURRENCY, CRAWL_QUEUE, ConnectionSessions, MAINTENANCE_QUEUE, SessionManager, SourceRegistry, SsoClient, TENANT, closeAllPools,
  crawlUserSource, crawlQueue, enqueueDueSubscriptions, envBool, fanOut, maintenanceQueue, redisConnection, refreshExpiringSessions, secretStore,
  ssoConfigFromEnv, withTenant, writerDb, type CrawlJob,
} from '@vala/core';
import { loadAllSpecs, registerSpecs } from '@vala/core/adapter';
import { log } from './log.js';

const connection = redisConnection();
const writer = writerDb();
const secrets = secretStore();
// Cấu hình adapter nằm trong CSDL (trang "Hệ thống nguồn"); nạp lại mỗi phút để thấy thay đổi của quản trị.
const registry = new SourceRegistry(writer);
await registry.reload();
registry.install();
setInterval(() => { registry.reload().catch((e: Error) => log.error('nạp lại cấu hình hệ thống nguồn lỗi', { err: e.message })); }, 60_000).unref();
const maintenance = maintenanceQueue(connection);
const crawl = crawlQueue(connection);

const baseUrls: Record<string, string> = {};
// Dev: <NGUON>_BASE_URL ghi đè base_url trong CSDL (trỏ vào hệ thống giả lập).
for (const [k, v] of Object.entries(process.env)) {
  const m = /^([A-Z0-9_]+)_BASE_URL$/.exec(k);
  if (m && v) baseUrls[m[1]!.toLowerCase()] = v;
}

// Lấy lại phiên ứng dụng khi phiên hỏng (phương án, mục 08). Khoá refresh theo người dùng chỉ có
// hiệu lực trong một tiến trình ⇒ bản 1 chạy MỘT tiến trình worker (concurrency nằm bên trong).
const resolveBaseUrl = (source: string) => withTenant(writer, (t) => t.one(
  'SELECT base_url FROM core.source_systems WHERE code = $1', [source], (r: { base_url: string }) => r.base_url));
// Dev: EGOV_BASE_URL và SSO_ORIGIN trỏ vào mock ⇒ ghi đè để không bao giờ chạm hệ thống thật.
const devLoginHost = process.env.SSO_ORIGIN ? new URL(process.env.SSO_ORIGIN).host : undefined;
const sourceInfo = (source: string) => withTenant(writer, (t) => t.one(
  'SELECT base_url, login_hosts FROM core.source_systems WHERE code = $1', [source],
  (r: { base_url: string; login_hosts: string[] }) => ({
    baseUrl: baseUrls[source] ?? r.base_url,
    loginHosts: [...r.login_hosts, ...(devLoginHost ? [devLoginHost] : [])],
  })));
const sessions = new SessionManager({ secrets, sso: new SsoClient(ssoConfigFromEnv()), tenant: TENANT, baseUrls, resolveBaseUrl });
// Cách xác thực nào cũng lấy lại phiên qua đây: password (tự đăng nhập), cookie (chờ dán), sso (refresh token).
const connections = new ConnectionSessions({ secrets, tenant: TENANT, sourceInfo, sso: sessions });

await withTenant(writer, async (t) => {
  await registerSpecs(t, loadAllSpecs());
  await t.any('SELECT ensure_raw_partitions(2)');
});
log.info('worker khởi động', { tenant: TENANT, adapters: loadAllSpecs().map((s) => `${s.id}@${s.version}`), concurrency: CRAWL_CONCURRENCY });

const crawlWorker = new Worker<CrawlJob>(
  CRAWL_QUEUE,
  async (job) => {
    const out = await crawlUserSource({ writer, secrets, baseUrls, sessions, connections }, job.data);
    log.info('crawl xong', { job: job.id, user: job.data.userId, ...out });
    if (out.status === 'ok' && out.recordsChanged > 0) {
      // Gộp nhiều lần làm mới thành một: jobId cố định + trễ 30 giây.
      await maintenance.add('refresh_aggregates', {}, { jobId: 'refresh_aggregates', delay: 30_000, removeOnComplete: true, removeOnFail: true });
    }
    return out;
  },
  { connection, concurrency: CRAWL_CONCURRENCY },
);
crawlWorker.on('failed', (job, err) => log.error('job lỗi ngoài dự kiến', { job: job?.id, error: err.message }));

const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE,
  async (job) => {
    switch (job.name) {
      case 'refresh_aggregates':
        await withTenant(writer, (t) => t.any('SELECT refresh_aggregates()'));
        return;
      case 'raw_partitions':
        await withTenant(writer, async (t) => {
          await t.any('SELECT ensure_raw_partitions(2)');
          const dropped = await t.one('SELECT drop_expired_raw_partitions(90) AS n', [], (r: { n: number }) => r.n);
          log.info('bảo trì phân vùng raw_records', { dropped });
        });
        return;
      case 'session_refresh': {
        const r = await refreshExpiringSessions(writer, connections, Number(process.env.SESSION_REFRESH_WITHIN_MINUTES ?? 60));
        if (r.checked) log.info('làm mới phiên', { ...r });
        return;
      }
      case 'due_subscriptions': {
        // Báo cáo không có spider (hệ thống quản trị thêm): lấy dữ liệu theo các bước khai trong adapter.
        const n = await enqueueDueSubscriptions(writer, crawl);
        if (n) log.info('lịch đến hạn (không qua spider)', { queued: n });
        return;
      }
      case 'dev_fanout': {
        const res = await fanOut(writer, crawl, { ...(job.data as { source: string; capability: string; preset: string }), trigger: 'schedule' });
        log.info('dev fan-out', { ...job.data, ...res });
        return;
      }
      default:
        log.warn('job bảo trì không rõ', { name: job.name });
    }
  },
  { connection, concurrency: 1 },
);

await maintenance.upsertJobScheduler('raw_partitions', { pattern: '0 2 * * *', tz: 'Asia/Ho_Chi_Minh' }, { name: 'raw_partitions' });
await maintenance.upsertJobScheduler('session_refresh', { every: 10 * 60_000 }, { name: 'session_refresh' });
await maintenance.upsertJobScheduler('due_subscriptions', { every: 60_000 }, { name: 'due_subscriptions' });

// Dev không có Crawlab: tự kích hoạt theo core.crawl_tasks. Production: Crawlab gọi /internal/crawl/fan-out.
if (envBool('DEV_SCHEDULER')) {
  const tasks = await withTenant(writer, (t) => t.any<{ source_system: string; capability: string; schedule_preset: string; cron_expr: string }>(
    'SELECT source_system, capability, schedule_preset, cron_expr FROM core.crawl_tasks WHERE is_enabled'));
  for (const task of tasks) {
    await maintenance.upsertJobScheduler(
      `dev_fanout:${task.source_system}:${task.capability}:${task.schedule_preset}`,
      { pattern: task.cron_expr, tz: 'Asia/Ho_Chi_Minh' },
      { name: 'dev_fanout', data: { source: task.source_system, capability: task.capability, preset: task.schedule_preset } },
    );
  }
  log.warn('DEV_SCHEDULER bật — worker tự chạy lịch thay Crawlab', { tasks: tasks.length });
}

async function shutdown(signal: string) {
  log.info('dừng worker', { signal });
  await Promise.allSettled([crawlWorker.close(), maintenanceWorker.close(), maintenance.close(), crawl.close()]);
  await closeAllPools();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

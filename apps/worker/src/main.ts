/**
 * Worker: tiêu thụ hàng đợi Redis, mỗi job = một người dùng, chạy adapter.
 * Không nhận request từ ngoài. Kết nối CSDL bằng pool writer (BYPASSRLS) vì ghi thay nhiều người.
 */
import { Worker } from 'bullmq';
import {
  CRAWL_CONCURRENCY, CRAWL_QUEUE, ConnectionSessions, CrawlabClient, MAINTENANCE_QUEUE, SessionManager, SourceRegistry, SsoClient, TENANT, closeAllPools,
  checkCrawlabHealth, checkSpiderLaunches, crawlUserSource, crawlQueue, crawlabConfigFromEnv, ensureRecordIndexes, heartbeat, markSourceMfa, runDueSchedules, maintenanceQueue, redisConnection, refreshExpiringSessions, secretStore,
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
// Lịch người dùng tự đặt có báo cáo dùng spider ⇒ worker bảo Crawlab chạy spider cho đúng người đến hạn.
const crawlabCfg = crawlabConfigFromEnv();
const crawlab = crawlabCfg ? new CrawlabClient(crawlabCfg) : null;
// Đủ thông tin ⇒ worker tự đồng bộ spider chưa có trên Crawlab (máy chủ mới / vừa chuyển dữ liệu).
const crawlabSync = process.env.SPIDER_API_URL && process.env.INTERNAL_TOKEN
  ? { apiUrlForSpiders: process.env.SPIDER_API_URL, internalToken: process.env.INTERNAL_TOKEN } : undefined;
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
// Tự đăng nhập gặp OTP ⇒ đánh dấu hệ thống có xác thực 2 lớp, bỏ cách kết nối bằng mật khẩu.
const connections = new ConnectionSessions({ secrets, tenant: TENANT, sourceInfo, sso: sessions,
  onOtpRequired: async (s) => { await markSourceMfa(writer, s); await registry.reload(); } });

await withTenant(writer, async (t) => {
  await registerSpecs(t, loadAllSpecs());
  await t.any('SELECT ensure_raw_partitions(2)');
});
// Chỉ mục cho các trường khai `index: true` trong cấu hình (kho chung records). Lỗi không chặn worker khởi động.
ensureRecordIndexes(writer).then(
  (n) => n.length && log.info('chỉ mục kho chung', { indexes: n.length }),
  (e: Error) => log.error('tạo chỉ mục kho chung lỗi', { err: e.message }),
);
log.info('worker khởi động', { tenant: TENANT, adapters: loadAllSpecs().map((s) => `${s.id}@${s.version}`), concurrency: CRAWL_CONCURRENCY });

const crawlWorker = new Worker<CrawlJob>(
  CRAWL_QUEUE,
  async (job) => {
    const out = await crawlUserSource({ writer, secrets, baseUrls, sessions, connections }, job.data);
    log.info('crawl xong', { job: job.id, user: job.data.userId, ...out });
    return out;
  },
  { connection, concurrency: CRAWL_CONCURRENCY },
);
crawlWorker.on('failed', (job, err) => log.error('job lỗi ngoài dự kiến', { job: job?.id, error: err.message }));

const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE,
  async (job) => {
    switch (job.name) {
      case 'refresh_aggregates':   // job cũ còn trong hàng đợi (bảng tổng hợp theo tháng đã bỏ ở migration 016)
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
        // Bộ hẹn giờ lịch người dùng tự đặt: spider (qua Crawlab, --user) hoặc các bước lấy dữ liệu trong adapter.
        const r = await runDueSchedules(writer, crawl, crawlab, new Date(), (msg, meta) => log.warn(msg, meta));
        if (r.due) log.info('lịch đến hạn', { ...r });
        // Lượt spider đã khởi chạy mà không gọi tới Vala ⇒ ghi lỗi kèm lý do từ Crawlab (Nhật ký chạy).
        if (crawlab) {
          const c = await checkSpiderLaunches(writer, crawlab);
          if (c.failed) log.warn('lượt spider không khởi chạy được', c);
        }
        await heartbeat(writer, 'worker', { pid: process.pid });
        return;
      }
      case 'crawlab_health': {
        // Crawlab còn liên lạc được không, spider nào mất file (vd sau khi khởi động lại) ⇒ đẩy lại mã từ CSDL.
        const info = await checkCrawlabHealth(writer, crawlab, crawlabSync);
        if ((info.restored as string[] | undefined)?.length || info.reachable === false) log.warn('kiểm tra Crawlab', info);
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
await maintenance.upsertJobScheduler('crawlab_health', { every: 10 * 60_000 }, { name: 'crawlab_health' });
// Ngay khi khởi động: báo còn sống + kiểm tra Crawlab (máy chủ vừa khởi động lại thì Crawlab hay mất mã spider).
await heartbeat(writer, 'worker', { pid: process.pid, started: true }).catch(() => {});
checkCrawlabHealth(writer, crawlab, crawlabSync).then(
  (info) => log.info('kiểm tra Crawlab lúc khởi động', info),
  (e: Error) => log.error('kiểm tra Crawlab lỗi', { err: e.message }),
);

async function shutdown(signal: string) {
  log.info('dừng worker', { signal });
  await Promise.allSettled([crawlWorker.close(), maintenanceWorker.close(), maintenance.close(), crawl.close()]);
  await closeAllPools();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

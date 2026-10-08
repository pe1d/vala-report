/**
 * Worker: tiêu thụ hàng đợi Redis, mỗi job = một người dùng, chạy adapter.
 * Không nhận request từ ngoài. Kết nối CSDL bằng pool writer (BYPASSRLS) vì ghi thay nhiều người.
 * Nhiều đơn vị: mỗi việc crawl chạy trong ngữ cảnh đơn vị ghi trong việc; việc bảo trì định kỳ lặp qua từng đơn vị đang
 * hoạt động (forEachTenant) — lỗi của một đơn vị không chặn đơn vị khác.
 */
import { Worker } from 'bullmq';
import {
  CRAWL_CONCURRENCY, CRAWL_QUEUE, ConnectionSessions, CrawlabClient, DEFAULT_TENANT, MAINTENANCE_QUEUE, SessionManager, SourceRegistries, SsoClient, activeTenants, closeAllPools, forEachTenant, runInTenant,
  checkCrawlabHealth, checkSpiderLaunches, crawlUserSource, crawlQueue, crawlabConfigFromEnv, ensureRecordIndexes, heartbeat, markSourceMfa, ownerDb, provisionPendingTenants, runDueSchedules, maintenanceQueue, redisConnection, keepAliveSessions, refreshExpiringSessions, secretStore,
  ssoConfigFromEnv, withTenant, writerDb, type CrawlJob,
} from '@vala/core';
import { loadAllSpecs, registerSpecs } from '@vala/core/adapter';
import { log } from './log.js';

const connection = redisConnection();
const writer = writerDb();
const secrets = secretStore();
// Cấu hình adapter nằm trong CSDL (trang "Hệ thống nguồn", schema của từng đơn vị); nạp lại mỗi phút để thấy thay đổi.
const registry = new SourceRegistries(writer);
const registryError = (tenant: string, e: Error) => log.error('nạp lại cấu hình hệ thống nguồn lỗi', { tenant, err: e.message });
await registry.reloadAll(registryError);
registry.install();
setInterval(() => { registry.reloadAll(registryError).catch((e: Error) => log.error('đọc danh mục đơn vị lỗi', { err: e.message })); }, 60_000).unref();
/** Lỗi của một đơn vị trong việc định kỳ: ghi log, đơn vị khác chạy tiếp. */
const tenantError = (job: string) => (tenant: string, e: Error) => log.error(`${job} lỗi`, { tenant, err: e.message });
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
  'SELECT base_url FROM source_systems WHERE code = $1', [source], (r: { base_url: string }) => r.base_url));
// Dev: EGOV_BASE_URL và SSO_ORIGIN trỏ vào mock ⇒ ghi đè để không bao giờ chạm hệ thống thật.
// Đọc an toàn: giá trị rỗng / chỉ có dấu cách / sai định dạng trong .env.prod không được làm dừng worker.
const devLoginHost = (() => { const o = (process.env.SSO_ORIGIN ?? '').trim(); try { return o ? new URL(o).host : undefined; } catch { return undefined; } })();
const sourceInfo = (source: string) => withTenant(writer, (t) => t.one(
  'SELECT base_url, login_hosts FROM source_systems WHERE code = $1', [source],
  (r: { base_url: string; login_hosts: string[] }) => ({
    baseUrl: baseUrls[source] ?? r.base_url,
    loginHosts: [...r.login_hosts, ...(devLoginHost ? [devLoginHost] : [])],
  })));
const ssoClient = new SsoClient(ssoConfigFromEnv());
if (ssoClient.cfg.issuer) await ssoClient.discover().catch((e) => console.warn(`[sso] chưa đọc được cấu hình từ ${ssoClient.cfg.issuer}: ${(e as Error).message}`));
const sessions = new SessionManager({ secrets, sso: ssoClient, baseUrls, resolveBaseUrl });
// Cách xác thực nào cũng lấy lại phiên qua đây: password (tự đăng nhập), cookie (chờ dán), sso (refresh token).
// Tự đăng nhập gặp OTP ⇒ đánh dấu hệ thống có xác thực 2 lớp, bỏ cách kết nối bằng mật khẩu.
const connections = new ConnectionSessions({ secrets, sourceInfo, sso: sessions,
  onOtpRequired: async (s) => { await markSourceMfa(writer, s); await registry.reload(); } });

await forEachTenant(writer, () => withTenant(writer, async (t) => {
  await registerSpecs(t, loadAllSpecs());
  await t.any('SELECT ensure_raw_partitions(2)');
}), tenantError('khởi tạo adapter / phân vùng'));
// Chỉ mục cho các trường khai `index: true` trong cấu hình (kho chung records). Lỗi không chặn worker khởi động.
void forEachTenant(writer, async (tenant) => {
  const n = await ensureRecordIndexes(writer);
  if (n.length) log.info('chỉ mục kho chung', { tenant, indexes: n.length });
}, tenantError('tạo chỉ mục kho chung'));

// Dựng đơn vị do quản trị hệ thống tạo (Quản trị → Đơn vị): cần quyền chủ CSDL (tạo schema) ⇒ chỉ worker làm. API báo
// ngay khi tạo / thử lại (việc bảo trì `tenant_provision`); quét thêm lúc khởi động và mỗi phút phòng khi lỡ tin.
const owner = process.env.DATABASE_OWNER_URL ? ownerDb() : null;
async function provisionTenants(): Promise<void> {
  if (!owner) return;
  const done = await provisionPendingTenants(owner, (tenant, e) => log.error('dựng đơn vị lỗi', { tenant, err: e.message }));
  for (const tenant of done) {
    log.info('đã dựng đơn vị', { tenant });
    await registry.reloadAll(registryError);
    await runInTenant(tenant, async () => {
      await withTenant(writer, (t) => registerSpecs(t, loadAllSpecs()));
      await ensureRecordIndexes(writer);
      // Spider chép từ đơn vị khác ⇒ đẩy lên Crawlab ngay với tên riêng của đơn vị (không chờ lượt kiểm tra 10 phút).
      if (crawlab) await checkCrawlabHealth(writer, crawlab, crawlabSync);
    }).catch((e: Error) => log.error('khởi tạo adapter cho đơn vị mới lỗi', { tenant, err: e.message }));
  }
}
await provisionTenants().catch((e: Error) => log.error('dựng đơn vị lỗi', { err: e.message }));
log.info('worker khởi động', { tenants: await activeTenants(writer), concurrency: CRAWL_CONCURRENCY });

const crawlWorker = new Worker<CrawlJob>(
  CRAWL_QUEUE,
  // Việc cũ còn trong hàng đợi (trước nhiều đơn vị) không có tenant ⇒ Bkav.
  async (job) => runInTenant(job.data.tenant ?? DEFAULT_TENANT, async () => {
    const out = await crawlUserSource({ writer, secrets, baseUrls, sessions, connections }, job.data);
    log.info('crawl xong', { job: job.id, tenant: job.data.tenant ?? DEFAULT_TENANT, user: job.data.userId, ...out });
    return out;
  }),
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
        await forEachTenant(writer, (tenant) => withTenant(writer, async (t) => {
          await t.any('SELECT ensure_raw_partitions(2)');
          const dropped = await t.one('SELECT drop_expired_raw_partitions(90) AS n', [], (r: { n: number }) => r.n);
          log.info('bảo trì phân vùng raw_records', { tenant, dropped });
        }), tenantError('bảo trì phân vùng'));
        return;
      case 'session_refresh':
        await forEachTenant(writer, async (tenant) => {
          const r = await refreshExpiringSessions(writer, connections, Number(process.env.SESSION_REFRESH_WITHIN_MINUTES ?? 60));
          if (r.checked) log.info('làm mới phiên', { tenant, ...r });
        }, tenantError('làm mới phiên'));
        return;
      case 'session_keepalive':
        // T10: giữ phiên các kết nối do Vala Desktop / tiện ích cấp (máy chủ không tự đăng nhập lại được).
        await forEachTenant(writer, async (tenant) => {
          const r = await keepAliveSessions(writer, connections, Number(process.env.SESSION_KEEPALIVE_MINUTES ?? 10));
          if (r.checked) log.info('giữ phiên', { tenant, ...r });
        }, tenantError('giữ phiên'));
        return;
      case 'due_subscriptions':
        // Bộ hẹn giờ lịch người dùng tự đặt: spider (qua Crawlab, --user) hoặc các bước lấy dữ liệu trong adapter.
        await forEachTenant(writer, async (tenant) => {
          const r = await runDueSchedules(writer, crawl, crawlab, new Date(), (msg, meta) => log.warn(msg, { tenant, ...meta }));
          if (r.due) log.info('lịch đến hạn', { tenant, ...r });
          // Lượt spider đã khởi chạy mà không gọi tới Vala ⇒ ghi lỗi kèm lý do từ Crawlab (Nhật ký chạy).
          if (crawlab) {
            const c = await checkSpiderLaunches(writer, crawlab);
            if (c.failed) log.warn('lượt spider không khởi chạy được', { tenant, ...c });
          }
        }, tenantError('lịch đến hạn'));
        await heartbeat(writer, 'worker', { pid: process.pid });
        return;
      case 'tenant_provision':
        await provisionTenants();
        return;
      case 'crawlab_health':
        // Crawlab còn liên lạc được không, spider nào mất file (vd sau khi khởi động lại) ⇒ đẩy lại mã từ CSDL.
        await forEachTenant(writer, async (tenant) => {
          const info = await checkCrawlabHealth(writer, crawlab, crawlabSync);
          if ((info.restored as string[] | undefined)?.length || info.reachable === false) log.warn('kiểm tra Crawlab', { tenant, ...info });
        }, tenantError('kiểm tra Crawlab'));
        return;
      default:
        log.warn('job bảo trì không rõ', { name: job.name });
    }
  },
  { connection, concurrency: 1 },
);

await maintenance.upsertJobScheduler('raw_partitions', { pattern: '0 2 * * *', tz: 'Asia/Ho_Chi_Minh' }, { name: 'raw_partitions' });
await maintenance.upsertJobScheduler('session_refresh', { every: 10 * 60_000 }, { name: 'session_refresh' });
await maintenance.upsertJobScheduler('due_subscriptions', { every: 60_000 }, { name: 'due_subscriptions' });
await maintenance.upsertJobScheduler('session_keepalive', { every: 5 * 60_000 }, { name: 'session_keepalive' });
await maintenance.upsertJobScheduler('tenant_provision', { every: 60_000 }, { name: 'tenant_provision' });
await maintenance.upsertJobScheduler('crawlab_health', { every: 10 * 60_000 }, { name: 'crawlab_health' });
// Ngay khi khởi động: báo còn sống + kiểm tra Crawlab (máy chủ vừa khởi động lại thì Crawlab hay mất mã spider).
await heartbeat(writer, 'worker', { pid: process.pid, started: true }).catch(() => {});
void forEachTenant(writer, async (tenant) => {
  log.info('kiểm tra Crawlab lúc khởi động', { tenant, ...await checkCrawlabHealth(writer, crawlab, crawlabSync) });
}, tenantError('kiểm tra Crawlab'));

async function shutdown(signal: string) {
  log.info('dừng worker', { signal });
  await Promise.allSettled([crawlWorker.close(), maintenanceWorker.close(), maintenance.close(), crawl.close()]);
  await closeAllPools();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

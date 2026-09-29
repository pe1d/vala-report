import { Queue } from 'bullmq';
import {
  CRAWL_QUEUE, ConnectionSessions, CrawlabClient, SessionManager, SourceRegistry, SsoClient, TENANT, crawlabConfigFromEnv, env, readerDb,
  redisConnection, secretStore, ssoConfigFromEnv, withTenant, writerDb, type CrawlJob,
} from '@vala/core';
import { buildApp } from './app.js';
import type { RateLimiter } from './deps.js';

const connection = redisConnection();
const queue = new Queue<CrawlJob>(CRAWL_QUEUE, { connection });
// Kiểu của queue.client là union Redis | Cluster; chỉ cần SET ... EX ... NX.
const redis = (await queue.client) as unknown as { set(...args: (string | number)[]): Promise<string | null> };

const limiter: RateLimiter = {
  async take(key, windowSeconds) {
    return (await redis.set(`vala:${key}`, '1', 'EX', windowSeconds, 'NX')) === 'OK';
  },
};

// Đăng nhập cổng: mật khẩu luôn bật; thêm 'sso' khi LOGIN_SSO=true.
const loginMethods: Array<'password' | 'sso'> = ['password', ...(process.env.LOGIN_SSO === 'true' ? ['sso' as const] : [])];

const port = Number(process.env.API_PORT ?? 3000);
const reader = readerDb();
const writer = writerDb();
const secrets = secretStore();
const sso = new SsoClient(ssoConfigFromEnv());
// Dev: <NGUON>_BASE_URL (vd EGOV_BASE_URL, ETASK_BASE_URL) ghi đè base_url trong CSDL, trỏ vào hệ thống giả lập.
const baseUrls: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) {
  const m = /^([A-Z0-9_]+)_BASE_URL$/.exec(k);
  if (m && v) baseUrls[m[1]!.toLowerCase()] = v;
}
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
const sessions = new SessionManager({ secrets, sso, tenant: TENANT, baseUrls, resolveBaseUrl });
// Cấu hình adapter nằm trong CSDL: nạp lúc khởi động, sau mỗi lần quản trị sửa, và mỗi phút (nhiều tiến trình).
const sources = new SourceRegistry(writer);
await sources.reload();
sources.install();
setInterval(() => { sources.reload().catch(() => { /* giữ cấu hình cũ, thử lại lần sau */ }); }, 60_000).unref();
const connections = new ConnectionSessions({ secrets, tenant: TENANT, sourceInfo, sso: sessions, extraSpecs: sources.specs });
const crawlabCfg = crawlabConfigFromEnv();
const crawlab = crawlabCfg ? new CrawlabClient(crawlabCfg) : undefined;
const app = await buildApp({
  reader,
  writer,
  secrets,
  sso,
  sessions,
  connections,
  sources,
  sourceInfo,
  crawlab,
  queue,
  limiter,
  config: {
    loginMethods,
    jwtSecret: env('AUTH_JWT_SECRET'),
    internalToken: env('INTERNAL_TOKEN'),
    publicWebUrl: env('PUBLIC_WEB_URL', 'http://localhost:5173'),
    publicApiUrl: env('PUBLIC_API_URL', env('PUBLIC_WEB_URL', 'http://localhost:5173')),
    tenant: TENANT,
    spiderApiUrl: process.env.SPIDER_API_URL ?? `http://localhost:${port}`,
    crawlabWebUrl: process.env.CRAWLAB_WEB_URL ?? crawlabCfg?.url,
  },
}, { logger: true });

await app.listen({ port, host: '0.0.0.0' });

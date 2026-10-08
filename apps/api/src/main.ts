import { Queue } from 'bullmq';
import {
  CRAWL_QUEUE, ConnectionSessions, CrawlabClient, SessionManager, SourceRegistries, SsoClient, crawlabConfigFromEnv, env, markSourceMfa, packageSigner, readerDb,
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


const port = Number(process.env.API_PORT ?? 3000);
const reader = readerDb();
const writer = writerDb();
const secrets = secretStore();
const sso = new SsoClient(ssoConfigFromEnv());
// Đăng nhập cổng: mật khẩu luôn bật; thêm 'sso' khi LOGIN_SSO=true VÀ cấu hình SSO đủ (thiếu client id/secret… ⇒ chỉ tắt
// nút SSO và ghi cảnh báo, API vẫn chạy — trước đây dừng luôn cả API lẫn worker).
const ssoOn = process.env.LOGIN_SSO === 'true';
if (ssoOn && !sso.cfg.ready) console.warn(`[sso] LOGIN_SSO=true nhưng cấu hình SSO chưa đủ — tạm tắt đăng nhập SSO: ${sso.cfg.problem}`);
const loginMethods: Array<'password' | 'sso'> = ['password', ...(ssoOn && sso.cfg.ready ? ['sso' as const] : [])];
// SSO_ISSUER ⇒ đọc endpoint từ .well-known ngay lúc khởi động (luồng uỷ quyền cần sẵn). Lỗi ⇒ thử lại khi có người đăng nhập.
if (sso.cfg.issuer) await sso.discover().catch((e) => console.warn(`[sso] chưa đọc được cấu hình từ ${sso.cfg.issuer}: ${(e as Error).message}`));
// Dev: <NGUON>_BASE_URL (vd EGOV_BASE_URL, ETASK_BASE_URL) ghi đè base_url trong CSDL, trỏ vào hệ thống giả lập.
const baseUrls: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) {
  const m = /^([A-Z0-9_]+)_BASE_URL$/.exec(k);
  if (m && v) baseUrls[m[1]!.toLowerCase()] = v;
}
const resolveBaseUrl = (source: string) => withTenant(writer, (t) => t.one(
  'SELECT base_url FROM source_systems WHERE code = $1', [source], (r: { base_url: string }) => r.base_url));
// Dev: EGOV_BASE_URL và SSO_ORIGIN trỏ vào mock ⇒ ghi đè để không bao giờ chạm hệ thống thật.
// Đọc an toàn: giá trị rỗng / chỉ có dấu cách / sai định dạng trong .env.prod không được làm dừng API.
const devLoginHost = (() => { const o = (process.env.SSO_ORIGIN ?? '').trim(); try { return o ? new URL(o).host : undefined; } catch { return undefined; } })();
const sourceInfo = (source: string) => withTenant(writer, (t) => t.one(
  'SELECT base_url, login_hosts FROM source_systems WHERE code = $1', [source],
  (r: { base_url: string; login_hosts: string[] }) => ({
    baseUrl: baseUrls[source] ?? r.base_url,
    loginHosts: [...r.login_hosts, ...(devLoginHost ? [devLoginHost] : [])],
  })));
const sessions = new SessionManager({ secrets, sso, baseUrls, resolveBaseUrl });
// Cấu hình adapter nằm trong CSDL (schema của từng đơn vị): nạp lúc khởi động, sau mỗi lần quản trị sửa, và mỗi phút
// (nhiều tiến trình). Mỗi request dùng danh mục của đơn vị mình (SourceRegistries theo ngữ cảnh).
const sources = new SourceRegistries(writer);
await sources.reloadAll((t, e) => console.warn(`[nguồn] nạp danh mục của đơn vị ${t} lỗi: ${e.message}`));
sources.install();
setInterval(() => { sources.reloadAll().catch(() => { /* giữ cấu hình cũ, thử lại lần sau */ }); }, 60_000).unref();
// Tự đăng nhập gặp OTP ⇒ đánh dấu hệ thống có xác thực 2 lớp, bỏ cách kết nối bằng mật khẩu.
const connections = new ConnectionSessions({ secrets, sourceInfo, sso: sessions, extraSpecs: sources.specs,
  onOtpRequired: async (s) => { await markSourceMfa(writer, s); await sources.reload(); } });
const crawlabCfg = crawlabConfigFromEnv();
const crawlab = crawlabCfg ? new CrawlabClient(crawlabCfg) : undefined;
// Khoá ký gói kịch bản Vala Desktop: SCRIPT_SIGNING_KEY, không có / sai thì suy ra từ AUTH_JWT_SECRET (không dừng API).
const signer = (() => {
  try { return packageSigner({ signingKey: process.env.SCRIPT_SIGNING_KEY, jwtSecret: env('AUTH_JWT_SECRET') }); } catch (e) {
    console.warn(`[desktop] SCRIPT_SIGNING_KEY không dùng được (${(e as Error).message}) — dùng khoá suy ra từ AUTH_JWT_SECRET`);
    return packageSigner({ jwtSecret: env('AUTH_JWT_SECRET') });
  }
})();
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
  packageSigner: signer,
  config: {
    loginMethods,
    jwtSecret: env('AUTH_JWT_SECRET'),
    internalToken: env('INTERNAL_TOKEN'),
    publicWebUrl: env('PUBLIC_WEB_URL', 'http://localhost:5173'),
    publicApiUrl: env('PUBLIC_API_URL', env('PUBLIC_WEB_URL', 'http://localhost:5173')),
    spiderApiUrl: process.env.SPIDER_API_URL ?? `http://localhost:${port}`,
    crawlabWebUrl: process.env.CRAWLAB_WEB_URL ?? crawlabCfg?.url,
    runnerUrl: process.env.RUNNER_URL?.trim().replace(/\/+$/, '') || undefined,
  },
}, { logger: true });

await app.listen({ port, host: '0.0.0.0' });

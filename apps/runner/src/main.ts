/**
 * Runner — chạy gói kịch bản Vala Desktop TRÊN MÁY CHỦ (phương án 2, biên bản họp 10/2026): Chromium không giao diện mở
 * trang hệ thống nguồn bằng phiên (cookie) của người dùng, chèn đúng bộ hàm `vala` và gói như Vala Desktop
 * (@vala/core injectionCode), rồi chạy thao tác có tên ⇒ kịch bản viết một lần chạy được ở máy người dùng lẫn máy chủ.
 *
 * Chỉ API gọi (Bearer INTERNAL_TOKEN), không mở ra ngoài. Không lưu gì: mỗi lượt một ngữ cảnh trình duyệt riêng, đóng ngay
 * khi xong; không ghi cookie hay kết quả ra log.
 *
 *   POST /run  { url, cookies: [{ name, value, domain?, url? }], packages: [{ code, version, matches, css, script }],
 *                action?: string, args?: object, timeout_ms? }
 *     ⇒ { ok: true, result, url } | { ok: true, actions: [...] } (không có action) | { ok: false, error, url? }
 *
 * Biến môi trường: RUNNER_PORT (3100), INTERNAL_TOKEN, CHROMIUM_PATH (không có ⇒ trình duyệt của playwright),
 * SOURCE_HTTP_PROXY (proxy ra hệ thống nguồn, như worker), RUNNER_CONCURRENCY (3).
 */
import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { chromium, type Browser, type BrowserContext, type Frame } from 'playwright-core';
import { env, injectionCode, type SignedFields } from '@vala/core';

const PORT = Number(process.env.RUNNER_PORT ?? 3100);
const TOKEN = Buffer.from(env('INTERNAL_TOKEN'));
const MAX = Math.max(1, Number(process.env.RUNNER_CONCURRENCY ?? 3));
const BODY_MAX = 4 * 1024 * 1024;

interface RunRequest {
  url: string;
  cookies: Array<{ name: string; value: string; domain?: string; url?: string; path?: string }>;
  packages: SignedFields[];
  action?: string;
  args?: Record<string, unknown>;
  timeout_ms?: number;
}
type RunResult = { ok: true; result?: unknown; actions?: unknown[]; url: string } | { ok: false; error: string; url?: string };

let browser: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  browser ??= chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    proxy: process.env.SOURCE_HTTP_PROXY ? { server: process.env.SOURCE_HTTP_PROXY } : undefined,
  }).then((b) => { b.on('disconnected', () => { browser = null; }); return b; }, (e) => { browser = null; throw e; });
  return browser;
}

/** UA như Chrome thường — bỏ "HeadlessChrome" (vài hệ thống chặn trình duyệt tự động theo UA). */
async function userAgent(b: Browser) {
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${b.version().split('.')[0]}.0.0.0 Safari/537.36`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function inject(frame: Frame, packages: SignedFields[]) {
  const code = injectionCode(packages, frame.url());
  if (!code) return;
  await frame.evaluate(code).catch(() => { /* khung vừa chuyển trang — lần tải sau chèn lại */ });
}

/** Khung đầu tiên có thao tác `name` (hoặc có bất kỳ thao tác nào khi name rỗng). */
async function frameWith(ctx: BrowserContext, name: string | undefined, deadline: number): Promise<Frame | null> {
  while (Date.now() < deadline) {
    for (const page of ctx.pages()) {
      for (const f of page.frames()) {
        const has = await f.evaluate((n) => {
          const v = (window as unknown as { __vala?: { has(n: string): boolean; list(): unknown[] } }).__vala;
          return !!v && (n ? v.has(n) : v.list().length > 0);
        }, name ?? '').catch(() => false);
        if (has) return f;
      }
    }
    await wait(300);
  }
  return null;
}

async function run(req: RunRequest): Promise<RunResult> {
  const timeout = Math.min(Math.max(req.timeout_ms ?? 60_000, 5_000), 180_000);
  const deadline = Date.now() + timeout;
  const b = await getBrowser();
  const ctx = await b.newContext({ userAgent: await userAgent(b), locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1366, height: 900 } });
  try {
    if (req.cookies.length) {
      await ctx.addCookies(req.cookies.map((c) => (c.domain
        ? { name: c.name, value: c.value, domain: c.domain, path: c.path ?? '/' }
        : { name: c.name, value: c.value, url: c.url ?? req.url })));
    }
    const page = await ctx.newPage();
    // Mỗi khung (cả iframe) tải xong DOM ⇒ chèn gói khớp địa chỉ — như Vala Desktop.
    page.on('domcontentloaded', () => { for (const f of page.frames()) void inject(f, req.packages); });
    page.on('frameattached', (f) => { void f.waitForLoadState('domcontentloaded').then(() => inject(f, req.packages), () => {}); });
    await page.goto(req.url, { waitUntil: 'domcontentloaded', timeout });
    for (const f of page.frames()) await inject(f, req.packages);

    const f = await frameWith(ctx, req.action, deadline);
    if (!f) {
      return { ok: false, url: page.url(), error: req.action
        ? `Trang không có thao tác ${req.action} (chưa đăng nhập — phiên hết hạn — hoặc mẫu địa chỉ của gói không khớp ${new URL(page.url()).host})`
        : `Trang chưa có thao tác nào (chưa đăng nhập, hoặc mẫu địa chỉ của gói không khớp ${new URL(page.url()).host})` };
    }
    if (!req.action) {
      // Gộp thao tác của mọi khung (trang chính và iframe).
      const actions: unknown[] = [];
      for (const fr of page.frames()) {
        actions.push(...await fr.evaluate(() => (window as unknown as { __vala?: { list(): unknown[] } }).__vala?.list() ?? []).catch(() => []));
      }
      return { ok: true, url: page.url(), actions };
    }
    const left = Math.max(1_000, deadline - Date.now());
    type Out = { ok: boolean; result?: unknown; error?: string };
    const r: Out = await Promise.race<Out>([
      f.evaluate(([n, a]) => (window as unknown as { __vala: { run(n: string, a: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> } }).__vala.run(n as string, a), [req.action, req.args ?? {}] as const),
      wait(left).then((): Out => ({ ok: false, error: `Quá ${Math.round(timeout / 1000)} giây chưa xong` })),
    ]);
    return r.ok ? { ok: true, result: r.result, url: page.url() } : { ok: false, error: r.error ?? 'Lỗi', url: page.url() };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// --- HTTP ---------------------------------------------------------------------------------------------
let active = 0;

function authorized(req: IncomingMessage) {
  const got = Buffer.from(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '');
  return got.length === TOKEN.length && timingSafeEqual(got, TOKEN);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function validRequest(x: unknown): x is RunRequest {
  const r = x as RunRequest;
  return !!r && typeof r.url === 'string' && /^https?:\/\//.test(r.url) && Array.isArray(r.cookies) && Array.isArray(r.packages)
    && r.packages.every((p) => typeof p?.code === 'string' && Array.isArray(p.matches) && typeof p.script === 'string' && typeof p.css === 'string')
    && (r.action === undefined || (typeof r.action === 'string' && /^[a-z][a-z0-9_]{0,62}$/.test(r.action)));
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { ok: true, active });
  if (req.method !== 'POST' || req.url !== '/run') return send(res, 404, { ok: false, error: 'not_found' });
  if (!authorized(req)) return send(res, 401, { ok: false, error: 'unauthenticated' });
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => { size += c.length; if (size > BODY_MAX) req.destroy(); else chunks.push(c); });
  req.on('end', () => {
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { ok: false, error: 'bad_json' }); }
    if (!validRequest(body)) return send(res, 422, { ok: false, error: 'invalid_request' });
    if (active >= MAX) return send(res, 429, { ok: false, error: 'busy' });
    active++;
    run(body).then((r) => send(res, 200, r), (e: Error) => send(res, 200, { ok: false, error: `Runner lỗi: ${e.message.split('\n')[0]}` }))
      .finally(() => { active--; });
  });
}).listen(PORT, '0.0.0.0', () => console.log(`[runner] nghe ở :${PORT}, tối đa ${MAX} lượt cùng lúc`));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => { void (browser ?? Promise.resolve(null)).then((b) => b?.close()).finally(() => process.exit(0)); });
}

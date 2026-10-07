/**
 * Giao diện cổng Vala Reporting chạy từ BẢN TRONG MÁY (cách lai): backend vẫn ở máy chủ, còn giao diện (HTML/JS/CSS do
 * Vite build) được tải về máy rồi phục vụ tại vala-ui://portal/<đường dẫn con>/… Máy chủ deploy web mới ⇒ ui-manifest.json
 * đổi version ⇒ ứng dụng tự tải bản mới — sửa giao diện không cần phát hành Vala Desktop.
 *
 *   - Danh sách tệp: <máy chủ>/ui-manifest.json (apps/web/scripts/ui-manifest.mjs) — mỗi tệp có SHA-256, tải xong kiểm
 *     đúng mã băm mới dùng; tải lỗi giữa chừng thì giữ bản cũ.
 *   - vala-ui://portal/<base>/api/… và /desktop/<tệp> chuyển thẳng lên máy chủ (cùng origin với giao diện ⇒ không cần CORS);
 *     tệp có trong gói ⇒ trả từ đĩa; còn lại ⇒ index.html (định tuyến phía trình duyệt).
 *   - Chưa có gói (lần đầu, máy chủ chưa có ui-manifest.json, bản dev chạy Vite) ⇒ tab Báo cáo nạp thẳng từ máy chủ như cũ.
 *   - Giữ cả bản trước trong phiên chạy: trang đang mở bản cũ vẫn tải được các chunk của bản cũ.
 */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, net, protocol } from 'electron';
import { getSettings } from './settings';

export const UI_SCHEME = 'vala-ui';
export const UI_ORIGIN = `${UI_SCHEME}://portal`;

interface Manifest { format: number; version: string; base: string; files: Record<string, { sha256: string; size: number }> }
interface Installed { serverUrl: string; manifest: Manifest }

/** 'updated' — vừa có bản giao diện mới trong máy. */
export const uiEvents = new EventEmitter();

const root = () => join(app.getPath('userData'), 'ui');
let current: Installed | null = null;
let previous: Installed | null = null;

/** Phải gọi TRƯỚC app ready: vala-ui là scheme chuẩn, an toàn (localStorage, fetch, Service Worker… như https). */
export function registerUiScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: UI_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);
}

/** Đường dẫn con của cổng theo máy chủ đang cấu hình, luôn có '/' hai đầu (vd /vala-report/). */
const basePath = (serverUrl: string) => { try { return `${new URL(serverUrl).pathname.replace(/\/+$/, '')}/`; } catch { return '/'; } };

function load(): Installed | null {
  if (current) return current;
  try {
    const inst = JSON.parse(readFileSync(join(root(), 'current.json'), 'utf8')) as Installed;
    const s = getSettings();
    // Gói của máy chủ khác / đường dẫn con khác ⇒ không dùng.
    if (inst.serverUrl !== s.serverUrl || inst.manifest.base !== basePath(s.serverUrl)) return null;
    if (!existsSync(join(root(), inst.manifest.version, 'index.html'))) return null;
    current = inst;
  } catch { current = null; }
  return current;
}

/** Có gói giao diện trong máy ⇒ địa chỉ tab Báo cáo (vala-ui://portal/<base>), không thì null (nạp thẳng từ máy chủ). */
export function uiPortalUrl(): string | null {
  const c = load();
  return c ? `${UI_ORIGIN}${c.manifest.base}` : null;
}

/** Địa chỉ trên máy chủ (trang của cổng, không phải /api) ⇒ địa chỉ tương ứng trong gói; null nếu không áp dụng. */
export function mapToUi(url: string): string | null {
  const c = load();
  if (!c) return null;
  try {
    const u = new URL(url);
    const server = new URL(c.serverUrl);
    if (u.origin !== server.origin) return null;
    const base = c.manifest.base;
    if (!(`${u.pathname}/`.startsWith(base) || u.pathname.startsWith(base))) return null;
    if (proxied(u.pathname.slice(base.length))) return null;
    return `${UI_ORIGIN}${u.pathname}${u.search}${u.hash}`;
  } catch { return null; }
}

/**
 * Trang này có phải cổng Vala Reporting không — bản trong máy (vala-ui://portal) hoặc nạp từ máy chủ (đúng origin).
 * So scheme + host: URL của Node trả origin 'null' cho scheme không chuẩn như vala-ui.
 */
export function isPortalUrl(url: string, serverUrl = getSettings().serverUrl): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === `${UI_SCHEME}:`) return u.host === 'portal';
    return !!serverUrl && u.origin === new URL(serverUrl).origin;
  } catch { return false; }
}

/** Đường dẫn (bỏ phần đường dẫn con) đi thẳng lên máy chủ: API, healthz, tệp cài Vala Desktop. */
const proxied = (rel: string) => rel.startsWith('api/') || rel === 'healthz' || /^desktop\/[^/]+/.test(rel);

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8', map: 'application/json',
};
const typeOf = (p: string) => TYPES[p.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';

function fileResponse(inst: Installed, rel: string): Response | null {
  if (!inst.manifest.files[rel]) return null;
  try {
    const body = readFileSync(join(root(), inst.manifest.version, rel));
    // Tệp trong assets/ có mã băm trong tên ⇒ cache lâu; index.html thì không (như nginx của máy chủ).
    const cache = rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    return new Response(body, { headers: { 'content-type': typeOf(rel), 'cache-control': cache, 'x-content-type-options': 'nosniff' } });
  } catch { return null; }
}

/** Xử lý vala-ui://portal/… (cài một lần sau app ready). */
export function installUiProtocol(): void {
  protocol.handle(UI_SCHEME, async (req) => {
    const c = load();
    const u = new URL(req.url);
    if (!c || u.host !== 'portal') return new Response('Not found', { status: 404 });
    const base = c.manifest.base;
    const path = decodeURIComponent(u.pathname);
    if (!(`${path}/` === base || path.startsWith(base))) return new Response('Not found', { status: 404 });
    const rel = path.slice(base.length);
    if (proxied(rel)) return proxy(req, `${new URL(c.serverUrl).origin}${u.pathname}${u.search}`);
    return fileResponse(c, rel) ?? (previous && fileResponse(previous, rel)) ?? fileResponse(c, 'index.html') ?? new Response('Not found', { status: 404 });
  });
}

/**
 * Chuyển tiếp lên máy chủ (mạng của Chromium: đúng proxy hệ thống). Lời gọi fetch/XHR của cổng: net.fetch. Điều hướng trang
 * (vd nút SSO /api/v1/auth/sso/login ⇒ 302 sang trang đăng nhập SSO): Chromium không theo chuyển hướng từ scheme riêng
 * sang http(s), còn net.fetch không dừng được ở chuyển hướng ⇒ dùng net.request bắt 302 rồi trả trang nhỏ tự chuyển.
 */
async function proxy(req: Request, target: string): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete('origin');      // máy chủ thấy như lời gọi cùng origin của trang web
  headers.delete('host');
  try {
    if (req.method === 'GET' && isNavigation(req)) return await navigate(target, headers);
    const init: RequestInit & { duplex?: 'half' } = {
      method: req.method, headers,
      ...(req.method === 'HEAD' ? {} : { body: req.body, duplex: 'half' }),
    };
    return await net.fetch(target, init);
  } catch (e) {
    return new Response(JSON.stringify({ type: 'network', title: 'Không kết nối được máy chủ Vala', status: 502, detail: (e as Error).message }),
      { status: 502, headers: { 'content-type': 'application/problem+json' } });
  }
}

/** GET điều hướng: không tự theo chuyển hướng — gặp 3xx thì trả trang tự chuyển (meta refresh) tới đích. */
function navigate(target: string, headers: Headers): Promise<Response> {
  return new Promise((resolve, reject) => {
    const r = net.request({ method: 'GET', url: target, redirect: 'manual' });
    headers.forEach((v, k) => { try { r.setHeader(k, v); } catch { /* header Chromium tự đặt */ } });
    r.on('redirect', (_status, _method, url) => {
      r.abort();
      resolve(new Response(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escapeAttr(url)}">`,
        { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }));
    });
    r.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) h.set(k, Array.isArray(v) ? v.join(', ') : String(v));
        h.delete('content-encoding');   // net.request đã giải nén
        h.delete('content-length');
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: h }));
      });
      res.on('error', reject);
    });
    r.on('error', reject);
    r.end();
  });
}

/** Yêu cầu điều hướng trang (không phải fetch/XHR của trang): Chromium gửi sec-fetch-mode / sec-fetch-dest khi có. */
function isNavigation(req: Request): boolean {
  const mode = req.headers.get('sec-fetch-mode');
  if (mode) return mode === 'navigate';
  return req.method === 'GET' && (req.headers.get('accept') ?? '').includes('text/html');
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Kiểm máy chủ có bản giao diện mới không, có thì tải về (kiểm SHA-256 từng tệp). Trả true nếu vừa cài bản mới. */
export async function refreshUi(): Promise<boolean> {
  const s = getSettings();
  if (!s.serverUrl) return false;
  let m: Manifest;
  try {
    const res = await net.fetch(`${s.serverUrl}/ui-manifest.json`, { cache: 'no-store' });
    if (!res.ok || !/json/.test(res.headers.get('content-type') ?? '')) return false;   // máy chủ cũ / Vite dev: chưa có
    m = (await res.json()) as Manifest;
  } catch { return false; }
  if (m?.format !== 1 || !/^[0-9a-f]{8,64}$/.test(m.version ?? '') || !m.files?.['index.html']) return false;
  if (m.base !== basePath(s.serverUrl)) { console.warn(`[ui] bỏ qua gói giao diện: base ${m.base} khác ${basePath(s.serverUrl)}`); return false; }
  const cur = load();
  if (cur && cur.manifest.version === m.version && cur.serverUrl === s.serverUrl) return false;

  const dir = join(root(), m.version);
  const tmp = `${dir}.part`;
  try {
    rmSync(tmp, { recursive: true, force: true });
    const entries = Object.entries(m.files);
    // Tên tệp phải là đường dẫn tương đối sạch (không .., không tuyệt đối) — không ghi ra ngoài thư mục gói.
    if (entries.some(([p]) => !/^[\w.@-]+(\/[\w.@-]+)*$/.test(p) || p.split('/').includes('..'))) throw new Error('tên tệp không hợp lệ');
    let i = 0;
    const worker = async () => {
      while (i < entries.length) {
        const [p, f] = entries[i++]!;
        const res = await net.fetch(`${s.serverUrl}/${p}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (createHash('sha256').update(buf).digest('hex') !== f.sha256) throw new Error(`${p}: sai mã băm (máy chủ đang deploy dở?)`);
        const out = join(tmp, p);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, buf);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, entries.length) }, worker));
    rmSync(dir, { recursive: true, force: true });
    renameSync(tmp, dir);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    console.warn(`[ui] chưa tải được giao diện bản ${m.version}: ${(e as Error).message}`);
    return false;
  }
  const next: Installed = { serverUrl: s.serverUrl, manifest: m };
  writeFileSync(join(root(), 'current.json'), JSON.stringify(next));
  if (cur) previous = cur;
  current = next;
  // Giữ bản hiện tại + bản trước; xoá các bản cũ hơn.
  for (const d of readdirSync(root())) {
    if (d === 'current.json' || d === next.manifest.version || d === previous?.manifest.version) continue;
    rmSync(join(root(), d), { recursive: true, force: true });
  }
  uiEvents.emit('updated');
  return true;
}

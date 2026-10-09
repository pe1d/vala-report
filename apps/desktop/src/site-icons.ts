/**
 * Biểu tượng PHẦN MỀM của ứng dụng trên thanh bên / khung Tất cả ứng dụng (người dùng 09/10/2026: "lấy theo icon của phần
 * mềm, không lấy theo icon của trang"). Trang như Vala tự vẽ favicon lúc chạy (số thông báo, logo đơn vị) ⇒ không dùng
 * favicon động của trang, mà lấy biểu tượng cố định của trang chủ ứng dụng: `<gốc>/favicon.ico`, không có thì
 * `<link rel=icon>` trong HTML trang chủ. Lấy một lần mỗi gốc, lưu dạng data: URL (máy, userData/site-icons.json).
 */
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, session } from 'electron';

export const siteIconEvents = new EventEmitter();
const file = () => join(app.getPath('userData'), 'site-icons.json');
/** Gốc ⇒ data: URL; '' = đã thử, không có. Lấy lại sau 7 ngày. */
let cache: Record<string, { icon: string; luc: number }> | null = null;
const load = () => {
  if (!cache) { try { cache = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}; } catch { cache = {}; } }
  return cache!;
};
const save = () => { try { writeFileSync(file(), JSON.stringify(load())); } catch { /* giữ trong phiên */ } };
const pending = new Set<string>();
const MAX_AGE = 7 * 86400_000;
const MAX_BYTES = 256 * 1024;

const originOf = (url: string) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } };

async function fetchImage(url: string): Promise<string | null> {
  const res = await session.defaultSession.fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return null;
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!/^image\//.test(type)) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  return `data:${type};base64,${buf.toString('base64')}`;
}

/** <link rel="icon" | "shortcut icon" | "apple-touch-icon"> trong HTML trang chủ (trang dựng sẵn — không chạy JS). */
async function iconFromHtml(pageUrl: string): Promise<string | null> {
  const res = await session.defaultSession.fetch(pageUrl, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok || !/html/i.test(res.headers.get('content-type') ?? '')) return null;
  const html = (await res.text()).slice(0, 200_000);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*\b(icon|apple-touch-icon)\b/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? /href\s*=\s*([^\s>]+)/i.exec(tag)?.[1];
    if (!href || /^data:/i.test(href)) continue;
    try { const img = await fetchImage(new URL(href, res.url || pageUrl).toString()); if (img) return img; } catch { /* địa chỉ hỏng */ }
  }
  return null;
}

async function resolve(origin: string, pageUrl: string): Promise<void> {
  const icon = (await fetchImage(`${origin}/favicon.ico`)) ?? (await iconFromHtml(pageUrl)) ?? '';
  load()[origin] = { icon, luc: Date.now() };
  save();
  if (icon) siteIconEvents.emit('changed');
}

/** Biểu tượng phần mềm của một ứng dụng theo địa chỉ trang chủ; chưa có ⇒ null và lấy ngầm (xong báo 'changed'). */
export function siteIcon(pageUrl: string): string | null {
  const origin = originOf(pageUrl);
  if (!origin) return null;
  const hit = load()[origin];
  if ((!hit || Date.now() - hit.luc > MAX_AGE) && !pending.has(origin)) {
    pending.add(origin);
    void resolve(origin, pageUrl).finally(() => pending.delete(origin));
  }
  return hit?.icon || null;
}

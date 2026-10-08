/**
 * Gói kịch bản do quản trị viết trên cổng (Quản trị → Kịch bản Desktop): CSS + JS chạy trong trang hệ thống nguồn — sửa
 * lỗi giao diện khi nhúng và khai báo thao tác có tên. Đổi kịch bản không cần phát hành bản app mới.
 *
 * - Tải GET /ext/desktop-packages (ETag ⇒ không đổi thì 304) lúc đăng nhập, khi mở app và cùng nhịp đồng bộ phiên.
 * - Chỉ dùng gói ĐÚNG CHỮ KÝ Ed25519 của máy chủ (khoá không nằm trong CSDL máy chủ) — gói sai chữ ký bị bỏ, ghi log.
 * - Lưu bản đã kiểm vào userData/desktop-packages.json để mở app khi mất mạng vẫn có; đọc lại vẫn kiểm chữ ký.
 * - Chèn vào mọi khung (cả iframe) có địa chỉ khớp mẫu, mỗi lần khung tải trang (dom-ready): bộ hàm `vala`
 *   (dist/vala-runtime.js, dùng chung với máy chủ) rồi từng gói. Kịch bản ghép thẳng vào mã chèn — không dùng eval nên
 *   trang có CSP chặn eval vẫn chạy.
 */
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, net, type WebContents, type WebFrameMain } from 'electron';
import { getSettings } from './settings';
import { reportError } from './error-report';
import { matchesUrl, verifyPackage, type SignedFields } from './scripts-verify';

export interface DesktopPackage extends SignedFields {
  ten: string;
  source_system: string | null;
  signature: string;
}

interface Store { serverUrl: string; publicKey: string; etag: string | null; packages: DesktopPackage[] }

const file = () => join(app.getPath('userData'), 'desktop-packages.json');
let store: Store | null = null;
let runtime: string | null = null;

/** 'changed' — danh sách gói vừa đổi (bản mới / thêm / bỏ). */
export const packageEvents = new EventEmitter();

const runtimeSource = () => (runtime ??= readFileSync(join(__dirname, 'vala-runtime.js'), 'utf8'));

/** Chỉ giữ gói đúng chữ ký. */
function verified(publicKey: string, list: DesktopPackage[]): DesktopPackage[] {
  return list.filter((p) => {
    const ok = typeof p?.signature === 'string' && verifyPackage(p, p.signature, publicKey);
    if (!ok) console.warn(`[kich-ban] bỏ gói ${p?.code} v${p?.version}: sai chữ ký`);
    return ok;
  });
}

function load(): Store | null {
  if (store) return store;
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Store;
    if (s.serverUrl !== getSettings().serverUrl) return null;   // gói của máy chủ khác
    store = { ...s, packages: verified(s.publicKey, s.packages ?? []) };
  } catch { store = null; }
  return store;
}

function save(s: Store | null) {
  store = s;
  try { writeFileSync(file(), JSON.stringify(s ?? {}, null, 1)); } catch { /* đĩa đầy / không ghi được: dùng bản trong bộ nhớ */ }
}

export const packages = (): DesktopPackage[] => (getSettings().deviceToken ? load()?.packages ?? [] : []);

/** Tải danh sách gói mới nhất. Lỗi mạng ⇒ giữ bản đang có. Trả true nếu có thay đổi. */
export async function refreshPackages(): Promise<boolean> {
  const st = getSettings();
  if (!st.deviceToken || !st.serverUrl) return false;
  const cur = load();
  const headers: Record<string, string> = { Authorization: `Bearer ${st.deviceToken}`, 'Accept-Language': st.lang };
  if (cur?.etag) headers['If-None-Match'] = cur.etag;
  let res: Response;
  try { res = await net.fetch(`${st.serverUrl}/api/v1/ext/desktop-packages`, { headers }); } catch { return false; }
  if (res.status === 304 || !res.ok) return false;
  const body = (await res.json().catch(() => null)) as { public_key?: string; packages?: DesktopPackage[] } | null;
  if (!body?.public_key || !Array.isArray(body.packages)) return false;
  const next: Store = { serverUrl: st.serverUrl, publicKey: body.public_key, etag: res.headers.get('etag'), packages: verified(body.public_key, body.packages) };
  const sig = (s: Store | null) => (s?.packages ?? []).map((p) => `${p.code}@${p.version}`).join(',');
  const changed = sig(next) !== sig(cur);
  save(next);
  if (changed) packageEvents.emit('changed');
  return changed;
}

/** Đăng xuất ⇒ quên gói (gói thuộc máy chủ / đơn vị của người vừa đăng xuất). */
export function forgetPackages() { save(null); packageEvents.emit('changed'); }

/** Mã chèn cho một khung: bộ hàm `vala` (cài một lần) + các gói khớp địa chỉ. Kết quả: { mã gói: { ok, error? } }. */
export function injectionFor(url: string, list = packages()): string | null {
  const match = list.filter((p) => matchesUrl(p.matches, url));
  if (!match.length) return null;
  const loads = match.map((p) =>
    `r[${JSON.stringify(p.code)}] = await window.__vala.load(${JSON.stringify({ code: p.code, version: p.version, css: p.css })}, async function (vala) {\n${p.script}\n});`);
  return `${runtimeSource()}\n;(async () => { const r = {};\n${loads.join('\n')}\nreturn r; })()`;
}

async function injectFrame(frame: WebFrameMain | null | undefined) {
  if (!frame || !/^https?:/.test(frame.url)) return;
  const code = injectionFor(frame.url);
  if (!code) return;
  try {
    const r = (await frame.executeJavaScript(code)) as Record<string, { ok: boolean; error?: string }>;
    for (const [k, v] of Object.entries(r ?? {})) {
      if (v.ok) continue;
      console.warn(`[kich-ban] ${k} lỗi trên ${new URL(frame.url).host}: ${v.error}`);
      reportError('kich_ban', `Gói ${k} lỗi khi nạp: ${v.error ?? ''}`, undefined, { goi: k, trang: new URL(frame.url).origin });
    }
  } catch (e) {
    console.warn(`[kich-ban] không chèn được vào ${frame.url}: ${(e as Error).message}`);
  }
}

/** Gắn vào một tab: mỗi khung (trang chính và iframe) tải xong DOM ⇒ chèn gói khớp địa chỉ. */
export function attachPackages(wc: WebContents) {
  wc.on('dom-ready', () => void injectFrame(wc.mainFrame));
  wc.on('frame-created', (_e, { frame }) => {
    if (!frame || frame === wc.mainFrame || !frame.parent) return;
    frame.on('dom-ready', () => void injectFrame(frame));
  });
}

/** Gói vừa đổi ⇒ nạp ngay vào các khung đang mở (gói cùng bản đã nạp thì bỏ qua; bản mới nạp đè CSS / thao tác). */
export function injectAll(wc: WebContents) {
  if (wc.isDestroyed()) return;
  for (const f of wc.mainFrame.framesInSubtree) void injectFrame(f);
}

export interface ActionResult { ok: boolean; result?: unknown; error?: string }

/** Thao tác đang có trong một tab (mọi khung). */
export async function listActions(wc: WebContents): Promise<Array<{ name: string; pkg: string | null; mo_ta: string }>> {
  const out: Array<{ name: string; pkg: string | null; mo_ta: string }> = [];
  for (const f of wc.mainFrame.framesInSubtree) {
    try { out.push(...((await f.executeJavaScript('window.__vala ? window.__vala.list() : []')) as typeof out)); } catch { /* khung đang tải */ }
  }
  return out;
}

/** Chạy thao tác có tên trong khung đầu tiên khai báo nó. Không ném lỗi — luôn trả { ok, result | error }. */
export async function runAction(wc: WebContents, name: string, args: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<ActionResult> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) return { ok: false, error: `Tên thao tác không hợp lệ: ${name}` };
  for (const f of wc.mainFrame.framesInSubtree) {
    let has = false;
    try { has = (await f.executeJavaScript(`!!(window.__vala && window.__vala.has(${JSON.stringify(name)}))`)) as boolean; } catch { continue; }
    if (!has) continue;
    // Trả CHUỖI JSON rồi giải ở đây: giá trị executeJavaScript trả thẳng đi qua kiểu từ điển của Electron ⇒ khoá object bị
    // xếp lại theo bảng chữ cái (mất thứ tự cột của bảng kết quả).
    const run = (f.executeJavaScript(`window.__vala.run(${JSON.stringify(name)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r))`) as Promise<string>)
      .then((txt) => JSON.parse(txt) as ActionResult);
    const timeout = new Promise<ActionResult>((r) => setTimeout(() => r({ ok: false, error: `Quá ${timeoutMs / 1000} giây chưa xong` }), timeoutMs));
    try { return await Promise.race([run, timeout]); } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  return { ok: false, error: `Trang đang mở không có thao tác ${name}` };
}

/**
 * Danh mục ứng dụng của đơn vị (quản trị đơn vị khai trên cổng — GET /ext/apps) + bố cục riêng của người dùng (ứng dụng
 * ghim, thứ tự — PUT /ext/layout). Lưu đệm ở userData/apps.json để mất mạng vẫn mở đúng thanh ứng dụng.
 * Khoá tab: trang web `web:<mã>`, hệ thống nguồn `src:<mã nguồn>` (giữ phiên, kịch bản), Báo cáo `portal`.
 */
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { api } from './api';
import { getSettings } from './settings';
import { catalogPinned } from './tabs-model';

export interface CatalogApp {
  ma: string;
  ten: string;
  kind: 'web' | 'source' | 'reports';
  /** Trang web: địa chỉ; hệ thống nguồn: base_url của hệ thống; Báo cáo: null (cổng của máy chủ). */
  url: string | null;
  source_system: string | null;
  icon: string | null;
  pinned_default: boolean;
  is_default: boolean;
}
interface Catalog { apps: CatalogApp[]; layout: { pinned: string[] | null }; /** Host SSO của đơn vị (sso-session.ts). */ sso_hosts?: string[]; /** Quản trị đơn vị ⇒ mục "Quản trị đơn vị". */ is_admin?: boolean;
  /** Quản trị hệ thống ⇒ trang Quản trị có thêm mục Đơn vị. */ is_system_admin?: boolean;
  /** Đổi mật khẩu: có mật khẩu Vala ⇒ form trong app; chỉ SSO ⇒ trang đổi mật khẩu của SSO (nếu đơn vị khai). */
  account?: { has_password: boolean; sso_password_url: string | null };
  /** Tên miền đơn vị khai "mở trong Vala Desktop" (link mở cửa sổ mới tới đó ⇒ tab trong app). */
  open_inside?: string[] }

/** Tên miền mở trong app: đơn vị khai + tên miền của các ứng dụng trong danh mục (trang web, hệ thống nguồn). */
export function insideDomains(c: Catalog = catalog()): string[] {
  const hosts = c.apps.map((a) => { try { return a.url ? new URL(a.url).hostname.toLowerCase() : ''; } catch { return ''; } }).filter(Boolean);
  return [...new Set([...(c.open_inside ?? []), ...hosts])];
}

/** 'changed' — danh mục / bố cục đổi ⇒ vẽ lại thanh ứng dụng. */
export const appsEvents = new EventEmitter();

const file = () => join(app.getPath('userData'), 'apps.json');
let cache: Catalog | null = null;

export function catalog(): Catalog {
  if (!cache) {
    try { cache = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Catalog) : null; } catch { cache = null; }
    if (!cache?.apps) cache = { apps: [], layout: { pinned: null } };
  }
  return cache;
}

function save(c: Catalog): void {
  const changed = JSON.stringify(c) !== JSON.stringify(cache);
  cache = c;
  try { writeFileSync(file(), JSON.stringify(c), { encoding: 'utf8', mode: 0o600 }); } catch { /* chỉ giữ trong phiên */ }
  if (changed) appsEvents.emit('changed');
}

export const appKey = (a: Pick<CatalogApp, 'kind' | 'ma' | 'source_system'>): string =>
  a.kind === 'source' ? `src:${a.source_system}` : a.kind === 'reports' ? 'portal' : `web:${a.ma}`;

/** Mở được trang Quản trị: quản trị đơn vị hoặc quản trị hệ thống. */
export const canAdmin = (): boolean => !!(catalog().is_admin || catalog().is_system_admin);

export const appByKey = (key: string): CatalogApp | undefined => catalog().apps.find((a) => appKey(a) === key);

/** Hỏi máy chủ danh mục mới nhất (đăng nhập, định kỳ, mở khung ⊞). Lỗi mạng ⇒ giữ bản đã lưu. */
export async function refreshApps(): Promise<void> {
  if (!getSettings().deviceToken) return;
  try {
    save(await api<Catalog>('GET', '/ext/apps'));
  } catch { /* mất mạng / máy chủ cũ chưa có danh mục: giữ bản đã lưu */ }
}

/**
 * Khoá các ứng dụng ghim trên thanh dọc, đúng thứ tự: bố cục của người dùng (bỏ mục không còn trong danh mục); chưa có ⇒
 * các mục "ghim sẵn" của đơn vị. Ứng dụng mặc định luôn đứng đầu (nếu được ghim).
 */
export function pinnedKeys(c: Catalog = catalog()): string[] {
  const byMa = new Map(c.apps.map((a) => [a.ma, a]));
  return catalogPinned(c.apps, c.layout.pinned).map((m) => appKey(byMa.get(m)!));
}

/** Ghim / bỏ ghim một ứng dụng: lưu bố cục trên máy chủ (đổi luôn bản đệm để thanh dọc vẽ ngay). */
export async function setAppPinned(key: string, on: boolean): Promise<void> {
  const c = catalog();
  const a = appByKey(key);
  if (!a) return;
  const cur = pinnedKeys(c).map((k) => appByKey(k)!.ma).filter((m) => m !== a.ma);
  const pinned = on ? [...cur, a.ma] : cur;
  save({ ...c, layout: { pinned } });
  try { await api('PUT', '/ext/layout', { pinned }); } catch { /* lần làm mới sau sẽ lấy lại bố cục trên máy chủ */ }
}

/** Kéo thả đổi thứ tự ứng dụng ghim (khoá tab, đã kiểm đúng các mục đang ghim): lưu bố cục như ghim / bỏ ghim. */
export async function setPinnedOrder(keys: readonly string[]): Promise<void> {
  const pinned = keys.map((k) => appByKey(k)?.ma).filter((m): m is string => !!m);
  save({ ...catalog(), layout: { pinned } });
  try { await api('PUT', '/ext/layout', { pinned }); } catch { /* lần làm mới sau sẽ lấy lại bố cục trên máy chủ */ }
}

/** Đăng xuất ⇒ quên danh mục của đơn vị. */
export function clearApps(): void {
  cache = { apps: [], layout: { pinned: null } };
  try { rmSync(file(), { force: true }); } catch { /* bỏ qua */ }
  appsEvents.emit('changed');
}

/**
 * Dùng chung cho service worker và các trang của tiện ích.
 *
 * Nguyên tắc an toàn:
 *   - Chỉ đọc cookie của tên miền máy chủ Vala liệt kê VÀ người dùng đã cho phép trong hộp thoại Chrome.
 *   - Chỉ gửi đúng các cookie phiên adapter khai (cookie_names), không gửi cookie nào khác.
 *   - Giá trị cookie không bao giờ lưu trong storage của tiện ích, không log; chỉ lưu SHA-256 để biết đã gửi chưa.
 *   - Token thiết bị chỉ gửi tới máy chủ Vala đã cấu hình.
 */

export interface Settings {
  serverUrl: string;
  token: string | null;
  user: { ho_ten: string; email: string } | null;
}

export interface Source {
  code: string;
  ten: string;
  origin: string;
  login_url: string;
  cookie_names: string[];
  /** Nhóm cookie phiên: mỗi nhóm là các tên thay thế nhau, có một trong số đó là đủ (vd [bkavAuthen1, bkavAuthen]). */
  cookie_groups?: string[][];
  /**
   * Cookie định danh (vd meId/companyId của eTask) chỉ đọc được khi đang mở trang nguồn. Thiếu thì vẫn gửi phiên:
   * máy chủ dùng lại giá trị lần gửi trước của chính người này.
   */
  stable_cookies?: string[];
  /** Mẫu quyền host cần xin (origin + tên miền cha của cookie phiên, vd https://*.bkav.com/*). */
  permission_origins?: string[];
  /** Tên miền tìm cookie phiên (vd bkav.com cho eGov thật, localhost cho dev). */
  cookie_domain?: string;
  state: 'active' | 'pending' | 'expired' | 'failed' | 'revoked' | 'chua_cau_hinh';
  auth_method: 'password' | 'cookie' | 'sso' | 'extension' | null;
  last_push_at: string | null;
  last_error: string | null;
  /** Kết nối đang dùng mật khẩu/SSO còn tốt: hệ thống tự lo, tiện ích không gửi. */
  managed: boolean;
  /** Người dùng đã đồng ý cho Vala dùng tài khoản này (máy chủ cũ không trả trường này ⇒ coi như đã đồng ý). */
  consented?: boolean;
}

/** Kết quả lần đồng bộ gần nhất của một nguồn — hiện trong popup. */
export interface SyncStatus {
  at: string;
  result: 'sent' | 'unchanged' | 'not_logged_in' | 'no_permission' | 'need_consent' | 'managed' | 'rejected' | 'error';
  message: string;
}

/** Máy chủ mặc định: bản dev → localhost, bản phát hành → máy chủ thật (đặt lúc build, xem vite.config.ts). */
export const DEFAULT_SERVER = (import.meta.env.VITE_VALA_URL as string | undefined) ?? '';

export async function getSettings(): Promise<Settings> {
  const s = await chrome.storage.local.get(['serverUrl', 'token', 'user']);
  return { serverUrl: (s.serverUrl as string) || DEFAULT_SERVER, token: (s.token as string) ?? null, user: (s.user as Settings['user']) ?? null };
}

export const setSettings = (p: Partial<Settings>) => chrome.storage.local.set(p);

export async function getStatuses(): Promise<Record<string, SyncStatus>> {
  return ((await chrome.storage.local.get('statuses')).statuses as Record<string, SyncStatus>) ?? {};
}

export async function getCachedSources(): Promise<Source[]> {
  return ((await chrome.storage.local.get('sources')).sources as Source[]) ?? [];
}

/**
 * Chuẩn hoá địa chỉ máy chủ: chỉ https, trừ localhost cho dev. Giữ đường dẫn con nếu cổng chạy dưới một thư mục
 * (vd https://qtttboard-demo.demozone.vn:5443/vala-report), bỏ '/' cuối, đuôi /api, query/hash. Trả null nếu không hợp lệ.
 */
export function normalizeServer(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    // Người dùng dán cả địa chỉ API (…/vala-report/api hoặc …/api/v1) ⇒ bỏ đuôi đó, tiện ích tự thêm /api/v1.
    return `${u.origin}${u.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/, '')}`;
  } catch {
    return null;
  }
}

/** Mẫu quyền host cho một origin (giữ cổng — Chrome khớp đúng cổng khi có). */
export const originPattern = (origin: string) => `${origin}/*`;

/**
 * Quyền cần để đọc cookie phiên của một nguồn. Chrome chỉ trả cookie khi tiện ích có quyền trên
 * TÊN MIỀN CỦA COOKIE (vd .bkav.com), không phải tên miền trang — nên có thể cần thêm tên miền cha.
 */
export const sourcePermissions = (src: { origin: string; permission_origins?: string[] }) =>
  src.permission_origins?.length ? src.permission_origins : [originPattern(src.origin)];

export class ApiError extends Error {
  constructor(readonly status: number, readonly type: string, title: string, readonly detail?: string) {
    super(title);
  }
}

export async function api<T>(method: string, path: string, body?: unknown, s?: Settings): Promise<T> {
  const st = s ?? (await getSettings());
  if (!st.serverUrl) throw new ApiError(0, 'no_server', 'Chưa cấu hình địa chỉ máy chủ Vala');
  const headers: Record<string, string> = {};
  if (st.token) headers.Authorization = `Bearer ${st.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${st.serverUrl}/api/v1${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit',
    });
  } catch {
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ Vala');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && st.token) await setSettings({ token: null, user: null });
    throw new ApiError(res.status, json.type ?? 'internal', json.title ?? `Lỗi HTTP ${res.status}`, json.detail);
  }
  return json as T;
}

/** Tên thiết bị gợi ý, để người dùng nhận ra trình duyệt trong danh sách ở cổng. */
export function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : 'Trình duyệt';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'máy tính';
  return `${browser} trên ${os}`;
}

const sessionDomain = (src: Source) => (src.cookie_domain ?? new URL(src.origin).hostname).replace(/^\./, '');
/** Khoá phân biệt một cookie (kể cả theo phân vùng), để gộp không trùng. */
const cookieKey = (c: chrome.cookies.Cookie) =>
  `${c.name}|${c.domain}|${c.path}|${(c as { partitionKey?: { topLevelSite?: string } }).partitionKey?.topLevelSite ?? ''}`;

/**
 * MỌI cookie trong cây tên miền phiên, GỘP cả cookie phân vùng (CHIPS). Cookie phân vùng KHÔNG nằm trong
 * getAll thường, và `partitionKey: {}` (rỗng) chỉ trả cookie KHÔNG phân vùng — nên phải hỏi riêng theo
 * top-level site (site đăng ký `bkav.com` và cả chính host) mới lấy được, vd companyId/meId của eTask.
 */
export async function allDomainCookies(src: Source): Promise<chrome.cookies.Cookie[]> {
  const u = new URL(src.origin);
  const domain = sessionDomain(src);
  const sites = [...new Set([`${u.protocol}//${domain}`, `${u.protocol}//${u.hostname}`])];
  const queries: Promise<chrome.cookies.Cookie[]>[] = [chrome.cookies.getAll({ domain })];
  for (const topLevelSite of sites)
    queries.push(chrome.cookies
      .getAll({ domain, partitionKey: { topLevelSite } } as chrome.cookies.GetAllDetails)
      .catch(() => [] as chrome.cookies.Cookie[]));
  const seen = new Set<string>();
  return (await Promise.all(queries)).flat().filter((c) => { const k = cookieKey(c); if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * Cookie phiên áp dụng cho trang nguồn: giữ cookie nằm trong cây tên miền phiên đã khai (cookie_domain) —
 * chính domain, một tên miền con của nó, hoặc cookie tên miền cha (.bkav.com). Trùng tên thì ưu tiên Path ngắn.
 */
export async function applicableCookies(src: Source): Promise<chrome.cookies.Cookie[]> {
  const domain = sessionDomain(src);
  return (await allDomainCookies(src))
    .filter((c) => { const d = c.domain.replace(/^\./, ''); return d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`); })
    .sort((a, b) => a.path.length - b.path.length);
}

export const cookieGroupsOf = (src: Source): string[][] => src.cookie_groups?.length ? src.cookie_groups : src.cookie_names.map((n) => [n]);

/** Nhóm chưa có cookie nào, dạng "bkavAuthen1|bkavAuthen". */
export const missingGroups = (src: Source, have: Set<string> | Record<string, string>) => {
  const has = (n: string) => (have instanceof Set ? have.has(n) : n in have);
  return cookieGroupsOf(src).filter((g) => !g.some(has)).map((g) => g.join('|'));
};

export type Message =
  | { type: 'sync'; force?: boolean }
  | { type: 'refresh-sources' }
  /** Bắt đầu kết nối một nguồn: có phiên sẵn thì gửi luôn, chưa thì mở trang đăng nhập rồi quay về. */
  | { type: 'connect'; code: string }
  | { type: 'bridge-hello' };

/** Báo cho trang (cổng Vala / trang cài đặt) khi kết nối xong. */
export type ConnectEvent =
  | { type: 'connected'; code: string; ten: string }
  | { type: 'connect-failed'; code: string; ten: string; message: string };

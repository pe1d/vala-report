/**
 * Cấu hình cục bộ của Vala Desktop — thay chrome.storage.local của tiện ích: một file JSON trong thư mục dữ liệu
 * của ứng dụng (Windows: %APPDATA%/Vala Desktop/settings.json).
 * Token thiết bị (vxt_…) chỉ dùng được ở /ext/*, người dùng thu hồi được trên cổng — cùng mức nhạy cảm như tiện ích.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { normLang, type Lang } from './i18n';

export type ThemeMode = 'light' | 'dark' | 'system';
export const normTheme = (v: unknown): ThemeMode => (v === 'light' || v === 'dark' ? v : 'system');

export interface Settings {
  /** Trang hiển thị trong cửa sổ chính — mỗi đơn vị một trang riêng (vd https://vala.bkav.com/). */
  homeUrl: string;
  /** Máy chủ Vala Reporting: đăng nhập thiết bị, gửi phiên các hệ thống nguồn (/api/v1/ext/*). */
  serverUrl: string;
  deviceToken: string | null;
  user: { ho_ten: string; email: string } | null;
  lang: Lang;
  /** Sáng / tối / theo hệ điều hành — chung cho thanh dọc, Cài đặt và cổng (prefs.ts). */
  theme: ThemeMode;
  /** Chạy cùng hệ điều hành (ẩn ở khay). Không đặt ⇒ bật. Chỉ có tác dụng ở bản cài. */
  autostart?: boolean;
  /** Tự cài bản mới (tải ngầm, cài lúc rảnh / khi thoát rồi mở lại). Không đặt ⇒ bật (người dùng chốt 08/10/2026). */
  autoUpdate?: boolean;
  /** Tự lưu mật khẩu khi người dùng đăng nhập một hệ thống / SSO (autofill.ts), không hỏi. Không đặt ⇒ bật (09/10/2026). */
  autoSavePasswords?: boolean;
  /** Tự gửi báo lỗi / crash về máy chủ Vala (error-report.ts). Không đặt ⇒ bật. */
  errorReport?: boolean;
  /** Đã ghim / đã hướng dẫn ghim vào thanh tác vụ (dock) lần đầu mở bản cài (pin.ts) — chỉ làm một lần. */
  pinOffered?: boolean;
  /** Chỉ bản dev: trang chính tự đặt để thử (đè trang quản trị đặt trên cổng). Bản cho người dùng bỏ qua trường này. */
  devHomeUrl?: string | null;
  /** Phiên bản lần chạy trước — khác bản đang chạy ⇒ vừa cập nhật, báo "có gì mới" một lần (updater.ts). */
  lastVersion?: string;
  /** Thanh ứng dụng dọc đang thu gọn (chỉ biểu tượng). */
  sidebarCollapsed?: boolean;
  /** Ứng dụng ghim trên thanh dọc (khoá tab: home, portal, src:<mã>); null/không có ⇒ ghim tất cả (tabs-model pinnedApps). */
  pinnedApps?: string[] | null;
  /** Lần đăng nhập gần nhất (bước 1 đã tra xong) ⇒ màn hình đăng nhập mở thẳng bước 2 (login-page.ts). */
  lastLogin?: LoginTarget | null;
  /** Tài khoản đăng nhập gần nhất (`<mã đơn vị>:<email>`): người khác đăng nhập ⇒ xoá dữ liệu của người trước (account.ts). */
  lastAccount?: string | null;
}

/** Kết quả bước 1 của đăng nhập (POST /auth/lookup). */
export interface LoginTarget {
  login: string;
  tenant: { ma: string; ten: string };
  account: string;
  methods: Array<'password' | 'sso'>;
  fill: string;
  selectors: { username?: string; password?: string } | null;
  /** Host SSO của đơn vị (sso-session.ts — giữ phiên SSO, mật khẩu SSO dùng chung). */
  sso_hosts?: string[];
}

/**
 * Giá trị mặc định theo nơi triển khai, đặt lúc build (VALA_HOME_URL=… VALA_URL=… pnpm build, xem scripts/write-defaults.cjs).
 * Người dùng sửa được trong cửa sổ Cài đặt.
 */
const BUILT: { homeUrl?: string; serverUrl?: string; updateUrl?: string } = (() => { try { return require('./defaults.json'); } catch { return {}; } })();
export const DEFAULT_HOME = BUILT.homeUrl || 'https://vala.bkav.com/';
/** Đang chạy từ mã nguồn (bản dev). An toàn khi chạy test ngoài Electron (app không có). */
const isDevRun = () => { try { return !app.isPackaged; } catch { return false; } };
/** Bản dev mặc định trỏ stack dev (pnpm dev:up); đổi được bằng VALA_URL=… pnpm dev. */
export const DEFAULT_SERVER = BUILT.serverUrl || process.env.VALA_URL
  || (isDevRun() ? 'http://localhost:5173' : 'https://qtttboard-demo.demozone.vn:5443/vala-report');

/**
 * Kênh cập nhật Vala Desktop (thư mục chứa latest.yml + file cài): mặc định /desktop/ trên máy chủ Vala Reporting của
 * đơn vị — mỗi đơn vị phát hành bản của mình; đặt riêng lúc build bằng VALA_UPDATE_URL.
 */
export function updateFeedUrl(serverUrl: string, override = BUILT.updateUrl): string {
  const base = override || `${serverUrl || DEFAULT_SERVER}/desktop`;
  return base.endsWith('/') ? base : `${base}/`;
}

/** Chuẩn hoá trang chính: chỉ https (trừ localhost cho dev), giữ nguyên đường dẫn/query. Trả null nếu không hợp lệ. */
export function normalizeHome(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Chuẩn hoá địa chỉ máy chủ — cùng quy tắc với tiện ích (apps/extension/src/shared.ts normalizeServer): chỉ https,
 * trừ localhost cho dev; giữ đường dẫn con; bỏ '/' cuối và đuôi /api, /api/v1. Trả null nếu không hợp lệ.
 */
export function normalizeServer(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/, '')}`;
  } catch {
    return null;
  }
}

const file = () => join(app.getPath('userData'), 'settings.json');
// Máy chủ cấu hình sẵn theo bản build (người dùng không nhập): đăng nhập cổng ngay ở tab Báo cáo.
const DEFAULTS: Settings = { homeUrl: DEFAULT_HOME, serverUrl: DEFAULT_SERVER, deviceToken: null, user: null, lang: 'vi', theme: 'system' };

/**
 * Ghép settings.json với mặc định. Chuỗi rỗng coi như chưa đặt: file của bản cũ lưu serverUrl = '' (mặc định khi đó) —
 * giữ nguyên thì không có tab Báo cáo và nút "Đăng nhập" không làm gì.
 */
export function withDefaults(raw: Partial<Settings>): Settings {
  const s = { ...DEFAULTS, ...raw };
  return { ...s, serverUrl: s.serverUrl || DEFAULT_SERVER, homeUrl: s.homeUrl || DEFAULT_HOME, lang: normLang(s.lang), theme: normTheme(s.theme) };
}

export function getSettings(): Settings {
  let s: Settings;
  try {
    s = existsSync(file()) ? withDefaults(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>) : { ...DEFAULTS };
  } catch {
    s = { ...DEFAULTS };
  }
  return devServerOverride(s);
}

/**
 * Bản dev: VALA_URL=… pnpm dev LUÔN chọn máy chủ (thắng địa chỉ đã lưu — trước đây bị bỏ qua khi settings.json đã có
 * serverUrl). Đổi sang máy chủ khác ⇒ lưu lại và quên token thiết bị của máy chủ cũ (đăng nhập lại ở tab Báo cáo).
 */
function devServerOverride(s: Settings): Settings {
  const env = isDevRun() && process.env.VALA_URL ? normalizeServer(process.env.VALA_URL) : null;
  if (!env || env === s.serverUrl) return s;
  const next = { ...s, serverUrl: env, deviceToken: null, user: null };
  try { writeFileSync(file(), JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 }); } catch { /* chỉ dùng trong phiên */ }
  return next;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  writeFileSync(file(), JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  return next;
}

export const getLang = (): Lang => getSettings().lang;

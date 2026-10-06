/**
 * Cấu hình cục bộ của Vala Desktop — thay chrome.storage.local của tiện ích: một file JSON trong thư mục dữ liệu
 * của ứng dụng (Windows: %APPDATA%/Vala Desktop/settings.json).
 * Token thiết bị (vxt_…) chỉ dùng được ở /ext/*, người dùng thu hồi được trên cổng — cùng mức nhạy cảm như tiện ích.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { normLang, type Lang } from './i18n';

export interface Settings {
  /** Trang hiển thị trong cửa sổ chính — mỗi đơn vị một trang riêng (vd https://vala.bkav.com/). */
  homeUrl: string;
  /** Máy chủ Vala Reporting: đăng nhập thiết bị, gửi phiên các hệ thống nguồn (/api/v1/ext/*). */
  serverUrl: string;
  deviceToken: string | null;
  user: { ho_ten: string; email: string } | null;
  lang: Lang;
  /** Chỉ bản dev: trang chính tự đặt để thử (đè trang quản trị đặt trên cổng). Bản cho người dùng bỏ qua trường này. */
  devHomeUrl?: string | null;
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
const DEFAULTS: Settings = { homeUrl: DEFAULT_HOME, serverUrl: DEFAULT_SERVER, deviceToken: null, user: null, lang: 'vi' };

/**
 * Ghép settings.json với mặc định. Chuỗi rỗng coi như chưa đặt: file của bản cũ lưu serverUrl = '' (mặc định khi đó) —
 * giữ nguyên thì không có tab Báo cáo và nút "Đăng nhập" không làm gì.
 */
export function withDefaults(raw: Partial<Settings>): Settings {
  const s = { ...DEFAULTS, ...raw };
  return { ...s, serverUrl: s.serverUrl || DEFAULT_SERVER, homeUrl: s.homeUrl || DEFAULT_HOME, lang: normLang(s.lang) };
}

export function getSettings(): Settings {
  try {
    if (!existsSync(file())) return { ...DEFAULTS };
    return withDefaults(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  writeFileSync(file(), JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  return next;
}

export const getLang = (): Lang => getSettings().lang;

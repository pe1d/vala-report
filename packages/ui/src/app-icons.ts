/**
 * Biểu tượng ứng dụng CHUẨN (yêu cầu "Chuẩn hoá & cấu hình ứng dụng", 09/10/2026): ô vuông bo góc nền màu + biểu tượng
 * trắng nét Lucide (bản kế thừa Feather). Dùng chung: máy chủ dựng sẵn ảnh cho Vala Desktop (GET /ext/apps), trang Quản trị
 * xem trước + ô chọn biểu tượng. Không phụ thuộc React / DOM / Node.
 *
 * Lưu trong desktop_apps.icon: `lucide:<tên>` (bộ có sẵn) — hoặc ảnh riêng (http(s) / data:image, như trước); màu ở
 * desktop_apps.mau (khoá trong APP_COLORS). Chưa chọn ⇒ biểu tượng mặc định theo loại, màu tự gán theo mã ứng dụng.
 */
import { ICONS, ICON_GROUPS } from './app-icons-data';

export { ICONS, ICON_GROUPS };

/** Bảng màu ô biểu tượng (Tailwind 600 — đủ tương phản với chữ / nét trắng). */
export const APP_COLORS = {
  xanh_duong: '#2563eb', xanh_troi: '#0284c7', xanh_ngoc: '#0d9488', xanh_la: '#16a34a', vang: '#ca8a04', cam: '#ea580c',
  do: '#dc2626', hong: '#db2777', tim: '#7c3aed', cham: '#4f46e5', xam: '#475569',
} as const;
export type AppColor = keyof typeof APP_COLORS;
export const COLOR_KEYS = Object.keys(APP_COLORS) as AppColor[];

export const ICON_PREFIX = 'lucide:';
export type AppKind = 'web' | 'source' | 'reports';
/** Chưa chọn biểu tượng ⇒ theo loại: trang web ⇒ quả địa cầu, hệ thống nguồn ⇒ cơ sở dữ liệu, Báo cáo ⇒ biểu đồ. */
export const DEFAULT_ICON: Record<AppKind, string> = { web: 'globe', source: 'database', reports: 'chart-column' };

export const isColor = (v: unknown): v is AppColor => typeof v === 'string' && v in APP_COLORS;
/** `lucide:<tên>` có trong bộ ⇒ tên; không ⇒ null. */
export const libraryIconName = (v: unknown): string | null =>
  typeof v === 'string' && v.startsWith(ICON_PREFIX) && ICONS[v.slice(ICON_PREFIX.length)] ? v.slice(ICON_PREFIX.length) : null;

/** Màu tự gán theo mã ứng dụng (ổn định — cùng mã luôn cùng màu; bỏ màu xám). */
export function defaultColor(ma: string): AppColor {
  let h = 0;
  for (const ch of ma) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const keys = COLOR_KEYS.filter((k) => k !== 'xam');
  return keys[h % keys.length]!;
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** SVG ô biểu tượng 48×48: nền màu bo góc, biểu tượng trắng 24×24 ở giữa. */
export function appTileSvg(name: string, color: AppColor): string {
  const icon = ICONS[name] ?? ICONS.globe!;
  const inner = icon.n.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="${APP_COLORS[color]}"/>`
    + `<g transform="translate(12 12)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
}

export const appTileDataUrl = (name: string, color: AppColor): string => `data:image/svg+xml,${encodeURIComponent(appTileSvg(name, color))}`;

/**
 * Ảnh biểu tượng cuối cùng của một ứng dụng: ảnh riêng (quản trị tải lên / địa chỉ ảnh) ⇒ giữ nguyên; `lucide:<tên>` ⇒ ô
 * chuẩn; chưa chọn ⇒ ô chuẩn biểu tượng mặc định theo loại.
 */
export function resolveAppIcon(a: { ma: string; kind: AppKind; icon: string | null; mau?: string | null }): string {
  if (a.icon && /^(https?:|data:image\/)/.test(a.icon)) return a.icon;
  const color = isColor(a.mau) ? a.mau : defaultColor(a.ma);
  return appTileDataUrl(libraryIconName(a.icon) ?? DEFAULT_ICON[a.kind] ?? 'globe', color);
}

/**
 * Nhận diện của đơn vị triển khai (Quản trị → Cấu hình chung): tên ứng dụng, tên đơn vị, dòng mô tả, logo, màu chủ
 * đạo, tên hiển thị của SSO. Lấy từ GET /branding (công khai — trang đăng nhập cũng cần), áp ngay vào tiêu đề tab,
 * favicon và bảng màu (biến CSS --brand-*, xem tailwind.config.js). Lưu lại trong localStorage để lần mở sau
 * index.html áp màu/tiêu đề ngay từ đầu, không bị nháy màu mặc định.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Branding {
  ten_ung_dung: string; ten_don_vi: string | null; mo_ta: string | null; logo: string | null; mau_chu_dao: string; ten_sso: string;
}
export const DEFAULT_BRANDING: Branding = {
  ten_ung_dung: 'Vala Reporting', ten_don_vi: null, mo_ta: null, logo: null, mau_chu_dao: '#1d4ed8', ten_sso: 'SSO',
};
const CACHE = 'vala.branding';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
/** Pha với trắng (số dương) / đen (số âm) để ra các sắc độ — màu đã chọn đúng bằng sắc 700 (màu nút chính). */
const MIX: Record<(typeof SHADES)[number], number> = {
  50: 0.94, 100: 0.87, 200: 0.75, 300: 0.58, 400: 0.4, 500: 0.24, 600: 0.11, 700: 0, 800: -0.16, 900: -0.3, 950: -0.52,
};
const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Biến CSS --brand-* (kênh RGB) cho một màu chủ đạo. Màu mặc định ⇒ rỗng (dùng sẵn trong index.css). */
export function brandVars(hex: string): Record<string, string> {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || hex.toLowerCase() === DEFAULT_BRANDING.mau_chu_dao) return {};
  const rgb = hexRgb(hex);
  return Object.fromEntries(SHADES.map((s) => {
    const m = MIX[s];
    const c = rgb.map((v) => Math.round(m >= 0 ? v + (255 - v) * m : v * (1 + m)));
    return [`--brand-${s}`, c.join(' ')];
  }));
}

/** Favicon: logo của đơn vị, không có thì ô vuông màu chủ đạo với chữ cái đầu của tên ứng dụng. */
function faviconOf(b: Branding): string {
  if (b.logo) return b.logo;
  const ch = (b.ten_ung_dung.trim()[0] ?? 'V').toUpperCase().replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${b.mau_chu_dao}"/>`
    + `<text x="16" y="22" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">${ch}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function applyBranding(b: Branding) {
  const root = document.documentElement;
  for (const s of SHADES) root.style.removeProperty(`--brand-${s}`);
  const vars = brandVars(b.mau_chu_dao);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.title = b.ten_don_vi ? `${b.ten_ung_dung} · ${b.ten_don_vi}` : b.ten_ung_dung;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = faviconOf(b);
  // index.html đọc bản này trước khi React chạy (chỉ màu + tiêu đề; logo có thể lớn nên không đưa vào).
  try { localStorage.setItem(CACHE, JSON.stringify({ vars, title: document.title, b: { ...b, logo: null } })); } catch { /* bỏ qua */ }
}

function cached(): Branding {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as { b?: Branding } | null;
    return c?.b ? { ...DEFAULT_BRANDING, ...c.b } : DEFAULT_BRANDING;
  } catch { return DEFAULT_BRANDING; }
}

const Ctx = createContext<{ b: Branding; set: (b: Branding) => void }>({ b: DEFAULT_BRANDING, set: () => {} });

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [b, setB] = useState<Branding>(cached);
  const set = useCallback((n: Branding) => { setB(n); applyBranding(n); }, []);
  useEffect(() => {
    api.get<Branding>('/branding').then(set, () => applyBranding(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Ctx.Provider value={{ b, set }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx).b;
export const useSetBranding = () => useContext(Ctx).set;

/** Biểu tượng ứng dụng: logo của đơn vị, hoặc ô màu chủ đạo với chữ cái đầu tên ứng dụng. */
export function BrandMark({ b, size = 32 }: { b: Branding; size?: number }) {
  if (b.logo) return <img src={b.logo} alt="" width={size} height={size} className="shrink-0 rounded-lg object-contain" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-lg bg-blue-700 font-bold text-white shadow-sm"
      style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {(b.ten_ung_dung.trim()[0] ?? 'V').toUpperCase()}
    </span>
  );
}

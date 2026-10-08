/**
 * Giao diện Văn bản chung (docs/van-ban-chung.md) — phần thuần, không phụ thuộc Electron, có test: ứng dụng nào dùng giao
 * diện này (có gói kịch bản "phiên dịch" khai báo vb_danh_sach), thao tác được gọi, và làm sạch kết quả phiên dịch trả về
 * trước khi đưa lên trang (kiểu, độ dài) — phiên dịch chạy trong trang của phần mềm khác, dữ liệu là của bên ngoài.
 */
import { matchesUrl } from './scripts-verify';

/** Thao tác của hợp đồng — giao diện chỉ gọi được các tên này. */
export const VB_ACTIONS = ['vb_thong_tin', 'vb_danh_sach', 'vb_chi_tiet', 'vb_tep', 'vb_thuc_hien'] as const;
export type VbAction = (typeof VB_ACTIONS)[number];
export const isVbAction = (n: unknown): n is VbAction => typeof n === 'string' && (VB_ACTIONS as readonly string[]).includes(n);

/** Gói có phải phiên dịch văn bản: khai báo thao tác vb_danh_sach. */
export const declaresVanBan = (script: string): boolean => /vala\.action\(\s*['"`]vb_danh_sach['"`]/.test(script);

/** Ứng dụng (khoá tab + địa chỉ) có gói phiên dịch văn bản khớp địa chỉ ⇒ dùng giao diện Văn bản. */
export function vanBanKeys(apps: ReadonlyArray<{ key: string; url: string }>, pkgs: ReadonlyArray<{ matches: string[]; script: string }>): Set<string> {
  const vb = pkgs.filter((p) => declaresVanBan(p.script));
  return new Set(apps.filter((a) => a.url && vb.some((p) => matchesUrl(p.matches, a.url))).map((a) => a.key));
}

// ---- làm sạch kết quả ----
const MAX_TEXT = 20_000;
const str = (v: unknown, max = 500): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined;
  return s === undefined ? undefined : s.slice(0, max);
};
const arr = <T>(v: unknown, f: (x: unknown) => T | null, max = 500): T[] => (Array.isArray(v) ? v.slice(0, max).map(f).filter((x): x is T => x !== null) : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : undefined; };

export interface Hop { ma: string; ten: string; loai: 'den' | 'di' | 'khac' }
export interface ThongTin { he_thong: string; nguoi_dung?: string; hop: Hop[] }
export interface Dong {
  id: string; trich_yeu: string; so_ky_hieu?: string; co_quan?: string; ngay?: string; do_khan?: string;
  han_xu_ly?: string; trang_thai?: string; nguoi_xu_ly?: string; loai?: string; da_doc?: boolean;
}
export interface DanhSach { tong: number; so_trang: number; dong: Dong[] }
export interface Truong { ma: string; ten: string; loai: 'chu' | 'doan' | 'ngay' | 'chon'; bat_buoc?: boolean; nhieu?: boolean; lua_chon?: Array<{ ma: string; ten: string }> }
export interface ThaoTac { ma: string; ten: string; xac_nhan?: string; truong: Truong[] }
export interface ChiTiet extends Dong {
  noi_dung?: string; noi_nhan?: string; tep: Array<{ id: string; ten: string; kich_thuoc?: string }>;
  qua_trinh: Array<{ luc?: string; nguoi?: string; viec: string }>; thao_tac: ThaoTac[];
}

const MA = /^[A-Za-z0-9_.:|-]{1,200}$/;

export function cleanThongTin(v: unknown): ThongTin {
  const o = obj(v) ?? {};
  return {
    he_thong: str(o.he_thong, 100) ?? '',
    nguoi_dung: str(o.nguoi_dung, 200),
    hop: arr(o.hop, (h) => {
      const x = obj(h); const ma = str(x?.ma, 100); const ten = str(x?.ten, 100);
      if (!x || !ma || !MA.test(ma) || !ten) return null;
      return { ma, ten, loai: x.loai === 'den' || x.loai === 'di' ? x.loai : 'khac' };
    }, 50),
  };
}

function cleanDong(v: unknown): Dong | null {
  const o = obj(v);
  const id = str(o?.id, 200);
  if (!o || !id) return null;
  return {
    id, trich_yeu: str(o.trich_yeu, 2000) ?? '', so_ky_hieu: str(o.so_ky_hieu, 200), co_quan: str(o.co_quan, 300), ngay: str(o.ngay, 40),
    do_khan: str(o.do_khan, 100), han_xu_ly: str(o.han_xu_ly, 40), trang_thai: str(o.trang_thai, 200), nguoi_xu_ly: str(o.nguoi_xu_ly, 300),
    loai: str(o.loai, 200), da_doc: typeof o.da_doc === 'boolean' ? o.da_doc : undefined,
  };
}

export function cleanDanhSach(v: unknown): DanhSach {
  const o = obj(v) ?? {};
  const dong = arr(o.dong, cleanDong, 200);
  return { tong: Math.max(0, num(o.tong) ?? dong.length), so_trang: Math.max(1, num(o.so_trang) ?? 1), dong };
}

function cleanTruong(v: unknown): Truong | null {
  const o = obj(v); const ma = str(o?.ma, 100); const ten = str(o?.ten, 200);
  if (!o || !ma || !/^[a-z][a-z0-9_]{0,63}$/.test(ma) || !ten) return null;
  const loai = o.loai === 'doan' || o.loai === 'ngay' || o.loai === 'chon' ? o.loai : 'chu';
  return {
    ma, ten, loai, bat_buoc: o.bat_buoc === true || undefined, nhieu: o.nhieu === true || undefined,
    lua_chon: loai === 'chon' ? arr(o.lua_chon, (x) => { const c = obj(x); const m = str(c?.ma, 300); const t = str(c?.ten, 300); return m && t ? { ma: m, ten: t } : null; }, 2000) : undefined,
  };
}

export function cleanChiTiet(v: unknown): ChiTiet | null {
  const d = cleanDong(v);
  const o = obj(v);
  if (!d || !o) return null;
  return {
    ...d,
    noi_dung: str(o.noi_dung, MAX_TEXT), noi_nhan: str(o.noi_nhan, 2000),
    tep: arr(o.tep, (x) => { const t = obj(x); const id = str(t?.id, 200); const ten = str(t?.ten, 300); return id && ten ? { id, ten, kich_thuoc: str(t?.kich_thuoc, 40) } : null; }, 200),
    qua_trinh: arr(o.qua_trinh, (x) => { const q = obj(x); const viec = str(q?.viec, 2000); return q && viec ? { luc: str(q.luc, 40), nguoi: str(q.nguoi, 300), viec } : null; }, 500),
    thao_tac: arr(o.thao_tac, (x) => {
      const t = obj(x); const ma = str(t?.ma, 100); const ten = str(t?.ten, 100);
      if (!t || !ma || !/^[a-z][a-z0-9_]{0,63}$/.test(ma) || !ten) return null;
      return { ma, ten, xac_nhan: str(t.xac_nhan, 500), truong: arr(t.truong, cleanTruong, 30) };
    }, 20),
  };
}

/** Giá trị form gửi vb_thuc_hien: chỉ trường khai trong thao tác, chuỗi / mảng chuỗi; thiếu trường bắt buộc ⇒ tên trường. */
export function formValues(tt: ThaoTac, v: Record<string, unknown>): { ok: true; values: Record<string, string | string[]> } | { ok: false; missing: string } {
  const values: Record<string, string | string[]> = {};
  for (const f of tt.truong) {
    const raw = v[f.ma];
    const val = f.nhieu ? (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 300)) : [])
      : typeof raw === 'string' ? raw.trim().slice(0, MAX_TEXT) : '';
    if (f.bat_buoc && (Array.isArray(val) ? !val.length : !val)) return { ok: false, missing: f.ten };
    if (f.lua_chon) {
      const ok = new Set(f.lua_chon.map((c) => c.ma));
      if ((Array.isArray(val) ? val : val ? [val] : []).some((x) => !ok.has(x))) return { ok: false, missing: f.ten };
    }
    values[f.ma] = val;
  }
  return { ok: true, values };
}

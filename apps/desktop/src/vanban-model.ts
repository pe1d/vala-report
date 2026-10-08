/**
 * Giao diện Văn bản chung (docs/van-ban-chung.md) — phần thuần, không phụ thuộc Electron, có test: ứng dụng nào dùng giao
 * diện này (có gói kịch bản "phiên dịch" khai báo vb_danh_sach), thao tác được gọi, và làm sạch kết quả phiên dịch trả về
 * trước khi đưa lên trang (kiểu, độ dài) — phiên dịch chạy trong trang của phần mềm khác, dữ liệu là của bên ngoài.
 */
import { matchesUrl } from './scripts-verify';

/** Thao tác của hợp đồng — giao diện chỉ gọi được các tên này. */
export const VB_ACTIONS = ['vb_thong_tin', 'vb_dem', 'vb_danh_sach', 'vb_chi_tiet', 'vb_tep', 'vb_thuc_hien', 'vb_mau_tao', 'vb_tao'] as const;
export type VbAction = (typeof VB_ACTIONS)[number];
export const isVbAction = (n: unknown): n is VbAction => typeof n === 'string' && (VB_ACTIONS as readonly string[]).includes(n);

/** Gói có phải phiên dịch văn bản: khai báo thao tác vb_danh_sach. */
export const declaresVanBan = (script: string): boolean => /vala\.action\(\s*['"`]vb_danh_sach['"`]/.test(script);

/** Ứng dụng (khoá tab + địa chỉ) có gói phiên dịch văn bản khớp địa chỉ ⇒ dùng giao diện Văn bản. */
export function vanBanKeys(apps: ReadonlyArray<{ key: string; url: string }>, pkgs: ReadonlyArray<{ matches: string[]; script: string }>): Set<string> {
  const vb = pkgs.filter((p) => declaresVanBan(p.script));
  return new Set(apps.filter((a) => a.url && vb.some((p) => matchesUrl(p.matches, a.url))).map((a) => a.key));
}

/** Tên máy của các ứng dụng văn bản (giữ phiên đăng nhập qua lần mở app — sso-session.ts). */
export function vanBanHosts(apps: ReadonlyArray<{ key: string; url: string }>, pkgs: ReadonlyArray<{ matches: string[]; script: string }>): string[] {
  const keys = vanBanKeys(apps, pkgs);
  const hosts = apps.filter((a) => keys.has(a.key)).map((a) => { try { return new URL(a.url).hostname.toLowerCase(); } catch { return ''; } });
  return [...new Set(hosts.filter(Boolean))];
}

/** Cookie (tên miền của cookie, có thể có dấu chấm đầu) thuộc một trong các máy `hosts`. */
export function cookieForHosts(domain: string, hosts: readonly string[]): boolean {
  const d = domain.replace(/^\./, '').toLowerCase();
  return !!d && hosts.some((h) => h === d || (domain.startsWith('.') && h.endsWith(`.${d}`)));
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

/**
 * Một mục của menu (như menu của hệ thống gốc). Có `goc` ⇒ mục CHƯA phiên dịch: bấm vào mở đúng trang đó của hệ thống
 * (địa chỉ phải cùng hệ thống); không có ⇒ danh sách vẽ bằng giao diện Vala (vb_danh_sach với `hop` = `ma`), `loc` là
 * bộ lọc riêng của mục.
 */
export interface Hop { ma: string; ten: string; loai: 'den' | 'di' | 'khac'; goc?: string; loc?: Truong[] }
export interface Nhom { ten: string; muc: Hop[] }
/**
 * `menu`: nhóm ⇒ mục, đủ như hệ thống gốc; `tao`: loại văn bản tạo được — form lấy bằng vb_mau_tao, hoặc `goc` (chưa
 * phiên dịch form) ⇒ mở đúng form tạo của hệ thống.
 */
export interface LoaiTao { ma: string; ten: string; goc?: string }
export interface ThongTin { he_thong: string; nguoi_dung?: string; menu: Nhom[]; tao: LoaiTao[] }
/** Trường riêng của hệ thống (không có trong hợp đồng) — hiện nguyên tên + giá trị để không mất thông tin nào. */
export interface Them { ten: string; gia_tri: string }
export interface Dong {
  id: string; trich_yeu: string; so_ky_hieu?: string; co_quan?: string; ngay?: string; do_khan?: string;
  han_xu_ly?: string; trang_thai?: string; nguoi_xu_ly?: string; loai?: string; da_doc?: boolean; them: Them[];
}
export interface DanhSach { tong: number; so_trang: number; dong: Dong[] }
/** `tep`: tệp đính kèm (giá trị = [{ ten, loai, base64 }]); `nhieu` = nhiều tệp / nhiều lựa chọn. */
/** `mac_dinh`: giá trị điền sẵn (như form của hệ thống gốc: loại văn bản, độ khẩn, đơn vị…). */
export interface Truong { ma: string; ten: string; loai: 'chu' | 'doan' | 'ngay' | 'chon' | 'tep'; bat_buoc?: boolean; nhieu?: boolean; goi_y?: string; mac_dinh?: string | string[]; lua_chon?: Array<{ ma: string; ten: string }> }
export interface MauTao { ten: string; truong: Truong[] }
/** Số văn bản theo hộp: { mã hộp: { tong, chua_doc?, qua_han? } }. */
export type Dem = Record<string, { tong: number; chua_doc?: number; qua_han?: number }>;
/** Tệp gửi lên trong form. */
export interface TepGui { ten: string; loai: string; base64: string }
export interface ThaoTac { ma: string; ten: string; xac_nhan?: string; truong: Truong[] }
export interface ChiTiet extends Dong {
  /** Tệp không có `id` ⇒ chỉ hiện tên (phần mềm không cho tải). */
  noi_dung?: string; noi_nhan?: string; tep: Array<{ id?: string; ten: string; kich_thuoc?: string }>;
  qua_trinh: Array<{ luc?: string; nguoi?: string; viec: string }>; thao_tac: ThaoTac[];
}

const MA = /^[A-Za-z0-9_.:|-]{1,200}$/;

const cleanHop = (h: unknown): Hop | null => {
  const x = obj(h); const ma = str(x?.ma, 100); const ten = str(x?.ten, 150);
  if (!x || !ma || !MA.test(ma) || !ten) return null;
  const goc = str(x.goc, 2000);
  return {
    ma, ten, loai: x.loai === 'den' || x.loai === 'di' ? x.loai : 'khac',
    goc: goc && /^https?:\/\//.test(goc) ? goc : undefined,
    loc: Array.isArray(x.loc) ? arr(x.loc, cleanTruong, 20) : undefined,
  };
};

export function cleanThongTin(v: unknown): ThongTin {
  const o = obj(v) ?? {};
  // Phiên dịch cũ khai `hop` phẳng ⇒ một nhóm không tên.
  const menu = Array.isArray(o.menu)
    ? arr(o.menu, (n) => { const x = obj(n); const muc = arr(x?.muc, cleanHop, 200); return x && muc.length ? { ten: str(x.ten, 150) ?? '', muc } : null; }, 40)
    : [{ ten: '', muc: arr(o.hop, cleanHop, 200) }].filter((n) => n.muc.length);
  return {
    he_thong: str(o.he_thong, 100) ?? '',
    nguoi_dung: str(o.nguoi_dung, 200),
    menu,
    tao: arr(o.tao, (h) => {
      const x = obj(h); const ma = str(x?.ma, 200); const ten = str(x?.ten, 150); const goc = str(x?.goc, 2000);
      return ma && MA.test(ma) && ten ? { ma, ten, goc: goc && /^https?:\/\//.test(goc) ? goc : undefined } : null;
    }, 30),
  };
}

export function cleanDem(v: unknown): Dem {
  const o = obj(v) ?? {};
  const out: Dem = {};
  for (const [k, x] of Object.entries(o).slice(0, 50)) {
    const d = obj(x); const tong = num(d?.tong);
    if (!MA.test(k) || tong === undefined) continue;
    out[k] = { tong: Math.max(0, tong), chua_doc: num(d?.chua_doc), qua_han: num(d?.qua_han) };
  }
  return out;
}

export function cleanMauTao(v: unknown): MauTao | null {
  const o = obj(v); const ten = str(o?.ten, 200);
  return o && ten ? { ten, truong: arr(o.truong, cleanTruong, 40) } : null;
}

function cleanDong(v: unknown): Dong | null {
  const o = obj(v);
  const id = str(o?.id, 200);
  if (!o || !id) return null;
  return {
    id, trich_yeu: str(o.trich_yeu, 2000) ?? '', so_ky_hieu: str(o.so_ky_hieu, 200), co_quan: str(o.co_quan, 300), ngay: str(o.ngay, 40),
    do_khan: str(o.do_khan, 100), han_xu_ly: str(o.han_xu_ly, 40), trang_thai: str(o.trang_thai, 200), nguoi_xu_ly: str(o.nguoi_xu_ly, 300),
    loai: str(o.loai, 200), da_doc: typeof o.da_doc === 'boolean' ? o.da_doc : undefined,
    them: arr(o.them, (x) => { const t = obj(x); const ten = str(t?.ten, 150); const g = str(t?.gia_tri, 2000); return ten && g ? { ten, gia_tri: g } : null; }, 60),
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
  const loai = o.loai === 'doan' || o.loai === 'ngay' || o.loai === 'chon' || o.loai === 'tep' ? o.loai : 'chu';
  return {
    ma, ten, loai, bat_buoc: o.bat_buoc === true || undefined, nhieu: o.nhieu === true || undefined, goi_y: str(o.goi_y, 300),
    mac_dinh: loai === 'tep' ? undefined : Array.isArray(o.mac_dinh) ? arr(o.mac_dinh, (x) => str(x, 300) ?? null, 200) : str(o.mac_dinh, 2000),
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
    tep: arr(o.tep, (x) => { const t = obj(x); const ten = str(t?.ten, 300); return ten ? { id: str(t?.id, 200) || undefined, ten, kich_thuoc: str(t?.kich_thuoc, 40) } : null; }, 200),
    qua_trinh: arr(o.qua_trinh, (x) => { const q = obj(x); const viec = str(q?.viec, 2000); return q && viec ? { luc: str(q.luc, 40), nguoi: str(q.nguoi, 300), viec } : null; }, 500),
    thao_tac: arr(o.thao_tac, (x) => {
      const t = obj(x); const ma = str(t?.ma, 100); const ten = str(t?.ten, 100);
      if (!t || !ma || !/^[a-z][a-z0-9_]{0,63}$/.test(ma) || !ten) return null;
      return { ma, ten, xac_nhan: str(t.xac_nhan, 500), truong: arr(t.truong, cleanTruong, 30) };
    }, 20),
  };
}

/** Tổng dung lượng tệp gửi trong một form (base64). */
export const MAX_FILES_B64 = 34_000_000;
const tepGui = (x: unknown): TepGui | null => {
  const t = obj(x); const ten = str(t?.ten, 255); const base64 = typeof t?.base64 === 'string' ? t.base64 : '';
  return t && ten && /^[A-Za-z0-9+/]*={0,2}$/.test(base64) ? { ten, loai: str(t.loai, 120) ?? 'application/octet-stream', base64 } : null;
};

/**
 * Giá trị form gửi vb_thuc_hien / vb_tao: chỉ trường khai báo; chữ, mảng chữ, hoặc tệp (`tep`); thiếu trường bắt buộc /
 * giá trị ngoài danh sách chọn / tệp quá lớn ⇒ tên trường.
 */
export function formValues(tt: { truong: Truong[] }, v: Record<string, unknown>): { ok: true; values: Record<string, string | string[] | TepGui[]> } | { ok: false; missing: string } {
  const values: Record<string, string | string[] | TepGui[]> = {};
  let bytes = 0;
  for (const f of tt.truong) {
    const raw = v[f.ma];
    if (f.loai === 'tep') {
      const files = (Array.isArray(raw) ? raw : []).map(tepGui).filter((x): x is TepGui => !!x).slice(0, f.nhieu ? 20 : 1);
      bytes += files.reduce((n, x) => n + x.base64.length, 0);
      if ((f.bat_buoc && !files.length) || bytes > MAX_FILES_B64) return { ok: false, missing: f.ten };
      values[f.ma] = files;
      continue;
    }
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

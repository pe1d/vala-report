/**
 * Báo lỗi của Vala Desktop — phần thuần, có test: làm sạch chữ trước khi gửi (không token / email / tham số URL), hàng
 * đợi gom lỗi trùng (đếm số lần) và giới hạn số mục, chọn lỗi trang nào đáng gửi.
 */
export type LoaiLoi = 'loi_chinh' | 'loi_trang' | 'trang_chet' | 'tien_trinh_chet' | 'trang_treo' | 'cap_nhat' | 'kich_ban';
export interface MucLoi { loai: LoaiLoi; thong_bao: string; stack?: string; ngu_canh?: Record<string, string>; phien_ban: string; he_dieu_hanh: string; so_lan: number }

export function scrub(s: string): string {
  return s
    .replace(/vxt_[\w.-]{10,}/g, 'vxt_…')
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g, '<jwt>')
    .replace(/\b(Bearer|Basic)\s+[\w.+/=-]{8,}/gi, '$1 …')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
    .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1?…');
}

/** Chỉ gốc của một địa chỉ (không đường dẫn / tham số) — đủ biết lỗi ở hệ thống nào. */
export const originOf = (url: string): string => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : u.protocol; } catch { return ''; } };

const key = (m: Pick<MucLoi, 'loai' | 'thong_bao' | 'stack'>) => `${m.loai}\n${m.thong_bao}\n${(m.stack ?? '').split('\n')[1] ?? ''}`;
export const MAX_QUEUE = 200;

/** Thêm vào hàng đợi: trùng (cùng loại + thông báo + dòng stack đầu) ⇒ tăng số lần; đầy ⇒ bỏ mục cũ nhất. */
export function enqueue(q: MucLoi[], m: Omit<MucLoi, 'so_lan'>): MucLoi[] {
  const clean = {
    ...m, thong_bao: scrub(m.thong_bao).slice(0, 2000), stack: m.stack ? scrub(m.stack).slice(0, 20_000) : undefined,
    ngu_canh: m.ngu_canh ? Object.fromEntries(Object.entries(m.ngu_canh).map(([k, v]) => [k, scrub(String(v)).slice(0, 500)])) : undefined,
  };
  const i = q.findIndex((x) => key(x) === key(clean));
  if (i >= 0) return q.map((x, j) => (j === i ? { ...x, so_lan: x.so_lan + 1 } : x));
  return [...q, { ...clean, so_lan: 1 }].slice(-MAX_QUEUE);
}

/** Lỗi console đáng gửi: mức lỗi, từ trang của chính app (file:// / vala-ui://) — lỗi của trang web bên ngoài không phải lỗi của app. */
export const appPageError = (level: number, sourceId: string): boolean => level >= 3 && /^(file|vala-ui):/.test(sourceId);

/** Trình quản lý tải — phần thuần, có test: tên tệp an toàn / không trùng, lịch sử, tiến độ chung cho nút trên header. */
/** cho_chon: đã tải (ngầm, vào thư mục tạm) — đang chờ người dùng chọn ở hộp Tải xuống (Mở / Tải về / Lưu thành…). */
export type TrangThaiTai = 'dang_tai' | 'tam_dung' | 'cho_chon' | 'xong' | 'huy' | 'loi';
export interface TaiVe {
  id: string; ten: string; duong_dan: string; tong: number; da_tai: number; trang_thai: TrangThaiTai;
  /** Lúc bắt đầu (ms). */ luc: number;
  /** Tải từ đâu (tên máy của trang) — không lưu địa chỉ đầy đủ (có thể kèm token). */ nguon: string;
}
export const MAX_HISTORY = 100;

/** Bỏ ký tự không hợp lệ trong tên tệp (Windows + Linux), giữ đuôi; rỗng ⇒ "tep". */
export function safeName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 200);
  return s || 'tep';
}

/** Tên chưa có trong thư mục: "a.pdf" ⇒ "a (1).pdf", "a (2).pdf"… (không ghi đè tệp người dùng đã có). */
export function uniqueName(existing: ReadonlySet<string>, name: string): string {
  if (!existing.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 1; i < 10_000; i++) { const n = `${base} (${i})${ext}`; if (!existing.has(n)) return n; }
  return `${base} (${Date.now()})${ext}`;
}

/** Thêm vào đầu lịch sử (mới nhất trước), giữ tối đa MAX_HISTORY. */
export const addItem = (list: TaiVe[], it: TaiVe): TaiVe[] => [it, ...list.filter((x) => x.id !== it.id)].slice(0, MAX_HISTORY);

/** Tiến độ chung cho nút trên header: số tệp đang tải + phần trăm (null nếu chưa biết tổng dung lượng). */
export function overall(list: readonly TaiVe[]): { dang_tai: number; phan_tram: number | null } {
  const act = list.filter((x) => x.trang_thai === 'dang_tai' || x.trang_thai === 'tam_dung');
  if (!act.length) return { dang_tai: 0, phan_tram: null };
  const tong = act.reduce((n, x) => n + x.tong, 0);
  if (act.some((x) => x.tong <= 0) || tong <= 0) return { dang_tai: act.length, phan_tram: null };
  return { dang_tai: act.length, phan_tram: Math.min(100, Math.floor((act.reduce((n, x) => n + x.da_tai, 0) / tong) * 100)) };
}

/** Đọc lịch sử đã lưu: tệp đang tải dở lúc tắt app ⇒ coi như lỗi (không tải tiếp được). */
export function restore(raw: unknown): TaiVe[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is TaiVe => !!x && typeof x === 'object' && typeof (x as TaiVe).id === 'string' && typeof (x as TaiVe).duong_dan === 'string')
    .map((x) => (x.trang_thai === 'dang_tai' || x.trang_thai === 'tam_dung' || x.trang_thai === 'cho_chon' ? { ...x, trang_thai: 'loi' as const } : x)).slice(0, MAX_HISTORY);
}

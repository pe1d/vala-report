/**
 * Báo lỗi / crash của Vala Desktop (người dùng chốt 08/10/2026) — phần thuần, có test: làm sạch dữ liệu nhận về (không
 * giữ token / email / tham số URL), dấu vân tay để gom lỗi giống nhau thành một dòng, đọc multipart Crashpad gửi.
 */
import { createHash } from 'node:crypto';

export const LOAI_LOI = ['crash', 'loi_chinh', 'loi_trang', 'trang_chet', 'tien_trinh_chet', 'trang_treo', 'cap_nhat', 'kich_ban'] as const;
export type LoaiLoi = (typeof LOAI_LOI)[number];

/** Xoá thứ có thể là bí mật / dữ liệu cá nhân khỏi chữ báo lỗi (app đã làm, máy chủ làm lại cho chắc). */
export function scrub(s: string): string {
  return s
    .replace(/vxt_[\w.-]{10,}/g, 'vxt_…')
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g, '<jwt>')
    .replace(/\b(Bearer|Basic)\s+[\w.+/=-]{8,}/gi, '$1 …')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
    .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1?…');
}

/** Gom lỗi giống nhau: bỏ số, mã hex, đường dẫn tạm khỏi thông báo; lấy dòng đầu của stack (hàm + tệp, bỏ dòng:cột). */
export function fingerprint(e: { loai: string; phien_ban: string; thong_bao: string; stack?: string | null }): string {
  const msg = e.thong_bao.replace(/0x[0-9a-f]+/gi, '#').replace(/\d+/g, '#').slice(0, 300);
  const frame = (e.stack ?? '').split('\n').map((x) => x.trim()).find((x) => /^at\s/.test(x)) ?? '';
  return createHash('sha1').update([e.loai, e.phien_ban, msg, frame.replace(/:\d+:\d+\)?$/, '')].join('\n')).digest('hex');
}

export interface LoiGui { loai: LoaiLoi; thong_bao: string; stack: string | null; ngu_canh: Record<string, string>; phien_ban: string; he_dieu_hanh: string; so_lan: number }

const str = (v: unknown, max: number) => (typeof v === 'string' ? scrub(v).slice(0, max) : '');

/** Một mục app gửi ⇒ dạng lưu (sai loại / thiếu thông báo ⇒ null). Ngữ cảnh chỉ giữ chuỗi ngắn, tối đa 30 khoá. */
export function cleanLoi(v: unknown): LoiGui | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const loai = LOAI_LOI.find((x) => x === o.loai);
  const thong_bao = str(o.thong_bao, 2000);
  if (!loai || !thong_bao) return null;
  const ctx = o.ngu_canh && typeof o.ngu_canh === 'object' ? Object.entries(o.ngu_canh as Record<string, unknown>) : [];
  return {
    loai, thong_bao, stack: str(o.stack, 20_000) || null,
    ngu_canh: Object.fromEntries(ctx.filter(([k, x]) => /^[\w.-]{1,40}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof x)).slice(0, 30)
      .map(([k, x]) => [k, scrub(String(x)).slice(0, 500)])),
    phien_ban: str(o.phien_ban, 40) || '?', he_dieu_hanh: str(o.he_dieu_hanh, 120) || '?',
    so_lan: Math.min(Math.max(Math.floor(Number(o.so_lan) || 1), 1), 10_000),
  };
}

/** Thân multipart/form-data (Crashpad: các trường chữ + tệp upload_file_minidump) ⇒ trường + tệp. */
export function parseMultipart(body: Buffer, boundary: string): { fields: Record<string, string>; files: Record<string, { filename: string; data: Buffer }> } {
  const fields: Record<string, string> = {};
  const files: Record<string, { filename: string; data: Buffer }> = {};
  const delim = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delim);
  while (pos >= 0) {
    const start = pos + delim.length;
    if (body.slice(start, start + 2).toString() === '--') break;          // kết thúc
    const next = body.indexOf(delim, start);
    if (next < 0) break;
    const part = body.slice(start + 2, next - 2);                          // bỏ CRLF đầu, CRLF trước delim
    const sep = part.indexOf('\r\n\r\n');
    if (sep >= 0) {
      const head = part.slice(0, sep).toString('utf8');
      const data = part.slice(sep + 4);
      const name = /name="([^"]*)"/i.exec(head)?.[1];
      const filename = /filename="([^"]*)"/i.exec(head)?.[1];
      if (name !== undefined) {
        if (filename !== undefined) files[name] = { filename, data };
        else fields[name] = data.toString('utf8').slice(0, 2000);
      }
    }
    pos = next;
  }
  return { fields, files };
}

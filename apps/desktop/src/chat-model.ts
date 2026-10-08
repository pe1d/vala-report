/** Quy tắc thuần của trang Trợ lý AI (không phụ thuộc Electron, có test; renderer/chat.ts có bản chép của resultView). */
import type { Lang } from './i18n';

export type Command = { kind: 'slash'; query: string } | { kind: 'text'; text: string };

/** "/…" ⇒ lệnh chạy thao tác (chữ sau "/" để lọc); còn lại ⇒ câu hỏi tự do; rỗng ⇒ null. */
export function parseCommand(input: string): Command | null {
  const s = input.trim();
  if (!s) return null;
  return s.startsWith('/') ? { kind: 'slash', query: s.slice(1).trim() } : { kind: 'text', text: s };
}

export type ResultView =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'fields'; fields: { key: string; view: ResultView }[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Giá trị ⇒ chữ trong ô: true/false ⇒ có/không (yes/no); object ⇒ JSON gọn; null ⇒ rỗng. */
export function cellText(v: unknown, lang: Lang = 'vi'): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return lang === 'en' ? (v ? 'yes' : 'no') : (v ? 'có' : 'không');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Kết quả thao tác ⇒ cách hiển thị: mảng object ⇒ bảng; object ⇒ thông tin – giá trị (mảng con ⇒ bảng con); khác ⇒ chữ. */
export function resultView(v: unknown, lang: Lang = 'vi', nested = false): ResultView {
  if (v === undefined || (Array.isArray(v) && !v.length)) return { kind: 'empty' };
  if (Array.isArray(v)) {
    if (v.every(isObj)) {
      const columns: string[] = [];
      for (const r of v) for (const k of Object.keys(r)) if (!k.startsWith('_') && !columns.includes(k)) columns.push(k);
      return { kind: 'table', columns, rows: v.map((r) => columns.map((c) => cellText(r[c], lang))) };
    }
    return { kind: 'list', items: v.map((x) => cellText(x, lang)) };
  }
  if (isObj(v) && !nested) {
    return { kind: 'fields', fields: Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([key, x]) => ({
      key, view: Array.isArray(x) && x.length && x.every(isObj) ? resultView(x, lang, true) : { kind: 'text', text: cellText(x, lang) },
    })) };
  }
  return { kind: 'text', text: cellText(v, lang) };
}

/** Lời chào giữa trang khi chưa có tin nhắn. */
export function greeting(hour: number, name: string, lang: Lang): string {
  const p = lang === 'en'
    ? (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
    : (hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối');
  return name ? `${p}, ${name}` : p;
}

/**
 * Tham số gõ trong phiếu chạy thao tác ⇒ giá trị: số nguyên (tối đa 15 chữ số) ⇒ số; `[…]` / `{…}` là JSON hợp lệ ⇒ giá trị
 * JSON; còn lại ⇒ chữ (đã bỏ khoảng trắng hai đầu). Ô trống ⇒ không gửi (thao tác dùng giá trị mặc định).
 */
export function parseArgs(form: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(form)) {
    const v = raw.trim();
    if (!v) continue;
    if (/^-?\d{1,15}$/.test(v)) out[k] = Number(v);
    else if (/^[[{]/.test(v)) { try { out[k] = JSON.parse(v); } catch { out[k] = v; } }
    else out[k] = v;
  }
  return out;
}

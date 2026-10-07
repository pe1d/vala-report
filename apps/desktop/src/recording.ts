/**
 * Bản ghi thao tác (T07 phần 2) — phần THUẦN, không import electron: kiểu dữ liệu, tách thân request, che giá trị nhạy
 * cảm, đọc tên trường từ trang / phản hồi UpdatePanel, đặt tên bước. recorder.ts gắn debugger và gọi các hàm này.
 *
 * Bản ghi chỉ ở trên máy người dùng, không gửi lên máy chủ. Không giữ cookie, mật khẩu, nội dung tệp, nội dung trang;
 * __VIEWSTATE / __EVENTVALIDATION chỉ giữ độ dài.
 */
import type { Lang } from './i18n';

export interface RecField { name: string; value: string; masked?: 'mat_khau' | 'trang_thai' }
export interface RecFile { name: string; filename: string; type: string; size: number | null }
/** Tên các trường trên trang trả về — để nhận ra nút được bấm ở bước sau và biết trang có những ô gì. */
export interface PageInfo { hidden: string[]; submits: string[]; inputs: string[]; passwords: string[] }

export interface RecStep {
  id: number;
  at: string;
  /** trang: tải trang (GET); form: gửi form (POST trang hoặc postback UpdatePanel); xhr: XHR / fetch khác. */
  kind: 'trang' | 'form' | 'xhr';
  method: string;
  url: string;
  /** Request của khung con (iframe) thay vì trang chính. */
  frame: 'chinh' | 'khung_con';
  label: string;
  contentType?: string;
  fields: RecField[];
  files: RecFile[];
  /** Không đọc được thân request (vd trình duyệt không chuyển thân có tệp lớn). */
  bodyUnreadable?: boolean;
  /** Postback UpdatePanel (MS AJAX): header X-MicrosoftAjax. */
  async?: boolean;
  status?: number;
  /** Chuyển hướng tới (header Location). */
  location?: string;
  responseType?: string;
  page?: PageInfo;
  /** UpdatePanel: id các vùng trang được cập nhật. */
  panels?: string[];
  /** Bước này là đích chuyển hướng của bước có id này. */
  redirectedFrom?: number;
}

export interface Recording {
  version: 1;
  host: string;
  title: string;
  startedAt: string;
  stoppedAt?: string;
  /** Dừng vì đủ MAX_STEPS bước. */
  truncated: boolean;
  /** Lý do dừng khác người dùng bấm (tab đóng, DevTools chiếm…). */
  stopReason?: string;
  steps: RecStep[];
}

export const MAX_STEPS = 200;
const MAX_TEXT = 2000;

// ---------------------------------------------------------------------------------------------
// Thân request
// ---------------------------------------------------------------------------------------------

/** Tách thân request theo Content-Type: urlencoded / multipart ⇒ trường + tệp; loại khác ⇒ nguyên văn (cắt ngắn). */
export function parseBody(contentType: string, body: string | Buffer | undefined): { fields: RecField[]; files: RecFile[] } {
  if (body === undefined || body.length === 0) return { fields: [], files: [] };
  const ct = contentType.toLowerCase();
  if (ct.startsWith('application/x-www-form-urlencoded')) {
    const fields: RecField[] = [];
    for (const [name, value] of new URLSearchParams(body.toString())) fields.push({ name, value });
    return { fields, files: [] };
  }
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (ct.startsWith('multipart/form-data') && boundary) return parseMultipart(Buffer.isBuffer(body) ? body : Buffer.from(body), boundary[1] ?? boundary[2]!.trim());
  const name = ct.includes('json') ? '(json)' : '(body)';
  return { fields: [{ name, value: body.toString().slice(0, MAX_TEXT) }], files: [] };
}

function parseMultipart(buf: Buffer, boundary: string): { fields: RecField[]; files: RecFile[] } {
  // latin1 giữ nguyên từng byte ⇒ tách theo ranh giới xong mới giải UTF-8 phần chữ; kích thước tệp tính theo byte thật.
  const raw = buf.toString('latin1');
  const fields: RecField[] = [];
  const files: RecFile[] = [];
  for (const part of raw.split(`--${boundary}`).slice(1)) {
    if (part.startsWith('--')) break;
    const sep = part.indexOf('\r\n\r\n');
    if (sep < 0) continue;
    const head = part.slice(0, sep);
    const content = part.slice(sep + 4).replace(/\r\n$/, '');
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    if (name === undefined) continue;
    const utf8 = (s: string) => Buffer.from(s, 'latin1').toString('utf8');
    const filename = /filename="([^"]*)"/i.exec(head)?.[1];
    if (filename === undefined) { fields.push({ name: utf8(name), value: utf8(content).slice(0, MAX_TEXT) }); continue; }
    if (filename === '') continue;                     // ô chọn tệp để trống
    files.push({ name: utf8(name), filename: utf8(filename), type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? '', size: content.length });
  }
  return { fields, files };
}

// ---------------------------------------------------------------------------------------------
// Che giá trị
// ---------------------------------------------------------------------------------------------

const PASSWORD_NAME = /(pass|pwd|matkhau|mat_khau|password)/i;
/** Trạng thái ASP.NET / token chống giả mạo: dài, vô nghĩa với người đọc, có thể chứa dữ liệu phiên ⇒ chỉ giữ độ dài. */
const STATE_NAME = /^(__VIEWSTATE|__EVENTVALIDATION|__RequestVerificationToken|__PREVIOUSPAGE)$/;

/** `passwords`: tên các ô type=password đang có trên trang (recorder hỏi trang). */
export function maskFields(fields: RecField[], passwords: Set<string>): RecField[] {
  return fields.map((f) => {
    const short = f.name.split('$').pop() ?? f.name;
    if (passwords.has(f.name) || PASSWORD_NAME.test(short)) return { name: f.name, value: '••••', masked: 'mat_khau' };
    if (STATE_NAME.test(f.name)) return { name: f.name, value: `(${f.value.length} ký tự)`, masked: 'trang_thai' };
    return f;
  });
}

// ---------------------------------------------------------------------------------------------
// Đọc trang / phản hồi UpdatePanel (chỉ lấy TÊN, không giữ nội dung)
// ---------------------------------------------------------------------------------------------

const attr = (tag: string, a: string) => new RegExp(`\\b${a}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((x) => x !== undefined);
const unescape = (s: string) => s.replace(/&#36;/g, '$').replace(/&amp;/g, '&');

/** Tên trường ẩn, nút gửi, ô nhập, ô mật khẩu trên trang HTML (theo thứ tự xuất hiện, không trùng). */
export function pageInfo(html: string): PageInfo {
  const out: PageInfo = { hidden: [], submits: [], inputs: [], passwords: [] };
  const add = (list: string[], name: string) => { if (!list.includes(name)) list.push(name); };
  for (const m of html.matchAll(/<(input|select|textarea|button)\b[^>]*>/gi)) {
    const tag = m[0];
    const name = attr(tag, 'name');
    if (!name) continue;
    const n = unescape(name);
    const el = m[1]!.toLowerCase();
    const type = (attr(tag, 'type') ?? (el === 'button' ? 'submit' : 'text')).toLowerCase();
    if (el === 'input' && type === 'hidden') add(out.hidden, n);
    else if ((el === 'input' && (type === 'submit' || type === 'image')) || (el === 'button' && type === 'submit')) add(out.submits, n);
    else if (el === 'button' || (el === 'input' && (type === 'button' || type === 'reset'))) continue;
    else {
      add(out.inputs, n);
      if (type === 'password') add(out.passwords, n);
    }
  }
  return out;
}

/**
 * Phản hồi UpdatePanel (MS AJAX): chuỗi mục `độ dài|loại|id|nội dung|`. Nội dung có thể chứa "|" nên phải đọc đúng theo độ
 * dài. Trả id các vùng cập nhật + tên trường ẩn; không phải dạng này ⇒ null.
 */
export function deltaInfo(text: string): { panels: string[]; hidden: string[] } | null {
  const out = { panels: [] as string[], hidden: [] as string[] };
  let i = 0;
  const until = () => {
    const j = text.indexOf('|', i);
    if (j < 0) throw new Error('hết');
    const s = text.slice(i, j);
    i = j + 1;
    return s;
  };
  try {
    while (i < text.length) {
      const len = until();
      if (!/^\d+$/.test(len)) return null;
      const type = until();
      const id = until();
      if (text[i + Number(len)] !== '|') return null;   // bỏ qua nội dung (không giữ) theo đúng độ dài
      i += Number(len) + 1;
      if (type === 'updatePanel') out.panels.push(id);
      else if (type === 'hiddenField') out.hidden.push(id);
    }
  } catch { return null; }
  return out.panels.length || out.hidden.length ? out : null;
}

// ---------------------------------------------------------------------------------------------
// Tên bước
// ---------------------------------------------------------------------------------------------

const LABEL = {
  vi: { open: 'Mở', page: 'Sang trang', postback: 'Gửi lại form', click: 'Bấm', login: 'Đăng nhập (đã che mật khẩu)', form: 'Gửi form' },
  en: { open: 'Open', page: 'Go to page', postback: 'Postback', click: 'Click', login: 'Sign in (password hidden)', form: 'Submit form' },
};

const pathOf = (url: string) => { try { const u = new URL(url); return u.pathname + u.search; } catch { return url; } };
const short = (name: string) => name.split('$').pop() ?? name;

/** Tên dễ đọc của một bước. `prev`: thông tin trang trước (để nhận ra nút được bấm). */
export function stepLabel(step: RecStep, prev: PageInfo | undefined, lang: Lang): string {
  const t = LABEL[lang];
  if (step.kind === 'xhr') return `${step.method} ${pathOf(step.url)}`;
  if (step.kind === 'trang') return `${t.open} ${pathOf(step.url)}`;
  const get = (n: string) => step.fields.find((f) => f.name === n)?.value ?? '';
  const target = get('__EVENTTARGET');
  const arg = get('__EVENTARGUMENT');
  const ajax = step.async ? ' (UpdatePanel)' : '';
  const page = /^Page\$(\d+|Next|Prev|First|Last)$/i.exec(arg);
  if (target && page) return `${t.page} ${page[1]}: ${short(target)}${ajax}`;
  if (target) return `${t.postback}: ${short(target)}${ajax}`;
  if (step.fields.some((f) => f.masked === 'mat_khau')) return t.login;
  const btn = step.fields.find((f) => prev?.submits.includes(f.name));
  if (btn) return `${t.click} ${short(btn.name)} (“${btn.value}”)${ajax}`;
  return `${t.form} ${pathOf(step.url)}`;
}

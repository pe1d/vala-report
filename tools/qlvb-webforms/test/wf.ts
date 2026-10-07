/**
 * Khách HTTP tối giản cho test hệ thống WebForms giả lập: giữ cookie, đọc trường ẩn, gửi lại form (postback), gửi tệp
 * (multipart), UpdatePanel (MS AJAX). Tự đi theo chuyển hướng như trình duyệt. Không dùng cho mã sản phẩm — phần 3/4 có
 * vala.webform() / WebForm riêng.
 */
export const BASE = process.env.QLVB_URL ?? 'http://localhost:4030';

export interface Page { status: number; url: string; html: string }
export interface Tep { ten: string; loai: string; noiDung: string }

export class Browser {
  cookies = new Map<string, string>();

  private keep(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv!.indexOf('=');
      const name = kv!.slice(0, i).trim();
      const value = kv!.slice(i + 1);
      if (/expires=Thu, 01[- ]Jan[- ]1970/i.test(c) || value === '') this.cookies.delete(name); else this.cookies.set(name, value);
    }
  }

  async open(path: string, init: RequestInit = {}): Promise<Page> {
    let url = new URL(path, BASE).toString();
    let req: RequestInit = init;
    for (let hop = 0; hop < 5; hop++) {
      const headers = new Headers(req.headers);
      if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
      const res = await fetch(url, { ...req, headers, redirect: 'manual' });
      this.keep(res);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); req = {}; continue; }
      return { status: res.status, url, html: await res.text() };
    }
    throw new Error('quá nhiều lần chuyển hướng');
  }

  /** Gửi form của trang `page` (mọi trường ẩn + trường thường đang có) đè thêm `fields`. */
  async post(page: Page, fields: Record<string, string | string[]>, opts: { tep?: Record<string, Tep>; ajax?: string } = {}): Promise<Page> {
    const all: Record<string, string | string[]> = { ...formFields(page.html), ...fields };
    const headers: Record<string, string> = {};
    let body: BodyInit;
    if (opts.ajax) {
      all['ctl00$sm'] = opts.ajax;                 // "<UpdatePanel>|<control gây postback>"
      all.__ASYNCPOST = 'true';
      headers['X-MicrosoftAjax'] = 'Delta=true';
    }
    if (opts.tep) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(all)) for (const x of [v].flat()) fd.append(k, x);
      for (const [k, t] of Object.entries(opts.tep)) fd.append(k, new Blob([t.noiDung], { type: t.loai }), t.ten);
      body = fd;
    } else {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(all)) for (const x of [v].flat()) sp.append(k, x);
      body = sp;
    }
    return this.open(page.url, { method: 'POST', body, headers });
  }

  /** Như __doPostBack(target, arg). */
  postback(page: Page, target: string, arg = '', fields: Record<string, string | string[]> = {}, ajax?: string) {
    return this.post(page, { __EVENTTARGET: target, __EVENTARGUMENT: arg, ...fields }, { ajax });
  }

  async login(user: string, pass = 'Qlvb@2026'): Promise<Page> {
    const p = await this.open('/Login.aspx');
    return this.post(p, { txtTenDangNhap: user, txtMatKhau: pass, btnDangNhap: 'Đăng nhập' });
  }
}

/** Giải thực thể HTML — ASP.NET mã hoá cả dấu tiếng Việt thành thực thể số (vd "B&#225;o c&#225;o"). */
const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Các trường form như trình duyệt sẽ gửi: input ẩn/chữ, ô chọn đang chọn, checkbox đang tích, textarea. Không gồm nút. */
export function formFields(html: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    const type = (/\btype="([^"]*)"/.exec(tag)?.[1] ?? 'text').toLowerCase();
    if (!name || ['submit', 'button', 'image', 'file'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(tag)) continue;
    out[decode(name)] = decode(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? (type === 'checkbox' ? 'on' : ''));
  }
  for (const m of html.matchAll(/<select\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const sel = /<option\b[^>]*selected[^>]*value="([^"]*)"|<option\b[^>]*value="([^"]*)"[^>]*selected/i.exec(m[2]!);
    const first = /<option\b[^>]*value="([^"]*)"/i.exec(m[2]!);
    out[decode(m[1]!)] = decode(sel?.[1] ?? sel?.[2] ?? first?.[1] ?? '');
  }
  for (const m of html.matchAll(/<textarea\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/textarea>/gi)) out[decode(m[1]!)] = decode(m[2]!.replace(/^\r?\n/, ''));
  return out;
}

/** Các lựa chọn của ô chọn / danh sách checkbox có tên đầy đủ `name`. */
export function options(html: string, name: string): { value: string; text: string }[] {
  const sel = new RegExp(`<select\\b[^>]*name="${name.replace(/\$/g, '\\$')}"[^>]*>([\\s\\S]*?)</select>`, 'i').exec(html);
  if (sel) return [...sel[1]!.matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)].map((m) => ({ value: decode(m[1]!), text: decode(m[2]!) }));
  const esc = name.replace(/\$/g, '\\$');
  return [...html.matchAll(new RegExp(`<input\\b[^>]*name="(${esc}\\$\\d+)"[^>]*value="([^"]*)"[^>]*/?>\\s*<label[^>]*>([^<]*)</label>`, 'gi'))]
    .map((m) => ({ value: decode(m[2]!), text: decode(m[3]!), field: m[1]! })) as { value: string; text: string; field?: string }[];
}

/** Chữ của phần tử có id (span/label/td…). */
export function text(html: string, id: string): string {
  const m = new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</`, 'i').exec(html);
  return m ? decode(m[1]!.replace(/<[^>]+>/g, '').trim()) : '';
}

/** Các dòng của bảng có id (bỏ dòng tiêu đề và dòng số trang), mỗi dòng là mảng chữ trong các ô. */
export function rows(html: string, id: string): string[][] {
  const t = new RegExp(`<table\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</table>\\s*(?:</div>)?`, 'i').exec(html);
  if (!t) return [];
  // Dòng số trang của GridView chứa một bảng con (các số trang) ⇒ bỏ.
  return [...t[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .filter((r) => !/<table\b/i.test(r[1]!))
    .map((r) => [...r[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => decode(c[1]!.replace(/<[^>]+>/g, '').trim())))
    .filter((cells) => cells.length > 2);
}

/** Máy giả lập có đang chạy không (test tự bỏ qua nếu không). */
export async function dangChay(): Promise<boolean> {
  try { return (await fetch(`${BASE}/_dev/reset`, { method: 'POST' })).ok; } catch { return false; }
}

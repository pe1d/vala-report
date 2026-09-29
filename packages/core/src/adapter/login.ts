/**
 * auth_method = 'password': hệ thống tự đăng nhập hệ thống nguồn bằng tài khoản/mật khẩu do quản trị
 * cấu hình, lấy cookie phiên. Mô phỏng đúng thao tác của trình duyệt trên iam.bkav.com (WSO2):
 *   GET start → (chuyển hướng) → trang đăng nhập → POST form → (chuyển hướng) → hệ thống nguồn có cookie.
 *
 * Nguyên tắc:
 *  - Mật khẩu không bao giờ xuất hiện trong lỗi, log hay kết quả trả về.
 *  - Sai mật khẩu / cần OTP ⇒ ném lỗi riêng để phía gọi DỪNG hẳn, không thử lại (tránh khoá tài khoản).
 *  - Chỉ đi tới base_url và login_hosts của nguồn.
 */
import { Problem } from '../errors.js';
import { missingCookieGroups, pickRequiredCookies, RedirectWalker, type BootstrapResult } from './bootstrap.js';
import type { FetchLike } from './http.js';
import type { AdapterSpec } from './spec.js';
import { render } from './template.js';

export interface SourceCredential {
  username: string;
  password: string;
}

export interface PasswordLoginOptions {
  spec: AdapterSpec;
  baseUrl: string;
  /** Host trang đăng nhập, vd iam.bkav.com (core.source_systems.login_hosts). */
  loginHosts: string[];
  credential: SourceCredential;
  fetchImpl?: FetchLike;
}

/** Các <input name=… value=…> trong trang — để lấy trường ẩn như sessionDataKey. */
export function formInputs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const name = /\bname\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
    const value = /\bvalue\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? '';
    if (name && !(name in out && out[name])) out[name] = value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
  }
  return out;
}

export async function passwordLogin(o: PasswordLoginOptions): Promise<BootstrapResult> {
  const cfg = o.spec.auth.password_login;
  if (!cfg) throw new Error(`${o.spec.id}: spec chưa khai báo auth.password_login`);
  const appHost = new URL(o.baseUrl).host;
  const hosts = new Set([appHost, ...o.loginHosts.map((h) => (h.includes('://') ? new URL(h).host : h))]);
  const walker = new RedirectWalker(hosts, o.fetchImpl ?? ((u, i) => fetch(u, i)), cfg.max_redirects);

  const page = await walker.go(new URL(cfg.start.path, o.baseUrl));
  if (page.url.host === appHost) {
    const already = pickRequiredCookies(o.spec, walker.cookiesFor(o.baseUrl));
    if (already) return { cookies: already, expires_at: ttl(cfg.session_ttl_minutes) };
    throw new Problem('schema_drift', 'Không thấy trang đăng nhập', `dừng ở ${page.url.host}${page.url.pathname} (${page.status})`);
  }
  if (page.status !== 200) throw new Error(`Trang đăng nhập trả HTTP ${page.status}`);

  const ctx = {
    credential: o.credential,
    page: { query: Object.fromEntries(page.url.searchParams), inputs: formInputs(page.text) },
  };
  let fields: Record<string, string>;
  try {
    fields = Object.fromEntries(Object.entries(render(cfg.form.fields, ctx) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  } catch {
    // Thường là thiếu sessionDataKey ⇒ trang đăng nhập đã đổi cấu trúc.
    throw new Problem('schema_drift', 'Trang đăng nhập đã thay đổi', 'không đủ trường để điền form đăng nhập');
  }

  const end = await walker.go(new URL(cfg.form.action, page.url), { method: 'POST', form: fields });
  const where = `${end.url.pathname}${end.url.search}`;
  if (new RegExp(cfg.failure.invalid_credentials).test(where)) {
    throw new Problem('invalid_credentials', 'Sai tên đăng nhập hoặc mật khẩu hệ thống nguồn');
  }
  if (new RegExp(cfg.failure.otp_required, 'i').test(where)) {
    throw new Problem('otp_required', 'Tài khoản bật xác thực hai lớp (OTP)', 'Không thể tự đăng nhập bằng mật khẩu');
  }
  if (end.url.host !== appHost || end.status >= 400) {
    throw new Problem('invalid_credentials', 'Đăng nhập không thành công', `dừng ở ${end.url.host}${end.url.pathname} (${end.status})`);
  }
  const cookies = pickRequiredCookies(o.spec, walker.cookiesFor(o.baseUrl));
  if (!cookies) throw new Problem('schema_drift', 'Đăng nhập xong nhưng thiếu cookie phiên', missingCookieGroups(o.spec, walker.cookiesFor(o.baseUrl)).join(', '));
  return { cookies, expires_at: ttl(cfg.session_ttl_minutes) };
}

const ttl = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

/**
 * auth_method = 'cookie': quản trị dán chuỗi Cookie (copy từ DevTools). Chỉ giữ đúng các cookie cần.
 */
export function parseCookieInput(spec: AdapterSpec, raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of raw.replace(/^cookie:\s*/i, '').split(/;\s*|\n/)) {
    const eq = part.indexOf('=');
    if (eq > 0) map[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  const cookies = pickRequiredCookies(spec, map);
  if (!cookies) {
    const missing = missingCookieGroups(spec, map);
    throw new Problem('invalid_params', 'Cookie thiếu trường bắt buộc', `thiếu: ${missing.join(', ')}`);
  }
  return cookies;
}

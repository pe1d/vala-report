import { Problem, L } from '../errors.js';
import type { AdapterSpec, RequestSpec } from './spec.js';
import { render } from './template.js';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpResponse {
  status: number;
  text: string;
  json(): unknown;
}

export interface GuardedClientOptions {
  baseUrl: string;
  cookies: Record<string, string>;
  spec: AdapterSpec;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Client HTTP duy nhất mà adapter được dùng. Ba việc không thương lượng:
 *  1. Chốt chặn allowed_endpoints — từ chối TRƯỚC khi phát request (phiên là bearer
 *     token không thu hẹp được, đây là rào duy nhất).
 *  2. Giới hạn tốc độ theo spec (theo từng phiên).
 *  3. Không bao giờ đưa giá trị cookie vào lỗi hay log.
 */
export class GuardedHttpClient {
  calls = 0;
  private readonly allowed: Set<string>;
  private readonly recent: number[] = [];
  private lastCallAt = -Infinity;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly cookieHeader: string;
  private readonly baseUrl: string;
  private readonly apiHeaders: Record<string, string>;

  constructor(private readonly opts: GuardedClientOptions) {
    this.allowed = new Set(opts.spec.allowed_endpoints.map((e) => `${e.method} ${e.path}`));
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
    this.cookieHeader = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    // Base do caller quyết (api_base_url của adapter hoặc override từ sourceInfo/env cho dev/test).
    this.baseUrl = opts.baseUrl;
    // Header cố định, nội suy từ cookie (vd Company-Id = {{cookie.companyId}}). Thiếu cookie ⇒ BỎ header đó
    // (không ném) — để lúc dò cookie phiên, bộ thiếu cookie chỉ dẫn tới probe 401, đúng tín hiệu "cookie này cần".
    this.apiHeaders = {};
    for (const [k, v] of Object.entries(opts.spec.auth.api_headers ?? {})) {
      try { this.apiHeaders[k] = String(render(v, { cookie: opts.cookies })); } catch { /* thiếu cookie ⇒ bỏ header */ }
    }
  }

  /** Giá trị một cookie phiên (để session_probe lấy định danh từ cookie). */
  cookieValue(name: string): string | undefined {
    return this.opts.cookies[name];
  }

  assertAllowed(method: string, path: string): void {
    if (!this.allowed.has(`${method} ${path}`)) {
      throw new Problem('endpoint_not_allowed', L('Endpoint không nằm trong allowed_endpoints', 'Endpoint is not in allowed_endpoints'), `${method} ${path}`);
    }
  }

  private async throttle(): Promise<void> {
    const { max_requests_per_minute: max, delay_between_calls_ms: gap } = this.opts.spec.rate_limit;
    const wait1 = this.lastCallAt + gap - this.now();
    if (wait1 > 0) await this.sleep(wait1);
    while (this.recent.length && this.recent[0]! <= this.now() - 60_000) this.recent.shift();
    if (this.recent.length >= max) {
      await this.sleep(this.recent[0]! + 60_000 - this.now());
      this.recent.shift();
    }
  }

  async request(req: RequestSpec & { query?: Record<string, unknown>; body?: Record<string, unknown> }): Promise<HttpResponse> {
    this.assertAllowed(req.method, req.path);
    await this.throttle();

    const url = new URL(req.path, this.baseUrl);
    for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, String(v));

    const headers: Record<string, string> = { Cookie: this.cookieHeader, Accept: 'application/json, text/html', ...this.apiHeaders };
    let body: string | undefined;
    if (req.body) {
      if (req.body_encoding === 'json') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(req.body);
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        body = new URLSearchParams(Object.entries(req.body).map(([k, v]) => [k, String(v)])).toString();
      }
    }

    this.calls++;
    this.lastCallAt = this.now();
    this.recent.push(this.lastCallAt);

    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
      });
    } catch (e) {
      // Chỉ ghi method + path: URL có thể mang puid, header mang cookie.
      throw new Problem('source_unavailable', L('Hệ thống nguồn không phản hồi', 'Source system is not responding'), `${req.method} ${req.path}: ${(e as Error).name}`);
    }

    // Phiên hết hạn trên hệ thống dùng SSO thường biểu hiện bằng chuyển hướng sang trang đăng nhập.
    if ((res.status >= 300 && res.status < 400) || res.status === 401 || res.status === 403) {
      let to = '';
      const loc = res.headers.get('location');
      if (loc) { try { const u = new URL(loc, url); to = ` (chuyển tới ${u.host === url.host ? '' : u.host}${u.pathname})`; } catch { /* bỏ qua */ } }
      throw new Problem('session_expired', L('Phiên uỷ quyền đã hết hạn', 'Authorized session has expired'), `${req.method} ${req.path} → ${res.status}${to}`);
    }
    const text = await res.text();
    // 5xx: nguồn đang lỗi — không phải do phiên, không được đánh dấu hết hạn.
    if (res.status >= 500) throw new Problem('source_unavailable', L('Hệ thống nguồn đang lỗi', 'Source system is failing'), `${req.method} ${req.path} → HTTP ${res.status}`);
    if (res.status >= 400) throw new Error(`${req.method} ${req.path} → HTTP ${res.status}`);
    return {
      status: res.status,
      text,
      json() {
        try {
          return JSON.parse(text);
        } catch {
          throw new Problem('schema_drift', L('Phản hồi không phải JSON', 'Response is not JSON'), `${req.method} ${req.path}`);
        }
      },
    };
  }
}

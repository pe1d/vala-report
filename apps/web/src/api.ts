/** Client API. Lỗi RFC 7807 thành ApiProblem để màn hình rẽ nhánh theo `type`. */
export class ApiProblem extends Error {
  constructor(readonly type: string, readonly status: number, readonly title: string, readonly detail?: string, readonly body?: Record<string, unknown>) {
    super(title);
  }
}

const TOKEN_KEY = 'vala.token';
export const auth = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ } },
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = auth.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    const p = ct.includes('json') ? await res.json() : { type: 'internal', title: `Lỗi HTTP ${res.status}` };
    if (res.status === 401 && token) {
      // Phiên đăng nhập cổng hết hạn: báo App đưa người dùng sang SSO đăng nhập lại.
      auth.set(null);
      try { sessionStorage.setItem('vala.reauth', '1'); } catch { /* bỏ qua */ }
      window.dispatchEvent(new Event('vala:unauthorized'));
    }
    throw new ApiProblem(p.type ?? 'internal', res.status, p.title ?? 'Lỗi', p.detail, p);
  }
  return (ct.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: (p: string) => request<void>('DELETE', p),
};

// ---- kiểu dữ liệu theo openapi.yaml ----
export type Scope = 'ca_nhan' | 'don_vi';
export type AuthMethod = 'password' | 'cookie' | 'sso' | 'extension';
export interface ExtensionDevice { id: number; ten: string; created_at: string; last_used_at: string | null; expires_at: string }
export interface Me { id: number; ho_ten: string; email: string; is_ops_admin: boolean; scopes: Scope[]; org_units: { id: number; ten: string; vai_tro: string }[] }
export interface AdminUser { id: number; ho_ten: string; email: string; username: string | null; is_ops_admin: boolean }
export interface Connection {
  app_user_id: number; ho_ten: string; email: string; source_system: string; source_ten: string;
  auth_method: AuthMethod | null; source_username: string | null;
  /** Cách kết nối hệ thống này cho phép (quản trị đặt ở "Hệ thống nguồn"). */
  connection_methods?: AuthMethod[];
  state: 'active' | 'pending' | 'expired' | 'failed' | 'revoked' | 'chua_cau_hinh';
  last_error: string | null; last_refresh_at: string | null; session_expires_at: string | null; last_success_at: string | null;
}
export interface Grant {
  source_system: string; ten: string; session_state: 'pending' | 'active' | 'expired' | 'revoked' | 'failed';
  granted_at: string | null; last_success_at: string | null; session_expires_at: string | null; scope_capabilities: string[]; available_capabilities: string[]; can_crawl: boolean;
}
export interface ReportDef {
  code: string; ten: string; mo_ta: string | null; source_system: string; source_ten?: string; view_template: string;
  required_scope: 'ca_nhan' | 'don_vi' | 'toan_don_vi'; requires_grant: boolean;
  param_schema: { properties: Record<string, JsonProp> }; default_params: Record<string, unknown>;
}
export interface JsonProp { type: string; title?: string; enum?: string[]; format?: string; items?: { type: string }; minimum?: number; maximum?: number; 'x-options'?: unknown }
export interface Column { field: string; label: string; type: 'string' | 'int' | 'date' | 'money'; width?: number }
export type ChartKind = 'bar' | 'column' | 'line' | 'donut' | 'heatmap';
export interface Chart {
  kind: ChartKind; title: string; x_field: string; series: { field: string; label: string }[];
  range?: { tu_ngay: string; den_ngay: string };
}
export interface Freshness {
  source_system: string;
  status: 'ok' | 'stale' | 'failed' | 'no_grant'; message: string; last_success_at: string | null; grant_state?: string | null;
  coverage?: { members: number; granted: number; message: string };
}
export interface ReportResult {
  columns: Column[]; rows: Record<string, unknown>[]; total_rows: number; page: number; page_size: number;
  charts?: Chart[]; freshness: Freshness; applied?: Record<string, unknown>; scope: Scope;
  /** Dữ liệu riêng cho biểu đồ (khi khác bảng). */
  chart_rows?: Record<string, unknown>[];
  /** Thẻ số liệu của dashboard. tone là trạng thái, luôn đi kèm nhãn chữ. */
  tiles?: StatTile[];
}
export interface StatTile {
  key: string; label: string; value: number; tone: 'ok' | 'warn' | 'err' | 'neutral';
  unit?: '%'; part?: number; whole?: number;
  trend?: number[]; delta?: { now: number; before: number; vs: string };
}
export interface Subscription {
  id: number; report_code: string; report_ten: string; params: Record<string, unknown>; schedule_preset: string;
  is_enabled: boolean; next_run_at: string | null; last_run_at: string | null; last_status: string | null;
}
export type WidgetStatus = 'ok' | 'chua_co_du_lieu' | 'can_ket_noi' | 'het_han' | 'loi';
/** Một ô trên Tổng quan: báo cáo + tình trạng nguồn dữ liệu + số liệu tóm tắt. */
export interface DashboardWidget {
  code: string; ten: string; mo_ta: string | null; view_template: string; scope: Scope;
  /** Tab trên Tổng quan (null = "Báo cáo của bạn"); độ rộng khối 1..3 phần ba hàng. */
  tab: number | null; width: 1 | 2 | 3;
  source_system: string; source_ten: string; connection_state: Connection['state']; can_run_now: boolean;
  status: WidgetStatus; has_data: boolean; message?: string;
  freshness?: Freshness; total_rows?: number; tiles?: StatTile[] | null; charts?: Chart[] | null;
  chart_rows?: Record<string, unknown>[]; columns?: Column[]; rows?: Record<string, unknown>[];
}

export interface DashboardTab {
  id: number; ten: string;
  source: { code: string; ten: string; state: string; can_run_now: boolean } | null;
}
export interface DashboardData { tabs: DashboardTab[]; widgets: DashboardWidget[] }

export interface AuthProfile {
  cookies_required: Array<string | string[]>; cookies_optional?: string[]; cookie_domain?: string;
  probe: { path: string; pattern: string };
}
export interface AdminSource {
  code: string; ten: string; mo_ta: string | null; base_url: string; effective_base_url: string; enabled: boolean;
  connection_methods: AuthMethod[]; supported_methods: AuthMethod[]; managed_by: 'adapter' | 'portal';
  auth_profile: AuthProfile | null;
  auth: { cookie_groups: string[][]; cookies_optional: string[]; cookie_domain: string | null; probe_path: string } | null;
  conns: number; spiders: number; reports: number; updated_at: string;
  adapter: AdapterSummary | null; adapter_updated_at: string | null; adapter_error: string | null;
}
export interface AdapterSummary {
  id: string; version: string; allowed_endpoints: number; password_login: boolean; sso_bootstrap: boolean;
  capabilities: Array<{ id: string; ten: string; sink: string | null }>;
}

export interface Preset { code: string; label: string; next_runs: string[] }

// ---- định dạng (hệ thiết kế mục 06) ----
const TZ = 'Asia/Ho_Chi_Minh';
export const DASH = '–';
export function fmtDate(v: unknown): string {
  if (typeof v !== 'string' || !v) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(v).toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return DASH;
  const d = new Date(v);
  return `${d.toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })} ${fmtDate(v)}`;
}
export const fmtInt = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : DASH);

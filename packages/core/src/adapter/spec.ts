import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

const Method = z.enum(['GET', 'POST']);

const Request = z.object({
  method: Method,
  path: z.string().startsWith('/'),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  body_encoding: z.enum(['form', 'json']).optional(),
});

const RegexExtract = z.object({ type: z.literal('regex'), pattern: z.string(), group: z.number().int().default(1) });
// Lấy định danh phiên thẳng từ một cookie (vd eTask: userId = cookie meId). Đây VẪN là định danh của
// chính phiên đó (cookie do phiên cấp), không phải nhận từ nơi khác — hợp nguyên tắc mục 07.
const CookieExtract = z.object({ type: z.literal('cookie'), name: z.string().min(1) });
const ProbeExtract = z.union([RegexExtract, CookieExtract]);

const Step = z.object({
  id: z.string(),
  request: Request,
  // tên → JSONPath ("$.documents[*]") hoặc nhóm tên → JSONPath
  extract: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])),
});

const OutputField = z.object({
  source: z.string(),
  field: z.string(),
  type: z.enum(['string', 'int', 'date']),
  format: z.string().optional(),
  key: z.boolean().optional(),
  /** Nhãn hiển thị khi quản trị dựng báo cáo trên dữ liệu này (bảng records). */
  label: z.string().max(80).optional(),
});

/**
 * Bảng đích trong kho cho dữ liệu của một capability — khai trong adapter (cấu hình), không viết trong code.
 * Tên bảng/cột chỉ được chọn trong danh sách dưới (khớp lược đồ CSDL), nên cấu hình không thể chèn SQL.
 */
export const SINK_TABLES = {
  documents: {
    key: 'ma_van_ban',
    columns: ['trich_yeu', 'so_ky_hieu', 'so_den_di', 'ngay_nhan', 'ngay_tao', 'nguoi_tao', 'nguoi_xu_ly_id', 'trang_thai', 'loai_van_ban_id', 'node_id', 'node_ten', 'org_unit_id'],
  },
  tasks: {
    key: 'ma_cong_viec',
    columns: ['tieu_de', 'mo_ta_ngan', 'nguoi_giao', 'nguoi_thuc_hien_id', 'trang_thai', 'do_uu_tien', 'ngay_giao', 'han_hoan_thanh', 'ngay_hoan_thanh', 'org_unit_id'],
  },
  /** Bảng chung: mọi trường output_schema nằm trong cột `data` (jsonb); khoá = trường có key: true. */
  records: { key: 'record_key', columns: [] as string[] },
} as const;
export type SinkTable = keyof typeof SINK_TABLES;

const Sink = z.object({
  table: z.enum(['documents', 'tasks', 'records']),
  /** Cột lấy từ output_schema (theo `field`). Bảng records: bỏ trống = mọi trường output_schema. */
  columns: z.array(z.string()).default([]),
  /** Cột lấy từ ngữ cảnh lúc crawl (vd node_id, node_ten của thư mục; org_unit_id của người dùng). */
  extra: z.array(z.string()).default([]),
});

const Capability = z.object({
  id: z.string(),
  ten: z.string(),
  input_schema: z.array(z.object({
    name: z.string(), type: z.enum(['int', 'string']), required: z.boolean().optional(), default: z.unknown().optional(),
  })).optional(),
  steps: z.array(Step).min(1),
  output_schema: z.array(OutputField).min(1),
  content_hash_fields: z.array(z.string()).optional(),
  pagination: z.object({ strategy: z.string() }).passthrough().optional(),
  sink: Sink.optional(),
});

export const AdapterSpecSchema = z.object({
  adapter: z.object({
    id: z.string(),
    version: z.string(),
    source_system: z.string(),
    execution: z.enum(['server', 'extension']),
    transport: z.enum(['http_api', 'dom_read']),
    auth: z.object({
      type: z.literal('delegated_session'),
      vault_ref: z.string(),
      // Mỗi phần tử là một cookie bắt buộc, hoặc một danh sách tên thay thế nhau (có một trong số đó là đủ),
      // vd [bkavAuthen1, bkavAuthen] — hệ thống thật đổi tên cookie giữa các phiên bản.
      cookies_required: z.array(z.union([z.string(), z.array(z.string()).min(1)])).min(1),
      // Gửi kèm nếu trình duyệt có, nhưng thiếu cũng không sao (vd cookie phiên ASP.NET mà vài API dữ liệu cần).
      cookies_optional: z.array(z.string()).default([]),
      // Cookie phiên đặt ở tên miền cha (vd `.bkav.com` dùng chung giữa eGov, eTask, SSO). Tiện ích trình duyệt
      // phải xin quyền cả tên miền này mới đọc được cookie — Chrome lọc cookie theo tên miền của chính cookie.
      cookie_domain: z.string().regex(/^[a-z0-9.-]+$/).optional(),
      // API ở tên miền khác trang đăng nhập (vd eTask: đăng nhập etask.bkav.com, API serviceetask.bkav.com).
      // Bỏ trống ⇒ dùng base_url của hệ thống nguồn.
      api_base_url: z.string().url().optional(),
      // Header cố định gửi kèm mọi request dữ liệu; giá trị nội suy được từ cookie ({{cookie.companyId}}).
      // Chỉ cho tên/giá trị tĩnh hoặc lấy từ cookie — không nhận SQL/định danh từ ngoài.
      api_headers: z.record(z.string(), z.string()).default({}),
      session_probe: z.object({
        request: Request,
        extract: z.record(z.string(), ProbeExtract),
      }),
      // Cách lấy phiên ứng dụng từ phiên SSO: đi theo chuỗi chuyển hướng bắt đầu từ `start`.
      bootstrap: z.object({
        start: z.object({ method: z.literal('GET'), path: z.string().startsWith('/') }),
        max_redirects: z.number().int().positive().max(20).default(10),
        session_ttl_minutes: z.number().int().positive().default(480),
      }).optional(),
      // Tự đăng nhập bằng tài khoản/mật khẩu do quản trị cấu hình (auth_method = 'password').
      password_login: z.object({
        start: z.object({ method: z.literal('GET'), path: z.string().startsWith('/') }),
        form: z.object({ action: z.string(), fields: z.record(z.string(), z.string()) }),
        failure: z.object({ invalid_credentials: z.string(), otp_required: z.string() }),
        max_redirects: z.number().int().positive().max(20).default(15),
        session_ttl_minutes: z.number().int().positive().default(480),
      }).optional(),
    }).passthrough(),
    allowed_endpoints: z.array(z.object({ method: Method, path: z.string() })).min(1),
    rate_limit: z.object({
      max_requests_per_minute: z.number().int().positive(),
      delay_between_calls_ms: z.number().int().nonnegative(),
    }).passthrough(),
    capabilities: z.array(Capability).min(1),
    // Chọn người cần crawl là việc của hệ thống (queue.ts, cố định), KHÔNG nhận SQL từ cấu hình:
    // cấu hình sửa được trên cổng nên không bao giờ được chứa câu lệnh chạy bằng quyền ghi.
    scheduling: z.object({}).passthrough().optional(),
    monitoring: z.object({ schema_baseline_fields: z.array(z.string()) }).passthrough(),
  }).passthrough(),
});

export type AdapterSpec = z.infer<typeof AdapterSpecSchema>['adapter'];
export type CapabilitySpec = AdapterSpec['capabilities'][number];
export type OutputFieldSpec = CapabilitySpec['output_schema'][number];
export type RequestSpec = z.infer<typeof Request>;

export function parseSpec(yamlText: string): AdapterSpec {
  const parsed = AdapterSpecSchema.parse(parse(yamlText));
  const spec = parsed.adapter;
  // content_hash_fields phải là tập con của output_schema, nếu không hash sẽ luôn thiếu trường.
  for (const cap of spec.capabilities) {
    if (cap.sink?.table === 'records') {
      const out = new Set(cap.output_schema.map((f) => f.field));
      if (!cap.output_schema.some((f) => f.key)) throw new Error(`${spec.id}/${cap.id}: bảng records cần một trường output_schema có key: true`);
      for (const c of cap.sink.columns) if (!out.has(c)) throw new Error(`${spec.id}/${cap.id}: sink.columns có '${c}' không nằm trong output_schema`);
      for (const c of cap.sink.extra) if (!/^[a-z][a-z0-9_]{0,40}$/.test(c)) throw new Error(`${spec.id}/${cap.id}: tên trường ngữ cảnh '${c}' không hợp lệ`);
    } else if (cap.sink) {
      const t = SINK_TABLES[cap.sink.table];
      const out = new Set(cap.output_schema.map((f) => f.field));
      if (!cap.sink.columns.length) throw new Error(`${spec.id}/${cap.id}: sink.columns không được trống với bảng ${cap.sink.table}`);
      const allowed = new Set<string>(t.columns);
      if (!out.has(t.key)) throw new Error(`${spec.id}/${cap.id}: output_schema phải có trường khoá '${t.key}' cho bảng ${cap.sink.table}`);
      for (const c of [...cap.sink.columns, ...cap.sink.extra]) {
        if (!allowed.has(c)) throw new Error(`${spec.id}/${cap.id}: bảng ${cap.sink.table} không có cột '${c}' (được phép: ${t.columns.join(', ')})`);
      }
      for (const c of cap.sink.columns) {
        if (!out.has(c)) throw new Error(`${spec.id}/${cap.id}: sink.columns có '${c}' không nằm trong output_schema`);
      }
    }
    const fields = new Set(cap.output_schema.map((f) => f.field));
    for (const h of cap.content_hash_fields ?? []) {
      if (!fields.has(h)) throw new Error(`${spec.id}/${cap.id}: content_hash_fields có '${h}' không nằm trong output_schema`);
    }
  }
  return spec;
}

export function loadSpec(path: string): AdapterSpec {
  return parseSpec(readFileSync(path, 'utf8'));
}

export function capability(spec: AdapterSpec, id: string): CapabilitySpec {
  const cap = spec.capabilities.find((c) => c.id === id);
  if (!cap) throw new Error(`${spec.id}: không có capability '${id}'`);
  return cap;
}

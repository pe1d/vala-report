import { Problem } from '../errors.js';
import type { GuardedHttpClient } from './http.js';
import { evaluate } from './jsonpath.js';
import { assertNoDrift, contentHash, normalizeItem, type Row } from './normalize.js';
import { capability, type AdapterSpec, type CapabilitySpec } from './spec.js';
import { render } from './template.js';

export interface SessionInfo {
  puid: string;
  [k: string]: string;
}

/**
 * Gọi session_probe: kiểm tra phiên còn sống và lấy định danh của CHÍNH phiên đó.
 * Không lấy được ⇒ session_expired. Adapter luôn gửi đúng định danh này, không bao giờ nhận
 * định danh từ nơi khác (mục 07).
 */
export async function probeSession(spec: AdapterSpec, client: GuardedHttpClient): Promise<SessionInfo> {
  const probe = spec.auth.session_probe;
  // Gọi request để xác nhận phiên còn sống (401/redirect ⇒ client tự ném session_expired).
  const res = await client.request(probe.request);
  const out: Record<string, string> = {};
  for (const [name, ex] of Object.entries(probe.extract)) {
    let v: string | undefined;
    if (ex.type === 'cookie') {
      // Định danh nằm sẵn trong cookie phiên (vd eTask: userId = meId) — không cần dò trong phản hồi.
      v = client.cookieValue(ex.name);
    } else {
      v = new RegExp(ex.pattern).exec(res.text)?.[ex.group];
    }
    if (!v) {
      const title = /<title[^>]*>([^<]{0,120})/i.exec(res.text)?.[1]?.trim();
      throw new Problem('session_expired', 'Phiên uỷ quyền đã hết hạn',
        `session_probe không lấy được ${name} (HTTP ${res.status}${title ? `, trang "${title}"` : ''}, ${res.text.length} byte)`);
    }
    out[name] = v;
  }
  if (!out.puid) throw new Error(`${spec.id}: session_probe phải trích được puid`);
  return out as SessionInfo;
}

export interface FetchResult {
  capability: string;
  /** Nguyên văn từng bản ghi — đi vào raw_records TRƯỚC khi chuẩn hoá. */
  items: unknown[];
  /** Khoá nguồn lấy thẳng từ bản ghi thô (trường key: true), để ghi lớp thô không cần chuẩn hoá. */
  rawKeys: (string | null)[];
  meta: Record<string, unknown>;
  warnings: string[];
}

export interface CapabilityResult extends FetchResult {
  rows: Row[];
  hashes: Buffer[];
  keys: string[];
}

function applyInput(cap: CapabilitySpec, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of cap.input_schema ?? []) {
    const v = input[f.name] ?? f.default;
    if (v === undefined || v === null) {
      if (f.required) throw new Error(`${cap.id}: thiếu input bắt buộc '${f.name}'`);
      continue;
    }
    out[f.name] = f.type === 'int' ? Number(v) : String(v);
  }
  return out;
}

const drift = (detail: string) => new Problem('schema_drift', 'Hệ thống nguồn đã đổi cấu trúc dữ liệu', detail);

/** Bước 1: gọi hệ thống nguồn, trả bản ghi thô. Chỉ lỗi cấu trúc ở mức vỏ (mất cả danh sách). */
export async function fetchCapability(
  spec: AdapterSpec,
  capabilityId: string,
  client: GuardedHttpClient,
  session: SessionInfo,
  input: Record<string, unknown> = {},
): Promise<FetchResult> {
  const cap = capability(spec, capabilityId);
  const ctx: Record<string, unknown> = { session, input: applyInput(cap, input), steps: {} };
  let items: unknown[] = [];
  const meta: Record<string, unknown> = {};

  for (const step of cap.steps) {
    const req = {
      ...step.request,
      query: step.request.query ? (render(step.request.query, ctx) as Record<string, unknown>) : undefined,
      body: step.request.body ? (render(step.request.body, ctx) as Record<string, unknown>) : undefined,
    };
    const json = (await client.request(req)).json();
    const extracted: Record<string, unknown> = {};
    for (const [name, path] of Object.entries(step.extract)) {
      if (typeof path === 'string') {
        extracted[name] = evaluate(path, json);
        if (path.includes('[*]')) {
          // Gốc của danh sách biến mất ("$.documents" không còn) là lệch schema, không phải "rỗng".
          const parent = path.slice(0, path.indexOf('[*]'));
          const container = parent === '$' ? json : evaluate(parent, json);
          if (!Array.isArray(container)) throw drift(`${cap.id}: ${parent} không còn là danh sách`);
          items = extracted[name] as unknown[];
        }
      } else {
        for (const [k, p] of Object.entries(path)) meta[k] = evaluate(p, json);
      }
    }
    (ctx.steps as Record<string, unknown>)[step.id] = extracted;
  }

  const keyField = cap.output_schema.find((f) => f.key);
  const rawKeys = items.map((i) => {
    const v = keyField && i && typeof i === 'object' ? (i as Record<string, unknown>)[keyField.source] : undefined;
    return v === undefined || v === null || v === '' ? null : String(v);
  });

  const warnings: string[] = [];
  const pageSize = Number(meta.page_size);
  // Đúng bằng pageSize ⇒ có thể bị cắt; nhiều hơn ⇒ nguồn không cắt trang (xem spider.ts).
  if (cap.pagination?.strategy === 'unknown' && Number.isFinite(pageSize) && pageSize > 0 && items.length === pageSize) {
    warnings.push('pagination_unverified');
  }
  return { capability: cap.id, items, rawKeys, meta, warnings };
}

/** Bước 2: kiểm tra lệch schema, chuẩn hoá, băm. Không gọi mạng — chạy lại được từ lớp thô. */
export function normalizeCapability(spec: AdapterSpec, fetched: FetchResult): CapabilityResult {
  const cap = capability(spec, fetched.capability);
  const keyField = cap.output_schema.find((f) => f.key);
  // Baseline chỉ áp cho capability có trường khoá (bản ghi nghiệp vụ), không áp cho cây thư mục.
  if (keyField) assertNoDrift(fetched.items, spec.monitoring.schema_baseline_fields, cap.id);
  const objs = fetched.items.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object');
  const rows = objs.map((i) => normalizeItem(i, cap.output_schema));
  if (keyField && rows.some((r) => r[keyField.field] === null)) throw drift(`${cap.id}: có bản ghi thiếu khoá ${keyField.source}`);
  const hashFields = cap.content_hash_fields ?? cap.output_schema.map((f) => f.field);
  return {
    ...fetched,
    rows,
    hashes: rows.map((r) => contentHash(r, hashFields)),
    keys: keyField ? rows.map((r) => String(r[keyField.field])) : [],
  };
}

export async function runCapability(
  spec: AdapterSpec,
  capabilityId: string,
  client: GuardedHttpClient,
  session: SessionInfo,
  input: Record<string, unknown> = {},
): Promise<CapabilityResult> {
  return normalizeCapability(spec, await fetchCapability(spec, capabilityId, client, session, input));
}

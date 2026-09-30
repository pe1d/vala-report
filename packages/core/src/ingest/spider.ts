/**
 * Phía backend của một lượt chạy spider Python trong Crawlab (qua vala_sdk):
 *
 *   start    Crawlab chạy spider --preset P [--user N] → chọn người dùng đã đặt lịch P, có kết nối
 *            còn hiệu lực → tạo một crawl_run cho mỗi người → trả danh sách "target".
 *   session  cookie phiên của target. Hết hạn/`refresh` ⇒ backend tự lấy phiên mới theo cách xác
 *            thực của kết nối (tự đăng nhập bằng mật khẩu trong vault, hoặc refresh token SSO).
 *            Spider KHÔNG bao giờ nhận mật khẩu.
 *   records  bản ghi thô ⇒ lớp thô (transaction riêng) ⇒ chuẩn hoá theo adapter spec (phát hiện
 *            lệch schema) ⇒ SCD2 vào bảng đích.
 *   finish   đóng crawl_run, cập nhật lịch của người dùng.
 */
import { findSpec, loadAllSpecs, normalizeCapability, type AdapterSpec, type FetchResult } from '../adapter/index.js';
import { isPermanentLoginError, type AuthMethod, type ConnectionSessions, type SourceInfo } from '../connections.js';
import { withTenant, type Db } from '../db/index.js';
import { Problem } from '../errors.js';
import { isPreset, nextRuns } from '../presets.js';
import type { SecretStore } from '../secrets.js';
import { saveSourceAccount, sinkOf, upsertCurrent, writeRaw, type TriggerType } from './crawl.js';

export interface SpiderDeps {
  writer: Db;
  secrets: SecretStore;
  connections: ConnectionSessions;
  sourceInfo: (source: string) => Promise<SourceInfo>;
  specs?: AdapterSpec[];
}

export interface SpiderRow {
  code: string;
  ten: string;
  mo_ta?: string | null;
  source_system: string;
  entity: 'records';
  is_enabled: boolean;
  crawlab_spider_id: string | null;
  /** Mã main.py lưu trong CSDL (sửa trên cổng). NULL = chưa chép từ repo. */
  main_py?: string | null;
}

interface RunRow {
  id: number;
  app_user_id: number;
  source_system: string;
  spider_code: string;
  status: string;
}

export async function getSpider(db: Db, code: string): Promise<SpiderRow> {
  const s = await withTenant(db, (t) => t.oneOrNone<SpiderRow>('SELECT * FROM core.crawl_spiders WHERE code = $1', [code]));
  if (!s) throw new Problem('not_found', 'Không có spider này', code);
  return s;
}

function specFor(deps: SpiderDeps, source: string, capability?: string): AdapterSpec {
  const specs = deps.specs ?? loadAllSpecs();
  if (capability) return findSpec(source, capability, specs);
  const s = specs.find((x) => x.source_system === source);
  if (!s) throw new Error(`Không có adapter spec cho ${source}`);
  return s;
}

async function loadRun(db: Db, runId: number): Promise<RunRow> {
  const r = await withTenant(db, (t) => t.oneOrNone<RunRow>(
    'SELECT id, app_user_id, source_system, spider_code, status FROM crawl_runs WHERE id = $1', [runId]));
  if (!r || !r.spider_code) throw new Problem('not_found', 'Không có lượt chạy này');
  if (r.status !== 'running') throw new Problem('invalid_params', 'Lượt chạy đã kết thúc', `trạng thái ${r.status}`);
  return r;
}

async function failRun(db: Db, runId: number, code: string, detail?: string) {
  await withTenant(db, (t) => t.none(
    `UPDATE crawl_runs SET status = 'failed', finished_at = now(), error_code = $2, error_detail = $3
      WHERE id = $1 AND status = 'running'`, [runId, code, detail?.slice(0, 500) ?? null]));
}

export interface StartRequest {
  spider: string;
  preset?: string;
  userId?: number;
  crawlabTaskId?: string;
  trigger?: TriggerType;
}

export interface SpiderTarget {
  run_id: number;
  user_id: number;
  base_url: string;
}

export async function startSpiderRun(deps: SpiderDeps, req: StartRequest) {
  const spider = await getSpider(deps.writer, req.spider);
  if (!spider.is_enabled) throw new Problem('forbidden', 'Spider đang tắt', spider.code);
  if (req.preset !== undefined && !isPreset(req.preset)) throw new Problem('invalid_params', 'Preset không hợp lệ');
  const spec = specFor(deps, spider.source_system);

  // Có --user: chạy riêng một người (chạy ngay / quản trị chạy thử), chỉ cần kết nối còn hiệu lực.
  // Không có: mọi người đã đặt lịch (preset) cho báo cáo dùng spider này.
  const users = await withTenant(deps.writer, (t) => t.map(
    req.userId !== undefined
      ? `SELECT app_user_id FROM source_grants
          WHERE app_user_id = $3 AND source_system = $4 AND revoked_at IS NULL AND session_state = 'active'`
      : `SELECT DISTINCT g.app_user_id
           FROM report_subscriptions rs
           JOIN report_catalog rc ON rc.code = rs.report_code
           JOIN source_grants g ON g.app_user_id = rs.app_user_id AND g.source_system = $4
          WHERE rc.spider_code = $1 AND rs.is_enabled
            AND ($2::text IS NULL OR rs.schedule_preset = $2)
            AND g.revoked_at IS NULL AND g.session_state = 'active'
          ORDER BY g.app_user_id`,
    [spider.code, req.preset ?? null, req.userId ?? null, spider.source_system],
    (r: { app_user_id: number }) => r.app_user_id));

  const info = await deps.sourceInfo(spider.source_system);
  const targets: SpiderTarget[] = [];
  for (const userId of users) {
    const runId = await withTenant(deps.writer, (t) => t.one(
      `INSERT INTO crawl_runs (source_system, capability, adapter_version, app_user_id, crawlab_task_id, crawlab_run_id, trigger_type, spider_code)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7) RETURNING id`,
      [spider.source_system, spider.code, spec.version, userId, req.crawlabTaskId ?? null,
       req.trigger ?? (req.userId !== undefined ? 'manual' : 'schedule'), spider.code],
      (r: { id: number }) => r.id));
    targets.push({ run_id: runId, user_id: userId, base_url: info.baseUrl });
  }
  return { spider: spider.code, source_system: spider.source_system, entity: spider.entity, preset: req.preset ?? null, targets };
}

/** Cookie phiên cho target. refresh=true khi spider thấy phiên hỏng giữa chừng. */
export async function spiderSession(deps: SpiderDeps, runId: number, opts: { refresh?: boolean } = {}) {
  const run = await loadRun(deps.writer, runId);
  const grant = await withTenant(deps.writer, (t) => t.oneOrNone<{ id: number; vault_ref: string; auth_method: AuthMethod }>(
    `SELECT id, vault_ref, auth_method FROM source_grants
      WHERE app_user_id = $1 AND source_system = $2 AND revoked_at IS NULL AND session_state = 'active'`,
    [run.app_user_id, run.source_system]));
  if (!grant) {
    await failRun(deps.writer, runId, 'grant_required', 'kết nối không còn hiệu lực');
    throw new Problem('grant_required', 'Kết nối không còn hiệu lực');
  }
  const info = await deps.sourceInfo(run.source_system);

  if (!opts.refresh) {
    const cur = await deps.secrets.get(grant.vault_ref);
    if (cur && (!cur.expires_at || new Date(cur.expires_at).getTime() > Date.now() + 60_000)) {
      return { cookies: cur.cookies, base_url: info.baseUrl, expires_at: cur.expires_at ?? null, renewed: false };
    }
  }
  try {
    const s = await deps.connections.renew(run.app_user_id, run.source_system, grant.auth_method);
    await withTenant(deps.writer, (t) => t.none(
      `UPDATE source_grants SET session_expires_at = $2, last_refresh_at = now(), refresh_fail_count = 0, last_error = NULL WHERE id = $1`,
      [grant.id, s.expires_at ?? null]));
    return { cookies: s.cookies, base_url: info.baseUrl, expires_at: s.expires_at ?? null, renewed: true };
  } catch (e) {
    const expired = e instanceof Problem && e.type === 'session_expired';
    if (expired || isPermanentLoginError(e)) {
      await withTenant(deps.writer, (t) => t.none(
        `UPDATE source_grants SET session_state = $2, refresh_fail_count = refresh_fail_count + 1, last_error = $3 WHERE id = $1`,
        [grant.id, expired ? 'expired' : 'failed', (e as Problem).title]));
      await failRun(deps.writer, runId, (e as Problem).type, (e as Problem).detail ?? (e as Problem).title);
    }
    throw e;
  }
}

export async function spiderAccount(deps: SpiderDeps, runId: number, sourceUserId: string) {
  const run = await loadRun(deps.writer, runId);
  if (!/^[\w.@-]{1,100}$/.test(sourceUserId)) throw new Problem('invalid_params', 'source_user_id không hợp lệ');
  try {
    await saveSourceAccount(deps.writer, { source: run.source_system, userId: run.app_user_id }, { puid: sourceUserId });
  } catch (e) {
    await failRun(deps.writer, runId, 'forbidden', (e as Error).message);
    throw e;
  }
}

export interface RecordsRequest {
  capability: string;
  items: unknown[];
  context?: Record<string, unknown>;
  meta?: { page_size?: number };
}

export async function spiderRecords(deps: SpiderDeps, runId: number, req: RecordsRequest) {
  const run = await loadRun(deps.writer, runId);
  const job = { source: run.source_system, capability: req.capability, userId: run.app_user_id };
  const sink = sinkOf(job.source, job.capability, deps.specs);
  if (!sink) throw new Problem('invalid_params', 'Capability không có bảng đích (sink) trong cấu hình adapter', `${job.source}:${job.capability}`);
  if (!Array.isArray(req.items) || req.items.length > 5000) throw new Problem('invalid_params', 'items phải là mảng ≤ 5000 phần tử');
  const spec = specFor(deps, run.source_system, req.capability);
  const cap = spec.capabilities.find((c) => c.id === req.capability)!;
  const keyField = cap.output_schema.find((f) => f.key);
  const rawKeys = req.items.map((i) => {
    const v = keyField && i && typeof i === 'object' ? (i as Record<string, unknown>)[keyField.source] : undefined;
    return v === undefined || v === null || v === '' ? null : String(v);
  });
  const warnings: string[] = [];
  const pageSize = Number(req.meta?.page_size);
  // Đúng bằng pageSize ⇒ có thể bị cắt trang. Nhiều hơn pageSize ⇒ nguồn không cắt trang (eGov thật: pageSize=25
  // nhưng trả 31 văn bản, tham số page bị bỏ qua — kiểm chứng 28/09/2026).
  if (Number.isFinite(pageSize) && pageSize > 0 && req.items.length === pageSize) warnings.push('pagination_unverified');
  const fetched: FetchResult = { capability: req.capability, items: req.items, rawKeys, meta: req.meta ?? {}, warnings };

  await writeRaw(deps.writer, runId, job, fetched);                 // lớp thô — luôn ghi trước
  let result;
  try {
    result = normalizeCapability(spec, fetched);                    // có thể ném schema_drift
  } catch (e) {
    if (e instanceof Problem) await failRun(deps.writer, runId, e.type, e.detail ?? e.title);
    throw e;
  }
  // Chỉ nhận các trường context mà bảng đích khai báo, không để spider ghi tuỳ ý.
  const context: Record<string, unknown> = {};
  for (const k of sink.extra) if (k !== 'org_unit_id' && req.context && k in req.context) context[k] = req.context[k];
  context.org_unit_id = await withTenant(deps.writer, (t) => t.oneOrNone(
    `SELECT org_unit_id FROM user_org_units WHERE app_user_id = $1 ORDER BY is_primary DESC, org_unit_id LIMIT 1`,
    [run.app_user_id], (r: { org_unit_id: number } | null) => r?.org_unit_id ?? null));
  const changed = await upsertCurrent(deps.writer, runId, job, result, context);
  await withTenant(deps.writer, (t) => t.none(
    `UPDATE crawl_runs SET records_seen = coalesce(records_seen, 0) + $2, records_changed = coalesce(records_changed, 0) + $3,
            error_code = coalesce(error_code, $4) WHERE id = $1`,
    [runId, result.rows.length, changed, warnings[0] ?? null]));
  return { seen: result.rows.length, changed, warnings };
}

export interface FinishRequest {
  status: 'ok' | 'failed';
  error_code?: string;
  error_detail?: string;
  http_calls?: number;
}

export async function finishSpiderRun(deps: SpiderDeps, runId: number, req: FinishRequest) {
  const r = await withTenant(deps.writer, (t) => t.oneOrNone<RunRow & { records_changed: number | null; preset: string | null }>(
    `SELECT id, app_user_id, source_system, spider_code, status, records_changed FROM crawl_runs WHERE id = $1`, [runId]));
  if (!r || !r.spider_code) throw new Problem('not_found', 'Không có lượt chạy này');
  if (r.status !== 'running') return { status: r.status };   // đã đóng (vd backend đã đánh dấu lỗi) — idempotent
  const status = req.status === 'ok' ? 'ok' : 'failed';
  await withTenant(deps.writer, async (t) => {
    await t.none(
      `UPDATE crawl_runs SET status = $2, finished_at = now(), http_calls = $3,
              error_code = CASE WHEN $2 = 'failed' THEN coalesce($4, 'spider_error') ELSE error_code END,
              error_detail = CASE WHEN $2 = 'failed' THEN $5 ELSE error_detail END
        WHERE id = $1`,
      [runId, status, req.http_calls ?? null, req.error_code ?? null, req.error_detail?.slice(0, 500) ?? null]);
    if (status !== 'ok') return;
    await t.none(`UPDATE source_grants SET last_refresh_at = now(), refresh_fail_count = 0, last_error = NULL
                   WHERE app_user_id = $1 AND source_system = $2`, [r.app_user_id, r.source_system]);
    // next_run_at do bộ hẹn giờ quản lý; ở đây chỉ ghi lần chạy gần nhất (kể cả lịch một lần đã tự tắt).
    await t.none(
      `UPDATE report_subscriptions rs SET last_run_at = now() FROM report_catalog rc
        WHERE rc.code = rs.report_code AND rs.app_user_id = $1 AND rc.spider_code = $2`, [r.app_user_id, r.spider_code]);
  });
  return { status };
}

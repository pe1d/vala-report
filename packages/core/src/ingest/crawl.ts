/**
 * Một job = một người dùng × một (source, capability). Trình tự đúng theo mục 02:
 *   1. lấy phiên từ vault          → không có / hỏng: grant = expired, dừng
 *   2. session_probe → puid        → lưu user_source_accounts
 *   3. list_nodes
 *   4. mỗi node: documents_by_node
 *   5. ghi raw_records — transaction RIÊNG, luôn ghi kể cả khi bước 6 lỗi
 *   6. chuẩn hoá → content_hash
 *   7. SCD2: khác hash thì đóng bản cũ, chèn bản mới
 *   8. cập nhật crawl_runs
 */
import {
  GuardedHttpClient, fetchCapability, findSpec, loadAllSpecs, normalizeCapability, probeSession,
  type AdapterSpec, type CapabilityResult, type FetchLike, type FetchResult, type SessionInfo,
} from '../adapter/index.js';
import { pgp, withTenant, type Db, type Tx } from '../db/index.js';
import { Problem } from '../errors.js';
import type { SecretStore, SessionSecret } from '../secrets.js';
import type { SessionManager } from '../sessions.js';
import { canAutoRenew, isPermanentLoginError, type AuthMethod, type ConnectionSessions } from '../connections.js';

export type TriggerType = 'schedule' | 'manual' | 'backfill';

export interface CrawlJob {
  source: string;
  capability: string;
  userId: number;
  trigger: TriggerType;
  preset?: string;
  crawlabTaskId?: string;
  crawlabRunId?: string;
}

export interface CrawlDeps {
  writer: Db;
  secrets: SecretStore;
  specs?: AdapterSpec[];
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Ghi đè base_url theo source (dev trỏ vào mock). Mặc định lấy từ core.source_systems. */
  baseUrls?: Record<string, string>;
  /** Có ⇒ phiên ứng dụng hỏng được lấy lại từ SSO thay vì đánh dấu hết hạn ngay. */
  sessions?: SessionManager;
  /** Có ⇒ phiên hỏng được lấy lại theo cách xác thực của kết nối (password / cookie / sso). */
  connections?: ConnectionSessions;
}

export interface CrawlOutcome {
  runId: number;
  status: 'ok' | 'failed' | 'skipped';
  errorCode?: string;
  recordsSeen: number;
  recordsChanged: number;
}

interface GrantRow {
  id: number;
  vault_ref: string;
  session_state: string;
  revoked_at: Date | null;
  scope_capabilities: string[];
  auth_method: AuthMethod;
}

export async function crawlUserSource(deps: CrawlDeps, job: CrawlJob): Promise<CrawlOutcome> {
  const specs = deps.specs ?? loadAllSpecs();
  const spec = findSpec(job.source, job.capability, specs);
  const db = deps.writer;

  const runId = await withTenant(db, (t) => t.one(
    `INSERT INTO crawl_runs (source_system, capability, adapter_version, app_user_id, crawlab_task_id, crawlab_run_id, trigger_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [job.source, job.capability, spec.version, job.userId, job.crawlabTaskId ?? null, job.crawlabRunId ?? null, job.trigger],
    (r: { id: number }) => r.id,
  ));

  let seen = 0;
  let changed = 0;
  let client: GuardedHttpClient | undefined;
  let earlierCalls = 0;
  const finish = async (status: CrawlOutcome['status'], errorCode?: string, detail?: string): Promise<CrawlOutcome> => {
    await withTenant(db, (t) => t.none(
      `UPDATE crawl_runs SET status = $2, finished_at = now(), records_seen = $3, records_changed = $4,
              http_calls = $5, error_code = $6, error_detail = $7 WHERE id = $1`,
      [runId, status, seen, changed, earlierCalls + (client?.calls ?? 0), errorCode ?? null, detail ?? null],
    ));
    return { runId, status, errorCode, recordsSeen: seen, recordsChanged: changed };
  };

  // Kiểm tra lại uỷ quyền NGAY khi job bắt đầu: người dùng có thể đã thu hồi sau khi job vào hàng đợi.
  const grant = await withTenant(db, (t) => t.oneOrNone<GrantRow>(
    `SELECT id, vault_ref, session_state, revoked_at, scope_capabilities, auth_method
       FROM source_grants WHERE app_user_id = $1 AND source_system = $2`,
    [job.userId, job.source],
  ));
  if (!grant || grant.revoked_at) return finish('skipped', 'grant_required', 'không có uỷ quyền còn hiệu lực');
  if (grant.session_state !== 'active') return finish('skipped', grant.session_state === 'expired' ? 'session_expired' : 'grant_required');
  if (!grant.scope_capabilities.includes(job.capability)) return finish('skipped', 'grant_required', 'capability ngoài phạm vi đã đồng ý');

  try {
    const baseUrl = deps.baseUrls?.[job.source] ?? await withTenant(db, (t) => t.one(
      'SELECT base_url FROM core.source_systems WHERE code = $1', [job.source], (r: { base_url: string }) => r.base_url));
    // API dữ liệu có thể ở tên miền khác (adapter.auth.api_base_url); bỏ trống ⇒ dùng base_url hệ thống.
    const apiBase = spec.auth.api_base_url ?? baseUrl;
    const connect = (sec: SessionSecret) =>
      new GuardedHttpClient({ baseUrl: apiBase, cookies: sec.cookies, spec, fetchImpl: deps.fetchImpl, sleep: deps.sleep });

    // Lấy phiên mới theo cách xác thực của kết nối. connections lo cả ba cách (password/cookie/sso);
    // deps.sessions là đường tương thích cũ (chỉ SSO).
    const canRenew = canAutoRenew(grant.auth_method) && (deps.connections || (deps.sessions && grant.auth_method === 'sso'));
    const renew = async (): Promise<SessionSecret> => {
      if (deps.connections) return deps.connections.renew(job.userId, job.source, grant.auth_method);
      if (deps.sessions) return deps.sessions.deriveAppSession(job.userId, job.source);
      throw new Problem('session_expired', 'Không cấu hình cách lấy lại phiên');
    };

    let secret = await deps.secrets.get(grant.vault_ref);
    let rederived = false;
    if (!secret) {
      if (!canRenew) throw new Problem('session_missing', 'Phiên đã lưu bị mất', 'Phiên đã lưu bị mất (kho bí mật không còn phiên này) — mở hệ thống nguồn trên trình duyệt, tiện ích tự gửi lại');
      secret = await renew();
      rederived = true;
    }
    client = connect(secret);

    let session: SessionInfo;
    try {
      session = await probeSession(spec, client);
    } catch (e) {
      // Phiên ứng dụng hỏng: nếu lấy lại được thì lấy phiên mới và probe lại MỘT lần.
      if (!(e instanceof Problem && e.type === 'session_expired') || !canRenew || rederived) throw e;
      earlierCalls += client.calls;
      secret = await renew();
      rederived = true;
      client = connect(secret);
      session = await probeSession(spec, client);
    }
    if (rederived) {
      await withTenant(db, (t) => t.none(`UPDATE source_grants SET session_expires_at = $2 WHERE id = $1`,
        [grant.id, secret!.expires_at ?? null]));
    }
    await saveSourceAccount(db, job, session);

    const orgUnitId = await withTenant(db, (t) => t.oneOrNone(
      `SELECT org_unit_id FROM user_org_units WHERE app_user_id = $1 ORDER BY is_primary DESC, org_unit_id LIMIT 1`,
      [job.userId], (r: { org_unit_id: number } | null) => r?.org_unit_id ?? null));

    const warnings = new Set<string>();
    for (const input of await planInputs(spec, job.capability, client, session)) {
      const fetched = await fetchCapability(spec, job.capability, client, session, input.params);
      fetched.warnings.forEach((w) => warnings.add(w));
      await writeRaw(db, runId, job, fetched);                     // bước 5 — transaction riêng
      const result = normalizeCapability(spec, fetched);           // bước 6 — có thể ném schema_drift
      seen += result.rows.length;
      changed += await upsertCurrent(db, runId, job, result, { ...input.context, org_unit_id: orgUnitId }); // bước 7
    }

    await withTenant(db, async (t) => {
      await t.none(`UPDATE source_grants SET last_refresh_at = now(), refresh_fail_count = 0, last_error = NULL WHERE id = $1`, [grant.id]);
      await touchSubscriptions(t, job);
    });
    const warn = [...warnings];
    return finish('ok', warn[0], warn.length ? warn.join(', ') : undefined);
  } catch (e) {
    // Hết phiên thật (nguồn từ chối phiên) hoặc phiên đã lưu bị mất ⇒ đánh dấu cần gửi phiên mới (tiện ích tự gửi lại
    // khi thấy kết nối không còn "đang dùng"). last_error ghi đúng lý do để người dùng không hiểu nhầm.
    if (e instanceof Problem && (e.type === 'session_expired' || e.type === 'session_missing')) {
      const why = e.type === 'session_missing' ? 'Phiên đã lưu bị mất — cần gửi lại qua tiện ích' : `Phiên hết hạn: ${e.detail ?? e.title}`;
      await withTenant(db, (t) => t.none(
        `UPDATE source_grants SET session_state = 'expired', refresh_fail_count = refresh_fail_count + 1,
                last_error = $2 WHERE id = $1`, [grant.id, why.slice(0, 300)]));
      return finish('failed', e.type, e.detail);
    }
    // Sai mật khẩu / cần OTP: thử lại chỉ khoá tài khoản nguồn. Đánh dấu kết nối cần quản trị sửa, dừng.
    if (isPermanentLoginError(e)) {
      await withTenant(db, (t) => t.none(
        `UPDATE source_grants SET session_state = 'failed', refresh_fail_count = refresh_fail_count + 1, last_error = $2 WHERE id = $1`,
        [grant.id, e.title]));
      return finish('failed', e.type, e.detail ?? e.title);
    }
    if (e instanceof Problem) return finish('failed', e.type, e.detail ?? e.title);
    // Thông báo lỗi từ GuardedHttpClient chỉ chứa method + path, không chứa cookie hay URL đầy đủ.
    return finish('failed', 'internal', (e as Error).message.slice(0, 500));
  }
}

export async function saveSourceAccount(db: Db, job: Pick<CrawlJob, 'source' | 'userId'>, session: Pick<SessionInfo, 'puid'>): Promise<void> {
  await withTenant(db, async (t) => {
    const owner = await t.oneOrNone(
      `SELECT app_user_id FROM user_source_accounts WHERE source_system = $1 AND source_user_id = $2`,
      [job.source, session.puid], (r: { app_user_id: number } | null) => r?.app_user_id);
    // Hai người dùng cổng cùng uỷ quyền một tài khoản nguồn ⇒ dữ liệu sẽ bị gán nhầm chủ. Dừng.
    if (owner !== undefined && owner !== job.userId) {
      throw new Problem('forbidden', 'Tài khoản nguồn đã gắn với người dùng khác', `${job.source} puid đã thuộc người dùng khác`);
    }
    await t.none(
      `INSERT INTO user_source_accounts (app_user_id, source_system, source_user_id) VALUES ($1, $2, $3)
       ON CONFLICT (app_user_id, source_system) DO UPDATE SET source_user_id = EXCLUDED.source_user_id`,
      [job.userId, job.source, session.puid]);
  });
}

interface PlannedInput {
  params: Record<string, unknown>;
  context: Record<string, unknown>;
}

/** Capability cần node_id ⇒ lặp qua mọi node của list_nodes (scheduling.nodes_per_user: all). */
async function planInputs(spec: AdapterSpec, capabilityId: string, client: GuardedHttpClient, session: SessionInfo): Promise<PlannedInput[]> {
  const cap = spec.capabilities.find((c) => c.id === capabilityId)!;
  if (!cap.input_schema?.some((f) => f.name === 'node_id')) return [{ params: {}, context: {} }];
  const nodes = normalizeCapability(spec, await fetchCapability(spec, 'list_nodes', client, session));
  return nodes.rows.map((n) => ({
    params: { node_id: n.node_id, params_query: n.params_query ?? '[]' },
    context: { node_id: n.node_id, node_ten: n.node_ten },
  }));
}

const rawColumns = new pgp.helpers.ColumnSet(
  ['crawl_run_id', 'source_system', 'capability', 'owner_user_id', 'source_key', { name: 'payload', mod: ':json' }],
  { table: 'raw_records' },
);

export async function writeRaw(db: Db, runId: number, job: Pick<CrawlJob, 'source' | 'capability' | 'userId'>, fetched: FetchResult): Promise<void> {
  const rows = fetched.items
    .map((payload, i) => ({ key: fetched.rawKeys[i], payload }))
    .filter((r) => r.key !== null)
    .map((r) => ({
      crawl_run_id: runId, source_system: job.source, capability: job.capability,
      owner_user_id: job.userId, source_key: r.key, payload: r.payload,
    }));
  if (!rows.length) return;
  await withTenant(db, (t) => t.none(pgp.helpers.insert(rows, rawColumns)));
}

export interface Sink { table: 'records'; key: string; columns: string[]; extra: string[] }

/**
 * Nơi lưu của (hệ thống × capability) — đọc từ `sink` trong cấu hình adapter (CSDL). Mọi hệ thống dùng chung bảng
 * `records`: khoá là trường key: true; trường = các trường output_schema (hoặc danh sách khai trong sink).
 */
export function sinkOf(source: string, capability: string, specs = loadAllSpecs()): Sink | null {
  const spec = specs.find((x) => x.source_system === source && x.capabilities.some((c) => c.id === capability));
  const cap = spec?.capabilities.find((c) => c.id === capability);
  const s = cap?.sink;
  if (!cap || !s) return null;
  const key = cap.output_schema.find((f) => f.key)!.field;
  const columns = s.columns.length ? s.columns : cap.output_schema.map((f) => f.field).filter((f) => f !== key);
  return { table: 'records', key, columns, extra: s.extra };
}

/**
 * Ghi bản ghi đã chuẩn hoá vào kho chung `records`, có lịch sử (SCD2): bản ghi đổi nội dung (content_hash khác)
 * ⇒ đóng bản cũ (valid_to) và thêm bản mới; không đổi ⇒ không ghi gì. org_unit_id là cột riêng để RLS phạm vi
 * đơn vị lọc được; các trường còn lại nằm trong `data` (jsonb).
 */
export async function upsertCurrent(
  db: Db, runId: number, job: Pick<CrawlJob, 'source' | 'capability' | 'userId'>, result: CapabilityResult, context: Record<string, unknown>,
): Promise<number> {
  const sink = sinkOf(job.source, job.capability);
  if (!sink) throw new Error(`Adapter ${job.source}:${job.capability} chưa khai báo sink (nơi lưu)`);
  return withTenant(db, async (t: Tx) => {
    let changed = 0;
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i] as Record<string, unknown>;
      const key = result.keys[i]!;
      const hash = result.hashes[i]!;
      const data: Record<string, unknown> = { [sink.key]: key };
      for (const c of sink.columns) data[c] = row[c] ?? null;
      for (const c of sink.extra) if (c !== 'org_unit_id' && c in context) data[c] = context[c] ?? null;
      // Đóng bản cũ nếu khác hash; giữ lại first_seen_at để bản mới kế thừa.
      const closed = await t.oneOrNone(
        `UPDATE records SET valid_to = now()
          WHERE source_system = $1 AND capability = $2 AND owner_user_id = $3 AND record_key = $4 AND valid_to IS NULL AND content_hash <> $5
          RETURNING first_seen_at`,
        [job.source, job.capability, job.userId, key, hash], (r: { first_seen_at: Date } | null) => r?.first_seen_at);
      changed += await t.result(
        `INSERT INTO records (source_system, capability, record_key, owner_user_id, org_unit_id, data, content_hash, first_seen_at, last_crawl_run_id)
         SELECT $1, $2, $3, $4, $5, $6, $7, coalesce($8, now()), $9
          WHERE NOT EXISTS (SELECT 1 FROM records WHERE source_system = $1 AND capability = $2 AND owner_user_id = $4
                               AND record_key = $3 AND valid_to IS NULL AND content_hash = $7)`,
        [job.source, job.capability, key, job.userId, context.org_unit_id ?? null, JSON.stringify(data), hash, closed ?? null, runId],
        (r) => r.rowCount);
    }
    return changed;
  });
}

/**
 * Lấy dữ liệu xong ⇒ ghi "lần chạy gần nhất" cho các lịch của người này dùng cùng dữ liệu. next_run_at do bộ hẹn giờ
 * (runDueSchedules) quản lý, ở đây không đụng. Cả lịch một lần đã tự tắt cũng được ghi để người dùng thấy "đã chạy".
 */
export async function touchSubscriptions(t: Tx, job: Pick<CrawlJob, 'source' | 'capability' | 'userId'>): Promise<void> {
  await t.none(
    `UPDATE report_subscriptions rs SET last_run_at = now()
       FROM report_catalog rc
      WHERE rc.code = rs.report_code AND rs.app_user_id = $1 AND rc.source_system = $2 AND rc.capability = $3`,
    [job.userId, job.source, job.capability]);
}

/**
 * Tạo chỉ mục cho các trường khai `index: true` (output_schema hoặc sink.extra_schema) trong kho chung. Việc dựng
 * tên/biểu thức nằm trong hàm CSDL ensure_record_index (định danh đã kiểm, không nhận SQL); gọi lại nhiều lần an toàn.
 */
export async function ensureRecordIndexes(db: Db, specs = loadAllSpecs()): Promise<string[]> {
  const made: string[] = [];
  for (const spec of specs) {
    for (const cap of spec.capabilities) {
      if (!cap.sink) continue;
      const fields = [
        ...cap.output_schema.filter((f) => f.index).map((f) => ({ field: f.field, type: f.type })),
        ...cap.sink.extra_schema.filter((f) => f.index).map((f) => ({ field: f.field, type: f.type })),
      ];
      for (const f of fields) {
        made.push(await withTenant(db, (t) => t.one('SELECT ensure_record_index($1, $2, $3, $4) AS n',
          [spec.source_system, cap.id, f.field, f.type], (r: { n: string }) => r.n)));
      }
    }
  }
  return made;
}

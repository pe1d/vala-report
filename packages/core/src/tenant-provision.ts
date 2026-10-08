/**
 * Dựng đơn vị mới (Quản trị hệ thống → Đơn vị, đợt 3 — docs/superpowers/plans/2026-10-08-multi-tenant-dot3-don-vi.md).
 * Chạy ở worker bằng quyền chủ CSDL (API không tạo được schema). Quản trị hệ thống tạo đơn vị ⇒ `core.tenants` trạng thái
 * `dang_tao` + `provision` (chép cấu hình từ đơn vị nào, quản trị đầu tiên với mật khẩu đã băm) ⇒ ở đây, trong MỘT giao dịch:
 *
 *   1. schema `tenant_<mã>` từ bản nền `db/tenant-baseline.sql` (bảng, RLS, hàm, quyền — sinh từ tenant_bkav);
 *   2. ghi các migration đơn vị bản nền đã gồm, áp các migration đơn vị sau bản nền;
 *   3. chép cấu hình từ đơn vị nguồn (nếu chọn): hệ thống nguồn, adapter, spider, tab Tổng quan, báo cáo, kịch bản
 *      Desktop (+ phiên bản), ứng dụng Desktop, thương hiệu;
 *   4. cấu hình chung, đơn vị tổ chức gốc, quản trị đầu tiên (mật khẩu tạm — bắt đổi khi đăng nhập), phân vùng dữ liệu thô;
 *   5. trạng thái `hoat_dong`, xoá `provision`.
 *
 * Lỗi ⇒ giao dịch huỷ (không để lại schema dở dang), trạng thái `loi` + lý do; quản trị hệ thống bấm thử lại.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db, Tx } from './db/index.js';
import { applyTenantMigration, tenantMigrationFiles, TENANT_MIGRATIONS_DIR } from './db/migrate.js';
import { REPO_ROOT } from './env.js';
import { isTenantCode, tenantSchema } from './tenant.js';
import { forgetTenantCache } from './tenants.js';

export const BASELINE_PLACEHOLDER = '{{schema}}';
export const TENANT_BASELINE = join(REPO_ROOT, 'db/tenant-baseline.sql');

export interface ProvisionRequest {
  /** Đơn vị lấy cấu hình (hệ thống nguồn, báo cáo, kịch bản, ứng dụng Desktop…); null ⇒ đơn vị trống. */
  copy_from?: string | null;
  /** password_hash null ⇒ đơn vị chỉ đăng nhập SSO: quản trị đầu tiên vào bằng SSO (ghép theo tên đăng nhập / email). */
  admin: { username: string; ho_ten: string; email: string; password_hash: string | null };
}

/** Bảng cấu hình chép sang đơn vị mới, theo thứ tự khoá ngoại. `reset`: cột đặt lại (người sửa ở đơn vị cũ, id Crawlab). */
const COPY: Array<{ table: string; reset?: Record<string, string>; serial?: string }> = [
  { table: 'source_systems', reset: { created_by: 'NULL', adapter_updated_by: 'NULL' } },
  { table: 'adapters', serial: 'id' },
  // Spider của đơn vị khác Bkav có tên riêng trên Crawlab ⇒ đồng bộ lại (worker tự làm khi thấy crawlab_spider_id rỗng).
  { table: 'crawl_spiders', reset: { crawlab_spider_id: 'NULL', synced_at: 'NULL', updated_by: 'NULL' } },
  { table: 'dashboard_tabs', serial: 'id', reset: { updated_by: 'NULL' } },
  { table: 'report_catalog', reset: { created_by: 'NULL' } },
  { table: 'desktop_packages', reset: { updated_by: 'NULL' } },
  { table: 'desktop_package_versions', reset: { created_by: 'NULL' } },
  { table: 'desktop_apps', reset: { updated_by: 'NULL' } },
];

/** Bản nền: SQL (đã thay tên schema) + các migration đơn vị bản nền đã gồm. */
export function readBaseline(schema: string, file = TENANT_BASELINE): { sql: string; migrations: string[] } {
  if (!existsSync(file)) throw new Error(`Thiếu bản nền schema đơn vị ${file}`);
  const text = readFileSync(file, 'utf8');
  const m = /^-- tenant-migrations: (.*)$/m.exec(text);
  const migrations = m?.[1]?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
  return { sql: text.replaceAll(BASELINE_PLACEHOLDER, schema), migrations };
}

async function columnsOf(t: Tx, schema: string, table: string): Promise<string[]> {
  return t.map(`SELECT column_name FROM information_schema.columns
                 WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' ORDER BY ordinal_position`,
  [schema, table], (r: { column_name: string }) => r.column_name);
}

/** Chép các bảng cấu hình từ đơn vị `from` sang schema mới (cột chung của hai bên — bản nền có thể mới hơn nguồn). */
async function copyConfig(t: Tx, from: string, to: string): Promise<void> {
  const src = tenantSchema(from);
  for (const c of COPY) {
    const have = new Set(await columnsOf(t, src, c.table));
    const cols = (await columnsOf(t, to, c.table)).filter((x) => have.has(x));
    if (!cols.length) continue;
    const exprs = cols.map((x) => c.reset?.[x] ?? `"${x}"`);
    await t.none(`INSERT INTO $1:name.$2:name (${cols.map((x) => `"${x}"`).join(', ')}) SELECT ${exprs.join(', ')} FROM $3:name.$2:name`,
      [to, c.table, src]);
    if (c.serial) {
      await t.any(`SELECT setval(pg_get_serial_sequence($1, $2), coalesce((SELECT max($2:name) FROM $3:name.$4:name), 0) + 1, false)`,
        [`${to}.${c.table}`, c.serial, to, c.table]);
    }
  }
}

/**
 * Dựng một đơn vị đang `dang_tao`. Trả 'done' | 'skip' (không còn ở trạng thái dựng — đã dựng / tiến trình khác đang dựng);
 * lỗi ⇒ ghi `loi` + lý do rồi ném lại.
 */
export async function provisionTenant(owner: Db, ma: string, opts: { baseline?: string; migrationsDir?: string } = {}): Promise<'done' | 'skip'> {
  if (!isTenantCode(ma)) throw new Error(`Mã đơn vị không hợp lệ: ${ma}`);
  const schema = tenantSchema(ma);
  try {
    const r = await owner.tx(async (t) => {
      const row = await t.oneOrNone<{ ten: string; provision: ProvisionRequest | null }>(
        `SELECT ten, provision FROM core.tenants WHERE ma = $1 AND status = 'dang_tao' FOR UPDATE SKIP LOCKED`, [ma]);
      if (!row) return 'skip' as const;
      const req = row.provision;
      if (!req?.admin?.username) throw new Error('Thiếu thông tin quản trị đầu tiên');
      if (await t.oneOrNone('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema])) throw new Error(`Schema ${schema} đã tồn tại`);

      // 1–2. Cấu trúc + migration đơn vị.
      const base = readBaseline(schema, opts.baseline);
      await t.none('CREATE SCHEMA $1:name', [schema]);
      // Như pg_dump: không kiểm thân hàm SQL lúc tạo (hàm dùng bảng tạo sau trong bản nền, tên không ghi schema).
      await t.none('SET LOCAL check_function_bodies = false');
      await t.none(base.sql);
      await t.none('SET LOCAL check_function_bodies = true');
      for (const f of base.migrations) await t.none('INSERT INTO core.tenant_migrations (tenant, name) VALUES ($1, $2)', [ma, f]);
      const dir = opts.migrationsDir ?? TENANT_MIGRATIONS_DIR;
      for (const f of tenantMigrationFiles(dir)) if (!base.migrations.includes(f)) await applyTenantMigration(t, ma, f, dir);
      await t.any('SELECT set_config(\'search_path\', $1, true)', [`${schema}, core, public`]);

      // 3. Cấu hình chép từ đơn vị khác.
      const from = req.copy_from ?? null;
      if (from) {
        if (!isTenantCode(from) || !(await t.oneOrNone(
          `SELECT 1 FROM core.tenants t JOIN pg_namespace n ON n.nspname = 'tenant_' || t.ma WHERE t.ma = $1 AND t.status IN ('hoat_dong', 'tam_khoa')`, [from]))) {
          throw new Error(`Không chép được cấu hình: đơn vị ${from} không có hoặc chưa dựng xong`);
        }
        await copyConfig(t, from, schema);
      }

      // 4. Cấu hình chung (thương hiệu theo đơn vị nguồn), đơn vị tổ chức gốc, quản trị đầu tiên, phân vùng.
      if (from) {
        await t.none(`INSERT INTO app_settings (id, ten_ung_dung, ten_don_vi, logo, mau_chu_dao, ten_sso, desktop_open_inside)
                        SELECT 1, ten_ung_dung, $1, logo, mau_chu_dao, ten_sso, desktop_open_inside FROM $2:name.app_settings WHERE id = 1`, [row.ten, tenantSchema(from)]);
      }
      await t.none('INSERT INTO app_settings (id, ten_don_vi) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [row.ten]);
      await t.none(`INSERT INTO org_units (id, ten, parent_id, path) VALUES (1, $1, NULL, '{1}')`, [row.ten]);
      const a = req.admin;
      const uid = await t.one<{ id: number }>(
        `INSERT INTO app_users (username, ho_ten, email, is_ops_admin, password_hash, password_changed_at, must_change_password)
         VALUES ($1, $2, $3, true, $4, CASE WHEN $4::text IS NULL THEN NULL ELSE now() END, $4::text IS NOT NULL) RETURNING id`,
        [a.username, a.ho_ten, a.email, a.password_hash ?? null]);
      await t.none(`INSERT INTO user_org_units (app_user_id, org_unit_id, vai_tro, is_primary) VALUES ($1, 1, 'thanh_vien', true)`, [uid.id]);
      await t.any('SELECT ensure_raw_partitions(2)');

      // 5. Xong.
      await t.none(`UPDATE core.tenants SET status = 'hoat_dong', status_note = NULL, provision = NULL, updated_at = now() WHERE ma = $1`, [ma]);
      return 'done' as const;
    });
    if (r === 'done') forgetTenantCache();
    return r;
  } catch (e) {
    await owner.none(`UPDATE core.tenants SET status = 'loi', status_note = $2, updated_at = now() WHERE ma = $1 AND status = 'dang_tao'`,
      [ma, (e as Error).message.slice(0, 500)]);
    forgetTenantCache();
    throw e;
  }
}

/** Dựng mọi đơn vị đang chờ (worker: lúc khởi động, định kỳ, khi API báo). Lỗi của một đơn vị không chặn đơn vị khác. */
export async function provisionPendingTenants(owner: Db, onError?: (ma: string, e: Error) => void): Promise<string[]> {
  const pending = await owner.map(`SELECT ma FROM core.tenants WHERE status = 'dang_tao' ORDER BY created_at`, [], (r: { ma: string }) => r.ma);
  const done: string[] = [];
  for (const ma of pending) {
    try { if (await provisionTenant(owner, ma) === 'done') done.push(ma); } catch (e) { onError?.(ma, e as Error); }
  }
  return done;
}

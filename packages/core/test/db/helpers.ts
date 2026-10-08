import pgPromise from 'pg-promise';
import { env } from '../../src/env';
import { withDatabase } from '../../src/db/migrate';
import { forgetTenantCache } from '../../src/tenants';
import { TEST_DB } from '../../src/testing/index';

/**
 * Đơn vị thử cho test: schema tenant_<mã> chép CẤU TRÚC (không dữ liệu) các bảng cần dùng từ tenant_bkav, cấp quyền như
 * 001, thêm vào core.tenants trạng thái hoat_dong. (Tạo đơn vị đầy đủ — mọi bảng, RLS, hàm — là việc của đợt 3.)
 */
export async function makeTestTenant(ma: string, tables: string[]): Promise<void> {
  const db = pgPromise()(withDatabase(env('DATABASE_OWNER_URL'), TEST_DB));
  try {
    const schema = `tenant_${ma}`;
    await db.none('CREATE SCHEMA IF NOT EXISTS $1:name', [schema]);
    for (const tb of tables) {
      await db.none('CREATE TABLE IF NOT EXISTS $1:name.$2:name (LIKE tenant_bkav.$2:name INCLUDING ALL)', [schema, tb]);
      // Chép cả chính sách RLS của bảng (LIKE không chép).
      const rls = await db.oneOrNone<{ on: boolean }>(
        `SELECT relrowsecurity AS on FROM pg_class WHERE oid = ('tenant_bkav.' || quote_ident($1))::regclass`, [tb]);
      if (rls?.on) {
        await db.none('ALTER TABLE $1:name.$2:name ENABLE ROW LEVEL SECURITY', [schema, tb]);
        const pols = await db.any<{ policyname: string; cmd: string; qual: string | null; with_check: string | null; roles: string }>(
          `SELECT policyname, cmd, qual, with_check, array_to_string(roles, ', ') AS roles FROM pg_policies WHERE schemaname = 'tenant_bkav' AND tablename = $1`, [tb]);
        for (const p of pols) {
          await db.none(`CREATE POLICY $1:name ON $2:name.$3:name FOR ${p.cmd} TO ${p.roles}`
            + (p.qual ? ` USING (${p.qual})` : '') + (p.with_check ? ` WITH CHECK (${p.with_check})` : ''), [p.policyname, schema, tb]);
        }
      }
    }
    await db.none('GRANT USAGE ON SCHEMA $1:name TO app_reader, app_writer', [schema]);
    await db.none('GRANT SELECT ON ALL TABLES IN SCHEMA $1:name TO app_reader', [schema]);
    await db.none('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA $1:name TO app_writer', [schema]);
    await db.none('GRANT USAGE ON ALL SEQUENCES IN SCHEMA $1:name TO app_writer', [schema]);
    await db.none(`INSERT INTO core.tenants (ma, ten, status) VALUES ($1, $1, 'hoat_dong') ON CONFLICT (ma) DO NOTHING`, [ma]);
    forgetTenantCache();
  } finally {
    await db.$pool.end();
  }
}

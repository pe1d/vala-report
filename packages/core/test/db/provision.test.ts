import { afterAll, describe, expect, it } from 'vitest';
import { closeAllPools, env, hashPassword, provisionTenant, runInTenant, withCore, withTenant, writerDb, type Tx } from '../../src/index';
import { withDatabase } from '../../src/db/migrate';
import { pgp, type Db } from '../../src/db/index';
import { TEST_DB } from '../../src/testing/index';

const writer = () => writerDb();
const owner = pgp({ connectionString: withDatabase(env('DATABASE_OWNER_URL'), TEST_DB), max: 2 }) as Db;
afterAll(async () => { await closeAllPools(); });

/** Cấu trúc một schema đơn vị (bỏ phân vùng + chỉ mục động) để so: đơn vị dựng từ bản nền phải giống hệt tenant_bkav. */
async function shape(t: Tx, schema: string) {
  const cols = await t.map(`SELECT c.table_name || '.' || c.column_name || ':' || c.data_type || ':' || c.is_nullable
      || ':' || coalesce(replace(c.column_default, $1 || '.', ''), '') AS x
      FROM information_schema.columns c JOIN pg_class k ON k.relname = c.table_name
      JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = c.table_schema
     WHERE c.table_schema = $1 AND NOT k.relispartition ORDER BY 1`, [schema], (r: { x: string }) => r.x);
  const idx = await t.map(`SELECT indexname AS x FROM pg_indexes WHERE schemaname = $1 AND indexname !~ '^records_f_'
      AND indexname !~ '^raw_records_20' ORDER BY 1`, [schema], (r: { x: string }) => r.x);
  const pol = await t.map(`SELECT tablename || '.' || policyname || ':' || cmd AS x FROM pg_policies WHERE schemaname = $1 ORDER BY 1`, [schema], (r: { x: string }) => r.x);
  const fn = await t.map(`SELECT p.proname || ':' || p.prosecdef AS x FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 ORDER BY 1`, [schema], (r: { x: string }) => r.x);
  const rls = await t.map(`SELECT k.relname AS x FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace
      WHERE n.nspname = $1 AND k.relrowsecurity AND NOT k.relispartition ORDER BY 1`, [schema], (r: { x: string }) => r.x);
  const grants = await t.map(`SELECT table_name || ':' || grantee || ':' || privilege_type AS x FROM information_schema.role_table_grants
      WHERE table_schema = $1 AND grantee IN ('app_reader', 'app_writer') AND table_name !~ '^raw_records_20' ORDER BY 1`, [schema], (r: { x: string }) => r.x);
  const con = await t.map(`SELECT k.relname || '.' || c.conname || ':' || replace(pg_get_constraintdef(c.oid), $1 || '.', '') AS x
      FROM pg_constraint c JOIN pg_class k ON k.oid = c.conrelid JOIN pg_namespace n ON n.oid = k.relnamespace
     WHERE n.nspname = $1 AND NOT k.relispartition ORDER BY 1`, [schema], (r: { x: string }) => r.x);
  return { cols, idx, pol, fn, rls, grants, con };
}

async function request(ma: string, copyFrom: string | null, withPassword = true) {
  const password_hash = withPassword ? await hashPassword('Tam@2026x') : null;
  await withCore(writer(), (t) => t.none(
    `INSERT INTO tenants (ma, ten, domains, status, provision) VALUES ($1, $2, $3, 'dang_tao', $4)`,
    [ma, `Đơn vị ${ma}`, [`${ma}.vn`], { copy_from: copyFrom, admin: { username: 'qtv', ho_ten: 'Quản trị viên', email: `qtv@${ma}.vn`, password_hash } }]));
}

describe('dựng đơn vị từ bản nền', () => {
  it('cấu trúc giống tenant_bkav; chép cấu hình; quản trị đầu tiên bắt đổi mật khẩu', async () => {
    await runInTenant('bkav', () => withTenant(writer(), async (t) => {
      await t.none(`INSERT INTO source_systems (code, ten, base_url, auth_mode, created_by) VALUES ('nguon_a', 'Nguồn A', 'https://a.vn', 'password', 7)
                    ON CONFLICT DO NOTHING`);
      await t.none(`INSERT INTO desktop_apps (ma, ten, kind, url) VALUES ('trang_a', 'Trang A', 'web', 'https://a.vn') ON CONFLICT DO NOTHING`);
      await t.none(`UPDATE app_settings SET mau_chu_dao = '#123456' WHERE id = 1`);
    }));
    await request('dung', 'bkav');
    expect(await provisionTenant(owner, 'dung')).toBe('done');
    expect(await provisionTenant(owner, 'dung')).toBe('skip');

    const [a, b] = await owner.task(async (t) => [await shape(t, 'tenant_bkav'), await shape(t, 'tenant_dung')]);
    expect(b).toEqual(a);

    const st = await withCore(writer(), (t) => t.one(`SELECT status, status_note FROM tenants WHERE ma = 'dung'`));
    expect(st).toEqual({ status: 'hoat_dong', status_note: null });
    expect(await owner.one(`SELECT provision FROM core.tenants WHERE ma = 'dung'`)).toEqual({ provision: null });
    const migs = await owner.map(`SELECT name FROM core.tenant_migrations WHERE tenant = 'dung' ORDER BY name`, [], (r: { name: string }) => r.name);
    const bk = await owner.map(`SELECT name FROM core.tenant_migrations WHERE tenant = 'bkav' ORDER BY name`, [], (r: { name: string }) => r.name);
    expect(migs).toEqual(bk);

    await runInTenant('dung', () => withTenant(writer(), async (t) => {
      expect(await t.one(`SELECT ten, created_by FROM source_systems WHERE code = 'nguon_a'`)).toEqual({ ten: 'Nguồn A', created_by: null });
      expect(await t.one(`SELECT count(*)::int AS n FROM desktop_apps WHERE ma = 'trang_a'`)).toEqual({ n: 1 });
      expect(await t.one(`SELECT ten_don_vi, mau_chu_dao FROM app_settings`)).toEqual({ ten_don_vi: 'Đơn vị dung', mau_chu_dao: '#123456' });
      const u = await t.one(`SELECT username, is_ops_admin, must_change_password FROM app_users`);
      expect(u).toEqual({ username: 'qtv', is_ops_admin: true, must_change_password: true });
      // Dữ liệu người dùng không chép.
      expect(await t.one(`SELECT count(*)::int AS n FROM extension_devices`)).toEqual({ n: 0 });
      // Sequence riêng của đơn vị (không dùng chung với Bkav).
      expect(await t.one(`SELECT pg_get_serial_sequence('app_users', 'id') AS s`)).toEqual({ s: 'tenant_dung.app_users_id_seq' });
    }));
  });

  it('đơn vị trống (không chép) dựng được', async () => {
    await request('trong', null);
    expect(await provisionTenant(owner, 'trong')).toBe('done');
    await runInTenant('trong', () => withTenant(writer(), async (t) => {
      expect(await t.one(`SELECT count(*)::int AS n FROM source_systems`)).toEqual({ n: 0 });
      expect(await t.one(`SELECT ten_don_vi FROM app_settings`)).toEqual({ ten_don_vi: 'Đơn vị trong' });
    }));
  });

  it('đơn vị chỉ SSO: quản trị đầu tiên không có mật khẩu, không bị bắt đổi mật khẩu', async () => {
    await request('chisso', null, false);
    expect(await provisionTenant(owner, 'chisso')).toBe('done');
    await runInTenant('chisso', () => withTenant(writer(), async (t) => {
      expect(await t.one(`SELECT username, is_ops_admin, password_hash, must_change_password FROM app_users`))
        .toEqual({ username: 'qtv', is_ops_admin: true, password_hash: null, must_change_password: false });
    }));
  });

  it('lỗi ⇒ không để lại schema, trạng thái loi + lý do', async () => {
    await request('hong', 'khongco');
    await expect(provisionTenant(owner, 'hong')).rejects.toThrow(/khongco/);
    expect(await owner.oneOrNone(`SELECT 1 FROM pg_namespace WHERE nspname = 'tenant_hong'`)).toBeNull();
    const st = await owner.one(`SELECT status, status_note FROM core.tenants WHERE ma = 'hong'`);
    expect(st.status).toBe('loi');
    expect(st.status_note).toMatch(/khongco/);
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeAllPools, env, runInTenant, withCore, withTenant, writerDb } from '../../src/index';
import { applyTenantMigrations, withDatabase } from '../../src/db/migrate';
import { TEST_DB } from '../../src/testing/index';

const writer = () => writerDb();
afterAll(() => closeAllPools());

describe('migration 027', () => {
  it('có đơn vị bkav, tên miền bkav.com, đang hoạt động', async () => {
    const r = await withCore(writer(), (t) => t.one(`SELECT ma, domains, status FROM tenants WHERE ma = 'bkav'`));
    expect(r).toEqual({ ma: 'bkav', domains: ['bkav.com'], status: 'hoat_dong' });
    expect(await withCore(writer(), (t) => t.one(`SELECT tenant FROM tenant_domains WHERE domain = 'bkav.com'`))).toEqual({ tenant: 'bkav' });
  });
  it('bảng nguồn nằm trong schema đơn vị, không còn ở core', async () => {
    // pg_tables (không lọc theo quyền); các test khác có thể đã tạo thêm đơn vị thử ⇒ chỉ xét core và tenant_bkav.
    const rows = await withCore(writer(), (t) => t.any<{ schemaname: string }>(
      `SELECT schemaname, tablename FROM pg_tables
        WHERE tablename IN ('source_systems','adapters','crawl_tasks','crawl_spiders','spider_schedules','spider_launches')
          AND schemaname IN ('core', 'tenant_bkav')`));
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.schemaname === 'tenant_bkav')).toBe(true);
    // Truy vấn không ghi tên schema tìm thấy bảng nguồn trong ngữ cảnh bkav.
    const n = await runInTenant('bkav', () => withTenant(writer(), (t) => t.one('SELECT count(*)::int AS n FROM source_systems')));
    expect(n.n).toBeGreaterThanOrEqual(0);
  });
  it('withTenant ngoài ngữ cảnh ⇒ lỗi', async () => {
    await expect(withTenant(writer(), (t) => t.any('SELECT 1'))).rejects.toThrow(/ngữ cảnh đơn vị/);
  });
});

describe('migration loại đơn vị', () => {
  it('áp cho mọi đơn vị, ghi nhận, không áp lại', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm-'));
    writeFileSync(join(dir, '001_thu.sql'), 'CREATE TABLE thu_bang (id int);');
    const owner = withDatabase(env('DATABASE_OWNER_URL'), TEST_DB);
    const first = await applyTenantMigrations(owner, dir);
    expect(first).toContain('bkav:001_thu.sql');
    expect(first.every((x) => x.endsWith(':001_thu.sql'))).toBe(true);
    expect(await applyTenantMigrations(owner, dir)).toEqual([]);
    const r = await withCore(writer(), (t) => t.map(`SELECT schemaname FROM pg_tables WHERE tablename = 'thu_bang'`, [], (x: { schemaname: string }) => x.schemaname));
    expect(r).toContain('tenant_bkav');
    expect(r).toHaveLength(first.length);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAllPools, readerDb, runInTenant, withTenant, withUserContext, writerDb } from '../../src/index';
import { insertRecord } from '../../src/testing/index';
import { makeTestTenant } from './helpers';

/**
 * Tách dữ liệu giữa hai đơn vị: cùng một câu truy vấn (không ghi tên schema), cùng id người dùng, mỗi đơn vị chỉ thấy
 * dữ liệu của mình — qua pool ghi (withTenant) lẫn pool đọc có RLS (withUserContext).
 */
const w = () => writerDb();
const r = () => readerDb();
let bkavUser = 0;
let cachUser = 0;

async function seed(tenant: string, email: string, key: string): Promise<number> {
  return runInTenant(tenant, () => withTenant(w(), async (t) => {
    await t.none(`INSERT INTO source_systems (code, ten, base_url, auth_mode) VALUES ('nguon', 'Nguồn', 'https://n.example', 'delegated_session')
                  ON CONFLICT (code) DO NOTHING`);
    const u = await t.one<{ id: number }>(
      `INSERT INTO app_users (sso_subject, email, ho_ten, username) VALUES ($1, $1, $1, $2) RETURNING id`, [email, email.split('@')[0]]);
    await insertRecord(t, { source: 'nguon', capability: 'vb', key, owner: u.id, org: null, data: { tieu_de: key } });
    return u.id;
  }));
}

beforeAll(async () => {
  await makeTestTenant('cach', ['source_systems', 'app_users', 'records']);
  bkavUser = await seed('bkav', 'a@bkav.com', 'van-ban-bkav');
  cachUser = await seed('cach', 'a@cach.vn', 'van-ban-cach');
});
afterAll(() => closeAllPools());

describe('tách dữ liệu giữa các đơn vị', () => {
  it('pool ghi: mỗi đơn vị chỉ thấy người dùng của mình', async () => {
    const emails = (tenant: string) => runInTenant(tenant, () => withTenant(w(), (t) => t.map('SELECT email FROM app_users', [], (x: { email: string }) => x.email)));
    expect(await emails('cach')).toEqual(['a@cach.vn']);
    expect(await emails('bkav')).not.toContain('a@cach.vn');
  });
  it('pool đọc (RLS): cùng câu truy vấn, mỗi đơn vị chỉ thấy bản ghi của mình', async () => {
    const keys = (tenant: string, userId: number) => runInTenant(tenant, () => withUserContext(r(), { userId, scope: 'ca_nhan', orgUnitsAllowed: [] },
      (t) => t.map('SELECT record_key FROM records', [], (x: { record_key: string }) => x.record_key)));
    expect(await keys('bkav', bkavUser)).toEqual(['van-ban-bkav']);
    expect(await keys('cach', cachUser)).toEqual(['van-ban-cach']);
    // Id người dùng của đơn vị này đặt vào ngữ cảnh đơn vị kia không lộ dữ liệu đơn vị gốc.
    expect(await keys('bkav', cachUser)).not.toContain('van-ban-cach');
  });
});

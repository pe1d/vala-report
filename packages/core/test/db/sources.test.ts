import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAllPools, runInTenant, SourceRegistries, withTenant, writerDb } from '../../src/index';
import { loadAllSpecs } from '../../src/adapter/index';
import { makeTestTenant } from './helpers';

const w = () => writerDb();
beforeAll(async () => {
  await makeTestTenant('thu', ['source_systems']);
  await runInTenant('thu', () => withTenant(w(), (t) => t.none(
    `INSERT INTO source_systems (code, ten, base_url, auth_mode, auth_profile)
     VALUES ('rieng', 'Nguồn riêng', 'https://rieng.example', 'delegated_session',
             '{"login_url": "https://rieng.example/login", "cookies_required": ["SID"]}'::jsonb)`)));
});
afterAll(() => closeAllPools());

describe('danh mục nguồn theo đơn vị', () => {
  it('mỗi đơn vị chỉ thấy nguồn của mình; loadAllSpecs theo đơn vị hiện tại', async () => {
    const reg = new SourceRegistries(w(), { importFromRepo: false });
    await reg.reloadAll();
    reg.install();
    const thu = await runInTenant('thu', async () => ({ codes: reg.list().map((r) => r.code), errors: [...reg.errors], specs: loadAllSpecs().map((s) => s.source_system) }));
    expect(thu.codes).toEqual(['rieng']);
    const bkav = await runInTenant('bkav', async () => reg.list().map((r) => r.code));
    expect(bkav).not.toContain('rieng');
    expect(thu.specs.length + thu.errors.length).toBe(1);
  });
});

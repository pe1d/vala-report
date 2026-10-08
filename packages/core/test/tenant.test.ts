import { describe, expect, it } from 'vitest';
import { currentTenant, DEFAULT_TENANT, isTenantCode, runInTenant, setRequestTenant, tenantSchema, withTenantStore } from '../src/tenant';

describe('ngữ cảnh đơn vị', () => {
  it('runInTenant ⇒ currentTenant (kể cả sau await); ngoài ngữ cảnh ⇒ lỗi', async () => {
    expect(() => currentTenant()).toThrow(/ngữ cảnh đơn vị/);
    await runInTenant('thu', async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(currentTenant()).toBe('thu');
      await runInTenant('bkav', async () => expect(currentTenant()).toBe('bkav'));
      expect(currentTenant()).toBe('thu');
    });
  });
  it('mã hợp lệ: chữ thường + số, bắt đầu bằng chữ, 2–20 ký tự', () => {
    expect(isTenantCode('bkav')).toBe(true);
    expect(isTenantCode('nuithanh2')).toBe(true);
    for (const bad of ['', 'b', 'Bkav', '1abc', 'a-b', 'a_b', 'x'.repeat(21), "bkav'; drop", undefined, 3]) expect(isTenantCode(bad)).toBe(false);
    expect(() => runInTenant('A B', () => 1)).toThrow();
  });
  it('tenantSchema + mặc định', () => {
    expect(tenantSchema('bkav')).toBe('tenant_bkav');
    expect(DEFAULT_TENANT).toBe('bkav');
  });
  it('kho theo request: đặt mã sau khi mở kho (hook API)', async () => {
    await withTenantStore(async () => {
      expect(() => currentTenant()).toThrow();
      setRequestTenant('thu');
      await Promise.resolve();
      expect(currentTenant()).toBe('thu');
    });
    expect(() => setRequestTenant('thu')).toThrow();
  });
});

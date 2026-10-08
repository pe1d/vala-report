import { describe, expect, it } from 'vitest';
import { refToPath, vaultRef } from '../src/secrets';

describe('refToPath', () => {
  it('phiên người dùng theo đơn vị', () => {
    expect(refToPath(vaultRef('tenant_bkav', 7, 'egov'))).toBe('tenant_bkav/users/7/egov');
  });
  it('bí mật SSO của đơn vị: vault://core/tenants/<mã>/sso', () => {
    expect(refToPath('vault://core/tenants/thu/sso')).toBe('core/tenants/thu/sso');
  });
  it('đường dẫn lạ ⇒ lỗi', () => {
    for (const bad of ['vault://core/tenants/Thu/sso', 'vault://core/tenants/thu/khac', 'vault://core/x', 'vault://../users/1/a']) expect(() => refToPath(bad)).toThrow();
  });
});

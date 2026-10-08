import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT } from '@vala/core';
import { MemoryRateLimiter, type ApiDeps } from '../src/deps';
import { fillFor, parseLogin, ssoPasswordUrlOf, takeN } from '../src/login-target';

describe('parseLogin', () => {
  it('tách tài khoản / tên miền, chữ thường, bỏ khoảng trắng', () => {
    expect(parseLogin('  DiepTX@Bkav.COM ')).toEqual({ account: 'dieptx', domain: 'bkav.com' });
    expect(parseLogin('dieptx')).toEqual({ account: 'dieptx', domain: null });
  });
  it('không hợp lệ ⇒ null', () => {
    for (const bad of ['', '@bkav.com', 'a@', 'a@b@c.vn', 'a b@bkav.com', 'a@bkav', 'x'.repeat(65) + '@a.vn']) expect(parseLogin(bad)).toBeNull();
  });
});

describe('fillFor', () => {
  it('account ⇒ phần trước @; email ⇒ đầy đủ', () => {
    expect(fillFor('account', 'dieptx', 'bkav.com')).toBe('dieptx');
    expect(fillFor('email', 'dieptx', 'bkav.com')).toBe('dieptx@bkav.com');
  });
});

describe('takeN', () => {
  it('cho tối đa N lần trong một cửa sổ', async () => {
    const l = new MemoryRateLimiter();
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await takeN(l, 'k', 3, 60));
    expect(r).toEqual([true, true, true, false]);
  });
});

describe('ssoPasswordUrlOf', () => {
  const deps = (ssoPasswordUrl?: string) => ({ config: { ssoPasswordUrl } }) as unknown as ApiDeps;
  it('đơn vị mặc định ⇒ theo cấu hình máy chủ (SSO_PASSWORD_URL)', () => {
    expect(ssoPasswordUrlOf(deps('https://iam.bkav.com/doi-mat-khau'), { ma: DEFAULT_TENANT, sso: null })).toBe('https://iam.bkav.com/doi-mat-khau');
    expect(ssoPasswordUrlOf(deps(), { ma: DEFAULT_TENANT, sso: null })).toBeNull();
  });
  it('đơn vị khác ⇒ sso.password_url của đơn vị, chỉ nhận http(s)', () => {
    expect(ssoPasswordUrlOf(deps('https://x.vn'), { ma: 'abc', sso: { password_url: 'https://sso.abc.vn/pw' } } as never)).toBe('https://sso.abc.vn/pw');
    expect(ssoPasswordUrlOf(deps('https://x.vn'), { ma: 'abc', sso: { password_url: 'javascript:alert(1)' } } as never)).toBeNull();
    expect(ssoPasswordUrlOf(deps('https://x.vn'), { ma: 'abc', sso: null })).toBeNull();
  });
});

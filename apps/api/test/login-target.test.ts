import { describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../src/deps';
import { fillFor, parseLogin, takeN } from '../src/login-target';

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

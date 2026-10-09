import { describe, expect, it } from 'vitest';
import { sameSubject } from '../src/sso';

describe('sameSubject (sub WSO2 khác dạng của cùng một người)', () => {
  it('chữ hoa / thường, @carbon.super, miền kho người dùng ⇒ cùng người', () => {
    expect(sameSubject('dieptx', 'DiepTX')).toBe(true);
    expect(sameSubject('dieptx', 'dieptx@carbon.super')).toBe(true);
    expect(sameSubject('PRIMARY/dieptx', 'dieptx')).toBe(true);
  });
  it('dạng email: chỉ khi đúng email của tài khoản cổng', () => {
    expect(sameSubject('dieptx', 'DiepTX@bkav.com', 'dieptx@bkav.com')).toBe(true);
    expect(sameSubject('dieptx@bkav.com', 'dieptx', 'dieptx@bkav.com')).toBe(true);
    expect(sameSubject('dieptx', 'dieptx@bkav.com')).toBe(false);                    // không biết email tài khoản
    expect(sameSubject('dieptx', 'dieptx@khac.vn', 'dieptx@bkav.com')).toBe(false);
  });
  it('khác người ⇒ không', () => {
    expect(sameSubject('dieptx', 'dieptx2')).toBe(false);
    expect(sameSubject('3f2a1b4c-0000-4000-8000-000000000001', 'dieptx')).toBe(false);
    expect(sameSubject('3f2a1b4c-0000-4000-8000-000000000001', '3f2a1b4c-0000-4000-8000-000000000002')).toBe(false);
  });
});

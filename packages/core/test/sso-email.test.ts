import { describe, expect, it } from 'vitest';
import { emailOf } from '../src/sso';

describe('emailOf (email để ghép / tạo tài khoản)', () => {
  const o = { usernameClaim: 'preferred_username', emailDomain: 'bkav.com' };
  it('SSO có email ⇒ dùng email đó (chữ thường)', () => {
    expect(emailOf({ sub: 'x', email: ' DiepTX@Bkav.com ' }, o)).toBe('diepTX@bkav.com'.toLowerCase());
  });
  it('email chưa xác minh ⇒ không dùng email, chuyển sang ghép theo tên đăng nhập', () => {
    expect(emailOf({ sub: 'x', email: 'a@bkav.com', email_verified: false, preferred_username: 'dieptx' }, o)).toBe('dieptx@bkav.com');
  });
  it('không có email ⇒ <preferred_username>@miền', () => {
    expect(emailOf({ sub: '0b3c-uuid', preferred_username: 'DiepTX' }, o)).toBe('dieptx@bkav.com');
  });
  it('không có preferred_username ⇒ dùng sub khi sub là tên đăng nhập (bỏ @carbon.super của WSO2)', () => {
    expect(emailOf({ sub: 'dieptx@carbon.super' }, o)).toBe('dieptx@bkav.com');
    expect(emailOf({ sub: 'dieptx' }, o)).toBe('dieptx@bkav.com');
  });
  it('sub kiểu WSO2 khác: PRIMARY/tên, hoặc sub đã là email', () => {
    expect(emailOf({ sub: 'PRIMARY/dieptx' }, o)).toBe('dieptx@bkav.com');
    expect(emailOf({ sub: 'DiepTX@bkav.com@carbon.super' }, o)).toBe('dieptx@bkav.com');
  });
  it('sub là UUID (không phải tên đăng nhập) ⇒ không đoán', () => {
    expect(emailOf({ sub: '5f2b8c1e-9a7d-4e3b-8f60-1c2d3e4f5a6b' }, o)).toBeNull();
  });
  it('tên đăng nhập đã là email ⇒ dùng nguyên', () => {
    expect(emailOf({ sub: 'x', preferred_username: 'dieptx@bkav.com' }, o)).toBe('dieptx@bkav.com');
  });
  it('chưa cấu hình SSO_EMAIL_DOMAIN ⇒ không tự ghép', () => {
    expect(emailOf({ sub: 'dieptx', preferred_username: 'dieptx' }, { usernameClaim: 'preferred_username' })).toBeNull();
  });
  it('tên đăng nhập có ký tự lạ ⇒ không ghép', () => {
    expect(emailOf({ sub: 'x', preferred_username: 'a b<c>' }, o)).toBeNull();
  });
});

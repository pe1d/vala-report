import { describe, expect, it } from 'vitest';
import { isSsoButtonText, RETRY_MS, shouldAutoSso } from '../src/sso-auto-model';

describe('isSsoButtonText', () => {
  it('nhận nút đăng nhập SSO thường gặp', () => {
    for (const t of ['Đăng nhập bằng SSO', ' đăng nhập  với Bkav SSO ', 'Đăng nhập qua tài khoản SSO', 'Sign in with SSO', 'Login with SSO', 'Log in via SSO', 'SSO', 'SSO login'])
      expect(isSsoButtonText(t), t).toBe(true);
  });
  it('bỏ qua nút khác', () => {
    for (const t of ['Đăng nhập bằng tài khoản LDAP', 'Đăng nhập', 'Quên mật khẩu SSO?', 'Hướng dẫn đăng nhập SSO cho cán bộ mới', 'Đổi mật khẩu SSO', ''])
      expect(isSsoButtonText(t), t).toBe(false);
  });
});

describe('shouldAutoSso', () => {
  const base = { signedIn: true, pageHost: 'valabeta.bkav.com', ssoHosts: ['iam.bkav.com'], hasSsoSession: true, lastClick: 0, now: 10 * RETRY_MS };
  it('đủ điều kiện ⇒ bấm', () => expect(shouldAutoSso(base)).toBe(true));
  it('chưa có phiên SSO / chưa đăng nhập Desktop / đơn vị không có SSO ⇒ không', () => {
    expect(shouldAutoSso({ ...base, hasSsoSession: false })).toBe(false);
    expect(shouldAutoSso({ ...base, signedIn: false })).toBe(false);
    expect(shouldAutoSso({ ...base, ssoHosts: [] })).toBe(false);
  });
  it('trang của chính IdP ⇒ không', () => expect(shouldAutoSso({ ...base, pageHost: 'IAM.bkav.com:443' })).toBe(false));
  it('vừa bấm trên tab này ⇒ chờ', () => {
    expect(shouldAutoSso({ ...base, lastClick: base.now - 1000 })).toBe(false);
    expect(shouldAutoSso({ ...base, lastClick: base.now - RETRY_MS })).toBe(true);
  });
});

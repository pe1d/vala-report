import { describe, expect, it } from 'vitest';
import { matchesUrl, verifyPackage } from '../src/scripts-verify';

// Chữ ký mẫu do packages/core (packageSigner với khoá 32 byte toàn 0x07) tạo — cùng mẫu với packages/core/test/desktop-scripts.test.ts.
const FIXTURE = {
  publicKey: '6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=',
  signature: 'tVZC2ciQkrOV/G9/8teyyTlnO8rHfznIVy0pLNoY5Hrkb+Or6JDGEJx6w/BJ5aLjXehz3ULan9i5DH7P6KvaCA==',
  pkg: { code: 'egov_sua_giao_dien', version: 3, matches: ['https://egov.bkav.com/*'], css: '.x{display:none}', script: "vala.log('xin chào')" },
};

describe('kiểm gói kịch bản do máy chủ ký', () => {
  it('chữ ký của máy chủ hợp lệ', () => {
    expect(verifyPackage(FIXTURE.pkg, FIXTURE.signature, FIXTURE.publicKey)).toBe(true);
  });
  it('gói bị sửa trên đường / trong bộ nhớ đệm ⇒ từ chối', () => {
    expect(verifyPackage({ ...FIXTURE.pkg, script: "vala.log('khác')" }, FIXTURE.signature, FIXTURE.publicKey)).toBe(false);
    expect(verifyPackage({ ...FIXTURE.pkg, version: 4 }, FIXTURE.signature, FIXTURE.publicKey)).toBe(false);
    expect(verifyPackage({ ...FIXTURE.pkg, matches: ['https://*.com/*'] }, FIXTURE.signature, FIXTURE.publicKey)).toBe(false);
  });
  it('khoá / chữ ký hỏng ⇒ từ chối, không ném lỗi', () => {
    expect(verifyPackage(FIXTURE.pkg, 'abc', FIXTURE.publicKey)).toBe(false);
    expect(verifyPackage(FIXTURE.pkg, FIXTURE.signature, 'abc')).toBe(false);
  });
});

describe('mẫu địa chỉ (giống máy chủ)', () => {
  it('khớp đúng', () => {
    expect(matchesUrl(['https://egov.bkav.com/*'], 'https://egov.bkav.com/qlvb/a.aspx?x=1')).toBe(true);
    expect(matchesUrl(['https://egov.bkav.com/*'], 'https://egov.bkav.com.evil.com/')).toBe(false);
    expect(matchesUrl(['https://*.bkav.com/*'], 'https://etask.bkav.com/')).toBe(true);
    expect(matchesUrl(['https://*.bkav.com/*'], 'https://evilbkav.com/')).toBe(false);
    expect(matchesUrl(['https://egov.bkav.com*'], 'https://egov.bkav.com/')).toBe(false);
  });
});

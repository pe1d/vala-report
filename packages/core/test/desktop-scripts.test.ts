import { describe, expect, it } from 'vitest';
import { canonicalPackage, injectionCode, isValidMatch, keyFingerprint, matchesUrl, packageSigner, valaRuntimeSource, verifyPackage } from '../src/desktopScripts';

const pkg = { code: 'egov_sua_giao_dien', version: 3, matches: ['https://egov.bkav.com/*'], css: '.x{display:none}', script: 'vala.log(1)' };

describe('ký gói kịch bản', () => {
  const s = packageSigner({ jwtSecret: 'bí mật thử' });

  it('ký rồi kiểm được', () => {
    expect(verifyPackage(pkg, s.sign(pkg), s.publicKey)).toBe(true);
  });
  it('đổi bất kỳ trường nào ⇒ chữ ký sai', () => {
    const sig = s.sign(pkg);
    for (const p of [{ ...pkg, version: 4 }, { ...pkg, script: 'vala.log(2)' }, { ...pkg, css: '' },
      { ...pkg, matches: ['https://*/*'] }, { ...pkg, code: 'khac' }]) expect(verifyPackage(p, sig, s.publicKey)).toBe(false);
  });
  it('khoá khác ⇒ chữ ký sai', () => {
    expect(verifyPackage(pkg, s.sign(pkg), packageSigner({ jwtSecret: 'khác' }).publicKey)).toBe(false);
  });
  it('cùng bí mật ⇒ cùng khoá (khởi động lại máy chủ không đổi khoá)', () => {
    expect(packageSigner({ jwtSecret: 'bí mật thử' }).publicKey).toBe(s.publicKey);
  });
  it('SCRIPT_SIGNING_KEY được ưu tiên; sai độ dài thì báo lỗi', () => {
    const k = Buffer.alloc(32, 7).toString('base64');
    expect(packageSigner({ signingKey: k, jwtSecret: 'x' }).publicKey).toBe(packageSigner({ signingKey: k, jwtSecret: 'y' }).publicKey);
    expect(() => packageSigner({ signingKey: 'abc', jwtSecret: 'x' })).toThrow();
  });
  it('chuỗi ký cố định (bên ứng dụng kiểm theo đúng định dạng này)', () => {
    expect(canonicalPackage(pkg)).toBe('["vala-desktop-package/1","egov_sua_giao_dien",3,["https://egov.bkav.com/*"],".x{display:none}","vala.log(1)"]');
    // Cùng chữ ký mẫu với apps/desktop/test/scripts-verify.test.ts (ứng dụng kiểm bằng bản sao của hàm này).
    const fixed = packageSigner({ signingKey: Buffer.alloc(32, 7).toString('base64'), jwtSecret: 'x' });
    const p = { ...pkg, script: "vala.log('xin chào')" };
    expect(fixed.publicKey).toBe('6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=');
    expect(fixed.sign(p)).toBe('tVZC2ciQkrOV/G9/8teyyTlnO8rHfznIVy0pLNoY5Hrkb+Or6JDGEJx6w/BJ5aLjXehz3ULan9i5DH7P6KvaCA==');
    expect(keyFingerprint(s.publicKey)).toMatch(/^[0-9a-f]{4}(:[0-9a-f]{4}){3}$/);
  });
});

describe('mẫu địa chỉ trang', () => {
  it('khớp đúng host, scheme, cổng, đường dẫn', () => {
    expect(matchesUrl(['https://egov.bkav.com/*'], 'https://egov.bkav.com/qlvb/Default.aspx?id=1')).toBe(true);
    expect(matchesUrl(['https://egov.bkav.com/*'], 'http://egov.bkav.com/')).toBe(false);
    expect(matchesUrl(['https://egov.bkav.com/*'], 'https://egov.bkav.com:8443/')).toBe(false);
    expect(matchesUrl(['https://egov.bkav.com/qlvb/*'], 'https://egov.bkav.com/khac/')).toBe(false);
    expect(matchesUrl(['http://localhost:8080/*'], 'http://localhost:8080/a')).toBe(true);
  });
  it('*.miền khớp tên miền con, không khớp miền giả', () => {
    expect(matchesUrl(['https://*.bkav.com/*'], 'https://etask.bkav.com/')).toBe(true);
    expect(matchesUrl(['https://*.bkav.com/*'], 'https://bkav.com/')).toBe(true);
    expect(matchesUrl(['https://*.bkav.com/*'], 'https://evilbkav.com/')).toBe(false);
    expect(matchesUrl(['https://egov.bkav.com/*'], 'https://egov.bkav.com.evil.com/')).toBe(false);
  });
  it('mẫu không hợp lệ bị loại', () => {
    for (const p of ['https://egov.bkav.com*', 'egov.bkav.com/*', 'https://*/*', 'https://a.*.com/*', 'javascript:alert(1)', 'https://a.com'])
      expect(isValidMatch(p)).toBe(false);
    expect(isValidMatch('https://*.bkav.com/qlvb/*')).toBe(true);
  });
});

describe('mã chèn vào trang', () => {
  it('chỉ gói khớp địa chỉ; kịch bản là thân hàm async; có bộ hàm vala', () => {
    const other = { ...pkg, code: 'khac', matches: ['https://etask.bkav.com/*'] };
    const code = injectionCode([pkg, other], 'https://egov.bkav.com/a')!;
    expect(code).toContain('window.__vala.load({"code":"egov_sua_giao_dien","version":3,"css":".x{display:none}"}, async function (vala) {\nvala.log(1)\n});');
    expect(code).not.toContain('"khac"');
    expect(code.startsWith(valaRuntimeSource())).toBe(true);
    expect(injectionCode([other], 'https://egov.bkav.com/a')).toBeNull();
  });
});

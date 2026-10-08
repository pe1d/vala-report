import { describe, expect, it } from 'vitest';
import { cleanLayout, domainOf, normalizeDomains } from '../src/routes/desktopApps';

describe('cleanLayout', () => {
  it('giữ đúng thứ tự người dùng, bỏ mã không còn / trùng / sai kiểu', () => {
    expect(cleanLayout(['b', 'x', 'a', 'b', 3], ['a', 'b', 'c'])).toEqual(['b', 'a']);
    expect(cleanLayout(null, ['a'])).toEqual([]);
  });
});

describe('domainOf (liên kết mở trong Desktop)', () => {
  it('chuẩn hoá: bỏ giao thức, đường dẫn, cổng, "*.", chữ hoa', () => {
    expect(domainOf('https://*.Bkav.com:8443/abc?x=1')).toBe('bkav.com');
    expect(domainOf(' egov.hanoi.gov.vn ')).toBe('egov.hanoi.gov.vn');
    expect(domainOf('*.gov.vn')).toBe('gov.vn');
  });
  it('không hợp lệ ⇒ null', () => {
    for (const bad of ['', 'abc', 'a b.vn', 'javascript:alert(1)', '-x.vn']) expect(domainOf(bad)).toBeNull();
  });
  it('bỏ trùng, bỏ mục sai', () => expect(normalizeDomains(['bkav.com', 'https://bkav.com/', 'x', 'gov.vn'])).toEqual(['bkav.com', 'gov.vn']));
});

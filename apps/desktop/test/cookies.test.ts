import { describe, expect, it } from 'vitest';
import { matchesSessionDomain, missingGroups, parseDocumentCookie, pickSessionCookies, type Source } from '../src/cookies';

const egov: Source = {
  code: 'egov', ten: 'eGov', origin: 'https://egov.bkav.com', login_url: 'https://egov.bkav.com/',
  cookie_names: ['bkavAuthen1', 'bkavAuthen', 'ASP.NET_SessionId'],
  cookie_groups: [['bkavAuthen1', 'bkavAuthen']],
  cookie_domain: 'bkav.com',
};

describe('matchesSessionDomain', () => {
  it('khớp đúng domain', () => expect(matchesSessionDomain('bkav.com', 'bkav.com')).toBe(true));
  it('khớp tên miền con', () => expect(matchesSessionDomain('bkav.com', 'egov.bkav.com')).toBe(true));
  it('khớp cookie đặt ở tên miền cha (.bkav.com)', () => expect(matchesSessionDomain('egov.bkav.com', '.bkav.com')).toBe(true));
  it('không khớp domain khác', () => expect(matchesSessionDomain('bkav.com', 'example.com')).toBe(false));
  it('không khớp domain chỉ trùng đuôi chữ', () => expect(matchesSessionDomain('bkav.com', 'notbkav.com')).toBe(false));
});

describe('pickSessionCookies', () => {
  it('chỉ giữ cookie phiên adapter khai, trong cây tên miền, ưu tiên Path ngắn', () => {
    const r = pickSessionCookies(egov, [
      { name: 'bkavAuthen1', value: 'deep', domain: 'egov.bkav.com', path: '/a/b', session: true },
      { name: 'bkavAuthen1', value: 'root', domain: '.bkav.com', path: '/', session: false, expirationDate: 1900000000.7 },
      { name: 'tracking', value: 'x', domain: '.bkav.com', path: '/', session: true },
      { name: 'ASP.NET_SessionId', value: 'other', domain: 'example.com', path: '/', session: true },
    ]);
    expect(r.cookies).toEqual({ bkavAuthen1: 'root' });
    expect(r.expires).toEqual({ bkavAuthen1: 1900000000 });
  });
});

describe('missingGroups', () => {
  it('nhóm thay thế: có một tên là đủ', () => {
    expect(missingGroups(egov, { bkavAuthen: 'v' })).toEqual([]);
    expect(missingGroups(egov, {})).toEqual(['bkavAuthen1|bkavAuthen']);
  });
  it('không khai nhóm ⇒ mỗi cookie_names là một nhóm', () => {
    const s: Source = { ...egov, cookie_groups: undefined, cookie_names: ['a', 'b'] };
    expect(missingGroups(s, { a: '1' })).toEqual(['b']);
  });
});

describe('parseDocumentCookie', () => {
  it('chỉ lấy đúng tên cần, giữ nguyên giá trị có dấu =', () => {
    expect(parseDocumentCookie('meId=12; companyId=a=b; other=z', ['meId', 'companyId']))
      .toEqual({ meId: '12', companyId: 'a=b' });
  });
  it('chuỗi rỗng ⇒ rỗng', () => expect(parseDocumentCookie('', ['meId'])).toEqual({}));
});

import { describe, expect, it } from 'vitest';
import { checkedClaims, decodeJwtPayload, looksLikeJwt } from '../src/jwt-claims';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: unknown) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.chu-ky`;
const NOW = 1_800_000_000;
const ISS = 'https://iam.bkav.com/oauth2/token';
const CID = 'client-vala-reporting';

describe('decodeJwtPayload', () => {
  it('giải mã phần nội dung (base64url, có dấu tiếng Việt)', () => {
    expect(decodeJwtPayload(jwt({ sub: 'u1', name: 'Tăng Xuân Điệp' }))).toEqual({ sub: 'u1', name: 'Tăng Xuân Điệp' });
  });
  it('không phải JWT ⇒ null', () => {
    expect(decodeJwtPayload('{"sub":"u1"}')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });
  it('looksLikeJwt', () => {
    expect(looksLikeJwt(` ${jwt({ sub: 'x' })}\n`)).toBe(true);
    expect(looksLikeJwt('{"sub":"x"}')).toBe(false);
  });
});

describe('checkedClaims (id_token / userinfo dạng JWT)', () => {
  const ok = { sub: 'u1', iss: ISS, aud: CID, exp: NOW + 600, email: 'a@bkav.com' };
  it('đúng iss, aud, còn hạn ⇒ nhận', () => {
    expect(checkedClaims(ok, { issuer: ISS, clientId: CID, now: NOW })).toMatchObject({ sub: 'u1', email: 'a@bkav.com' });
  });
  it('aud dạng mảng có client ⇒ nhận', () => {
    expect(checkedClaims({ ...ok, aud: ['khac', CID] }, { issuer: ISS, clientId: CID, now: NOW })).not.toBeNull();
  });
  it('cấp cho client khác ⇒ từ chối', () => {
    expect(checkedClaims({ ...ok, aud: 'client-khac' }, { issuer: ISS, clientId: CID, now: NOW })).toBeNull();
  });
  it('SSO khác phát ⇒ từ chối', () => {
    expect(checkedClaims({ ...ok, iss: 'https://sso-gia.example' }, { issuer: ISS, clientId: CID, now: NOW })).toBeNull();
  });
  it('hết hạn (quá 2 phút lệch giờ) ⇒ từ chối', () => {
    expect(checkedClaims({ ...ok, exp: NOW - 300 }, { issuer: ISS, clientId: CID, now: NOW })).toBeNull();
    expect(checkedClaims({ ...ok, exp: NOW - 60 }, { issuer: ISS, clientId: CID, now: NOW })).not.toBeNull();
  });
  it('userinfo JWT không có aud/iss/exp (không bắt buộc) ⇒ nhận', () => {
    expect(checkedClaims({ sub: 'u1', email: 'a@bkav.com' }, { issuer: ISS, clientId: CID, now: NOW, requireAud: false })).not.toBeNull();
  });
  it('id_token bắt buộc có aud', () => {
    expect(checkedClaims({ sub: 'u1', iss: ISS, exp: NOW + 60 }, { issuer: ISS, clientId: CID, now: NOW, requireAud: true })).toBeNull();
  });
  it('thiếu sub ⇒ từ chối', () => {
    expect(checkedClaims({ iss: ISS, aud: CID, exp: NOW + 60 }, { issuer: ISS, clientId: CID, now: NOW })).toBeNull();
  });
});

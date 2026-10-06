import { describe, expect, it } from 'vitest';
import { SsoClient, type SsoConfig } from '../src/sso';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: unknown) => `${b64({ alg: 'RS256' })}.${b64(payload)}.sig`;
const ISS = 'https://iam.bkav.com/oauth2/token';
const CID = 'client-vala';
const exp = Math.floor(Date.now() / 1000) + 600;

const cfg: SsoConfig = {
  origin: 'https://iam.bkav.com', authorizeUrl: 'https://iam.bkav.com/oauth2/authorize', tokenUrl: 'https://iam.bkav.com/oauth2/token',
  userinfoUrl: 'https://iam.bkav.com/oauth2/userinfo', revokeUrl: '', clientId: CID, clientSecret: 's', loginScope: 'openid profile email',
  grantScope: 'openid offline_access', pinned: [], matchBy: ['email', 'username'], pkce: true, usernameClaim: 'preferred_username',
  autoCreate: true, ready: true,
};
const client = (status: number, body: string, type: string) =>
  new SsoClient(cfg, async () => new Response(body, { status, headers: { 'content-type': type } }));
const idToken = jwt({ sub: 'u1', iss: ISS, aud: CID, exp, email: 'tu-id-token@bkav.com', name: 'Từ id_token' });

describe('SsoClient.userinfo', () => {
  it('userinfo dạng JWT (Bkav SSO) ⇒ đọc claim', async () => {
    const u = await client(200, jwt({ sub: 'u1', email: 'dieptx@bkav.com', preferred_username: 'dieptx' }), 'application/jwt').userinfo('at');
    expect(u).toMatchObject({ sub: 'u1', email: 'dieptx@bkav.com', preferred_username: 'dieptx' });
  });
  it('userinfo JWT nhưng content-type là text ⇒ vẫn nhận ra', async () => {
    const u = await client(200, jwt({ sub: 'u1', email: 'a@bkav.com' }), 'text/plain').userinfo('at');
    expect(u.email).toBe('a@bkav.com');
  });
  it('userinfo JSON thường ⇒ như trước', async () => {
    expect((await client(200, JSON.stringify({ sub: 'u1', email: 'a@bkav.com' }), 'application/json').userinfo('at')).email).toBe('a@bkav.com');
  });
  it('userinfo lỗi ⇒ dùng id_token', async () => {
    expect(await client(401, '', 'text/plain').userinfo('at', idToken)).toMatchObject({ sub: 'u1', email: 'tu-id-token@bkav.com' });
  });
  it('userinfo đè lên id_token (cùng người)', async () => {
    const u = await client(200, jwt({ sub: 'u1', email: 'moi@bkav.com' }), 'application/jwt').userinfo('at', idToken);
    expect(u).toMatchObject({ sub: 'u1', email: 'moi@bkav.com', name: 'Từ id_token' });
  });
  it('hai nguồn khác người ⇒ từ chối', async () => {
    await expect(client(200, jwt({ sub: 'u2' }), 'application/jwt').userinfo('at', idToken)).rejects.toThrow();
  });
  it('userinfo JWT cấp cho client khác, không có id_token ⇒ từ chối', async () => {
    await expect(client(200, jwt({ sub: 'u1', aud: 'client-khac' }), 'application/jwt').userinfo('at')).rejects.toThrow();
  });
  it('id_token ghi iss có :443 (WSO2) ⇒ vẫn lấy được email', async () => {
    const id443 = jwt({ sub: 'u1', iss: 'https://iam.bkav.com:443/oauth2/token', aud: CID, exp, email: 'dieptx@bkav.com' });
    expect((await client(200, jwt({ sub: 'u1' }), 'application/jwt').userinfo('at', id443)).email).toBe('dieptx@bkav.com');
  });
  it('email chỉ có trong access token (JWT của WSO2) ⇒ vẫn lấy được', async () => {
    const at = jwt({ sub: 'u1', iss: ISS, aud: CID, exp, email: 'tu-access-token@bkav.com' });
    expect((await client(200, jwt({ sub: 'u1' }), 'application/jwt').userinfo(at)).email).toBe('tu-access-token@bkav.com');
  });
  it('access token của người khác ⇒ từ chối', async () => {
    const at = jwt({ sub: 'u9', iss: ISS, aud: CID, exp, email: 'x@bkav.com' });
    await expect(client(200, jwt({ sub: 'u1' }), 'application/jwt').userinfo(at)).rejects.toThrow();
  });
  it('báo nguồn nào dùng được / bị loại vì sao (không kèm giá trị)', async () => {
    let diag: Record<string, string> = {};
    const badId = jwt({ sub: 'u1', iss: ISS, aud: 'khac', exp, email: 'x@bkav.com' });
    await client(200, jwt({ sub: 'u1', email: 'a@bkav.com' }), 'application/jwt').userinfo('khong-phai-jwt', badId, (d) => { diag = d; });
    expect(diag).toMatchObject({ id_token: 'loại: aud', userinfo: 'jwt', access_token: 'không phải JWT' });
  });
  it('id_token cấp cho client khác ⇒ không dùng', async () => {
    const bad = jwt({ sub: 'u1', iss: ISS, aud: 'client-khac', exp });
    await expect(client(401, '', 'text/plain').userinfo('at', bad)).rejects.toThrow();
  });
});

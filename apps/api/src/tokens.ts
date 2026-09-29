import { createHmac, timingSafeEqual } from 'node:crypto';

/** Token ký HMAC-SHA256 dạng JWT (HS256). Dùng cho phiên dev và cho `state` của luồng uỷ quyền. */
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function sign(payload: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = b64(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verify<T extends Record<string, unknown>>(token: string, secret: string): T | null {
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) return null;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

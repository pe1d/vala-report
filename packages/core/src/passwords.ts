/**
 * Mật khẩu đăng nhập CỔNG (không phải mật khẩu hệ thống nguồn — cái đó nằm trong vault, xem connections.ts).
 * scrypt của Node, định dạng: scrypt$N$r$p$saltBase64$hashBase64.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 16384, R = 8, P = 1, KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split('$');
  if (!parts || parts.length !== 6 || parts[0] !== 'scrypt') {
    // Vẫn tốn thời gian như lần kiểm tra thật, để không lộ tài khoản nào tồn tại qua thời gian phản hồi.
    await scrypt(password, randomBytes(16), N, R, P);
    return false;
  }
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, 'base64');
  const got = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Chính sách tối thiểu: ≥ 8 ký tự, có chữ và số. Trả lý do nếu không đạt. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự';
  if (!/[A-Za-zÀ-ỹ]/.test(pw) || !/\d/.test(pw)) return 'Mật khẩu cần có cả chữ và số';
  return null;
}

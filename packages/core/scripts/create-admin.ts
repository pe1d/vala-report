/**
 * Tạo (hoặc đặt lại) tài khoản QUẢN TRỊ đăng nhập bằng mật khẩu — dùng khi cài mới trên máy chủ.
 *   tsx scripts/create-admin.ts --username admin --name "Quản trị" --email admin@bkav.com
 * Mật khẩu tạm được sinh ngẫu nhiên và in ra MỘT lần; lần đăng nhập đầu phải đổi (must_change_password).
 * Tài khoản đã có ⇒ giữ nguyên, cấp quyền quản trị, bật lại và đặt mật khẩu tạm mới.
 */
import { randomBytes } from 'node:crypto';
import pgPromise from 'pg-promise';
import { env, TENANT } from '../src/env.js';
import { hashPassword } from '../src/passwords.js';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const username = (arg('username') ?? 'admin').trim().toLowerCase();
const name = arg('name') ?? 'Quản trị hệ thống';
const email = (arg('email') ?? `${username}@local`).trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) throw new Error('username chỉ gồm chữ thường, số, . _ - (3–40 ký tự)');

// Mật khẩu tạm: 14 ký tự, bỏ ký tự dễ nhầm, luôn có chữ và số.
const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bytes = randomBytes(14);
let password = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
if (!/\d/.test(password)) password = `${password.slice(0, 13)}7`;
if (!/[a-zA-Z]/.test(password)) password = `k${password.slice(1)}`;

const db = pgPromise()(env('DATABASE_OWNER_URL'));
const hash = await hashPassword(password);
const cur = await db.oneOrNone<{ id: number }>(
  `SELECT id FROM ${TENANT}.app_users WHERE lower(username) = $1 OR lower(email) = $2 ORDER BY (lower(username) = $1) DESC LIMIT 1`,
  [username, email]);
const r = cur
  ? await db.one<{ id: number; created: boolean }>(
    `UPDATE ${TENANT}.app_users SET username = $2, is_ops_admin = true, is_active = true, password_hash = $3,
            password_changed_at = now(), must_change_password = true, failed_logins = 0, locked_until = NULL
      WHERE id = $1 RETURNING id, false AS created`, [cur.id, username, hash])
  : await db.one<{ id: number; created: boolean }>(
    `INSERT INTO ${TENANT}.app_users (username, ho_ten, email, is_ops_admin, is_active, password_hash, password_changed_at, must_change_password)
     VALUES ($1, $2, $3, true, true, $4, now(), true) RETURNING id, true AS created`, [username, name, email, hash]);
await db.$pool.end();
console.log(`${r.created ? 'Đã tạo' : 'Đã đặt lại'} tài khoản quản trị #${r.id}`);
console.log(`  Tên đăng nhập : ${username}`);
console.log(`  Mật khẩu tạm  : ${password}`);
console.log('  (Lần đăng nhập đầu phải đổi mật khẩu. Mật khẩu này không được lưu ở đâu khác — chép lại ngay.)');

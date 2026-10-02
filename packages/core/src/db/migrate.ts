import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pgPromise from 'pg-promise';
import { REPO_ROOT, TENANT } from '../env.js';
import { hashPassword } from '../passwords.js';

const pgp = pgPromise();

export interface MigrateOptions {
  ownerUrl: string;
  readerUrl: string;
  writerUrl: string;
  seed?: boolean;
  log?: (msg: string) => void;
}

/** Chạy các file db/migrations/NNN_*.sql chưa áp dụng, mỗi file một transaction. */
export async function migrate(opts: MigrateOptions): Promise<string[]> {
  const log = opts.log ?? (() => {});
  const db = pgp({ connectionString: opts.ownerUrl, max: 1 });
  const applied: string[] = [];
  try {
    await db.none(`CREATE SCHEMA IF NOT EXISTS core;
      CREATE TABLE IF NOT EXISTS core.schema_migrations (
        name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await db.any<{ name: string }>('SELECT name FROM core.schema_migrations')).map((r) => r.name));
    const dir = join(REPO_ROOT, 'db/migrations');
    const files = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(join(dir, f), 'utf8');
      await db.tx(async (t) => {
        await t.none(sql);
        await t.none('RESET search_path');
        await t.none('INSERT INTO core.schema_migrations(name) VALUES ($1)', [f]);
      });
      applied.push(f);
      log(`đã áp dụng ${f}`);
    }
    await ensureLoginRoles(db, opts.readerUrl, opts.writerUrl);
    if (opts.seed) {
      await db.none(readFileSync(join(REPO_ROOT, 'db/seed/dev.sql'), 'utf8'));
      // Tên đăng nhập = phần trước @ của email; một mật khẩu chung cho mọi tài khoản mẫu.
      const pw = await hashPassword(process.env.DEV_SEED_PASSWORD ?? 'Vala@2026');
      await db.none(
        `UPDATE $2:name.app_users SET username = split_part(email, '@', 1), password_hash = $1, password_changed_at = now()
          WHERE password_hash IS NULL`, [pw, TENANT]);
      log('đã nạp dữ liệu mẫu');
    }
  } finally {
    await db.$pool.end();
  }
  return applied;
}

/**
 * Vai trò đăng nhập cho hai pool. Lưu ý: thuộc tính BYPASSRLS KHÔNG được thừa kế qua
 * membership — nên vala_writer phải tự mang BYPASSRLS, còn vala_reader phải NOBYPASSRLS.
 */
async function ensureLoginRoles(db: pgPromise.IDatabase<unknown>, readerUrl: string, writerUrl: string) {
  const reader = new URL(readerUrl);
  const writer = new URL(writerUrl);
  const roles = [
    { name: decodeURIComponent(reader.username), pass: decodeURIComponent(reader.password), group: 'app_reader', bypass: false },
    { name: decodeURIComponent(writer.username), pass: decodeURIComponent(writer.password), group: 'app_writer', bypass: true },
  ];
  for (const r of roles) {
    const exists = await db.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname = $1', [r.name]);
    const attrs = `LOGIN ${r.bypass ? 'BYPASSRLS' : 'NOBYPASSRLS'} NOSUPERUSER PASSWORD $2`;
    await db.none(exists ? `ALTER ROLE $1:name ${attrs}` : `CREATE ROLE $1:name ${attrs}`, [r.name, r.pass]);
    await db.none(`GRANT $1:name TO $2:name`, [r.group, r.name]);
    await db.none(`ALTER ROLE $1:name SET search_path = $2:name, core, public`, [r.name, TENANT]);
  }
}

/** Chỉ dùng cho test: xoá và tạo lại một database trống. */
export async function recreateDatabase(ownerUrl: string, dbName: string): Promise<string> {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error('tên database không hợp lệ');
  const admin = new URL(ownerUrl);
  admin.pathname = '/postgres';
  const db = pgp({ connectionString: admin.toString(), max: 1 });
  try {
    await db.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [dbName]);
    await db.none('CREATE DATABASE $1:name', [dbName]);
  } finally {
    await db.$pool.end();
  }
  const u = new URL(ownerUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

export function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

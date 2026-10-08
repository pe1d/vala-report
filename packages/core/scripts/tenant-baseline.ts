/**
 * Sinh bản nền schema đơn vị `db/tenant-baseline.sql` từ `tenant_bkav` (cấu trúc, không dữ liệu): dựng đơn vị mới
 * (tenant-provision.ts) chạy file này rồi áp các migration đơn vị sau bản nền. Chạy lại khi muốn gộp các migration đơn vị
 * mới vào bản nền (không bắt buộc). Cần `pg_dump` cùng phiên bản lớn với máy chủ CSDL.
 *
 *   pnpm --filter @vala/core tenant-baseline
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pgPromise from 'pg-promise';
import { REPO_ROOT, env } from '../src/env.js';
import { BASELINE_PLACEHOLDER, tenantSchema } from '../src/index.js';

const SOURCE = 'bkav';
const schema = tenantSchema(SOURCE);
const url = env('DATABASE_OWNER_URL');

const dump = execFileSync('pg_dump', [
  '--schema-only', '--no-owner', `--schema=${schema}`,
  // Phân vùng theo tháng của raw_records: hàm ensure_raw_partitions tự tạo.
  `--exclude-table=${schema}.raw_records_2*`,
  url,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Mỗi đối tượng trong bản dump mở đầu bằng khối chú thích "-- Name: …; Type: …; Schema: …".
const blocks = dump.split(/\n(?=--\n-- (?:Name|Data for Name): )/);
const kept: string[] = [];
for (const b of blocks.slice(1)) {
  const head = /^--\n-- Name: ([^;]+); Type: ([^;]+);/.exec(b);
  if (!head) continue;
  const [, name, type] = head;
  if (type === 'SCHEMA') continue;                                           // dựng đơn vị tự tạo schema
  if (type === 'INDEX' && name!.startsWith('records_f_')) continue;          // chỉ mục động theo cấu hình adapter
  const body = b.replace(/^--\n-- .*\n--\n/, '').replace(/^\\(un)?restrict .*$/gm, '').trim();
  if (body) kept.push(`-- ${type} ${name}\n${body}`);
}

const db = pgPromise()(url);
const done = (await db.any<{ name: string }>('SELECT name FROM core.tenant_migrations WHERE tenant = $1 ORDER BY name', [SOURCE])).map((r) => r.name);
await db.$pool.end();

const header = [
  '-- Bản nền schema đơn vị — SINH TỰ ĐỘNG (packages/core/scripts/tenant-baseline.ts), không sửa tay.',
  `-- tenant-migrations: ${done.join(', ')}`,
  '',
].join('\n');
const out = header + kept.join('\n\n').replaceAll(schema, BASELINE_PLACEHOLDER) + '\n';
const file = join(REPO_ROOT, 'db/tenant-baseline.sql');
writeFileSync(file, out);
console.log(`${file}: ${kept.length} đối tượng; gồm migration đơn vị: ${done.join(', ') || '(không)'}`);

import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { migrate, recreateDatabase, withDatabase } from '../db/migrate.js';
import type { Tx } from '../db/index.js';

export const TEST_DB = 'vala_test';

/** Tạo lại database test từ đầu: migration + dữ liệu mẫu. Gọi từ vitest globalSetup. */
export async function prepareTestDatabase(): Promise<{ readerUrl: string; writerUrl: string }> {
  const ownerUrl = await recreateDatabase(env('DATABASE_OWNER_URL'), TEST_DB);
  const readerUrl = withDatabase(env('DATABASE_READER_URL'), TEST_DB);
  const writerUrl = withDatabase(env('DATABASE_WRITER_URL'), TEST_DB);
  await migrate({ ownerUrl, readerUrl, writerUrl, seed: true });
  return { readerUrl, writerUrl };
}

export function testUrls() {
  return {
    readerUrl: withDatabase(env('DATABASE_READER_URL'), TEST_DB),
    writerUrl: withDatabase(env('DATABASE_WRITER_URL'), TEST_DB),
  };
}

/** Chèn một bản ghi hiện hành vào kho chung trực tiếp (bỏ qua adapter) — chỉ để test phân quyền (RLS). */
export async function insertRecord(
  t: Tx,
  r: { source: string; capability: string; key: string; owner: number; org: number | null; data?: Record<string, unknown> },
) {
  await t.none(
    `INSERT INTO records (source_system, capability, record_key, owner_user_id, org_unit_id, data, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [r.source, r.capability, r.key, r.owner, r.org, JSON.stringify(r.data ?? {}), createHash('sha256').update(r.key).digest()],
  );
}

// eGov/eTask/SSO giả lập (fakes) đã gỡ bỏ cùng bộ test cũ. Tiện ích chuẩn bị CSDL test ở trên
// được giữ lại để dựng bộ test mới (không phụ thuộc hệ thống nguồn cụ thể) khi cần.

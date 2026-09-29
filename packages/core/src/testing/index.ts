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

/** Chèn một văn bản hiện hành trực tiếp (bỏ qua adapter) — chỉ để test phân quyền. */
export async function insertDocument(
  t: Tx,
  d: { ma: string; owner: number; org: number | null; node?: number; ngay_nhan?: string; trich_yeu?: string },
) {
  await t.none(
    `INSERT INTO documents (ma_van_ban, owner_user_id, org_unit_id, node_id, node_ten, trich_yeu, ngay_nhan, content_hash)
     VALUES ($1, $2, $3, $4, 'Văn bản mới kết thúc', $5, $6, $7)`,
    [d.ma, d.owner, d.org, d.node ?? 32, d.trich_yeu ?? `Văn bản ${d.ma}`, d.ngay_nhan ?? '2026-09-10',
     createHash('sha256').update(d.ma).digest()],
  );
}

// eGov/eTask/SSO giả lập (fakes) đã gỡ bỏ cùng bộ test cũ. Tiện ích chuẩn bị CSDL test ở trên
// được giữ lại để dựng bộ test mới (không phụ thuộc hệ thống nguồn cụ thể) khi cần.

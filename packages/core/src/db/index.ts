import pgPromise from 'pg-promise';
import type { IDatabase, ITask } from 'pg-promise';
import { TENANT } from '../env.js';

export const pgp = pgPromise({ capSQL: true });

// date → chuỗi 'YYYY-MM-DD', không để pg chuyển thành Date theo múi giờ máy chủ.
pgp.pg.types.setTypeParser(1082, (v: string) => v);
// bigint → number. Id trong hệ thống này nằm xa giới hạn 2^53.
pgp.pg.types.setTypeParser(20, (v: string) => Number(v));

export type Db = IDatabase<unknown>;
export type Tx = ITask<unknown>;

/**
 * Hai pool TÁCH BIỆT (mục 03 tài liệu kỹ thuật):
 *  - reader: vai trò app_reader, KHÔNG BYPASSRLS — đường phục vụ báo cáo.
 *  - writer: vai trò app_writer, BYPASSRLS — worker ghi dữ liệu và thao tác hệ thống.
 * Mỗi pool đọc URL từ một biến môi trường khác nhau để không thể dùng nhầm bằng cấu hình.
 */
const pools = new Map<string, Db>();

function makeDb(url: string, max: number): Db {
  const existing = pools.get(url);
  if (existing) return existing;
  const db = pgp({ connectionString: url, max, application_name: 'vala' }) as Db;
  pools.set(url, db);
  return db;
}

export function readerDb(url = process.env.DATABASE_READER_URL): Db {
  if (!url) throw new Error('Thiếu DATABASE_READER_URL');
  return makeDb(url, 10);
}

export function writerDb(url = process.env.DATABASE_WRITER_URL): Db {
  if (!url) throw new Error('Thiếu DATABASE_WRITER_URL');
  return makeDb(url, 10);
}

export async function closeAllPools(): Promise<void> {
  pools.clear();
  await pgp.end();
}

export type Scope = 'ca_nhan' | 'don_vi';

export interface UserContext {
  userId: number;
  scope: Scope;
  /** Đơn vị được xem, đã gồm cấp dưới. Rỗng khi scope = ca_nhan. */
  orgUnitsAllowed: number[];
}

export function toPgArray(ids: number[]): string {
  if (!ids.every((n) => Number.isSafeInteger(n))) throw new Error('org unit id không hợp lệ');
  return `{${ids.join(',')}}`;
}

/**
 * Hợp đồng bắt buộc giữa API và CSDL: mở transaction, đặt ba biến phiên (is_local = true
 * nên chỉ sống trong transaction này), rồi mới chạy truy vấn. Không đặt ⇒ RLS trả rỗng.
 */
export function withUserContext<T>(db: Db, ctx: UserContext, fn: (t: Tx) => Promise<T>): Promise<T> {
  return db.tx(async (t) => {
    await t.any(
      `SELECT set_config('search_path', $4, true),
              set_config('app.user_id', $1, true),
              set_config('app.org_units_allowed', $2, true),
              set_config('app.scope', $3, true)`,
      [String(ctx.userId), toPgArray(ctx.orgUnitsAllowed), ctx.scope, `${TENANT}, core, public`],
    );
    return fn(t);
  });
}

/** Giao dịch hệ thống trên pool writer, chỉ đặt search_path theo đơn vị. */
export function withTenant<T>(db: Db, fn: (t: Tx) => Promise<T>): Promise<T> {
  return db.tx(async (t) => {
    await t.any(`SELECT set_config('search_path', $1, true)`, [`${TENANT}, core, public`]);
    return fn(t);
  });
}

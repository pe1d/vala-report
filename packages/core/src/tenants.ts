/**
 * Danh mục đơn vị (core.tenants) cho API / worker: đơn vị nào đang hoạt động, trạng thái của một đơn vị (hook API từ
 * chối token của đơn vị tạm khoá), chạy một việc cho từng đơn vị.
 */
import { withCore, type Db } from './db/index.js';
import { runInTenant } from './tenant.js';

export interface TenantRow {
  ma: string;
  ten: string;
  status: 'dang_tao' | 'hoat_dong' | 'tam_khoa' | 'loi';
  login_methods: string[];
  sso: Record<string, unknown> | null;
  login_fill: 'account' | 'email';
  login_selectors: Record<string, unknown> | null;
}

const TTL_MS = 30_000;
let cache: { at: number; rows: TenantRow[] } | null = null;

/** Danh mục đơn vị, đệm 30 giây (đổi trạng thái — vd tạm khoá — có hiệu lực trong vòng 30 giây). */
export async function tenantRows(db: Db, fresh = false): Promise<TenantRow[]> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await withCore(db, (t) => t.any<TenantRow>(
    'SELECT ma, ten, status, login_methods, sso, login_fill, login_selectors FROM tenants ORDER BY ma'));
  cache = { at: Date.now(), rows };
  return rows;
}

/** Bỏ đệm (sau khi sửa danh mục đơn vị). */
export const forgetTenantCache = (): void => { cache = null; };

export async function activeTenants(db: Db): Promise<string[]> {
  return (await tenantRows(db)).filter((r) => r.status === 'hoat_dong').map((r) => r.ma);
}

export async function tenantStatus(db: Db, ma: string): Promise<TenantRow['status'] | null> {
  return (await tenantRows(db)).find((r) => r.ma === ma)?.status ?? null;
}

/** Chạy fn cho từng đơn vị đang hoạt động, mỗi đơn vị trong ngữ cảnh riêng; lỗi của một đơn vị không chặn đơn vị khác. */
export async function forEachTenant(db: Db, fn: (ma: string) => Promise<void>, onError?: (ma: string, e: Error) => void): Promise<void> {
  for (const ma of await activeTenants(db)) {
    try { await runInTenant(ma, () => fn(ma)); } catch (e) {
      if (onError) onError(ma, e as Error); else throw e;
    }
  }
}

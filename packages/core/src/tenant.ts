/**
 * Ngữ cảnh ĐƠN VỊ (multi-tenant — docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md): mỗi request của API
 * và mỗi việc của worker chạy trong ngữ cảnh một đơn vị; withTenant / withUserContext đặt search_path theo đó. Thiếu ngữ
 * cảnh ⇒ ném lỗi — không bao giờ ngầm rơi về một đơn vị mặc định (tránh đọc nhầm dữ liệu đơn vị khác).
 *
 * Kho là object sửa được: API mở kho ở đầu request (withTenantStore) rồi hook đặt mã sau khi đọc token.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** Đơn vị đầu tiên — token / việc cũ không mang mã đơn vị được coi là của Bkav. */
export const DEFAULT_TENANT = 'bkav';
const CODE = /^[a-z][a-z0-9]{1,19}$/;
interface Store { tenant: string | null }
const als = new AsyncLocalStorage<Store>();

export const isTenantCode = (s: unknown): s is string => typeof s === 'string' && CODE.test(s);
export const tenantSchema = (code: string): string => `tenant_${code}`;

function check(code: string): string {
  if (!isTenantCode(code)) throw new Error(`Mã đơn vị không hợp lệ: ${JSON.stringify(code)}`);
  return code;
}

export function runInTenant<T>(code: string, fn: () => T): T {
  return als.run({ tenant: check(code) }, fn);
}

/** Mở kho rỗng cho một request (API) — mã đặt sau bằng setRequestTenant. */
export function withTenantStore<T>(fn: () => T): T {
  return als.run({ tenant: null }, fn);
}

export function setRequestTenant(code: string): void {
  const s = als.getStore();
  if (!s) throw new Error('Chưa mở ngữ cảnh đơn vị cho request');
  s.tenant = check(code);
}

export function currentTenant(): string {
  const t = als.getStore()?.tenant;
  if (!t) throw new Error('Thiếu ngữ cảnh đơn vị (runInTenant / hook API)');
  return t;
}

/** Schema của đơn vị hiện tại (cũng là tiền tố đường dẫn vault `vault://tenant_bkav/…`). */
export const currentSchema = (): string => tenantSchema(currentTenant());

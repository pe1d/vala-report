/**
 * Bước 1 của đăng nhập nhiều đơn vị (họp 07/10): `tàikhoản@tênmiền` ⇒ tên miền tìm đơn vị (core.tenant_domains), phần
 * trước @ là tài khoản trong schema của đơn vị (không phải địa chỉ email). Dùng chung cho cổng web, Vala Desktop, tiện ích.
 */
import { DEFAULT_TENANT, L, Problem, runInTenant, withCore, withTenant, type TenantRow } from '@vala/core';
import type { ApiDeps, RateLimiter } from './deps.js';

const ACCOUNT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function parseLogin(raw: string): { account: string; domain: string | null } | null {
  const s = raw.trim().toLowerCase();
  const parts = s.split('@');
  if (parts.length > 2) return null;
  const [account, domain] = parts as [string, string | undefined];
  if (!ACCOUNT.test(account)) return null;
  if (domain === undefined) return { account, domain: null };
  return DOMAIN.test(domain) && domain.length <= 253 ? { account, domain } : null;
}

/** Chữ điền sẵn vào ô tài khoản ở bước 2 theo cấu hình đơn vị. */
export const fillFor = (fill: 'account' | 'email', account: string, domain: string) => (fill === 'email' ? `${account}@${domain}` : account);

/** Cho tối đa n lần mỗi cửa sổ (RateLimiter chỉ có "một lần mỗi cửa sổ" ⇒ n khoá con). */
export async function takeN(l: RateLimiter, key: string, n: number, windowSeconds: number): Promise<boolean> {
  for (let i = 0; i < n; i++) if (await l.take(`${key}:${i}`, windowSeconds)) return true;
  return false;
}

export interface TenantFull extends TenantRow { domains: string[] }

/** Đơn vị đang hoạt động sở hữu tên miền; không có ⇒ null. */
export async function tenantByDomain(deps: ApiDeps, domain: string): Promise<TenantFull | null> {
  return withCore(deps.writer, (t) => t.oneOrNone<TenantFull>(
    `SELECT t.ma, t.ten, t.status, t.login_methods, t.sso, t.login_fill, t.login_selectors, t.domains
       FROM tenant_domains d JOIN tenants t ON t.ma = d.tenant
      WHERE d.domain = $1 AND t.status = 'hoat_dong'`, [domain]));
}

export async function tenantByCode(deps: ApiDeps, ma: string): Promise<TenantFull | null> {
  return withCore(deps.writer, (t) => t.oneOrNone<TenantFull>(
    `SELECT ma, ten, status, login_methods, sso, login_fill, login_selectors, domains FROM tenants WHERE ma = $1 AND status = 'hoat_dong'`, [ma]));
}

/**
 * Cách đăng nhập của đơn vị: Bkav theo cấu hình .env (LOGIN_SSO + SSO_*) như trước nhiều đơn vị; đơn vị khác theo
 * core.tenants.login_methods, bỏ 'sso' khi đơn vị chưa khai cấu hình SSO.
 */
export function loginMethodsOf(deps: ApiDeps, t: Pick<TenantRow, 'ma' | 'login_methods' | 'sso'>): Array<'password' | 'sso'> {
  if (t.ma === DEFAULT_TENANT) return deps.config.loginMethods;
  return t.login_methods.filter((m): m is 'password' | 'sso' => m === 'password' || (m === 'sso' && !!t.sso));
}

/** Đơn vị bật tự tạo tài khoản khi đăng nhập SSO lần đầu ⇒ bước 1 không kiểm tài khoản. */
export function ssoAutoCreate(deps: ApiDeps, t: Pick<TenantRow, 'ma' | 'sso'>): boolean {
  if (t.ma === DEFAULT_TENANT) return deps.sso.cfg.autoCreate && deps.config.loginMethods.includes('sso');
  return (t.sso as { auto_create?: boolean } | null)?.auto_create === true;
}

/** Tài khoản có trong đơn vị (theo tên đăng nhập, hoặc email đầy đủ) và đang hoạt động — trong ngữ cảnh đơn vị. */
export async function accountExists(deps: ApiDeps, account: string, full: string): Promise<boolean> {
  return !!(await withTenant(deps.writer, (t) => t.oneOrNone(
    'SELECT 1 FROM app_users WHERE (lower(username) = $1 OR lower(email) = $2) AND is_active LIMIT 1', [account, full])));
}

/**
 * Đơn vị + tài khoản cho một lần đăng nhập: `tenant` (mã, do bước 1 trả) hoặc `username` dạng tk@tênmiền; tài khoản trơn
 * (tiện ích / bản cũ) ⇒ Bkav. Chạy fn trong ngữ cảnh đơn vị đó.
 */
export async function inLoginTenant<T>(deps: ApiDeps, username: string, tenant: string | undefined,
  fn: (account: string, t: TenantFull) => Promise<T>): Promise<T> {
  const p = parseLogin(username);
  const notFound = () => new Problem('invalid_credentials', L('Sai tài khoản hoặc mật khẩu', 'Incorrect username or password'));
  if (!p) throw notFound();
  const row = tenant ? await tenantByCode(deps, tenant) : p.domain ? await tenantByDomain(deps, p.domain) : await tenantByCode(deps, DEFAULT_TENANT);
  if (!row) throw notFound();
  // Ghi mã đơn vị mà tên miền lại thuộc đơn vị khác ⇒ từ chối (không cho dò chéo).
  if (tenant && p.domain && !row.domains.includes(p.domain)) throw notFound();
  return runInTenant(row.ma, () => fn(p.account, row));
}

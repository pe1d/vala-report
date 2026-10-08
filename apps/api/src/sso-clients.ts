/**
 * SSO theo đơn vị (multi-tenant): Bkav dùng cấu hình .env như trước (deps.sso); đơn vị khác dùng core.tenants.sso + client
 * secret trong vault (`vault://core/tenants/<mã>/sso`, khoá `client_secret`). Đệm client theo cấu hình — sửa cấu hình
 * (đợt 3: trang Đơn vị) thì client mới được tạo lần gọi sau.
 */
import { DEFAULT_TENANT, SsoClient, ssoConfigFromJson, type TenantRow } from '@vala/core';
import type { ApiDeps } from './deps.js';

export const tenantSsoRef = (ma: string) => `vault://core/tenants/${ma}/sso`;

const cache = new Map<string, { key: string; client: SsoClient }>();

export async function ssoFor(deps: ApiDeps, t: Pick<TenantRow, 'ma' | 'sso'>): Promise<SsoClient | null> {
  if (t.ma === DEFAULT_TENANT) return deps.config.loginMethods.includes('sso') ? deps.sso : null;
  if (!t.sso) return null;
  const secret = (await deps.secrets.get<{ client_secret?: string }>(tenantSsoRef(t.ma)))?.client_secret ?? null;
  const key = JSON.stringify([t.sso, secret]);
  const hit = cache.get(t.ma);
  if (hit?.key === key) return hit.client;
  const client = new SsoClient(ssoConfigFromJson(t.sso, secret));
  if (!client.cfg.ready) return null;
  cache.set(t.ma, { key, client });
  return client;
}

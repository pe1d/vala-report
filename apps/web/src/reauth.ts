import { api } from './api';
import { appPath, BASE } from './base';

/** Chuyển sang trang đăng nhập SSO để uỷ quyền (lại) cho một hệ thống nguồn. */
export async function startGrant(source: string): Promise<void> {
  const r = await api.post<{ flow: string; redirect_url: string | null }>(`/grants/${source}`, {});
  if (r.redirect_url) window.location.assign(r.redirect_url);
}

/**
 * Chuyển sang trang đăng nhập SSO để vào cổng, quay về đúng trang đang xem. `tenant` (mã đơn vị ở bước 1) ⇒ SSO của đơn vị
 * đó; `hint` ⇒ IdP điền sẵn tài khoản. Không có ⇒ đơn vị của phiên cũ / Bkav.
 */
export function startLogin(next = appPath() + window.location.search, o: { tenant?: string; hint?: string } = {}): void {
  const q = new URLSearchParams({ next });
  if (o.tenant) q.set('tenant', o.tenant);
  if (o.hint) q.set('login_hint', o.hint);
  window.location.assign(`${BASE}/api/v1/auth/sso/login?${q}`);
}

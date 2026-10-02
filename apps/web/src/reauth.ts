import { api } from './api';
import { appPath, BASE } from './base';

/** Chuyển sang trang đăng nhập SSO để uỷ quyền (lại) cho một hệ thống nguồn. */
export async function startGrant(source: string): Promise<void> {
  const r = await api.post<{ flow: string; redirect_url: string | null }>(`/grants/${source}`, {});
  if (r.redirect_url) window.location.assign(r.redirect_url);
}

/** Chuyển sang trang đăng nhập SSO để vào cổng, quay về đúng trang đang xem. */
export function startLogin(next = appPath() + window.location.search): void {
  window.location.assign(`${BASE}/api/v1/auth/login?next=${encodeURIComponent(next)}`);
}

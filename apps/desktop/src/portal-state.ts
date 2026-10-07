/**
 * Điều cổng (tab Báo cáo) cho ứng dụng biết về người đang đăng nhập cổng — chỉ những gì menu của app cần, giữ trong bộ nhớ.
 * Cổng gửi qua cầu nối ('portal-user', windows.ts kiểm origin).
 */
let hasPassword = false;

/** Người đăng nhập cổng có mật khẩu (không phải chỉ SSO) ⇒ menu hồ sơ có "Đổi mật khẩu". */
export const portalHasPassword = (): boolean => hasPassword;
export function setPortalUser(u: { has_password?: unknown } | null): boolean {
  const next = u?.has_password === true;
  if (next === hasPassword) return false;
  hasPassword = next;
  return true;
}

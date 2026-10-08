/** Nhãn dùng chung giữa trang Quản trị và cổng web: cách kết nối hệ thống nguồn. Đọc theo ngôn ngữ tại thời điểm truy cập. */
import type { AuthMethod } from '@vala/ui/api';
import { messages, tr } from '@vala/ui/i18n';

const M = messages({
  method: { password: 'Tài khoản/mật khẩu', cookie: 'Dán cookie', sso: 'Người dùng tự uỷ quyền (SSO)', extension: 'Vala Desktop' } as Record<AuthMethod, string>,
}, {
  method: { password: 'Username/password', cookie: 'Pasted cookie', sso: 'User-authorized (SSO)', extension: 'Vala Desktop' } as Record<AuthMethod, string>,
});

/** `METHOD_LABEL.cookie` ⇒ chữ theo ngôn ngữ đang chọn (getter, đổi ngôn ngữ là đổi theo). */
export const METHOD_LABEL: Record<AuthMethod, string> = Object.defineProperties({} as Record<AuthMethod, string>,
  Object.fromEntries((['password', 'cookie', 'sso', 'extension'] as const).map((k) => [k, { enumerable: true, get: () => tr(M).method[k] }])));

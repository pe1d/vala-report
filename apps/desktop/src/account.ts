/**
 * Tài khoản của Vala Desktop = người đang đăng nhập cổng Vala Reporting trong ứng dụng (tab Báo cáo — mật khẩu hoặc SSO).
 * Cổng cấp token thiết bị (vxt_…, POST /me/extension-devices) và chuyển sang qua cầu nối (windows.ts), không có màn hình
 * đăng nhập riêng. Token hiện trên cổng ở mục thiết bị đã kết nối, thu hồi được ở đó.
 */
import { EventEmitter } from 'node:events';
import { api } from './api';
import { messages } from './i18n';
import { getSettings, setSettings } from './settings';
import { resetSync } from './sync';

const M = messages({
  device: (os: string) => `Vala Desktop trên ${os}`,
  computer: 'máy tính',
}, {
  device: (os: string) => `Vala Desktop on ${os}`,
  computer: 'computer',
});

/** 'login' — vừa nhận token thiết bị; 'logout' — vừa đăng xuất. */
export const accountEvents = new EventEmitter();

export function deviceName(): string {
  const t = M[getSettings().lang];
  const os = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : t.computer;
  return t.device(os);
}

export const DEVICE_TOKEN = /^vxt_[\w-]{20,100}$/;

/** Nhận token thiết bị do cổng cấp. Đang đăng nhập người khác ⇒ thu hồi token cũ trước. */
export async function adoptDeviceToken(token: string, user: { ho_ten: string; email: string }): Promise<void> {
  const s = getSettings();
  if (s.deviceToken === token) return;
  if (s.deviceToken) {
    try { await api('POST', '/ext/logout'); } catch { /* token cũ đã hết hạn / máy chủ không tới được */ }
    resetSync();
  }
  setSettings({ deviceToken: token, user });
  accountEvents.emit('login');
}

export async function logoutDevice(): Promise<void> {
  try { await api('POST', '/ext/logout'); } catch { /* máy chủ không tới được: vẫn quên token ở máy này */ }
  setSettings({ deviceToken: null, user: null });
  resetSync();
  accountEvents.emit('logout');
}

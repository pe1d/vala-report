/**
 * Chạy cùng hệ điều hành (ẩn ở khay hệ thống) — bật mặc định, tắt được ở Cài đặt → Khởi động. Chỉ bản CÀI ĐẶT (bản dev chạy
 * bằng binary electron chung, không đăng ký). Windows/macOS: setLoginItemSettings; Linux: mục ~/.config/autostart (linux.ts).
 */
import { app } from 'electron';
import { disableLinuxAutostart, enableLinuxAutostart } from './linux';
import { getSettings, setSettings } from './settings';

export const autostartSupported = (): boolean => app.isPackaged;
export const autostartEnabled = (): boolean => getSettings().autostart !== false;

/** Áp lựa chọn đang lưu (gọi lúc khởi động và khi người dùng đổi). */
export function applyAutostart(): void {
  if (!autostartSupported()) return;
  const on = autostartEnabled();
  if (process.platform === 'linux') { if (on) enableLinuxAutostart(); else disableLinuxAutostart(); }
  else app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
}

export function setAutostart(on: boolean): void {
  setSettings({ autostart: on });
  applyAutostart();
}

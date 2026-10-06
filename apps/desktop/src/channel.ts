/**
 * Bản dev và bản cho người dùng chạy song song, không đụng nhau. Chạy từ mã nguồn (`pnpm --filter @vala/desktop dev`,
 * app chưa đóng gói) ⇒ "Vala Desktop (dev)": thư mục dữ liệu riêng (cấu hình, cookie, phiên eGov/eTask, token thiết bị),
 * khoá "chỉ một bản" riêng, máy chủ mặc định là stack dev (settings.ts), biểu tượng cam có chữ DEV, nhãn DEV trên thanh tab;
 * không tự khởi động, không tự cập nhật. Bản đóng gói (bộ cài) giữ nguyên "Vala Desktop".
 *
 * VALA_USER_DATA=<thư mục> ⇒ dùng thư mục dữ liệu đó (chạy thử nhiều hồ sơ, script kiểm thử).
 */
import { join } from 'node:path';
import { app } from 'electron';

export const IS_DEV = !app.isPackaged;
export const APP_NAME = IS_DEV ? 'Vala Desktop (dev)' : 'Vala Desktop';
export const ICON = join(__dirname, '../resources', IS_DEV ? 'icon-dev.png' : 'icon.png');

/** Gọi đầu tiên, trước khi đọc cấu hình hay xin khoá "chỉ một bản". */
export function setupChannel(): void {
  if (IS_DEV) app.setName(APP_NAME);
  const dir = process.env.VALA_USER_DATA || (IS_DEV ? join(app.getPath('appData'), APP_NAME) : '');
  if (dir) app.setPath('userData', dir);
}

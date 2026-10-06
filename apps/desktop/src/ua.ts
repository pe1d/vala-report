/**
 * User-Agent như Chrome thường: bỏ "Electron/x" và tên ứng dụng (ValaDesktop/…, ValaDesktop(dev)/…). Có trang (vd
 * vala.bkav.com) thấy dấu hiệu ứng dụng desktop là trả về thông báo "đã dừng phát triển bản Vala Desktop" (của bản cũ).
 */
export function cleanUserAgent(ua: string): string {
  return ua.replace(/ (?:Electron|\S*desktop[^\s/]*)\/\S+/gi, '');
}

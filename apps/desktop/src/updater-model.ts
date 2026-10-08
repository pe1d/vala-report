/** Quy tắc thuần của tự cập nhật (có test): khi nào tự cài bản mới đã tải mà không làm phiền người dùng. */

/** Máy để không (không chuột / phím) bao lâu thì coi là rảnh để tự cài. */
export const IDLE_INSTALL_SECONDS = 10 * 60;

/**
 * Tự cài bản mới khi: người dùng bật "Tự động cập nhật", không phải Ubuntu (gói .deb cần mật khẩu quản trị — luôn để
 * người dùng bấm), và lúc này không phiền: cửa sổ đang ẩn xuống khay hoặc máy để không đủ lâu.
 */
export function shouldAutoInstall(a: { enabled: boolean; platform: string; windowVisible: boolean; idleSeconds: number }): boolean {
  if (!a.enabled || a.platform === 'linux') return false;
  return !a.windowVisible || a.idleSeconds >= IDLE_INSTALL_SECONDS;
}

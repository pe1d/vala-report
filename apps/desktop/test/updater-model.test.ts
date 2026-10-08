import { describe, expect, it } from 'vitest';
import { IDLE_INSTALL_SECONDS, shouldAutoInstall } from '../src/updater-model';

describe('tự cài bản mới', () => {
  const base = { enabled: true, platform: 'win32', windowVisible: true, idleSeconds: 0 };
  it('đang dùng (cửa sổ hiện, vừa thao tác) ⇒ chưa cài', () => expect(shouldAutoInstall(base)).toBe(false));
  it('cửa sổ ẩn xuống khay ⇒ cài', () => expect(shouldAutoInstall({ ...base, windowVisible: false })).toBe(true));
  it('máy để không đủ lâu ⇒ cài', () => expect(shouldAutoInstall({ ...base, idleSeconds: IDLE_INSTALL_SECONDS })).toBe(true));
  it('tắt tự cập nhật ⇒ không bao giờ tự cài', () => expect(shouldAutoInstall({ ...base, enabled: false, windowVisible: false })).toBe(false));
  it('Ubuntu (.deb cần mật khẩu quản trị) ⇒ không tự cài', () => expect(shouldAutoInstall({ ...base, platform: 'linux', windowVisible: false })).toBe(false));
});

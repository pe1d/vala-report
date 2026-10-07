import { beforeEach, describe, expect, it, vi } from 'vitest';

let store: Record<string, unknown> = {};
vi.mock('electron', () => ({ app: { getVersion: () => '0.2.4', isPackaged: false }, BrowserWindow: {}, dialog: {} }));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));
vi.mock('../src/notify', () => ({ notify: vi.fn() }));
vi.mock('../src/settings', () => ({
  getSettings: () => ({ lang: 'vi', deviceToken: null, ...store }),
  setSettings: (p: Record<string, unknown>) => { store = { ...store, ...p }; },
  updateFeedUrl: () => '',
}));

const { notify } = await import('../src/notify');
const { announceUpdate } = await import('../src/updater');

beforeEach(() => { store = {}; vi.mocked(notify).mockReset(); });

describe('announceUpdate — báo "Đã cập nhật lên bản …" một lần', () => {
  it('bản trước khác bản đang chạy ⇒ báo, ghi lại bản mới', () => {
    store = { lastVersion: '0.2.3' };
    announceUpdate(() => {});
    expect(notify).toHaveBeenCalledOnce();
    expect(vi.mocked(notify).mock.calls[0]![0]).toContain('0.2.4');
    expect(store.lastVersion).toBe('0.2.4');
  });
  it('cùng bản ⇒ không báo', () => {
    store = { lastVersion: '0.2.4' };
    announceUpdate(() => {});
    expect(notify).not.toHaveBeenCalled();
  });
  it('mới cài (chưa có lastVersion, chưa đăng nhập) ⇒ không báo, chỉ ghi lại', () => {
    announceUpdate(() => {});
    expect(notify).not.toHaveBeenCalled();
    expect(store.lastVersion).toBe('0.2.4');
  });
  it('lên từ bản cũ chưa ghi lastVersion (0.2.3), máy đã đăng nhập ⇒ vẫn báo', () => {
    store = { deviceToken: 't' };
    announceUpdate(() => {});
    expect(notify).toHaveBeenCalledOnce();
  });
});

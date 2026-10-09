import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('../src/api', () => ({ api: vi.fn() }));
vi.mock('../src/apps', () => ({ canAdmin: () => true }));
vi.mock('../src/notify', () => ({ notify: vi.fn() }));
vi.mock('../src/settings', () => ({ getSettings: () => ({ lang: 'vi' }) }));
const { newAlerts } = await import('../src/admin-alert');

describe('báo quản trị khi phiên dịch hỏng', () => {
  const g = (code: string, muc: 'loi' | 'doi') => ({ code, ten: code, muc, thong_bao: 'x' });
  it('mới ⇒ báo; đã báo ⇒ không lặp; đổi ⇒ lỗi thì báo lại', () => {
    const a = newAlerts([g('hn', 'doi')], []);
    expect(a.bao.map((x) => x.code)).toEqual(['hn']);
    expect(newAlerts([g('hn', 'doi')], a.seen).bao).toEqual([]);
    expect(newAlerts([g('hn', 'loi')], a.seen).bao.map((x) => x.muc)).toEqual(['loi']);
  });
  it('hết cảnh báo (đã kiểm) ⇒ quên, lần lỗi sau báo lại', () => {
    const a = newAlerts([g('hn', 'loi')], []);
    const b = newAlerts([], a.seen);
    expect(b.seen).toEqual([]);
    expect(newAlerts([g('hn', 'loi')], b.seen).bao).toHaveLength(1);
  });
});

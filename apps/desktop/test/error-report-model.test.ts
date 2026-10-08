import { describe, expect, it } from 'vitest';
import { appPageError, enqueue, MAX_QUEUE, originOf, scrub } from '../src/error-report-model';

const base = { loai: 'loi_chinh' as const, phien_ban: '0.3.1', he_dieu_hanh: 'win32 10' };

describe('báo lỗi phía app', () => {
  it('làm sạch: token, email, tham số URL', () => {
    expect(scrub('vxt_bkav.AbCdEfGhIjKlMn ở https://a.vn/x?sid=1 của a@b.vn')).toBe('vxt_… ở https://a.vn/x?… của <email>');
  });
  it('lỗi trùng ⇒ tăng số lần; khác ⇒ thêm; đầy ⇒ bỏ cũ nhất', () => {
    let q = enqueue([], { ...base, thong_bao: 'A', stack: 'Error\n    at f (x.js:1:1)' });
    q = enqueue(q, { ...base, thong_bao: 'A', stack: 'Error\n    at f (x.js:1:1)' });
    q = enqueue(q, { ...base, thong_bao: 'B' });
    expect(q.map((x) => [x.thong_bao, x.so_lan])).toEqual([['A', 2], ['B', 1]]);
    let big: ReturnType<typeof enqueue> = [];
    for (let i = 0; i < MAX_QUEUE + 5; i++) big = enqueue(big, { ...base, thong_bao: `L${i}` });
    expect(big).toHaveLength(MAX_QUEUE);
    expect(big[0]!.thong_bao).toBe('L5');
  });
  it('chỉ gốc địa chỉ; lỗi trang chỉ của trang app', () => {
    expect(originOf('https://egov.bkav.com/vb/1?x=2')).toBe('https://egov.bkav.com');
    expect(originOf('file:///opt/x/tabs.html')).toBe('file:');
    expect(appPageError(3, 'file:///opt/app/dist/renderer/tabs.js')).toBe(true);
    expect(appPageError(3, 'https://valabeta.bkav.com/main.js')).toBe(false);
    expect(appPageError(1, 'file:///x.js')).toBe(false);
  });
});

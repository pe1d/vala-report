import { describe, expect, it } from 'vitest';
import { addVisit, fold, matchScore, searchAll, type AppVisit } from '../src/search-model';

describe('fold (bỏ dấu, chữ thường)', () => {
  it('bỏ dấu tiếng Việt, đ ⇒ d, gộp khoảng trắng', () => {
    expect(fold('  Chuyển  VĂN bản Đã xử lý ')).toBe('chuyen van ban da xu ly');
  });
});

describe('matchScore', () => {
  it('mọi từ phải có mặt (không phân biệt dấu); thiếu một từ ⇒ 0', () => {
    expect(matchScore('chuyen van', 'Chuyển văn bản cho người xử lý')).toBeGreaterThan(0);
    expect(matchScore('chuyen kinh phi', 'Chuyển văn bản')).toBe(0);
  });
  it('khớp đầu chuỗi > đầu từ > giữa từ', () => {
    const a = matchScore('van', 'Văn bản đến');
    const b = matchScore('van', 'Danh sách văn bản');
    const c = matchScore('van', 'Thông tin nhân viên');
    const d = matchScore('an', 'Danh sách');
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(d);
    expect(d).toBeGreaterThan(0);
    expect(c).toBe(0);
  });
  it('truy vấn rỗng ⇒ 0', () => expect(matchScore('  ', 'abc')).toBe(0));
});

describe('addVisit (lịch sử chỉ theo ứng dụng — không lưu địa chỉ trang)', () => {
  const v = (app: string, at: number, label = app): AppVisit => ({ app, label, at, count: 1 });
  it('cùng ứng dụng ⇒ gộp (tên mới, thời điểm mới, tăng số lần), đưa lên đầu', () => {
    const list = addVisit([v('src:egov', 1), v('web:vala', 2)], v('src:egov', 3, 'eGov mới'), 10);
    expect(list.map((x) => [x.app, x.label, x.at, x.count])).toEqual([['src:egov', 'eGov mới', 3, 2], ['web:vala', 'web:vala', 2, 1]]);
  });
  it('giữ tối đa N mục; không có trường địa chỉ', () => {
    const list = addVisit([v('a', 1), v('b', 2)], v('c', 3), 2);
    expect(list.map((x) => x.app)).toEqual(['c', 'a']);
    expect(Object.keys(list[0]!).sort()).toEqual(['app', 'at', 'count', 'label']);
  });
});

describe('searchAll', () => {
  const data = {
    apps: [{ key: 'src:egov', label: 'Bkav eGov' }, { key: 'src:qlvb', label: 'QLVB Thử nghiệm' }, { key: 'web:vala', label: 'Vala' }],
    actions: [{ code: 'qlvb', system: 'QLVB Thử nghiệm', name: 'chuyen_van_ban', mo_ta: 'Chuyển văn bản cho người xử lý' }],
    chats: [{ id: 'c1', title: 'Danh sách văn bản đang xử lý', text: 'lay_danh_sach_van_ban trang_thai Đang xử lý', at: 5 }],
    visits: [
      { app: 'src:qlvb', label: 'QLVB Thử nghiệm', at: 9, count: 4 },
      { app: 'web:vala', label: 'Vala', at: 8, count: 1 },
      { app: 'src:cu', label: 'Hệ thống đã gỡ', at: 7, count: 1 },
    ] as AppVisit[],
  };
  it('ô trống ⇒ Gần đây (ứng dụng vừa dùng, bỏ ứng dụng không còn) + Hội thoại gần đây', () => {
    const r = searchAll('', data);
    expect(r.map((s) => s.kind)).toEqual(['recent', 'chats']);
    expect(r[0]!.items).toEqual([
      { kind: 'app', title: 'QLVB Thử nghiệm', sub: '', ref: { key: 'src:qlvb' } },
      { kind: 'app', title: 'Vala', sub: '', ref: { key: 'web:vala' } },
    ]);
  });
  it('gõ ⇒ Ứng dụng · Thao tác · Hội thoại (không còn nhóm lịch sử trang)', () => {
    expect(searchAll('chuyen', data).map((s) => s.kind)).toEqual(['actions']);
    expect(searchAll('qlvb', data)[0]!.items[0]).toMatchObject({ kind: 'app', ref: { key: 'src:qlvb' } });
    expect(searchAll('dang xu ly', data).map((s) => s.kind)).toEqual(['chats']);
  });
  it('ứng dụng hay dùng xếp trước khi điểm khớp bằng nhau', () => {
    const r = searchAll('v', { ...data, apps: [{ key: 'web:vala', label: 'Vala' }, { key: 'src:vb', label: 'Văn bản' }] , visits: [{ app: 'src:vb', label: 'Văn bản', at: 1, count: 9 }] });
    expect(r[0]!.items.map((i) => i.title)).toEqual(['Văn bản', 'Vala']);
  });
});

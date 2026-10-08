import { describe, expect, it } from 'vitest';
import { addHistory, fold, matchScore, searchAll, type HistoryEntry } from '../src/search-model';

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
    const c = matchScore('van', 'Thông tin nhân viên');   // "vien" không khớp "van" ⇒ 0
    const d = matchScore('an', 'Danh sách');             // giữa từ
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(d);
    expect(d).toBeGreaterThan(0);
    expect(c).toBe(0);
  });
  it('truy vấn rỗng ⇒ 0', () => expect(matchScore('  ', 'abc')).toBe(0));
});

describe('addHistory', () => {
  const e = (url: string, at: number, title = url): HistoryEntry => ({ url, title, app: 'src:egov', appLabel: 'eGov', at, count: 1 });
  it('trùng địa chỉ ⇒ gộp (cập nhật tiêu đề, thời điểm, tăng số lần), đưa lên đầu', () => {
    const list = addHistory([e('a', 1), e('b', 2)], e('a', 3, 'A mới'), 10);
    expect(list.map((x) => [x.url, x.title, x.at, x.count])).toEqual([['a', 'A mới', 3, 2], ['b', 'b', 2, 1]]);
  });
  it('tiêu đề rỗng không ghi đè tiêu đề cũ; giữ tối đa N mục mới nhất', () => {
    expect(addHistory([e('a', 1, 'Cũ')], { ...e('a', 2), title: '' }, 10)[0]!.title).toBe('Cũ');
    expect(addHistory([e('a', 1), e('b', 2)], e('c', 3), 2).map((x) => x.url)).toEqual(['c', 'a']);
  });
});

describe('searchAll', () => {
  const data = {
    apps: [{ key: 'src:egov', label: 'Bkav eGov' }, { key: 'src:qlvb', label: 'QLVB Thử nghiệm' }],
    actions: [{ code: 'qlvb', system: 'QLVB Thử nghiệm', name: 'chuyen_van_ban', mo_ta: 'Chuyển văn bản cho người xử lý' }],
    chats: [{ id: 'c1', title: 'Danh sách văn bản đang xử lý', text: 'lay_danh_sach_van_ban trang_thai Đang xử lý', at: 5 }],
    history: [
      { url: 'http://h/ChiTiet.aspx?id=4', title: 'Chi tiết văn bản — chuyển xử lý', app: 'src:qlvb', appLabel: 'QLVB', at: 9, count: 1 },
      { url: 'http://h/VanBan.aspx', title: 'Danh sách văn bản', app: 'src:qlvb', appLabel: 'QLVB', at: 8, count: 3 },
    ] as HistoryEntry[],
  };
  it('ô trống ⇒ Gần đây (lịch sử mới nhất) + Hội thoại gần đây', () => {
    const r = searchAll('', data);
    expect(r.map((s) => s.kind)).toEqual(['recent', 'chats']);
    expect(r[0]!.items.map((i) => i.title)).toEqual(['Chi tiết văn bản — chuyển xử lý', 'Danh sách văn bản']);
  });
  it('gõ ⇒ các nhóm có kết quả theo thứ tự Ứng dụng · Thao tác · Hội thoại · Lịch sử', () => {
    const r = searchAll('chuyen', data);
    expect(r.map((s) => s.kind)).toEqual(['actions', 'history']);
    expect(r[0]!.items[0]).toMatchObject({ kind: 'action', title: 'Chuyển văn bản cho người xử lý', sub: 'QLVB Thử nghiệm · chuyen_van_ban', ref: { code: 'qlvb', name: 'chuyen_van_ban' } });
    expect(searchAll('qlvb', data)[0]!.items[0]).toMatchObject({ kind: 'app', ref: { key: 'src:qlvb' } });
    expect(searchAll('dang xu ly', data).map((s) => s.kind)).toEqual(['chats']);
  });
  it('mỗi nhóm tối đa 5 kết quả', () => {
    const many = { ...data, history: Array.from({ length: 9 }, (_, i) => ({ url: `u${i}`, title: `văn bản ${i}`, app: 'x', appLabel: 'X', at: i, count: 1 })) };
    expect(searchAll('van ban', many).find((s) => s.kind === 'history')!.items).toHaveLength(5);
  });
});

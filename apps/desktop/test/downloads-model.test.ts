import { describe, expect, it } from 'vitest';
import { addItem, MAX_HISTORY, overall, restore, safeName, uniqueName, viewableInApp, type TaiVe } from '../src/downloads-model';

const it0 = (o: Partial<TaiVe>): TaiVe => ({ id: '1', ten: 'a.pdf', duong_dan: '/d/a.pdf', tong: 100, da_tai: 0, trang_thai: 'dang_tai', luc: 0, nguon: 'h', ...o });

describe('trình quản lý tải', () => {
  it('tên an toàn, không trùng', () => {
    expect(safeName('Công văn: số 1/2026?.pdf')).toBe('Công văn_ số 1_2026_.pdf');
    expect(safeName('..')).toBe('tep');
    expect(uniqueName(new Set(['a.pdf', 'a (1).pdf']), 'a.pdf')).toBe('a (2).pdf');
    expect(uniqueName(new Set(['README']), 'README')).toBe('README (1)');
    expect(uniqueName(new Set(), 'b.docx')).toBe('b.docx');
  });
  it('lịch sử: mới nhất trước, giới hạn', () => {
    let l: TaiVe[] = [];
    for (let i = 0; i < MAX_HISTORY + 3; i++) l = addItem(l, it0({ id: String(i) }));
    expect(l).toHaveLength(MAX_HISTORY);
    expect(l[0]!.id).toBe(String(MAX_HISTORY + 2));
  });
  it('tiến độ chung', () => {
    expect(overall([it0({ trang_thai: 'xong' })])).toEqual({ dang_tai: 0, phan_tram: null });
    expect(overall([it0({ da_tai: 50 }), it0({ id: '2', tong: 300, da_tai: 50 })])).toEqual({ dang_tai: 2, phan_tram: 25 });
    expect(overall([it0({ tong: 0 })])).toEqual({ dang_tai: 1, phan_tram: null });
  });
  it('khôi phục: đang tải dở lúc tắt app ⇒ lỗi; mục hỏng bị bỏ', () => {
    expect(restore([it0({}), { id: 2 }, null]).map((x) => x.trang_thai)).toEqual(['loi']);
    expect(restore('rác')).toEqual([]);
  });
});

describe('viewableInApp', () => {
  it('PDF / ảnh ⇒ xem trong app; Word, Excel, SVG ⇒ không', () => {
    expect(viewableInApp('Cong van.PDF')).toBe(true);
    expect(viewableInApp('anh.jpeg')).toBe(true);
    expect(viewableInApp('bao-cao.docx')).toBe(false);
    expect(viewableInApp('so-lieu.xlsx')).toBe(false);
    expect(viewableInApp('logo.svg')).toBe(false);
  });
  it('restore: tệp đang chờ chọn lúc tắt app ⇒ lỗi', () => {
    expect(restore([{ id: 'a', ten: 'a', duong_dan: '/t/a', tong: 1, da_tai: 1, trang_thai: 'cho_chon', luc: 1, nguon: '' }])[0]!.trang_thai).toBe('loi');
  });
});

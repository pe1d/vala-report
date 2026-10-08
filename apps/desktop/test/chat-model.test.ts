import { describe, expect, it } from 'vitest';
import { greeting, parseArgs, parseCommand, resultView } from '../src/chat-model';

describe('parseCommand', () => {
  it('bắt đầu bằng "/" ⇒ lệnh (chữ sau "/" để lọc)', () => {
    expect(parseCommand('/qlvb')).toEqual({ kind: 'slash', query: 'qlvb' });
    expect(parseCommand('  /  ')).toEqual({ kind: 'slash', query: '' });
  });
  it('còn lại ⇒ câu hỏi tự do; rỗng ⇒ null', () => {
    expect(parseCommand(' Hôm nay có việc gì? ')).toEqual({ kind: 'text', text: 'Hôm nay có việc gì?' });
    expect(parseCommand('   ')).toBeNull();
  });
});

describe('resultView (hiển thị kết quả thao tác)', () => {
  it('mảng object ⇒ bảng; cột theo thứ tự xuất hiện, bỏ khoá bắt đầu bằng "_"', () => {
    expect(resultView([{ id: 1, ten: 'A', _x: 1 }, { id: 2, them: true }])).toEqual({
      kind: 'table', columns: ['id', 'ten', 'them'], rows: [['1', 'A', ''], ['2', '', 'có']],
    });
  });
  it('object ⇒ thông tin – giá trị; mảng con ⇒ bảng con; object con ⇒ JSON gọn', () => {
    expect(resultView({ tong: 35, van_ban: [{ id: 5 }], meta: { a: 1 }, rong: null })).toEqual({
      kind: 'fields', fields: [
        { key: 'tong', view: { kind: 'text', text: '35' } },
        { key: 'van_ban', view: { kind: 'table', columns: ['id'], rows: [['5']] } },
        { key: 'meta', view: { kind: 'text', text: '{"a":1}' } },
        { key: 'rong', view: { kind: 'text', text: '' } },
      ],
    });
  });
  it('mảng giá trị đơn ⇒ danh sách; giá trị đơn ⇒ chữ; rỗng ⇒ empty', () => {
    expect(resultView(['a', 2])).toEqual({ kind: 'list', items: ['a', '2'] });
    expect(resultView(false)).toEqual({ kind: 'text', text: 'không' });
    expect(resultView(undefined)).toEqual({ kind: 'empty' });
    expect(resultView([])).toEqual({ kind: 'empty' });
    expect(resultView(true, 'en')).toEqual({ kind: 'text', text: 'yes' });
  });
});

describe('greeting (lời chào theo giờ)', () => {
  it('sáng / chiều / tối, có tên', () => {
    expect(greeting(8, 'Điệp', 'vi')).toBe('Chào buổi sáng, Điệp');
    expect(greeting(14, 'Điệp', 'vi')).toBe('Chào buổi chiều, Điệp');
    expect(greeting(20, '', 'vi')).toBe('Chào buổi tối');
    expect(greeting(9, 'Diep', 'en')).toBe('Good morning, Diep');
  });
});

describe('parseArgs (tham số gõ trong phiếu)', () => {
  it('số nguyên ⇒ số; [..] / {..} hợp lệ ⇒ JSON; còn lại ⇒ chữ; ô trống ⇒ bỏ', () => {
    expect(parseArgs({ id: '4', trang: ' 2 ', nguoi_nhan: '["Lê Thị Chuyên Viên"]', y_kien: 'Đề nghị xử lý', rong: '  ', loi: '[không phải json' }))
      .toEqual({ id: 4, trang: 2, nguoi_nhan: ['Lê Thị Chuyên Viên'], y_kien: 'Đề nghị xử lý', loi: '[không phải json' });
  });
  it('số rất dài (mã định danh) giữ là chữ để không mất chữ số', () => {
    expect(parseArgs({ ma: '71124658431777123456' })).toEqual({ ma: '71124658431777123456' });
  });
});

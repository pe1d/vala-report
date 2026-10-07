import { describe, expect, it } from 'vitest';
import { notesFor, parseNotes } from '../src/release-notes';

const CHANGELOG = `# Vala Desktop — có gì mới

Ghi chú mở đầu, không thuộc bản nào.

## 0.2.5

### vi
- Điểm A
- Điểm B

### en
- Point A
- Point B

## 0.2.4
### vi
- Cũ
  tiếp dòng
### en
- Old
  continued
`;

describe('notesFor (CHANGELOG.md → ghi chú một bản)', () => {
  it('lấy đúng mục của phiên bản, đủ hai thứ tiếng', () =>
    expect(notesFor(CHANGELOG, '0.2.5')).toEqual({ version: '0.2.5', vi: ['Điểm A', 'Điểm B'], en: ['Point A', 'Point B'] }));
  it('dòng thụt vào là phần tiếp của gạch đầu dòng trước', () =>
    expect(notesFor(CHANGELOG, '0.2.4')).toEqual({ version: '0.2.4', vi: ['Cũ tiếp dòng'], en: ['Old continued'] }));
  it('không có mục của phiên bản ⇒ null', () => expect(notesFor(CHANGELOG, '0.3.0')).toBeNull());
  it('thiếu một thứ tiếng ⇒ null (song ngữ bắt buộc)', () =>
    expect(notesFor('## 1.0.0\n### vi\n- Chỉ tiếng Việt\n', '1.0.0')).toBeNull());
  it('"0.2.4" không khớp nhầm "0.2.45"', () => expect(notesFor('## 0.2.45\n### vi\n- a\n### en\n- a\n', '0.2.4')).toBeNull());
});

describe('parseNotes (releaseNotes trong latest.yml / tệp đóng kèm)', () => {
  const ok = { version: '0.2.5', vi: ['A'], en: ['B'] };
  it('chuỗi JSON hợp lệ', () => expect(parseNotes(JSON.stringify(ok))).toEqual(ok));
  it('đối tượng sẵn', () => expect(parseNotes(ok)).toEqual(ok));
  it('rác / thiếu trường / sai kiểu ⇒ null', () => {
    expect(parseNotes('không phải JSON')).toBeNull();
    expect(parseNotes(null)).toBeNull();
    expect(parseNotes({ version: '1', vi: 'x', en: [] })).toBeNull();
    expect(parseNotes({ version: '1', vi: [1], en: ['a'] })).toBeNull();
  });
});

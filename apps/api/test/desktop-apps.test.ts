import { describe, expect, it } from 'vitest';
import { cleanLayout } from '../src/routes/desktopApps';

describe('cleanLayout', () => {
  it('giữ đúng thứ tự người dùng, bỏ mã không còn / trùng / sai kiểu', () => {
    expect(cleanLayout(['b', 'x', 'a', 'b', 3], ['a', 'b', 'c'])).toEqual(['b', 'a']);
    expect(cleanLayout(null, ['a'])).toEqual([]);
  });
});

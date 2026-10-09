import { describe, expect, it } from 'vitest';
import { cleanZoom, stepZoom } from '../src/zoom-model';

describe('cỡ chữ', () => {
  it('tăng / giảm theo bước, không vượt giới hạn', () => {
    expect(stepZoom(100, 1)).toBe(110);
    expect(stepZoom(110, 1)).toBe(125);
    expect(stepZoom(100, -1)).toBe(90);
    expect(stepZoom(175, 1)).toBe(175);
    expect(stepZoom(80, -1)).toBe(80);
    expect(stepZoom(105, 1)).toBe(110);
    expect(stepZoom(105, -1)).toBe(100);
    expect(stepZoom(150, 0)).toBe(100);
  });
  it('giá trị không hợp lệ ⇒ 100', () => {
    expect(cleanZoom(125)).toBe(125);
    expect(cleanZoom(10)).toBe(100);
    expect(cleanZoom('125')).toBe(100);
    expect(cleanZoom(null)).toBe(100);
  });
});

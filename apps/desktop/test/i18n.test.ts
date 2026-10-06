import { describe, expect, it } from 'vitest';
import { messages, normLang } from '../src/i18n';

describe('i18n', () => {
  it('mặc định tiếng Việt với giá trị lạ', () => {
    expect(normLang(undefined)).toBe('vi');
    expect(normLang('fr')).toBe('vi');
    expect(normLang('en')).toBe('en');
  });
  it('messages trả đúng bản theo ngôn ngữ', () => {
    const M = messages({ hi: (n: string) => `Chào ${n}` }, { hi: (n: string) => `Hello ${n}` });
    expect(M.vi.hi('A')).toBe('Chào A');
    expect(M.en.hi('A')).toBe('Hello A');
  });
});

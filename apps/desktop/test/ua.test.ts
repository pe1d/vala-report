import { describe, expect, it } from 'vitest';
import { cleanUserAgent } from '../src/ua';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.186 Safari/537.36';

describe('cleanUserAgent (trang web thấy như Chrome thường)', () => {
  it('bỏ Electron/x và tên bản cài', () => {
    expect(cleanUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ValaDesktop/0.2.0 Chrome/128.0.6613.186 Electron/32.3.3 Safari/537.36')).toBe(CHROME);
  });
  it('bỏ tên bản dev có ngoặc', () => {
    expect(cleanUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ValaDesktop(dev)/0.2.0 Chrome/128.0.6613.186 Electron/32.3.3 Safari/537.36')).toBe(CHROME);
  });
  it('bỏ tên theo tên gói npm', () => {
    expect(cleanUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) @vala/desktop/0.1.0 Chrome/128.0.6613.186 Electron/32.3.3 Safari/537.36')).toBe(CHROME);
  });
  it('không đụng User-Agent Chrome thường', () => expect(cleanUserAgent(CHROME)).toBe(CHROME));
});

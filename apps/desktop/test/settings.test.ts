import { describe, expect, it } from 'vitest';
import { normalizeServer } from '../src/settings';

describe('normalizeServer', () => {
  it('giữ đường dẫn con, bỏ dấu / cuối', () => {
    expect(normalizeServer('https://qtttboard-demo.demozone.vn:5443/vala-report/'))
      .toBe('https://qtttboard-demo.demozone.vn:5443/vala-report');
  });
  it('bỏ đuôi /api hoặc /api/v1 khi người dùng dán địa chỉ API', () => {
    expect(normalizeServer('https://vala.example.com/api/v1')).toBe('https://vala.example.com');
    expect(normalizeServer('https://vala.example.com/vala-report/api')).toBe('https://vala.example.com/vala-report');
  });
  it('từ chối http không phải localhost', () => {
    expect(normalizeServer('http://vala.example.com')).toBeNull();
  });
  it('chấp nhận http cho localhost (dev)', () => {
    expect(normalizeServer('http://localhost:5173')).toBe('http://localhost:5173');
  });
  it('từ chối chuỗi không phải URL', () => {
    expect(normalizeServer('vala')).toBeNull();
  });
});

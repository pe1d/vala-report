import { describe, expect, it } from 'vitest';
import { normalizeHome, normalizeServer, updateFeedUrl } from '../src/settings';

describe('updateFeedUrl (kênh cập nhật Vala Desktop)', () => {
  it('mặc định là /desktop/ trên máy chủ Vala Reporting của đơn vị (giữ đường dẫn con)', () => {
    expect(updateFeedUrl('https://qtttboard-demo.demozone.vn:5443/vala-report')).toBe('https://qtttboard-demo.demozone.vn:5443/vala-report/desktop/');
    expect(updateFeedUrl('https://baocao.donvi.gov.vn')).toBe('https://baocao.donvi.gov.vn/desktop/');
  });
  it('đặt riêng lúc build (VALA_UPDATE_URL) thì dùng địa chỉ đó, luôn có / cuối', () => {
    expect(updateFeedUrl('https://baocao.donvi.gov.vn', 'https://cap-nhat.donvi.gov.vn/vala')).toBe('https://cap-nhat.donvi.gov.vn/vala/');
  });
});

describe('normalizeHome', () => {
  it('giữ nguyên đường dẫn và query của trang chính', () => {
    expect(normalizeHome(' https://vala.bkav.com/ ')).toBe('https://vala.bkav.com/');
    expect(normalizeHome('https://vala.donvi.gov.vn/home?tab=1')).toBe('https://vala.donvi.gov.vn/home?tab=1');
  });
  it('chỉ nhận https (trừ localhost)', () => {
    expect(normalizeHome('http://vala.bkav.com/')).toBeNull();
    expect(normalizeHome('http://localhost:8080/')).toBe('http://localhost:8080/');
    expect(normalizeHome('file:///etc/passwd')).toBeNull();
    expect(normalizeHome('vala.bkav.com')).toBeNull();
  });
});

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

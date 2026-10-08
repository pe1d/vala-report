import { describe, expect, it } from 'vitest';
import { cleanLoi, fingerprint, parseMultipart, scrub } from '../src/desktop-errors';

describe('làm sạch báo lỗi', () => {
  it('xoá token, JWT, email, tham số URL', () => {
    expect(scrub('Bearer vxt_abcdefghijklmnopqrstu gọi https://a.vn/x?token=bí_mật#h của dieptx@bkav.com'))
      .toBe('Bearer vxt_… gọi https://a.vn/x?… của <email>');
    expect(scrub('Authorization: Bearer abcdefghijklmnop')).toBe('Authorization: Bearer …');
    expect(scrub('tok eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.sig')).toBe('tok <jwt>');
    expect(scrub('vxt_bkav.AbCdEfGhIjKlMnOp lỗi')).toBe('vxt_… lỗi');
  });
  it('mục hợp lệ / sai loại / thiếu thông báo; ngữ cảnh chỉ giữ chuỗi ngắn', () => {
    const r = cleanLoi({ loai: 'loi_chinh', thong_bao: 'x', stack: 'at f (a.js:1:2)', phien_ban: '0.3.1', he_dieu_hanh: 'win32 10', so_lan: 3,
      ngu_canh: { url: 'https://a.vn/p?q=1', 'khóa lạ!': 'x', obj: { a: 1 } } });
    expect(r).toEqual({ loai: 'loi_chinh', thong_bao: 'x', stack: 'at f (a.js:1:2)', phien_ban: '0.3.1', he_dieu_hanh: 'win32 10', so_lan: 3, ngu_canh: { url: 'https://a.vn/p?…' } });
    expect(cleanLoi({ loai: 'khac', thong_bao: 'x' })).toBeNull();
    expect(cleanLoi({ loai: 'crash', thong_bao: '' })).toBeNull();
  });
});

describe('dấu vân tay', () => {
  it('cùng lỗi khác số / dòng:cột ⇒ cùng dấu; khác phiên bản ⇒ khác', () => {
    const a = fingerprint({ loai: 'loi_chinh', phien_ban: '0.3.1', thong_bao: 'Không tải được tab 12', stack: 'Error\n    at load (browser.js:10:5)' });
    const b = fingerprint({ loai: 'loi_chinh', phien_ban: '0.3.1', thong_bao: 'Không tải được tab 99', stack: 'Error\n    at load (browser.js:88:1)' });
    const c = fingerprint({ loai: 'loi_chinh', phien_ban: '0.3.2', thong_bao: 'Không tải được tab 12', stack: 'Error\n    at load (browser.js:10:5)' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('multipart của Crashpad', () => {
  it('trường chữ + tệp minidump', () => {
    const b = 'XyZ';
    const body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="ver"\r\n\r\n0.3.1\r\n`),
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="upload_file_minidump"; filename="x.dmp"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      Buffer.from([0x4d, 0x44, 0x4d, 0x50, 0x0d, 0x0a, 0x00]), Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const r = parseMultipart(body, b);
    expect(r.fields).toEqual({ ver: '0.3.1' });
    expect(r.files.upload_file_minidump?.filename).toBe('x.dmp');
    expect([...r.files.upload_file_minidump!.data]).toEqual([0x4d, 0x44, 0x4d, 0x50, 0x0d, 0x0a, 0x00]);
  });
});

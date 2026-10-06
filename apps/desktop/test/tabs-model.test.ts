import { describe, expect, it } from 'vitest';
import { addressToUrl, openTarget, tabStatus } from '../src/tabs-model';

describe('addressToUrl (ô địa chỉ)', () => {
  it('thiếu giao thức ⇒ thêm https://', () => expect(addressToUrl('egov.bkav.com')).toBe('https://egov.bkav.com/'));
  it('giữ http(s) có sẵn', () => {
    expect(addressToUrl(' https://vala.bkav.com/newfeed ')).toBe('https://vala.bkav.com/newfeed');
    expect(addressToUrl('http://localhost:5173/uy-quyen')).toBe('http://localhost:5173/uy-quyen');
  });
  it('từ chối giao thức khác và chuỗi rỗng', () => {
    expect(addressToUrl('javascript:alert(1)')).toBeNull();
    expect(addressToUrl('file:///etc/passwd')).toBeNull();
    expect(addressToUrl('   ')).toBeNull();
  });
  it('chữ có khoảng trắng không phải địa chỉ ⇒ null', () => expect(addressToUrl('văn bản đến')).toBeNull());
});

describe('openTarget (link mở cửa sổ mới)', () => {
  it('target=_blank / window.open không kèm kích thước ⇒ tab mới', () => {
    expect(openTarget({ url: 'https://egov.bkav.com/vb/1', disposition: 'foreground-tab' })).toEqual({ kind: 'tab', foreground: true });
    expect(openTarget({ url: 'https://egov.bkav.com/vb/1', disposition: 'background-tab' })).toEqual({ kind: 'tab', foreground: false });
  });
  it('popup có kích thước (SSO, chọn người nhận…) ⇒ cửa sổ thật để giữ window.opener', () => {
    expect(openTarget({ url: 'https://iam.bkav.com/login', disposition: 'new-window' })).toEqual({ kind: 'window' });
  });
  it('form POST target=_blank ⇒ cửa sổ thật (tab mới không gửi lại được dữ liệu POST)', () => {
    expect(openTarget({ url: 'https://egov.bkav.com/in', disposition: 'foreground-tab', hasPostBody: true })).toEqual({ kind: 'window' });
  });
  it('mailto/tel ⇒ giao cho hệ điều hành; giao thức lạ ⇒ chặn', () => {
    expect(openTarget({ url: 'mailto:a@bkav.com', disposition: 'foreground-tab' })).toEqual({ kind: 'external' });
    expect(openTarget({ url: 'javascript:void(0)', disposition: 'foreground-tab' })).toEqual({ kind: 'deny' });
  });
});

describe('tabStatus (chấm trạng thái tab hệ thống nguồn)', () => {
  it('kết nối được ⇒ ok', () => {
    expect(tabStatus('sent', 'active')).toBe('ok');
    expect(tabStatus('unchanged', 'active')).toBe('ok');
    expect(tabStatus('managed', 'active')).toBe('ok');
  });
  it('kết nối đang có mà hết hạn / lỗi ⇒ warn', () => {
    for (const r of ['rejected', 'error', 'not_logged_in', 'need_consent'] as const) expect(tabStatus(r, 'active')).toBe('warn');
    expect(tabStatus('not_logged_in', 'expired')).toBe('warn');
  });
  it('chưa từng kết nối / đã gỡ ⇒ off (không báo động)', () => {
    expect(tabStatus('not_logged_in', 'chua_cau_hinh')).toBe('off');
    expect(tabStatus('need_consent', 'revoked')).toBe('off');
  });
  it('chưa đồng bộ lần nào ⇒ off', () => expect(tabStatus(undefined, 'active')).toBe('off'));
});

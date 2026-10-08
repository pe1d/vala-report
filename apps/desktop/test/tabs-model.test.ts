import { describe, expect, it } from 'vitest';
import { catalogPinned, openTarget, siteOf, sidebarSections, tabStatus } from '../src/tabs-model';

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
  it('sang tên miền gốc KHÁC trang đang mở ⇒ trình duyệt mặc định; cùng tên miền gốc ⇒ tab trong app (giữ phiên)', () => {
    const from = 'https://egov.bkav.com/vb';
    expect(openTarget({ url: 'https://vnexpress.net/bai-viet', disposition: 'foreground-tab', openerUrl: from })).toEqual({ kind: 'external' });
    expect(openTarget({ url: 'https://tailieu.bkav.com/x', disposition: 'foreground-tab', openerUrl: from })).toEqual({ kind: 'tab', foreground: true });
    // Popup có kích thước / POST giữ cửa sổ trong app kể cả khác tên miền (đăng nhập SSO của đơn vị…).
    expect(openTarget({ url: 'https://sso.tinh.gov.vn/login', disposition: 'new-window', openerUrl: from })).toEqual({ kind: 'window' });
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

describe('siteOf (tên miền gốc)', () => {
  it('2 nhãn cuối; đuôi cấp 2 Việt Nam ⇒ 3 nhãn; IP / localhost giữ nguyên', () => {
    expect(siteOf('egov.bkav.com')).toBe('bkav.com');
    expect(siteOf('dichvucong.nuithanh.quangnam.gov.vn')).toBe('quangnam.gov.vn');
    expect(siteOf('vnexpress.net')).toBe('vnexpress.net');
    expect(siteOf('Mail.Bkav.COM.vn')).toBe('bkav.com.vn');
    expect(siteOf('10.2.65.146')).toBe('10.2.65.146');
    expect(siteOf('localhost')).toBe('localhost');
  });
});

describe('catalogPinned (danh mục đơn vị + bố cục người dùng)', () => {
  const app = (ma: string, o: Partial<{ pinned_default: boolean; is_default: boolean }> = {}) => ({ ma, pinned_default: true, is_default: false, ...o });
  const apps = [app('vala', { is_default: true }), app('egov'), app('etask', { pinned_default: false }), app('bao_cao')];
  it('chưa có bố cục ⇒ các mục ghim sẵn theo thứ tự danh mục', () => {
    expect(catalogPinned(apps, null)).toEqual(['vala', 'egov', 'bao_cao']);
  });
  it('có bố cục ⇒ đúng thứ tự người dùng, bỏ mục đã gỡ khỏi danh mục, mặc định luôn đứng đầu', () => {
    expect(catalogPinned(apps, ['etask', 'da_go', 'vala', 'egov'])).toEqual(['vala', 'etask', 'egov']);
  });
  it('mặc định bị người dùng bỏ ghim ⇒ không tự ghim lại', () => {
    expect(catalogPinned(apps, ['egov'])).toEqual(['egov']);
  });
});

describe('sidebarSections (nhóm trên thanh dọc)', () => {
  it('Ứng dụng = mục ghim; Đang mở = mục đang mở không ghim (bỏ Trợ lý AI), giữ thứ tự mở', () => {
    expect(sidebarSections({ pinned: ['home', 'portal', 'src:egov'], open: ['chat', 'src:egov', 't:3', 'settings', 'src:etask'] }))
      .toEqual({ apps: ['home', 'portal', 'src:egov'], open: ['t:3', 'settings', 'src:etask'] });
  });
});

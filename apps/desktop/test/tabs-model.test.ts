import { describe, expect, it } from 'vitest';
import { openTarget, pinnedApps, sidebarSections, tabStatus } from '../src/tabs-model';

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

describe('pinnedApps (ứng dụng ghim trên thanh dọc)', () => {
  const avail = ['home', 'portal', 'src:egov', 'src:etask'];
  it('chưa tuỳ chỉnh ⇒ ghim tất cả theo thứ tự', () => {
    expect(pinnedApps(null, avail)).toEqual(avail);
    expect(pinnedApps(undefined, avail)).toEqual(avail);
  });
  it('đã tuỳ chỉnh ⇒ giữ đúng thứ tự đã lưu, bỏ mục không còn (nguồn bị gỡ khỏi cổng)', () => {
    expect(pinnedApps(['src:etask', 'src:da_go', 'home'], avail)).toEqual(['src:etask', 'home']);
  });
  it('ứng dụng mới trên cổng không tự ghim khi người dùng đã tuỳ chỉnh (chỉ hiện trong ⊞)', () => {
    expect(pinnedApps(['home'], [...avail, 'src:moi'])).toEqual(['home']);
  });
});

describe('sidebarSections (nhóm trên thanh dọc)', () => {
  it('Ứng dụng = mục ghim; Đang mở = mục đang mở không ghim (bỏ Trợ lý AI), giữ thứ tự mở', () => {
    expect(sidebarSections({ pinned: ['home', 'portal', 'src:egov'], open: ['chat', 'src:egov', 't:3', 'settings', 'src:etask'] }))
      .toEqual({ apps: ['home', 'portal', 'src:egov'], open: ['t:3', 'settings', 'src:etask'] });
  });
});

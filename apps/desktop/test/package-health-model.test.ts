import { describe, expect, it } from 'vitest';
import { actionFailureWorthReporting, healthEvents } from '../src/package-health-model';

describe('giám sát phiên dịch', () => {
  it('lần đầu thấy ⇒ chỉ ghi nhớ phiên bản; đổi ⇒ báo; trùng ⇒ không báo', () => {
    const a = healthEvents({ hn: { thieu: [], phien_ban: 'v1' } }, {}, 'qlvb.hn.vn');
    expect(a).toEqual({ reports: [], versions: { 'hn@qlvb.hn.vn': 'v1' } });
    const b = healthEvents({ hn: { thieu: [], phien_ban: 'v2' } }, a.versions, 'qlvb.hn.vn');
    expect(b.reports).toEqual([{ goi: 'hn', kieu: 'doi_phien_ban', thong_bao: 'Gói hn: trang gốc qlvb.hn.vn đổi phiên bản', ngu_canh: { trang: 'qlvb.hn.vn', cu: 'v1', moi: 'v2' } }]);
    expect(healthEvents({ hn: { thieu: [], phien_ban: 'v2' } }, b.versions, 'qlvb.hn.vn').reports).toEqual([]);
  });
  it('thiếu phụ thuộc ⇒ báo; trang không cần kiểm (bo_qua) ⇒ bỏ qua; lỗi kiểm ⇒ báo', () => {
    expect(healthEvents({ hn: { thieu: ['NEORemoting.getRSet'], phien_ban: null } }, {}, 'h').reports[0]).toMatchObject({ kieu: 'thieu_phu_thuoc', thong_bao: 'Gói hn: trang gốc thiếu NEORemoting.getRSet' });
    expect(healthEvents({ hn: { bo_qua: true } }, {}, 'h')).toEqual({ reports: [], versions: {} });
    expect(healthEvents({ hn: { loi: 'x' } }, {}, 'h').reports[0]?.kieu).toBe('loi_kiem');
  });
  it('lỗi thao tác đáng báo', () => {
    expect(actionFailureWorthReporting(undefined)).toBe(true);
    expect(actionFailureWorthReporting('loi_he_thong')).toBe(true);
    expect(actionFailureWorthReporting('het_phien')).toBe(false);
    expect(actionFailureWorthReporting('nghiep_vu')).toBe(false);
  });
});

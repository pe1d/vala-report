import { describe, expect, it } from 'vitest';
import { cleanChiTiet, cleanDanhSach, cleanThongTin, declaresVanBan, formValues, isVbAction, vanBanKeys, type ThaoTac } from '../src/vanban-model';

describe('ứng dụng nào dùng giao diện Văn bản', () => {
  it('gói khai báo vb_danh_sach + địa chỉ ứng dụng khớp mẫu của gói', () => {
    const goi = [
      { matches: ['https://quanlyvanban.hanoi.gov.vn/*'], script: "vala.action('vb_danh_sach', async () => ({}));" },
      { matches: ['https://egov.bkav.com/*'], script: "vala.action('lay_danh_sach_van_ban', async () => ({}));" },
    ];
    const apps = [
      { key: 'web:vb_ha_noi', url: 'https://quanlyvanban.hanoi.gov.vn/' },
      { key: 'src:egov', url: 'https://egov.bkav.com/' },
      { key: 'portal', url: '' },
    ];
    expect([...vanBanKeys(apps, goi)]).toEqual(['web:vb_ha_noi']);
    expect(declaresVanBan('vala.action( "vb_danh_sach", f)')).toBe(true);
    expect(declaresVanBan('// vb_danh_sach chưa làm')).toBe(false);
  });
  it('chỉ thao tác của hợp đồng', () => {
    expect(isVbAction('vb_chi_tiet')).toBe(true);
    expect(isVbAction('chuyen_van_ban')).toBe(false);
  });
});

describe('làm sạch kết quả phiên dịch', () => {
  it('thông tin: menu nhóm ⇒ mục, bỏ mục sai mã, loại lạ ⇒ khac, mục chưa phiên dịch giữ địa chỉ trang gốc', () => {
    const r = cleanThongTin({ he_thong: 'iOffice', menu: [{ ten: 'Văn bản đến', muc: [
      { ma: 'den', ten: 'Đến', loai: 'den' }, { ma: 'x y', ten: 'Sai' }, { ma: 'k', ten: 'K', loai: 'zzz', goc: 'https://a.vn/x?y=1' }, { ma: 'j', ten: 'J', goc: 'javascript:alert(1)' }] }],
      tao: [{ ma: 'du_thao', ten: 'Dự thảo' }, { ma: 'tao_m1', ten: 'Đi CVPX', goc: 'https://a.vn/tao' }, { ma: 'x', ten: 'X', goc: 'file:///etc' }] });
    expect(r.menu).toEqual([{ ten: 'Văn bản đến', muc: [
      { ma: 'den', ten: 'Đến', loai: 'den', goc: undefined, loc: undefined },
      { ma: 'k', ten: 'K', loai: 'khac', goc: 'https://a.vn/x?y=1', loc: undefined },
      { ma: 'j', ten: 'J', loai: 'khac', goc: undefined, loc: undefined }] }]);
    expect(r.tao).toEqual([{ ma: 'du_thao', ten: 'Dự thảo', goc: undefined }, { ma: 'tao_m1', ten: 'Đi CVPX', goc: 'https://a.vn/tao' }, { ma: 'x', ten: 'X', goc: undefined }]);
  });
  it('thông tin: phiên dịch cũ khai `hop` phẳng ⇒ một nhóm', () => {
    expect(cleanThongTin({ he_thong: 'X', hop: [{ ma: 'a', ten: 'A' }] }).menu).toEqual([{ ten: '', muc: [{ ma: 'a', ten: 'A', loai: 'khac', goc: undefined, loc: undefined }] }]);
  });
  it('danh sách: id số ⇒ chuỗi, dòng không id bị bỏ, object lạ trong trường chữ bị bỏ', () => {
    const r = cleanDanhSach({ tong: '2', so_trang: 1, dong: [{ id: 5, trich_yeu: 'A', so_ky_hieu: { x: 1 } }, { trich_yeu: 'không id' }] });
    expect(r).toEqual({ tong: 2, so_trang: 1, dong: [expect.objectContaining({ id: '5', trich_yeu: 'A', so_ky_hieu: undefined, them: [] })] });
    expect(cleanDanhSach(null)).toEqual({ tong: 0, so_trang: 1, dong: [] });
  });
  it('chi tiết: thao tác + trường hợp lệ, trường chọn giữ lựa chọn', () => {
    const ct = cleanChiTiet({ id: '1', trich_yeu: 'X', tep: [{ id: 1, ten: 'a.pdf' }], qua_trinh: [{ viec: 'Chuyển' }, {}],
      thao_tac: [{ ma: 'chuyen', ten: 'Chuyển', truong: [{ ma: 'nguoi', ten: 'Người', loai: 'chon', nhieu: true, lua_chon: [{ ma: '1|2', ten: 'B' }] }, { ma: 'BAD', ten: 'x' }] }, { ma: '', ten: 'x' }] });
    expect(ct?.tep).toEqual([{ id: '1', ten: 'a.pdf', kich_thuoc: undefined }]);
    expect(cleanChiTiet({ id: '1', trich_yeu: 'X', tep: [{ ten: 'chỉ tên.docx' }], them: [{ ten: 'Sổ đến', gia_tri: 12 }, { ten: 'rỗng' }] }))
      .toMatchObject({ tep: [{ id: undefined, ten: 'chỉ tên.docx' }], them: [{ ten: 'Sổ đến', gia_tri: '12' }] });
    expect(ct?.qua_trinh).toEqual([{ luc: undefined, nguoi: undefined, viec: 'Chuyển' }]);
    expect(ct?.thao_tac).toEqual([{ ma: 'chuyen', ten: 'Chuyển', xac_nhan: undefined, truong: [{ ma: 'nguoi', ten: 'Người', loai: 'chon', bat_buoc: undefined, nhieu: true, goi_y: undefined, lua_chon: [{ ma: '1|2', ten: 'B' }] }] }]);
  });
});

describe('formValues', () => {
  const tt: ThaoTac = { ma: 'chuyen', ten: 'Chuyển', truong: [
    { ma: 'nguoi', ten: 'Người nhận', loai: 'chon', bat_buoc: true, nhieu: true, lua_chon: [{ ma: 'a', ten: 'A' }, { ma: 'b', ten: 'B' }] },
    { ma: 'y_kien', ten: 'Ý kiến', loai: 'doan' },
  ] };
  it('chỉ trường khai báo, cắt khoảng trắng', () => {
    expect(formValues(tt, { nguoi: ['a'], y_kien: ' ok ', la: 'bỏ' })).toEqual({ ok: true, values: { nguoi: ['a'], y_kien: 'ok' } });
  });
  it('thiếu trường bắt buộc / giá trị ngoài danh sách chọn ⇒ báo tên trường', () => {
    expect(formValues(tt, { nguoi: [] })).toEqual({ ok: false, missing: 'Người nhận' });
    expect(formValues(tt, { nguoi: ['zzz'] })).toEqual({ ok: false, missing: 'Người nhận' });
  });
});

describe('form có tệp', () => {
  it('tệp: chỉ { ten, loai, base64 } hợp lệ, một tệp khi không `nhieu`, bắt buộc', () => {
    const f = { truong: [{ ma: 'tep', ten: 'Tệp', loai: 'tep' as const, bat_buoc: true }] };
    expect(formValues(f, { tep: [{ ten: 'a.pdf', loai: 'application/pdf', base64: 'QUJD' }, { ten: 'b', base64: 'QQ==' }] }))
      .toEqual({ ok: true, values: { tep: [{ ten: 'a.pdf', loai: 'application/pdf', base64: 'QUJD' }] } });
    expect(formValues(f, { tep: [{ ten: 'x', base64: 'không phải base64!' }] })).toEqual({ ok: false, missing: 'Tệp' });
  });
});


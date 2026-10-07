import { describe, expect, it } from 'vitest';
import { draftScript } from '../src/recording-draft';
import type { Recording, RecStep } from '../src/recording';

const H = 'http://localhost:4030';
const F = 'ctl00$MainContent$';
let id = 0;
const s = (p: Partial<RecStep>): RecStep => ({ id: ++id, at: '', kind: 'form', method: 'POST', url: `${H}/Chuyen.aspx?id=4`, frame: 'chinh', label: '', fields: [], files: [], ...p });
const state = [{ name: '__VIEWSTATE', value: '(5000 ký tự)', masked: 'trang_thai' as const }, { name: '__EVENTVALIDATION', value: '(80 ký tự)', masked: 'trang_thai' as const }];

const rec: Recording = {
  version: 1, host: 'localhost:4030', title: 'QLVB Thử nghiệm', startedAt: '2026-10-07T08:00:00.000Z', truncated: false,
  steps: [
    s({ kind: 'trang', method: 'GET', url: `${H}/Login.aspx`, label: 'Mở /Login.aspx' }),
    s({ url: `${H}/Login.aspx`, label: 'Đăng nhập (đã che mật khẩu)', fields: [...state, { name: 'txtTenDangNhap', value: 'chanhvp' }, { name: 'txtMatKhau', value: '••••', masked: 'mat_khau' }, { name: 'btnDangNhap', value: 'Đăng nhập' }], status: 302, location: '/VanBan.aspx' }),
    s({ kind: 'trang', method: 'GET', url: `${H}/VanBan.aspx`, label: 'Mở /VanBan.aspx', redirectedFrom: 2 }),
    s({ kind: 'trang', method: 'GET', url: `${H}/Chuyen.aspx?id=4`, label: 'Mở /Chuyen.aspx?id=4',
      page: { hidden: ['__VIEWSTATE'], submits: [`${F}btnChuyen`], inputs: [`${F}ddlDonVi`], passwords: [] } }),
    s({ label: 'Gửi lại form: ddlDonVi', fields: [{ name: '__EVENTTARGET', value: `${F}ddlDonVi` }, { name: '__EVENTARGUMENT', value: '' }, ...state,
      { name: `${F}ddlDonVi`, value: '2' }, { name: `${F}txtYKien`, value: '\t\r\n' }, { name: `${F}txtHanXuLy`, value: '' }],
      page: { hidden: ['__VIEWSTATE'], submits: [`${F}btnChuyen`], inputs: [`${F}cblNguoiNhan$0`, `${F}cblNguoiNhan$1`], passwords: [] } }),
    s({ label: 'Bấm btnChuyen (“Chuyển”)', contentType: 'multipart/form-data; boundary=x',
      fields: [{ name: '__EVENTTARGET', value: '' }, ...state, { name: `${F}ddlDonVi`, value: '2' }, { name: `${F}cblNguoiNhan$0`, value: '3' },
        { name: `${F}cblNguoiNhan$1`, value: '4' }, { name: `${F}txtYKien`, value: "Đề nghị xử lý, 'gấp'\ndòng 2" }, { name: `${F}txtHanXuLy`, value: '' },
        { name: `${F}btnChuyen`, value: 'Chuyển' }],
      files: [{ name: `${F}fuDinhKem`, filename: 'to-trinh.pdf', type: 'application/pdf', size: 12 }], status: 302, location: '/ChiTiet.aspx?id=4' }),
    s({ kind: 'trang', method: 'GET', url: `${H}/ChiTiet.aspx?id=4`, label: 'Mở /ChiTiet.aspx?id=4', redirectedFrom: 6 }),
    s({ kind: 'trang', method: 'GET', url: `${H}/PhatHanh.aspx?id=8`, label: 'Mở /PhatHanh.aspx?id=8' }),
    s({ url: `${H}/PhatHanh.aspx?id=8`, async: true, label: 'Gửi lại form: ddlSo (UpdatePanel)',
      fields: [{ name: 'ctl00$sm', value: `${F}upSo|${F}ddlSo` }, { name: '__EVENTTARGET', value: `${F}ddlSo` }, { name: '__ASYNCPOST', value: 'true' }, ...state, { name: `${F}ddlSo`, value: '1' }],
      panels: ['ctl00_MainContent_upSo'] }),
    s({ kind: 'xhr', method: 'POST', url: `${H}/api/thong-ke`, contentType: 'application/json', label: 'POST /api/thong-ke', fields: [{ name: '(json)', value: '{"nam":2026}' }] }),
  ],
};

describe('draftScript — bản nháp kịch bản từ bản ghi', () => {
  const code = draftScript(rec, 'vi');

  it('là một thao tác vala.action, parse được (không lỗi cú pháp)', () => {
    expect(code).toContain("vala.action('thao_tac_moi'");
    expect(() => new Function('vala', code)).not.toThrow();
  });
  it('bỏ bước đăng nhập (dùng phiên sẵn có), chỉ để chú thích', () => {
    expect(code).toMatch(/\/\/ .*Đăng nhập.*bỏ qua/);
    expect(code).not.toContain('txtMatKhau');
    expect(code).not.toContain('chanhvp');
  });
  it('mở trang có form rồi gửi lại "chọn đơn vị"', () => {
    expect(code).toContain("f = await vala.webform('/Chuyen.aspx?id=4');");
    expect(code).toContain(`await f.postback('${F}ddlDonVi', { '${F}ddlDonVi': '2' });`);
  });
  it('bấm nút: gộp CheckBoxList về tên gốc thành mảng, bỏ trường trạng thái / trống, có tệp', () => {
    expect(code).toContain(`await f.submit('${F}btnChuyen', {`);
    expect(code).toContain(`'${F}cblNguoiNhan': ['3', '4']`);
    expect(code).toContain(`'${F}txtYKien': 'Đề nghị xử lý, \\'gấp\\'\\ndòng 2'`);
    expect(code).toContain(`files: { '${F}fuDinhKem': { ten: 'to-trinh.pdf', base64: p.tep_base64 } }`);
    expect(code).toMatch(/to-trinh\.pdf, application\/pdf, 12 byte/);
    const submit = code.slice(code.indexOf('f.submit('));
    expect(submit.slice(0, submit.indexOf(');'))).not.toMatch(/__VIEWSTATE|__EVENTTARGET|txtHanXuLy|btnChuyen': 'Chuyển'/);
  });
  it('chuyển hướng chỉ là chú thích; trang không có form theo sau chỉ là chú thích', () => {
    expect(code).toMatch(/\/\/ .*→ \/ChiTiet\.aspx\?id=4/);
    expect(code).not.toContain("vala.webform('/ChiTiet.aspx?id=4')");
  });
  it('UpdatePanel ⇒ { async: true }, không gửi trường ScriptManager', () => {
    expect(code).toContain("f = await vala.webform('/PhatHanh.aspx?id=8');");
    expect(code).toContain(`await f.postback('${F}ddlSo', { '${F}ddlSo': '1' }, { async: true });`);
    expect(code).not.toContain("'ctl00$sm'");
  });
  it('trường chỉ có khoảng trắng (ô nhiều dòng của WebForms) coi như trống', () => {
    expect(code).not.toMatch(/txtYKien': '\\t/);
  });
  it('mô tả thao tác là bước gửi form cuối (không phải tiêu đề trang lúc bắt đầu ghi)', () => {
    expect(code).toContain("mo_ta: 'Bấm btnChuyen (“Chuyển”)'");
  });
  it('XHR ⇒ vala.request', () => {
    expect(code).toContain(`await vala.request('/api/thong-ke', { method: 'POST', body: '{"nam":2026}', headers: { 'Content-Type': 'application/json' } });`);
  });
  it('tiếng Anh: chú thích tiếng Anh', () => {
    expect(draftScript(rec, 'en')).toMatch(/\/\/ .*skipped — the script runs in the signed-in session/);
  });
});

import { describe, expect, it } from 'vitest';
import { deltaInfo, maskFields, pageInfo, parseBody, stepLabel, type RecStep } from '../src/recording';

describe('parseBody — tách thân request', () => {
  it('urlencoded: giải mã, giữ dấu tiếng Việt và tên có $', () => {
    expect(parseBody('application/x-www-form-urlencoded; charset=UTF-8', 'a=1&b=x%20y&ctl00%24c=%C4%90+k')).toEqual({
      fields: [{ name: 'a', value: '1' }, { name: 'b', value: 'x y' }, { name: 'ctl00$c', value: 'Đ k' }], files: [],
    });
  });
  it('urlencoded: trường lặp và CheckBoxList giữ đủ, đúng thứ tự', () => {
    expect(parseBody('application/x-www-form-urlencoded', 'cbl$0=3&cbl$2=5&x=1&x=2').fields).toEqual([
      { name: 'cbl$0', value: '3' }, { name: 'cbl$2', value: '5' }, { name: 'x', value: '1' }, { name: 'x', value: '2' },
    ]);
  });
  it('multipart: trường chữ + tệp (chỉ tên, loại, kích thước)', () => {
    const b = '----vala123';
    const body = [
      `--${b}`, 'Content-Disposition: form-data; name="ctl00$MainContent$txtTrichYeu"', '', 'V/v xin kinh phí',
      `--${b}`, 'Content-Disposition: form-data; name="ctl00$MainContent$fuDinhKem"; filename="to-trinh.pdf"',
      'Content-Type: application/pdf', '', '%PDF-1.4 thu', `--${b}--`, '',
    ].join('\r\n');
    expect(parseBody(`multipart/form-data; boundary=${b}`, Buffer.from(body))).toEqual({
      fields: [{ name: 'ctl00$MainContent$txtTrichYeu', value: 'V/v xin kinh phí' }],
      files: [{ name: 'ctl00$MainContent$fuDinhKem', filename: 'to-trinh.pdf', type: 'application/pdf', size: 12 }],
    });
  });
  it('multipart: ô tệp để trống thì không tính là tệp', () => {
    const b = 'x';
    const body = `--${b}\r\nContent-Disposition: form-data; name="fu"; filename=""\r\nContent-Type: application/octet-stream\r\n\r\n\r\n--${b}--\r\n`;
    expect(parseBody(`multipart/form-data; boundary=${b}`, body)).toEqual({ fields: [], files: [] });
  });
  it('JSON / loại khác: giữ nguyên văn (cắt 2000 ký tự)', () => {
    expect(parseBody('application/json', '{"a":1}').fields).toEqual([{ name: '(json)', value: '{"a":1}' }]);
    expect(parseBody('text/plain', 'x'.repeat(3000)).fields[0]!.value).toHaveLength(2000);
  });
  it('không có thân ⇒ rỗng', () => expect(parseBody('', undefined)).toEqual({ fields: [], files: [] }));
});

describe('maskFields — che giá trị nhạy cảm', () => {
  const vs = 'A'.repeat(5000);
  const out = maskFields([
    { name: 'txtMatKhau', value: 'Qlvb@2026' },
    { name: 'ctl00$Login1$Password', value: 'bi-mat' },
    { name: 'ctl00$MainContent$txtPwd', value: 'bi-mat' },
    { name: 'o_la_password', value: 'x' },
    { name: 'mat_khau_cu', value: 'x' },
    { name: '__VIEWSTATE', value: vs },
    { name: '__EVENTVALIDATION', value: 'abc' },
    { name: '__RequestVerificationToken', value: 'tok' },
    { name: 'ctl00$MainContent$txtYKien', value: 'Đề nghị xử lý' },
  ], new Set(['txtMatKhau']));
  it('ô mật khẩu (theo trang hoặc theo tên) ⇒ ••••', () => {
    expect(out.slice(0, 5).every((f) => f.value === '••••' && f.masked === 'mat_khau')).toBe(true);
  });
  it('trạng thái ASP.NET / token ⇒ chỉ độ dài', () => {
    expect(out[5]).toEqual({ name: '__VIEWSTATE', value: '(5000 ký tự)', masked: 'trang_thai' });
    expect(out[6]).toEqual({ name: '__EVENTVALIDATION', value: '(3 ký tự)', masked: 'trang_thai' });
    expect(out[7]!.masked).toBe('trang_thai');
  });
  it('trường thường giữ nguyên', () => expect(out[8]).toEqual({ name: 'ctl00$MainContent$txtYKien', value: 'Đề nghị xử lý' }));
  it('không còn giá trị bí mật nào', () => expect(JSON.stringify(out)).not.toMatch(/Qlvb@2026|bi-mat|tok"/));
});

describe('pageInfo — tên trường trên trang trả về', () => {
  const html = `<form method="post" action="Chuyen.aspx?id=4" id="ctl00_form1">
    <input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value="" />
    <input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="xyz" />
    <INPUT TYPE="HIDDEN" NAME="__EVENTVALIDATION" value="abc">
    <select name="ctl00$MainContent$ddlDonVi" onchange="javascript:setTimeout(&#39;__doPostBack(\\&#39;ctl00$MainContent$ddlDonVi\\&#39;,\\&#39;\\&#39;)&#39;, 0)"><option value="">—</option></select>
    <input id="c_0" type="checkbox" name="ctl00$MainContent$cblNguoiNhan$0" value="3" />
    <textarea name="ctl00$MainContent$txtYKien"></textarea>
    <input name="ctl00$MainContent$txtHanXuLy" type="text" />
    <input type="password" name="txtMatKhau" />
    <input type="file" name="ctl00$MainContent$fuDinhKem" />
    <input type="submit" name="ctl00$MainContent$btnChuyen" value="Chuyển" />
    <input type="image" name="ctl00$MainContent$imgLuu" src="luu.png" />
    <button type="submit" name="ctl00$MainContent$btnHuy">Huỷ</button>
  </form>`;
  it('phân loại trường ẩn / nút / ô nhập / mật khẩu', () => {
    expect(pageInfo(html)).toEqual({
      hidden: ['__EVENTTARGET', '__VIEWSTATE', '__EVENTVALIDATION'],
      submits: ['ctl00$MainContent$btnChuyen', 'ctl00$MainContent$imgLuu', 'ctl00$MainContent$btnHuy'],
      inputs: ['ctl00$MainContent$ddlDonVi', 'ctl00$MainContent$cblNguoiNhan$0', 'ctl00$MainContent$txtYKien',
        'ctl00$MainContent$txtHanXuLy', 'txtMatKhau', 'ctl00$MainContent$fuDinhKem'],
      passwords: ['txtMatKhau'],
    });
  });
});

describe('deltaInfo — phản hồi UpdatePanel', () => {
  it('đọc id vùng cập nhật và tên trường ẩn', () => {
    // Nội dung có cả dấu "|" ⇒ phải đọc theo độ dài khai báo, không tách bừa theo "|".
    const html = '<div>có | dấu sổ</div>';
    const d = `${html.length}|updatePanel|ctl00_MainContent_upSo|${html}|0|hiddenField|__EVENTTARGET||8|hiddenField|__VIEWSTATE|AAAAAAAA|`;
    expect(deltaInfo(d)).toEqual({ panels: ['ctl00_MainContent_upSo'], hidden: ['__EVENTTARGET', '__VIEWSTATE'] });
  });
  it('không phải phản hồi UpdatePanel ⇒ null', () => {
    expect(deltaInfo('<html></html>')).toBeNull();
    expect(deltaInfo('12|xyz')).toBeNull();
  });
});

describe('stepLabel — tên bước dễ đọc', () => {
  const step = (p: Partial<RecStep>): RecStep => ({ id: 1, at: '', kind: 'form', method: 'POST', url: 'http://h/Chuyen.aspx?id=4', frame: 'chinh', label: '', fields: [], files: [], ...p });
  const f = (name: string, value: string, masked?: 'mat_khau') => ({ name, value, ...(masked ? { masked } : {}) });
  const prev = { hidden: [], submits: ['ctl00$MainContent$btnChuyen'], inputs: [], passwords: [] };
  it('mở trang', () => {
    expect(stepLabel(step({ kind: 'trang', method: 'GET', url: 'http://h/VanBan.aspx?x=1' }), undefined, 'vi')).toBe('Mở /VanBan.aspx?x=1');
    expect(stepLabel(step({ kind: 'trang', method: 'GET', url: 'http://h/VanBan.aspx' }), undefined, 'en')).toBe('Open /VanBan.aspx');
  });
  it('sang trang của bảng', () => {
    expect(stepLabel(step({ fields: [f('__EVENTTARGET', 'ctl00$MainContent$gvVanBan'), f('__EVENTARGUMENT', 'Page$2')] }), prev, 'vi')).toBe('Sang trang 2: gvVanBan');
  });
  it('gửi lại form (AutoPostBack / LinkButton), có UpdatePanel', () => {
    const fs = [f('__EVENTTARGET', 'ctl00$MainContent$ddlDonVi'), f('__EVENTARGUMENT', '')];
    expect(stepLabel(step({ fields: fs }), prev, 'vi')).toBe('Gửi lại form: ddlDonVi');
    expect(stepLabel(step({ fields: fs, async: true }), prev, 'vi')).toBe('Gửi lại form: ddlDonVi (UpdatePanel)');
    expect(stepLabel(step({ fields: fs }), prev, 'en')).toBe('Postback: ddlDonVi');
  });
  it('bấm nút của trang trước', () => {
    expect(stepLabel(step({ fields: [f('__EVENTTARGET', ''), f('ctl00$MainContent$btnChuyen', 'Chuyển')] }), prev, 'vi')).toBe('Bấm btnChuyen (“Chuyển”)');
  });
  it('đăng nhập (đã che mật khẩu)', () => {
    expect(stepLabel(step({ fields: [f('txtTenDangNhap', 'vanthu'), f('txtMatKhau', '••••', 'mat_khau')] }), undefined, 'vi')).toBe('Đăng nhập (đã che mật khẩu)');
  });
  it('gửi form khác / XHR', () => {
    expect(stepLabel(step({ fields: [f('a', '1')] }), undefined, 'vi')).toBe('Gửi form /Chuyen.aspx?id=4');
    expect(stepLabel(step({ kind: 'xhr', method: 'POST', url: 'http://h/api/x' }), undefined, 'vi')).toBe('POST /api/x');
  });
});

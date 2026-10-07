import { beforeEach, describe, expect, it } from 'vitest';
import { BASE, Browser, dangChay, formFields, options, rows, text } from './wf';

const up = await dangChay();
const reset = () => fetch(`${BASE}/_dev/reset`, { method: 'POST' });

describe.skipIf(!up)('QLVB Thử nghiệm (WebForms giả lập)', () => {
  beforeEach(async () => { await reset(); });

  describe('đăng nhập', () => {
    it('chưa đăng nhập ⇒ chuyển về Login.aspx kèm ReturnUrl', async () => {
      const p = await new Browser().open('/VanBan.aspx');
      expect(p.url).toMatch(/\/Login\.aspx\?ReturnUrl=%2fVanBan\.aspx/i);
    });
    it('sai mật khẩu ⇒ báo lỗi, vẫn ở trang đăng nhập', async () => {
      const p = await new Browser().login('vanthu', 'sai');
      expect(p.url).toMatch(/Login\.aspx/);
      expect(text(p.html, 'lblLoi')).toBe('Sai tên đăng nhập hoặc mật khẩu');
    });
    it('đúng ⇒ có .ASPXAUTH + ASP.NET_SessionId, vào danh sách, thấy tên', async () => {
      const b = new Browser();
      const p = await b.login('vanthu');
      expect([...b.cookies.keys()].sort()).toEqual(['.ASPXAUTH', 'ASP.NET_SessionId']);
      expect(p.url).toMatch(/VanBan\.aspx$/);
      expect(text(p.html, 'ctl00_lblUser')).toBe('Nguyễn Thị Văn Thư (vanthu)');
    });
    it('mất phiên (Session) dù còn cookie đăng nhập ⇒ về trang đăng nhập', async () => {
      const b = new Browser();
      await b.login('vanthu');
      b.cookies.delete('ASP.NET_SessionId');
      expect((await b.open('/VanBan.aspx')).url).toMatch(/Login\.aspx\?ReturnUrl=/);
    });
  });
  describe('danh sách', () => {
    const G = 'ctl00$MainContent$gvVanBan';
    it('35 văn bản, 10 dòng/trang, trang 4 có 5 dòng (phân trang bằng __doPostBack)', async () => {
      const b = new Browser();
      const p1 = await b.login('vanthu');
      expect(text(p1.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 35 văn bản');
      expect(rows(p1.html, 'ctl00_MainContent_gvVanBan')).toHaveLength(10);
      expect(p1.html).toContain(`__doPostBack(&#39;${G}&#39;,&#39;Page$4&#39;)`);
      const p4 = await b.postback(p1, G, 'Page$4');
      const r4 = rows(p4.html, 'ctl00_MainContent_gvVanBan');
      expect(r4).toHaveLength(5);
      expect(r4[4]![0]).toBe('1');                     // mã nhỏ nhất ở cuối trang cuối (sắp mới nhất trước)
    });
    it('lọc trạng thái là ô tự gửi lại form (AutoPostBack)', async () => {
      const b = new Browser();
      const p = await b.login('vanthu');
      const f = await b.postback(p, 'ctl00$MainContent$ddlTrangThai', '', { 'ctl00$MainContent$ddlTrangThai': 'Đã phát hành' });
      expect(text(f.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 9 văn bản');
      expect(rows(f.html, 'ctl00_MainContent_gvVanBan').every((r) => r[4] === 'Đã phát hành')).toBe(true);
    });
    it('tìm theo trích yếu bằng nút Tìm', async () => {
      const b = new Browser();
      const p = await b.login('vanthu');
      const f = await b.post(p, { 'ctl00$MainContent$txtTuKhoa': 'tuyển dụng', 'ctl00$MainContent$btnTim': 'Tìm' });
      expect(text(f.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 5 văn bản');
    });
  });
  describe('chi tiết, kết thúc', () => {
    it('xem chi tiết: thông tin + lịch sử', async () => {
      const b = new Browser();
      await b.login('vanthu');
      const p = await b.open('/ChiTiet.aspx?id=6');
      expect(text(p.html, 'ctl00_MainContent_lblTrichYeu')).toContain('(số 6)');
      expect(rows(p.html, 'ctl00_MainContent_gvLichSu').length).toBeGreaterThanOrEqual(1);
    });
    it('Kết thúc là LinkButton: __doPostBack ⇒ trạng thái "Đã kết thúc", thêm lịch sử', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      const p = await b.open('/ChiTiet.aspx?id=5');          // 5 % 4 = 1 ⇒ "Đang xử lý"
      expect(text(p.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đang xử lý');
      expect(p.html).toContain('ctl00$MainContent$lnkKetThuc');
      const r = await b.postback(p, 'ctl00$MainContent$lnkKetThuc', '', { 'ctl00$MainContent$txtYKienKetThuc': 'Đã xong' });
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đã kết thúc');
      expect(text(r.html, 'ctl00_MainContent_lblThongBao')).toBe('Đã kết thúc văn bản');
      expect(rows(r.html, 'ctl00_MainContent_gvLichSu').at(-1)).toEqual(expect.arrayContaining(['Kết thúc', 'Đã xong']));
    });
    it('văn bản đã kết thúc không còn nút Kết thúc', async () => {
      const b = new Browser();
      await b.login('vanthu');
      const p = await b.open('/ChiTiet.aspx?id=2');          // 2 % 4 = 2 ⇒ "Đã kết thúc"
      expect(p.html).not.toContain('lnkKetThuc');
    });
    it('không có văn bản ⇒ báo không tìm thấy', async () => {
      const b = new Browser();
      await b.login('vanthu');
      expect(text((await b.open('/ChiTiet.aspx?id=999')).html, 'ctl00_MainContent_lblLoi')).toBe('Không tìm thấy văn bản');
    });
  });
  describe('tạo dự thảo', () => {
    const F = 'ctl00$MainContent$';
    it('đủ thông tin + tệp ⇒ chuyển sang chi tiết dự thảo mới (mã 36)', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      const p = await b.open('/DuThao.aspx');
      expect(options(p.html, `${F}ddlLoai`).map((o) => o.text)).toEqual(['— Chọn loại —', 'Công văn', 'Quyết định', 'Tờ trình', 'Báo cáo']);
      const r = await b.post(p, { [`${F}ddlLoai`]: '3', [`${F}txtTrichYeu`]: 'V/v xin kinh phí', [`${F}txtNoiDung`]: 'Kính gửi…', [`${F}btnLuu`]: 'Lưu dự thảo' },
        { tep: { [`${F}fuDinhKem`]: { ten: 'to-trinh.pdf', loai: 'application/pdf', noiDung: '%PDF-1.4 thu' } } });
      expect(r.url).toMatch(/ChiTiet\.aspx\?id=36&moi=1$/);
      expect(text(r.html, 'ctl00_MainContent_lblThongBao')).toBe('Đã lưu dự thảo');
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Dự thảo');
      expect(text(r.html, 'ctl00_MainContent_lblTep')).toBe('to-trinh.pdf (12 byte)');
    });
    it('thiếu trích yếu ⇒ validator báo lỗi, không tạo', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      const p = await b.open('/DuThao.aspx');
      const r = await b.post(p, { [`${F}ddlLoai`]: '1', [`${F}txtTrichYeu`]: '', [`${F}btnLuu`]: 'Lưu dự thảo' });
      expect(r.url).toMatch(/DuThao\.aspx$/);
      expect(r.html).toContain('Nhập trích yếu');
      const ds = await b.open('/VanBan.aspx');
      expect(text(ds.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 35 văn bản');
    });
  });
  describe('chuyển, bẫy WebForms', () => {
    const F = 'ctl00$MainContent$';
    async function moChuyen(id = 4) {                       // 4 % 4 = 0 ⇒ "Dự thảo"
      const b = new Browser();
      await b.login('chanhvp');
      return { b, p: await b.open(`/Chuyen.aspx?id=${id}`) };
    }
    it('chọn đơn vị ⇒ gửi lại form ⇒ người nhận của đơn vị đó ⇒ Chuyển ⇒ lịch sử + trạng thái', async () => {
      const { b, p } = await moChuyen();
      expect(options(p.html, `${F}cblNguoiNhan`)).toEqual([]);
      const p2 = await b.postback(p, `${F}ddlDonVi`, '', { [`${F}ddlDonVi`]: '2' });
      const nhan = options(p2.html, `${F}cblNguoiNhan`) as { value: string; text: string; field: string }[];
      expect(nhan.map((o) => o.text)).toEqual(['Lê Thị Chuyên Viên', 'Phạm Văn Tài Chính']);
      const r = await b.post(p2, { [nhan[0]!.field]: nhan[0]!.value, [`${F}txtYKien`]: 'Đề nghị xử lý', [`${F}txtHanXuLy`]: '15/10/2026', [`${F}btnChuyen`]: 'Chuyển' });
      expect(r.url).toMatch(/ChiTiet\.aspx\?id=4$/);
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đang xử lý');
      expect(text(r.html, 'ctl00_MainContent_lblHan')).toBe('15/10/2026');
      expect(rows(r.html, 'ctl00_MainContent_gvLichSu').at(-1)).toEqual(expect.arrayContaining(['Chuyển xử lý', 'Gửi: Lê Thị Chuyên Viên. Ý kiến: Đề nghị xử lý']));
    });
    it('BẪY: bấm Chuyển mà không gửi lại "chọn đơn vị" trước ⇒ bị từ chối, không chuyển', async () => {
      const { b, p } = await moChuyen();
      const r = await b.post(p, { [`${F}ddlDonVi`]: '2', [`${F}cblNguoiNhan$0`]: '3', [`${F}btnChuyen`]: 'Chuyển' });
      expect(r.url).toMatch(/Chuyen\.aspx\?id=4$/);
      expect(r.status === 500 || r.html.includes('Chọn ít nhất một người nhận')).toBe(true);
      expect(text((await b.open('/ChiTiet.aspx?id=4')).html, 'ctl00_MainContent_lblTrangThai')).toBe('Dự thảo');
    });
    it('BẪY: giá trị không có trong ô chọn ⇒ 500 "Invalid postback or callback argument" (EventValidation)', async () => {
      const { b, p } = await moChuyen();
      const r = await b.postback(p, `${F}ddlDonVi`, '', { [`${F}ddlDonVi`]: '99' });
      expect(r.status).toBe(500);
      expect(r.html).toContain('Invalid postback or callback argument');
    });
    it('BẪY: ViewState bị sửa ⇒ 500', async () => {
      const { b, p } = await moChuyen();
      const vs = formFields(p.html).__VIEWSTATE as string;
      const r = await b.postback(p, `${F}ddlDonVi`, '', { [`${F}ddlDonVi`]: '2', __VIEWSTATE: vs.slice(0, -8) + 'AAAAAAAA' });
      expect(r.status).toBe(500);
    });
    it('văn bản đã kết thúc ⇒ không chuyển được', async () => {
      const { p } = await moChuyen(2);
      expect(text(p.html, 'ctl00_MainContent_lblLoi')).toBe('Văn bản đã kết thúc, không chuyển được');
    });
  });
  describe('phát hành', () => {
    const F = 'ctl00$MainContent$';
    it('UpdatePanel: chọn sổ ⇒ phản hồi từng phần có số dự kiến; Phát hành ⇒ cấp số ký hiệu', async () => {
      const b = new Browser();
      await b.login('vanthu');
      const p = await b.open('/PhatHanh.aspx?id=4');        // 4 ⇒ Dự thảo, loại (4 % 4) + 1 = 1 ⇒ Công văn (UBND-VP)
      const d = await b.postback(p, `${F}ddlSo`, '', { [`${F}ddlSo`]: '1' }, `${F}upSo|${F}ddlSo`);
      expect(d.html).toMatch(/^\d+\|updatePanel\|ctl00_MainContent_upSo\|/);
      expect(d.html).toContain('101/2026/UBND-VP');
      // Lấy ViewState mới từ phản hồi từng phần (dạng độ dài|hiddenField|__VIEWSTATE|giá trị|)
      const vs = /\|hiddenField\|__VIEWSTATE\|([^|]*)\|/.exec(d.html)![1]!;
      const ev = /\|hiddenField\|__EVENTVALIDATION\|([^|]*)\|/.exec(d.html)![1]!;
      const r = await b.post(p, { __VIEWSTATE: vs, __EVENTVALIDATION: ev, [`${F}ddlSo`]: '1', [`${F}cblDonViNhan$1`]: '2', [`${F}btnPhatHanh`]: 'Phát hành' });
      expect(r.url).toMatch(/ChiTiet\.aspx\?id=4$/);
      expect(text(r.html, 'ctl00_MainContent_lblSoKyHieu')).toBe('101/2026/UBND-VP');
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đã phát hành');
    });
    it('không phải văn thư ⇒ không phát hành được', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      expect(text((await b.open('/PhatHanh.aspx?id=4')).html, 'ctl00_MainContent_lblLoi')).toBe('Chỉ văn thư được phát hành');
    });
  });
});

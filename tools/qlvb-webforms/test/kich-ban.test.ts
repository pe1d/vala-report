/**
 * Test tích hợp `vala.webform()` (packages/core/runtime/vala-runtime.js) và gói kịch bản của hệ thống giả lập
 * (../kich-ban.js) trong Chrome THẬT: chèn bằng đúng `injectionCode` của @vala/core như Vala Desktop / runner rồi gọi
 * `__vala.run`. Tự bỏ qua khi máy giả lập hoặc Chrome không có.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser as Chrome, type Page } from 'playwright-core';
import { injectionCode } from '../../../packages/core/src/desktopScripts';
import { BASE, Browser, dangChay, rows, text } from './wf';

const GOI = readFileSync(new URL('../kich-ban.js', import.meta.url), 'utf8');

const CHROME = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome';
const up = (await dangChay()) && existsSync(CHROME);
const reset = () => fetch(`${BASE}/_dev/reset`, { method: 'POST' });

let chrome: Chrome;
let ver = 0;

/** Mở trang đã đăng nhập (đăng nhập như người dùng trên form thật). */
async function dangNhap(user = 'vanthu'): Promise<Page> {
  const page = await (await chrome.newContext()).newPage();
  await page.goto(`${BASE}/Login.aspx`);
  await page.fill('#txtTenDangNhap', user);
  await page.fill('#txtMatKhau', 'Qlvb@2026');
  await Promise.all([page.waitForURL(/VanBan\.aspx/), page.click('#btnDangNhap')]);
  return page;
}

/** Chèn một gói chỉ có thao tác `t` với thân `body`, chạy nó. Mỗi lần một phiên bản mới (trang nạp lại gói). */
async function chay(page: Page, body: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: any; error?: string }> {
  const script = `vala.action('t', async (p) => { ${body} });`;
  const code = injectionCode([{ code: 'thu', version: ++ver, matches: [`${BASE}/*`], css: '', script }], page.url());
  await page.evaluate(code!);
  return page.evaluate((a) => (window as any).__vala.run('t', a), args);
}

/** Chèn gói kịch bản của hệ thống giả lập (../kich-ban.js) như Vala Desktop / runner rồi chạy thao tác `ten`. */
async function thaoTac(page: Page, ten: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: any; error?: string; code?: string }> {
  const code = injectionCode([{ code: 'qlvb_thu', version: ++ver, matches: [`${BASE}/*`], css: '', script: GOI }], page.url());
  await page.evaluate(code!);
  return page.evaluate(([n, a]) => (window as any).__vala.run(n, a), [ten, args] as const);
}

/** Kiểm độc lập (không qua gói): chi tiết văn bản đọc bằng khách HTTP của phần 1. */
async function xem(id: number) {
  const b = new Browser();
  await b.login('vanthu');
  const p = await b.open(`/ChiTiet.aspx?id=${id}`);
  return { tt: text(p.html, 'ctl00_MainContent_lblTrangThai'), so: text(p.html, 'ctl00_MainContent_lblSoKyHieu'), tep: text(p.html, 'ctl00_MainContent_lblTep'),
    ls: rows(p.html, 'ctl00_MainContent_gvLichSu') };
}

describe.skipIf(!up)('vala.webform trên WebForms thật', () => {
  beforeAll(async () => { chrome = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-proxy-server'] }); });
  afterAll(async () => { await chrome?.close(); });
  beforeEach(async () => { await reset(); });

  describe('đọc trang, gửi lại form', () => {
    it('mở trang ngầm: trường ẩn, tên ngắn ⇒ tên đầy đủ, trang đang xem không đổi', async () => {
      const page = await dangNhap();
      await page.goto(`${BASE}/ChiTiet.aspx?id=1`);
      const r = await chay(page, `
        const f = await vala.webform('/VanBan.aspx');
        return { url: f.url, status: f.status, ten: f.name('gvVanBan'), ddl: f.name('ddlTrangThai'),
                 coVS: '__VIEWSTATE' in f.fields(), tong: f.read('[id$="_lblTong"]'), dong: f.table('[id$="_gvVanBan"]').length };`);
      expect(r).toEqual({ ok: true, result: { url: `${BASE}/VanBan.aspx`, status: 200, ten: 'ctl00$MainContent$gvVanBan',
        ddl: 'ctl00$MainContent$ddlTrangThai', coVS: true, tong: 'Tổng: 35 văn bản', dong: 10 } });
      expect(page.url()).toBe(`${BASE}/ChiTiet.aspx?id=1`);
    });
    it('postback phân trang: sang trang 4 ⇒ 5 dòng, mã cuối là 1; bảng đọc theo tiêu đề (đã giải dấu)', async () => {
      const page = await dangNhap();
      const r = await chay(page, `
        const f = await vala.webform('/VanBan.aspx');
        await f.postback('gvVanBan', { __EVENTARGUMENT: 'Page$4' });
        const rows = f.table('[id$="_gvVanBan"]');
        return { n: rows.length, cuoi: rows[4]['Mã'], loai: rows[0]['Loại'] };`);
      expect(r.result).toEqual({ n: 5, cuoi: '1', loai: 'Quyết định' });   // dòng đầu trang 4 = mã 5 ⇒ loại (5 % 4) + 1 = 2
    });
    it('postback ô lọc (AutoPostBack) và bấm nút Tìm', async () => {
      const page = await dangNhap();
      const r = await chay(page, `
        const a = await vala.webform('/VanBan.aspx');
        await a.postback('ddlTrangThai', { ddlTrangThai: 'Đã phát hành' });
        const b = await vala.webform('/VanBan.aspx');
        await b.submit('btnTim', { txtTuKhoa: 'tuyển dụng' });
        return [a.read('[id$="_lblTong"]'), b.read('[id$="_lblTong"]'), a.options('ddlTrangThai').find((o) => o.selected).value];`);
      expect(r.result).toEqual(['Tổng: 9 văn bản', 'Tổng: 5 văn bản', 'Đã phát hành']);
    });
  });

  describe('chuyển hướng, CheckBoxList, tệp', () => {
    it('chuyển văn bản: gửi lại "chọn đơn vị" ⇒ người nhận ⇒ bấm Chuyển (có tệp) ⇒ theo chuyển hướng sang chi tiết', async () => {
      const page = await dangNhap('chanhvp');
      const r = await chay(page, `
        const f = await vala.webform('/Chuyen.aspx?id=4');
        const truoc = f.options('cblNguoiNhan').length;
        await f.postback('ddlDonVi', { ddlDonVi: '2' });
        const nhan = f.options('cblNguoiNhan').map((o) => o.text);
        await f.submit('btnChuyen', { cblNguoiNhan: ['Phạm Văn Tài Chính'], txtYKien: 'Đề nghị xử lý', txtHanXuLy: '20/10/2026' },
          { files: { fuDinhKem: { ten: 'to-trinh.pdf', loai: 'application/pdf', base64: btoa('%PDF-1.4 thu') } } });
        return { truoc, nhan, url: f.url, redirected: f.redirected, tt: f.read('[id$="_lblTrangThai"]'), tep: f.read('[id$="_lblTep"]'),
                 ls: f.table('[id$="_gvLichSu"]').pop() };`);
      expect(r.error ?? null).toBeNull();
      expect(r.result).toMatchObject({ truoc: 0, nhan: ['Lê Thị Chuyên Viên', 'Phạm Văn Tài Chính'], url: `${BASE}/ChiTiet.aspx?id=4`, redirected: true,
        tt: 'Đang xử lý', tep: 'to-trinh.pdf (12 byte)' });
      expect(r.result.ls['Nội dung']).toBe('Gửi: Phạm Văn Tài Chính. Ý kiến: Đề nghị xử lý');
    });
    it('tạo dự thảo có tệp ⇒ sang chi tiết dự thảo mới', async () => {
      const page = await dangNhap('chuyenvien');
      const r = await chay(page, `
        const f = await vala.webform('/DuThao.aspx');
        await f.submit('btnLuu', { ddlLoai: 'Tờ trình', txtTrichYeu: 'V/v xin kinh phí', txtNoiDung: 'Kính gửi…' },
          { files: { fuDinhKem: { ten: 'du-toan.xlsx', base64: btoa('abc') } } });
        return [f.url, f.read('[id$="_lblLoai"]'), f.read('[id$="_lblTep"]')];`);
      expect(r.error ?? null).toBeNull();
      expect(r.result).toEqual([`${BASE}/ChiTiet.aspx?id=36&moi=1`, 'Tờ trình', 'du-toan.xlsx (3 byte)']);
    });
  });


  describe('UpdatePanel', () => {
    it('chọn sổ ⇒ gửi một phần trang ⇒ số dự kiến + ViewState mới ⇒ Phát hành dùng được ViewState đó', async () => {
      const page = await dangNhap('vanthu');
      const r = await chay(page, `
        const f = await vala.webform('/PhatHanh.aspx?id=8');
        const vs1 = f.fields().__VIEWSTATE;
        await f.postback('ddlSo', { ddlSo: '1' }, { async: true });
        const duKien = f.$('[id$="_txtSoKyHieu"]').getAttribute('value');
        const vs2 = f.fields().__VIEWSTATE;
        await f.submit('btnPhatHanh', { cblDonViNhan: ['Phòng Nội vụ'] });
        return { duKien, doiVS: vs1 !== vs2, url: f.url, so: f.read('[id$="_lblSoKyHieu"]'), tt: f.read('[id$="_lblTrangThai"]') };`);
      expect(r.error ?? null).toBeNull();
      expect(r.result).toEqual({ duKien: '101/2026/UBND-VP', doiVS: true, url: `${BASE}/ChiTiet.aspx?id=8`, so: '101/2026/UBND-VP', tt: 'Đã phát hành' });
    });
  });


  describe('báo lỗi rõ ràng', () => {
    it('hết phiên ⇒ het_phien', async () => {
      const page = await dangNhap();
      await page.context().clearCookies();
      const r = await chay(page, `await vala.webform('/VanBan.aspx'); return 1;`);
      expect(r).toMatchObject({ ok: false, code: 'het_phien' });
    });
    it('bấm Chuyển mà bỏ bước "chọn đơn vị" (chưa có người nhận) ⇒ du_lieu_khong_hop_le từ validator của máy chủ', async () => {
      const page = await dangNhap('chanhvp');
      const r = await chay(page, `
        const f = await vala.webform('/Chuyen.aspx?id=4');
        await f.submit('btnChuyen', { ddlDonVi: '2' });
        return 1;`);
      expect(r).toMatchObject({ ok: false, code: 'du_lieu_khong_hop_le' });
      expect(r.chi_tiet).toEqual(['Chọn ít nhất một người nhận']);
    });
    it('giá trị không có trong ô chọn ⇒ lỗi rõ trước khi gửi', async () => {
      const page = await dangNhap('chanhvp');
      const r = await chay(page, `const f = await vala.webform('/Chuyen.aspx?id=4'); await f.postback('ddlDonVi', { ddlDonVi: 'Phòng Không Có' }); return 1;`);
      expect(r).toMatchObject({ ok: false, code: 'khong_tim_thay_truong', error: 'Ô ddlDonVi không có lựa chọn Phòng Không Có' });
    });
    it('máy chủ từ chối (EventValidation) ⇒ loi_may_chu kèm câu lỗi', async () => {
      const page = await dangNhap('chanhvp');
      // dựng thân tay (bỏ qua kiểm tra lựa chọn) để chạm tới EventValidation của máy chủ
      const r = await chay(page, `
        const f = await vala.webform('/Chuyen.aspx?id=4');
        const pairs = f._pairs().map((p) => p[0].endsWith('ddlDonVi') ? [p[0], '99'] : p);
        pairs.unshift(['__EVENTTARGET', f.name('ddlDonVi')]);
        await f._send(pairs, {});
        return 1;`);
      expect(r).toMatchObject({ ok: false, code: 'loi_may_chu', error: 'Hệ thống báo lỗi: Invalid postback or callback argument' });
    });
    it('thiếu trích yếu ⇒ du_lieu_khong_hop_le + danh sách lỗi', async () => {
      const page = await dangNhap('chuyenvien');
      const r = await chay(page, `const f = await vala.webform('/DuThao.aspx'); await f.submit('btnLuu', { ddlLoai: '1' }); return 1;`);
      expect(r).toMatchObject({ ok: false, code: 'du_lieu_khong_hop_le', error: 'Dữ liệu không hợp lệ: Nhập trích yếu', chi_tiet: ['Nhập trích yếu'] });
    });
    it('tên trường sai ⇒ khong_tim_thay_truong', async () => {
      const page = await dangNhap();
      const r = await chay(page, `const f = await vala.webform('/VanBan.aspx'); await f.submit('btnKhongCo'); return 1;`);
      expect(r).toMatchObject({ ok: false, code: 'khong_tim_thay_truong', error: 'Trang không có trường btnKhongCo' });
    });
  });


  describe('gói kịch bản 7 thao tác (kich-ban.js)', () => {
    const pdf = [{ ten: 'to-trinh.pdf', loai: 'application/pdf', base64: Buffer.from('%PDF-1.4 thu').toString('base64') }];
    it('lay_danh_muc: loại văn bản, đơn vị kèm người nhận, sổ (văn thư)', async () => {
      const r = await thaoTac(await dangNhap('vanthu'), 'lay_danh_muc');
      expect(r.error ?? null).toBeNull();
      expect(r.result.loai_van_ban.map((x: any) => x.ten)).toEqual(['Công văn', 'Quyết định', 'Tờ trình', 'Báo cáo']);
      expect(r.result.don_vi.map((x: any) => [x.ten, x.nguoi_nhan.length])).toEqual([['Văn phòng', 2], ['Phòng Tài chính', 2], ['Phòng Nội vụ', 2]]);
      expect(r.result.so_van_ban.map((x: any) => x.ten)).toEqual(['Sổ văn bản đi 2026', 'Sổ quyết định 2026']);
    });
    it('lay_danh_sach_van_ban: trang, trạng thái (không phân biệt hoa thường), từ khoá', async () => {
      const page = await dangNhap();
      const t4 = await thaoTac(page, 'lay_danh_sach_van_ban', { trang: 4 });
      expect(t4.result).toMatchObject({ trang: 4, so_trang: 4, tong: 35 });
      expect(t4.result.van_ban.map((v: any) => v.id)).toEqual([5, 4, 3, 2, 1]);
      expect((await thaoTac(page, 'lay_danh_sach_van_ban', { trang_thai: 'đã phát hành' })).result.tong).toBe(9);
      expect((await thaoTac(page, 'lay_danh_sach_van_ban', { tu_khoa: 'tuyển dụng' })).result.tong).toBe(5);
    });
    it('lay_chi_tiet_van_ban', async () => {
      const r = await thaoTac(await dangNhap(), 'lay_chi_tiet_van_ban', { id: 5 });
      expect(r.result).toMatchObject({ id: 5, trang_thai: 'Đang xử lý', loai: 'Quyết định' });
      expect(r.result.lich_su.map((x: any) => x.hanh_dong)).toEqual(['Tạo dự thảo', 'Chuyển xử lý']);
    });
    it('tao_du_thao (có tệp) ⇒ dự thảo mới; kiểm lại độc lập', async () => {
      const r = await thaoTac(await dangNhap('chuyenvien'), 'tao_du_thao', { loai_van_ban: 'tờ trình', trich_yeu: 'V/v xin kinh phí', tep: pdf });
      expect(r.error ?? null).toBeNull();
      expect(r.result).toMatchObject({ id: 36, trang_thai: 'Dự thảo', loai: 'Tờ trình' });
      expect(await xem(36)).toMatchObject({ tt: 'Dự thảo', tep: 'to-trinh.pdf (12 byte)' });
    });
    it('chuyen_van_ban theo tên đơn vị / người nhận ⇒ kiểm lại độc lập', async () => {
      const r = await thaoTac(await dangNhap('chanhvp'), 'chuyen_van_ban', { id: 4, don_vi: 'Phòng Tài chính', nguoi_nhan: ['Lê Thị Chuyên Viên'], y_kien: 'Đề nghị xử lý', han_xu_ly: '20/10/2026' });
      expect(r.error ?? null).toBeNull();
      expect(r.result).toMatchObject({ id: 4, trang_thai: 'Đang xử lý', han_xu_ly: '20/10/2026', lich_su_moi: { hanh_dong: 'Chuyển xử lý', noi_dung: 'Gửi: Lê Thị Chuyên Viên. Ý kiến: Đề nghị xử lý' } });
      const v = await xem(4);
      expect(v.tt).toBe('Đang xử lý');
      expect(v.ls.at(-1)).toEqual(expect.arrayContaining(['Chuyển xử lý', 'Gửi: Lê Thị Chuyên Viên. Ý kiến: Đề nghị xử lý']));
    });
    it('chuyen_van_ban: đơn vị không có ⇒ lỗi kèm danh sách hợp lệ, không chuyển', async () => {
      const r = await thaoTac(await dangNhap('chanhvp'), 'chuyen_van_ban', { id: 4, don_vi: 'Phòng Không Có', nguoi_nhan: ['x'] });
      expect(r).toMatchObject({ ok: false, error: 'Đơn vị "Phòng Không Có" không có. Chọn một trong: Văn phòng, Phòng Tài chính, Phòng Nội vụ' });
      expect((await xem(4)).tt).toBe('Dự thảo');
    });
    it('ket_thuc_van_ban: đang xử lý ⇒ kết thúc; đã kết thúc ⇒ lỗi', async () => {
      const page = await dangNhap('chuyenvien');
      expect((await thaoTac(page, 'ket_thuc_van_ban', { id: 5, y_kien: 'Xong' })).result).toEqual({ id: 5, trang_thai: 'Đã kết thúc' });
      expect((await xem(5)).tt).toBe('Đã kết thúc');
      expect(await thaoTac(page, 'ket_thuc_van_ban', { id: 2 })).toMatchObject({ ok: false, error: 'Văn bản đã kết thúc, không kết thúc được' });
    });
    it('phat_hanh_van_ban (UpdatePanel) ⇒ số ký hiệu; kiểm lại độc lập', async () => {
      const r = await thaoTac(await dangNhap('vanthu'), 'phat_hanh_van_ban', { id: 8, so_van_ban: 'Sổ văn bản đi 2026', don_vi_nhan: ['Phòng Nội vụ'] });
      expect(r.error ?? null).toBeNull();
      expect(r.result).toEqual({ id: 8, so_ky_hieu: '101/2026/UBND-VP', so_du_kien: '101/2026/UBND-VP' });
      expect(await xem(8)).toMatchObject({ tt: 'Đã phát hành', so: '101/2026/UBND-VP' });
    });
    it('phat_hanh_van_ban: không phải văn thư ⇒ lỗi nghiệp vụ của trang', async () => {
      expect(await thaoTac(await dangNhap('chuyenvien'), 'phat_hanh_van_ban', { id: 8, so_van_ban: '1' })).toMatchObject({ ok: false, error: 'Chỉ văn thư được phát hành' });
    });
  });

});

"""
Test vala_sdk.WebForm (T07 phần 4) — chạy offline trên trang HTML thật chụp từ hệ thống WebForms giả lập
(tools/qlvb-webforms; chụp lại: xem test_fixtures/README.md).

    python3 -m venv /tmp/venv && /tmp/venv/bin/pip install requests==2.32.3 beautifulsoup4==4.12.3
    /tmp/venv/bin/python -m unittest discover -s crawlers/_sdk -p 'test_*.py'

(Cùng phiên bản thư viện với Crawlab.)
"""
import os
import unittest
from urllib.parse import parse_qsl

from vala_sdk import SessionExpired, SourceResponseError, WebForm, WebFormError

HERE = os.path.dirname(__file__)
F = 'ctl00$MainContent$'


def fx(name):
    with open(os.path.join(HERE, 'test_fixtures', name), encoding='utf-8') as f:
        return f.read()


class Resp:
    """Phản hồi giả: như máy chủ Mono thật — Content-Type KHÔNG có charset (bảng mã lấy từ <meta charset>)."""

    def __init__(self, status=200, text='', headers=None):
        self.status_code = status
        self.content = text.encode('utf-8')
        self.headers = headers or {'Content-Type': 'text/html'}

    @property
    def text(self):   # như requests: không có charset ⇒ ISO-8859-1 (SDK không được dùng thuộc tính này)
        return self.content.decode('iso-8859-1')


class FakeHttp:
    """Thay requests.Session: ghi lại request, trả lần lượt các phản hồi đã định."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.sent = []

    def request(self, method, url, **kw):
        self.sent.append((method, url, kw))
        return self.responses.pop(0)


class FakeRun:
    def __init__(self, responses):
        self.base_url = 'http://localhost:4030'
        self.http = FakeHttp(responses)
        self.calls = 0

    def _throttle(self):
        pass

    def webform(self, path, form=None):
        return WebForm(self, path, form=form)


def body(sent):
    """Thân urlencoded của request ⇒ list cặp (giữ thứ tự, giữ trường lặp)."""
    return parse_qsl(sent[2]['data'], keep_blank_values=True)


class DocTrang(unittest.TestCase):
    def setUp(self):
        self.f = FakeRun([Resp(200, fx('van-ban-trang-1.html'))]).webform('/VanBan.aspx')

    def test_mo_trang(self):
        self.assertEqual(self.f.url, 'http://localhost:4030/VanBan.aspx')
        self.assertEqual(self.f.status, 200)
        self.assertIn('__VIEWSTATE', self.f.fields())

    def test_ten_ngan_va_dich_postback(self):
        self.assertEqual(self.f.name('ddlTrangThai'), F + 'ddlTrangThai')
        self.assertEqual(self.f.name('gvVanBan'), F + 'gvVanBan')       # GridView: chỉ có trong __doPostBack
        self.assertEqual(self.f.name('__EVENTTARGET'), '__EVENTTARGET')
        with self.assertRaises(WebFormError) as e:
            self.f.name('khongCo')
        self.assertEqual(e.exception.code, 'khong_tim_thay_truong')

    def test_bang_theo_tieu_de_da_giai_dau_bo_dong_so_trang(self):
        rows = self.f.table('[id$="_gvVanBan"]')
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[0]['Mã'], '35')
        self.assertEqual(rows[0]['Loại'], 'Báo cáo')                  # B&#225;o c&#225;o ⇒ Báo cáo
        self.assertEqual(set(rows[0]), {'Mã', 'Số ký hiệu', 'Trích yếu', 'Loại', 'Trạng thái', 'Ngày tạo', 'Người đang xử lý'})

    def test_lien_ket_trong_o(self):
        self.assertEqual(self.f.table('[id$="_gvVanBan"]', links=True)[0]['_links']['Trích yếu'], 'ChiTiet.aspx?id=35')

    def test_doc_chu(self):
        self.assertEqual(self.f.read('[id$="_lblTong"]'), 'Tổng: 35 văn bản')
        self.assertEqual(self.f.read('[id$="_lblUser"]'), 'Nguyễn Thị Văn Thư (vanthu)')
        self.assertIsNone(self.f.read('#khong-co'))

    def test_lua_chon(self):
        opts = self.f.options('ddlTrangThai')
        self.assertEqual([o['text'] for o in opts], ['— Tất cả —', 'Dự thảo', 'Đang xử lý', 'Đã kết thúc', 'Đã phát hành'])
        self.assertTrue(opts[0]['selected'])

    def test_trang_sau(self):
        self.assertEqual(self.f.next_page('gvVanBan'), 'Page$2')
        f4 = FakeRun([Resp(200, fx('van-ban-trang-4.html'))]).webform('/VanBan.aspx')
        self.assertIsNone(f4.next_page('gvVanBan'))
        self.assertEqual(len(f4.table('[id$="_gvVanBan"]')), 5)


class GuiForm(unittest.TestCase):
    def test_postback_mang_trang_thai_va_doi_trang(self):
        run = FakeRun([Resp(200, fx('van-ban-trang-1.html')), Resp(200, fx('van-ban-trang-4.html'))])
        f = run.webform('/VanBan.aspx')
        vs = f.fields()['__VIEWSTATE']
        f.postback('gvVanBan', argument='Page$4')
        method, url, kw = run.http.sent[1]
        self.assertEqual((method, url), ('POST', 'http://localhost:4030/VanBan.aspx'))
        sent = dict(body(run.http.sent[1]))
        self.assertEqual(sent['__EVENTTARGET'], F + 'gvVanBan')
        self.assertEqual(sent['__EVENTARGUMENT'], 'Page$4')
        self.assertEqual(sent['__VIEWSTATE'], vs)
        self.assertFalse(any(k.endswith('btnTim') for k, _ in body(run.http.sent[1])))   # không gửi nút
        self.assertEqual(len(f.table('[id$="_gvVanBan"]')), 5)
        self.assertEqual(run.calls, 2)

    def test_submit_gui_nut_va_doi_chu_hien_thi_sang_ma(self):
        run = FakeRun([Resp(200, fx('van-ban-trang-1.html')), Resp(200, fx('van-ban-trang-1.html'))])
        f = run.webform('/VanBan.aspx')
        f.submit('btnTim', {'txtTuKhoa': 'tuyển dụng', 'ddlTrangThai': 'đã phát hành'})
        sent = dict(body(run.http.sent[1]))
        self.assertEqual(sent[F + 'btnTim'], 'Tìm')
        self.assertEqual(sent[F + 'txtTuKhoa'], 'tuyển dụng')
        self.assertEqual(sent[F + 'ddlTrangThai'], 'Đã phát hành')
        self.assertEqual(sent['__EVENTTARGET'], '')

    def test_gia_tri_khong_co_trong_o_chon(self):
        f = FakeRun([Resp(200, fx('van-ban-trang-1.html'))]).webform('/VanBan.aspx')
        with self.assertRaises(WebFormError) as e:
            f.postback('ddlTrangThai', {'ddlTrangThai': 'Không có'})
        self.assertEqual(e.exception.code, 'khong_tim_thay_truong')

    def test_di_theo_chuyen_huong(self):
        run = FakeRun([Resp(200, fx('van-ban-trang-1.html')), Resp(302, '', {'Location': '/VanBan.aspx?x=1'}), Resp(200, fx('van-ban-trang-4.html'))])
        f = run.webform('/VanBan.aspx')
        f.submit('btnTim')
        self.assertEqual(run.http.sent[2][:2], ('GET', 'http://localhost:4030/VanBan.aspx?x=1'))
        self.assertEqual(f.url, 'http://localhost:4030/VanBan.aspx?x=1')
        self.assertTrue(f.redirected)


class UpdatePanel(unittest.TestCase):
    def test_gui_mot_phan_trang_va_vá_trang_thai(self):
        run = FakeRun([Resp(200, fx('phat-hanh.html')), Resp(200, fx('phat-hanh-delta.txt'))])
        f = run.webform('/PhatHanh.aspx?id=8')
        vs = f.fields()['__VIEWSTATE']
        f.postback('ddlSo', {'ddlSo': '1'}, async_=True)
        method, url, kw = run.http.sent[1]
        self.assertEqual(kw['headers']['X-MicrosoftAjax'], 'Delta=true')
        sent = dict(body(run.http.sent[1]))
        self.assertEqual(sent['ctl00$sm'], F + 'upSo|' + F + 'ddlSo')   # Mono không khai UpdatePanel ⇒ khối cha có id
        self.assertEqual(sent['__ASYNCPOST'], 'true')
        self.assertEqual(f.value('[id$="_txtSoKyHieu"]'), '101/2026/UBND-VP')
        self.assertNotEqual(f.fields()['__VIEWSTATE'], vs)


class Loi(unittest.TestCase):
    def test_ve_trang_dang_nhap_la_het_phien(self):
        run = FakeRun([Resp(302, '', {'Location': '/Login.aspx?ReturnUrl=%2fVanBan.aspx'})])
        with self.assertRaises(SessionExpired):
            run.webform('/VanBan.aspx')

    def test_trang_loi_aspnet(self):
        run = FakeRun([Resp(200, fx('van-ban-trang-1.html')), Resp(500, fx('loi-event-validation.html'))])
        f = run.webform('/VanBan.aspx')
        with self.assertRaises(SourceResponseError) as e:
            f.postback('ddlTrangThai')
        self.assertIn('Invalid postback or callback argument', str(e.exception))

    def test_loi_kiem_tra_du_lieu(self):
        # Mở trang không kiểm (trang có thể đang hiện lỗi cũ); chỉ sau khi GỬI mà vẫn ở trang đó mới báo.
        run = FakeRun([Resp(200, fx('du-thao-loi.html')), Resp(200, fx('du-thao-loi.html'))])
        f = run.webform('/DuThao.aspx')
        with self.assertRaises(WebFormError) as e:
            f.submit('btnLuu')
        self.assertEqual(e.exception.code, 'du_lieu_khong_hop_le')
        self.assertEqual(e.exception.chi_tiet, ['Nhập trích yếu'])

if __name__ == '__main__':
    unittest.main()

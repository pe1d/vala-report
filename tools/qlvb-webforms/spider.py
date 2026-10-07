"""
Spider "QLVB thử — danh sách văn bản" (mã qlvb_thu_van_ban) cho hệ thống ASP.NET WebForms giả lập (T07 phần 4).
Bản MẪU: bản chạy thật lưu trong CSDL (Script crawl) — nạp bằng `node tools/qlvb-webforms/nap-vao-vala.mjs`.

Hệ thống không có API: mở trang danh sách, đọc bảng GridView, sang trang bằng cách gửi lại form (__doPostBack
'Page$N') — vala_sdk.WebForm giữ đúng __VIEWSTATE / __EVENTVALIDATION qua từng lần gửi. Đọc ĐỦ mọi trang (adapter
close_missing: văn bản không thấy trong lượt chạy ⇒ đóng lại).
"""
import re

from vala_sdk import SchemaDrift, SessionExpired, Vala

BANG = '[id$="_gvVanBan"]'
COT = {'Mã': 'ma', 'Số ký hiệu': 'so_ky_hieu', 'Trích yếu': 'trich_yeu', 'Loại': 'loai', 'Trạng thái': 'trang_thai',
       'Ngày tạo': 'ngay_tao', 'Người đang xử lý': 'nguoi_xu_ly'}
TOI_DA_TRANG = 500


def crawl(run):
    f = run.webform('/VanBan.aspx')
    # "Nguyễn Thị Văn Thư (vanthu)" ⇒ tài khoản nguồn của người này (chống gán nhầm chủ dữ liệu).
    m = re.search(r'\(([\w.@-]+)\)\s*$', f.read('[id$="_lblUser"]') or '')
    if not m:
        raise SessionExpired('không thấy tên đăng nhập trên trang — phiên không còn')
    run.account(m.group(1))

    items = {}
    for _ in range(TOI_DA_TRANG):
        rows = f.table(BANG)
        if rows and set(COT) - set(rows[0]):
            raise SchemaDrift(f'bảng văn bản thiếu cột: {", ".join(sorted(set(COT) - set(rows[0])))}')
        for r in rows:
            item = {COT[k]: v for k, v in r.items() if k in COT}
            items[item['ma']] = item
        nxt = f.next_page('gvVanBan')
        if not nxt:
            break
        f.postback('gvVanBan', argument=nxt)
    tong = re.search(r'\d+', f.read('[id$="_lblTong"]') or '')
    if tong and int(tong.group()) != len(items):
        raise SchemaDrift(f'trang báo {tong.group()} văn bản nhưng đọc được {len(items)}')
    run.save('van_ban', list(items.values()))


if __name__ == '__main__':
    Vala().run('qlvb_thu_van_ban', crawl)

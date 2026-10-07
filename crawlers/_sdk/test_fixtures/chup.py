# Chụp trang HTML thật của hệ thống WebForms giả lập (tools/qlvb-webforms, phải đang chạy) làm dữ liệu test cho vala_sdk.WebForm.
#   python3 -I crawlers/_sdk/test_fixtures/chup.py crawlers/_sdk/test_fixtures
# Giải mã bằng UTF-8 (máy chủ Mono không gửi charset; r.text sẽ đoán sai ISO-8859-1).
import re, sys, requests
B = 'http://localhost:4030'; D = sys.argv[1]
s = requests.Session(); s.trust_env = False
requests.post(B + '/_dev/reset', proxies={})
def hidden(h): return dict(re.findall(r'<input type="hidden" name="(__\w+)" id="\w+" value="([^"]*)"', h))
T = lambda r: r.content.decode('utf-8')
lg = T(s.get(B + '/Login.aspx'))
s.post(B + '/Login.aspx', data={**hidden(lg), 'txtTenDangNhap': 'vanthu', 'txtMatKhau': 'Qlvb@2026', 'btnDangNhap': 'Đăng nhập'})
def save(name, text): open(f'{D}/{name}', 'w', encoding='utf-8').write(text)
p1 = T(s.get(B + '/VanBan.aspx')); save('van-ban-trang-1.html', p1)
F = 'ctl00$MainContent$'
p4 = T(s.post(B + '/VanBan.aspx', data={**hidden(p1), '__EVENTTARGET': F + 'gvVanBan', '__EVENTARGUMENT': 'Page$4', F + 'ddlTrangThai': '', F + 'txtTuKhoa': ''})); save('van-ban-trang-4.html', p4)
ph = T(s.get(B + '/PhatHanh.aspx?id=8')); save('phat-hanh.html', ph)
d = T(s.post(B + '/PhatHanh.aspx?id=8', data={**hidden(ph), 'ctl00$sm': F + 'upSo|' + F + 'ddlSo', '__EVENTTARGET': F + 'ddlSo', '__ASYNCPOST': 'true', F + 'ddlSo': '1'}, headers={'X-MicrosoftAjax': 'Delta=true'})); save('phat-hanh-delta.txt', d)
dt = T(s.get(B + '/DuThao.aspx'))
bad = T(s.post(B + '/DuThao.aspx', data={**hidden(dt), F + 'ddlLoai': '1', F + 'txtTrichYeu': '', F + 'btnLuu': 'Lưu dự thảo'})); save('du-thao-loi.html', bad)
ch = T(s.get(B + '/Chuyen.aspx?id=4'))
e = s.post(B + '/Chuyen.aspx?id=4', data={**hidden(ch), '__EVENTTARGET': F + 'ddlDonVi', F + 'ddlDonVi': '99'}); save('loi-event-validation.html', T(e))
print('xong', e.status_code, len(p1), len(p4), len(d))

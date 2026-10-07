# T07 phần 3 — Ghi bằng gói kịch bản (`vala.webform`) — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm `vala.webform()` vào bộ hàm `vala` để kịch bản gửi form WebForms trực tiếp (giữ trạng thái qua nhiều lần gửi,
UpdatePanel, tệp, báo lỗi rõ), và viết gói kịch bản 7 thao tác cho hệ thống giả lập, chạy được ở Vala Desktop lẫn runner.

**Architecture:** `vala.webform(url)` tải trang bằng `fetch` (cookie của trang), đọc HTML bằng `DOMParser`, giữ một
`Document` làm trạng thái form. `postback` / `submit` dựng thân như trình duyệt (trạng thái hiện tại + trường đè), gửi, rồi
thay trạng thái bằng trang trả về (UpdatePanel: vá vùng + trường ẩn từ phản hồi từng phần). Không đụng trang đang xem. Chỉ
sửa `packages/core/runtime/vala-runtime.js` — tệp này đã được Desktop đóng gói và runner chèn, nên hai nơi tự có.

**Tech Stack:** JS thuần trong trang (fetch, DOMParser, FormData, Blob), playwright-core 1.49 + Chrome để test tích hợp,
runner (`apps/runner`) để chạy trên máy chủ.

Spec: `docs/superpowers/specs/2026-10-07-t07-aspnet-design.md` (phần 3).

## API (khớp bản nháp của phần 2)

```js
const f = await vala.webform(url, { form? })   // form: CSS chọn form (mặc định form có __VIEWSTATE, không thì form đầu)
f.url, f.status, f.doc                          // trang hiện tại (sau chuyển hướng), Document đã parse
f.name(ten)                                     // tên ngắn ⇒ tên đầy đủ (khớp đúng / khớp đuôi `$ten`); 0 hoặc >1 ⇒ lỗi
f.fields()                                      // trạng thái form như trình duyệt sẽ gửi (không gồm nút)
f.options(ten)                                  // select ⇒ [{value,text,selected}]; CheckBoxList/RadioButtonList ⇒ [{value,text,selected}]
f.$(sel), f.read(sel), f.table(sel)             // đọc trang hiện tại; table bỏ dòng số trang (bảng lồng) của GridView
await f.postback(target, fields?, { async?, panel?, argument? })   // __doPostBack; trả f
await f.submit(button | null, fields?, { files? })                 // bấm nút; files: { ten: { ten, loai?, base64 } }
```

- `fields`: `{ ten: string | string[] }`, tên ngắn hoặc đầy đủ. CheckBoxList: tên gốc + mảng giá trị (đặt đúng
  `tên$i=<giá trị>`, bỏ tích các mục khác). Ô chọn nhiều: mảng ⇒ nhiều mục.
- Thân: có tệp hoặc form `multipart/form-data` ⇒ `FormData`; không thì urlencoded.
- UpdatePanel (`async`): header `X-MicrosoftAjax: Delta=true`, `__ASYNCPOST=true`, trường ScriptManager (tên lấy từ
  `PageRequestManager._initialize('<tên>'`) = `<UpdatePanel>|<target>`. Vùng: `opts.panel`, hoặc trong danh sách
  `_updateControls(['t…'])`, hoặc (Mono để rỗng) khối cha gần nhất có id bao quanh target. Phản hồi: `updatePanel` ⇒ thay
  nội dung phần tử; `hiddenField` ⇒ đặt trường ẩn; `pageRedirect` ⇒ tải trang đó; `error` ⇒ lỗi máy chủ.
- **Lỗi** (ném `Error` có `code`, thông báo tiếng Việt; `vala.__vala.run` trả `{ ok:false, error }`):
  - `het_phien`: bị đưa về trang có `ReturnUrl=` hoặc trang đăng nhập (đường dẫn có `login`) khi không gọi trang đó;
  - `loi_may_chu`: HTTP ≥ 500 hoặc trang lỗi ASP.NET — thông báo gồm dòng lỗi (`Invalid postback or callback argument`,
    `…Exception: …`, `Validation of viewstate MAC failed`);
  - `du_lieu_khong_hop_le`: sau khi gửi, trang có ValidationSummary đang hiện (`<div …><ul><li>…`) hoặc validator đang
    hiện có thông báo — kèm danh sách lỗi;
  - `khong_tim_thay_truong` / `truong_trung_ten`: `name()` không khớp / khớp nhiều.

## Gói kịch bản hệ thống giả lập (`tools/qlvb-webforms/kich-ban.js`)

Mẫu địa chỉ `http://localhost:4030/*`. Chọn phần tử bằng đuôi id (`[id$="_lblTong"]`) để chạy được cả id kiểu Mono
(`ctl00_MainContent_…`) lẫn .NET 4 (`MainContent_…`). Thao tác: `lay_danh_muc`, `lay_danh_sach_van_ban`,
`lay_chi_tiet_van_ban`, `tao_du_thao`, `chuyen_van_ban`, `ket_thuc_van_ban`, `phat_hanh_van_ban` (tham số, kết quả như spec).
Giá trị chọn nhận mã hoặc tên (so khớp không phân biệt hoa thường, bỏ khoảng trắng thừa). Thao tác ghi đọc lại để xác nhận,
không tự thử lại. Lỗi nghiệp vụ trên trang (`[id$="_lblLoi"]`) ⇒ ném lỗi với đúng câu đó.

## Tệp

| Tệp | Việc |
|---|---|
| `packages/core/runtime/vala-runtime.js` | thêm `webform` |
| `tools/qlvb-webforms/kich-ban.js` | gói 7 thao tác (bản mẫu; bản thật lưu CSDL) |
| `tools/qlvb-webforms/nap-kich-ban.mjs` | nạp / cập nhật gói vào CSDL dev qua API quản trị |
| `tools/qlvb-webforms/test/kich-ban.test.ts` | test tích hợp: Chrome thật + `injectionCode` của `@vala/core` |
| `tools/qlvb-webforms/package.json` | thêm `playwright-core` |
| `docs/kich-ban-desktop.md`, `docs/tich-hop-aspnet.md` | mục `vala.webform`, mục "2. Viết thao tác ghi" |

## Task

1. **Khung test tích hợp** — `kich-ban.test.ts`: mở Chrome (`CHROMIUM_PATH` hoặc `/usr/bin/google-chrome`), đăng nhập hệ
   thống giả lập, chèn `injectionCode([gói], url)` vào trang, gọi `__vala.run`. Bỏ qua khi máy giả lập / Chrome không có.
2. **`webform` cơ bản (TDD)** — test: mở `/VanBan.aspx`, `name('gvVanBan')`, `fields()` có `__VIEWSTATE`; `postback('gvVanBan',
   { __EVENTARGUMENT: 'Page$4' })` ⇒ `table` 5 dòng; `postback('ddlTrangThai', { ddlTrangThai: 'Đã phát hành' })` ⇒ tổng 9;
   `submit('btnTim', { txtTuKhoa: 'tuyển dụng' })` ⇒ 5; trang đang xem không đổi URL. Viết `webform`, `name`, `fields`,
   `options`, `read`, `table`, `postback`, `submit` (urlencoded) ⇒ qua.
3. **Chuyển hướng, CheckBoxList, tệp (TDD)** — test: `Chuyen.aspx?id=4` ⇒ `postback('ddlDonVi', { ddlDonVi: '2' })` ⇒
   `options('cblNguoiNhan')` 2 người ⇒ `submit('btnChuyen', { cblNguoiNhan: ['3'], txtYKien }, { files })` ⇒ `f.url` là
   `ChiTiet.aspx?id=4`, lịch sử có dòng chuyển; `DuThao.aspx` có tệp ⇒ chi tiết hiện tên tệp. Viết multipart + đi theo
   chuyển hướng + CheckBoxList ⇒ qua.
4. **UpdatePanel (TDD)** — test: `PhatHanh.aspx?id=8` ⇒ `postback('ddlSo', { ddlSo: '1' }, { async: true })` ⇒
   `read('[id$=_txtSoKyHieu]')` = `101/2026/UBND-VP`, `__VIEWSTATE` mới khác cũ ⇒ `submit('btnPhatHanh', …)` thành công.
5. **Báo lỗi (TDD)** — test: mất phiên ⇒ `het_phien`; người nhận lạ / bỏ bước chọn đơn vị ⇒ `loi_may_chu` kèm dòng lỗi;
   thiếu trích yếu ⇒ `du_lieu_khong_hop_le` + `['Nhập trích yếu']`; tên trường sai ⇒ `khong_tim_thay_truong`.
6. **Gói 7 thao tác (TDD)** — test từng thao tác qua `__vala.run`: kết quả đúng + kiểm lại bằng `test/wf.ts` trên hệ
   thống giả lập; lỗi nghiệp vụ (chuyên viên phát hành, kết thúc văn bản chưa xử lý) trả `{ ok:false, error:'…' }`.
7. **Chạy hai nơi** — runner thật (`apps/runner`, Chrome máy dev) gọi `POST /run` với cookie đăng nhập hệ thống giả lập +
   gói ⇒ `chuyen_van_ban` thành công; Vala Desktop (Playwright `_electron`, tab hệ thống giả lập) chèn gói ⇒ `tao_du_thao`
   thành công. Chạy lại **bản nháp** sinh ở phần 2 (sau khi thay `p.tep_base64`) ⇒ chuyển được.
8. **Nạp vào CSDL dev + tài liệu** — `nap-kich-ban.mjs` (đăng nhập API quản trị, tạo/cập nhật gói `qlvb_thu`); cập nhật
   `docs/kich-ban-desktop.md` (bảng hàm + `webform`) và `docs/tich-hop-aspnet.md` mục 2.

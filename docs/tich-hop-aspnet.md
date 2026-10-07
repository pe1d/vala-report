# Tích hợp hệ thống ASP.NET không có API

Việc T07 trong biên bản họp Vala Desktop. Nhiều hệ thống của cơ quan nhà nước (quản lý văn bản, một cửa…) viết bằng
**ASP.NET WebForms**: không có API, mọi thao tác là gửi lại form (`__doPostBack`) kèm `__VIEWSTATE`. Tài liệu này hướng dẫn
cách Vala đọc và ghi vào những hệ thống đó. Thiết kế: `docs/superpowers/specs/2026-10-07-t07-aspnet-design.md`.

**Cách làm:** gửi form trực tiếp, có theo dõi trạng thái. Kịch bản không bấm nút trên giao diện. Nó tải trang ngầm, đọc
các trường ẩn, rồi gửi lại form theo đúng chuỗi mà trình duyệt gửi. Cùng một kịch bản chạy được trong Vala Desktop lẫn trên
máy chủ (runner). Để biết "chuỗi mà trình duyệt gửi", dùng công cụ bắt request ở mục 1.

Muốn thử mà không cần hệ thống thật: `tools/qlvb-webforms`, là một hệ thống quản lý văn bản WebForms thật chạy bằng Mono
(`docker compose --profile qlvb up -d qlvb-webforms`, http://localhost:4030).

## 1. Bắt request

### Dùng

1. Mở hệ thống trong Vala Desktop, đăng nhập nếu cần.
2. Chuột phải lên tab của hệ thống ⇒ **Bắt đầu ghi thao tác**. Tab hiện chấm đỏ.
3. Thao tác như bình thường. Mỗi nghiệp vụ nên ghi một lượt riêng, ví dụ chỉ một lần "chuyển văn bản".
4. Chuột phải ⇒ **Dừng ghi thao tác** ⇒ mở tab **Bản ghi thao tác**.

Tab Bản ghi có danh sách bước (bấm vào để xem chi tiết), nút **Lưu ra tệp** (.json), **Sao chép JSON** và **Bản nháp
kịch bản**. Bản nháp là mã `vala.action(…)` dùng `vala.webform()` để dán vào Quản trị → Kịch bản Desktop rồi sửa.

Mục ghi có trên mọi tab trang web, trừ tab Vala và tab Báo cáo. Mỗi lúc chỉ ghi được một tab: bắt đầu ghi tab khác thì bản
đang ghi dừng lại.

### Cái gì được ghi

Mỗi lần tải trang, gửi form, XHR/fetch của tab đó, kể cả iframe, là một bước. Ảnh, CSS, JS không được ghi. Mỗi bước có:

- phương thức, địa chỉ, các trường đã gửi, tệp đính kèm;
- mã phản hồi, địa chỉ chuyển hướng;
- tên các trường ẩn và nút có trên trang trả về;
- với UpdatePanel: id các vùng trang được cập nhật.

Tên bước tự đặt theo cách WebForms gửi:

| Tên bước | Nghĩa |
|---|---|
| `Mở /Chuyen.aspx?id=4` | tải trang (GET) |
| `Gửi lại form: ddlDonVi` | `__EVENTTARGET` = ô đó: AutoPostBack (ô chọn tự gửi) hoặc LinkButton |
| `Sang trang 2: gvVanBan` | GridView phân trang (`__EVENTARGUMENT` = `Page$2`) |
| `Bấm btnChuyen (“Chuyển”)` | bấm nút submit (tên nút có trong trường gửi đi) |
| `… (UpdatePanel)` | gửi một phần trang (header `X-MicrosoftAjax`), phản hồi dạng `độ dài\|loại\|id\|nội dung\|` |
| `Đăng nhập (đã che mật khẩu)` | form có ô mật khẩu |

### An toàn

Bản ghi chỉ nằm trên máy, không gửi lên máy chủ; tắt app là mất trừ khi đã **Lưu ra tệp**.

- Không ghi cookie, header `Authorization`, nội dung phản hồi (chỉ đọc lấy **tên** trường), nội dung tệp (chỉ tên, loại,
  kích thước).
- Ô mật khẩu được che (`••••`): ô `type=password` trên trang, hoặc tên có `pass`, `pwd`, `matkhau`, `password`.
- `__VIEWSTATE`, `__EVENTVALIDATION`, `__RequestVerificationToken` chỉ ghi độ dài.

### Đọc bản ghi để viết kịch bản

- Chuỗi điển hình của một nghiệp vụ WebForms: **mở trang** ⇒ **gửi lại form** cho từng ô AutoPostBack, ví dụ chọn đơn vị
  để nạp người nhận ⇒ **bấm nút** ⇒ **chuyển hướng** sang trang kết quả. Kịch bản phải gửi lại đủ các bước giữa: bỏ bước
  "gửi lại form" thì máy chủ từ chối, vì `__EVENTVALIDATION` không có các lựa chọn mới.
- Ô chọn nhiều (CheckBoxList) gửi `tên$<thứ tự>=<giá trị>`; bản nháp gộp về tên gốc thành mảng.
- Ô nhiều dòng của WebForms hay gửi kèm khoảng trắng dù người dùng không gõ; bản nháp coi là trống.
- Bước đăng nhập không đưa vào kịch bản: kịch bản chạy trong phiên đã đăng nhập (Vala Desktop / phiên lưu trên máy chủ).

### Giới hạn

- Tab đang mở **DevTools** thì không ghi được (Chromium chỉ cho một trình gỡ lỗi). Đóng DevTools rồi thử lại.
- Tối đa **200 bước** mỗi lượt; đủ thì tự dừng và báo.
- Form **có tệp đính kèm**: Chromium không đưa thân request ra giao thức gỡ lỗi. Trong lúc ghi, Vala Desktop gài vào trang
  một đoạn script đọc form ngay lúc gửi (`FormData`, kể cả `form.submit()` của `__doPostBack`), và gỡ khi dừng ghi.
  Không đọc được thì bước ghi chú "không đọc được thân request".
- Đóng tab hoặc tắt app ⇒ dừng ghi và báo.

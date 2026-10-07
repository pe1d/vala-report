# QLVB Thử nghiệm — hệ thống ASP.NET WebForms giả lập (T07)

Hệ thống quản lý văn bản nhỏ viết bằng **ASP.NET WebForms thật** (Mono 6.12 + xsp4), để thử cách Vala đọc và ghi vào một hệ
thống không có API (biên bản họp 10/2026, việc T07). Thiết kế: `docs/superpowers/specs/2026-10-07-t07-aspnet-design.md`.
Chỉ dùng để thử, không triển khai cho người dùng.

## Chạy

    docker compose --profile qlvb up -d --build qlvb-webforms     # http://localhost:4030
    pnpm --filter @vala/qlvb-webforms test                        # tự bỏ qua nếu máy giả lập chưa chạy
    curl -XPOST localhost:4030/_dev/reset                         # về dữ liệu mẫu ban đầu

- Máy dev sau proxy: đặt `HTTP_PROXY` / `HTTPS_PROXY` khi build, vì ảnh cần tải `mono-xsp4`.
- Ảnh dựa trên `mono:6.12` (Debian buster đã hết hỗ trợ), nên `Dockerfile` trỏ nguồn apt về `archive.debian.org`.
- Mã trang là C# nội tuyến trong `.aspx`; `xsp4` biên dịch lúc chạy. Sửa trang xong thì build lại ảnh.

## Tài khoản (mật khẩu chung `Qlvb@2026`)

| Tên đăng nhập | Họ tên | Đơn vị | Ghi chú |
|---|---|---|---|
| vanthu | Nguyễn Thị Văn Thư | Văn phòng | được phát hành |
| chanhvp | Trần Văn Chánh | Văn phòng | |
| chuyenvien | Lê Thị Chuyên Viên | Phòng Tài chính | |
| truongtc | Phạm Văn Tài Chính | Phòng Tài chính | |
| truongnv | Hoàng Thị Nội Vụ | Phòng Nội vụ | |
| canbonv | Đỗ Văn Cán Bộ | Phòng Nội vụ | |

Dữ liệu mẫu có 35 văn bản. Trạng thái theo mã chia 4: dư 0 là Dự thảo, dư 1 Đang xử lý, dư 2 Đã kết thúc, dư 3 Đã phát hành.
Loại văn bản là `(mã % 4) + 1`: Công văn, Quyết định, Tờ trình, Báo cáo. Có 2 sổ: Sổ văn bản đi 2026 (số tiếp theo 101), Sổ
quyết định 2026 (số tiếp theo 21).

## Các trang

| Trang | Chức năng | Điểm WebForms |
|---|---|---|
| `Login.aspx` | đăng nhập | Forms auth: cookie `.ASPXAUTH` + `ASP.NET_SessionId`; hết phiên sau 20 phút |
| `VanBan.aspx` | danh sách văn bản | GridView phân trang qua `__doPostBack('ctl00$MainContent$gvVanBan','Page$2')`; ô tìm kiếm + nút; ô lọc trạng thái tự gửi lại form (AutoPostBack) |
| `ChiTiet.aspx?id=` | xem văn bản + lịch sử | nút **Kết thúc** là LinkButton (`__doPostBack('ctl00$MainContent$lnkKetThuc','')`), có hộp xác nhận ở trình duyệt |
| `DuThao.aspx` | tạo dự thảo | chọn loại, trích yếu (bắt buộc, có validator), nội dung, **đính kèm tệp** (multipart); lưu xong chuyển sang `ChiTiet.aspx?id=…&moi=1` |
| `Chuyen.aspx?id=` | chuyển văn bản | chọn **đơn vị ⇒ danh sách người nhận (CheckBoxList) nạp lại** qua AutoPostBack; ý kiến, hạn xử lý `dd/MM/yyyy`, đính kèm tệp |
| `PhatHanh.aspx?id=` | phát hành (chỉ văn thư) | trong **UpdatePanel** `ctl00_MainContent_upSo`: chọn sổ ⇒ số ký hiệu dự kiến điền sẵn mà không tải lại cả trang |

## Các bẫy (giữ nguyên như hệ thống thật)

- **Tên trường và id kiểu cũ.** Tên trường có dạng `ctl00$MainContent$ddlDonVi`, id có dạng `ctl00_MainContent_ddlDonVi`
  (cách đặt id của ASP.NET 2.0–3.5, Mono dùng mặc định).
- **ViewState chống sửa.** machineKey cố định; ViewState bị sửa thì trả lỗi 500.
- **EventValidation.** Gửi giá trị không có trong ô chọn thì trả 500 *Invalid postback or callback argument*.
- **Phải gửi lại "chọn đơn vị" trước khi Chuyển.** Bỏ bước này thì danh sách người nhận trên máy chủ vẫn rỗng, và Mono trả
  500 `System.ArgumentOutOfRangeException`. ASP.NET thật trên Windows thường báo *Invalid postback*. Cả hai trường hợp đều
  không chuyển được.
- **CheckBoxList** gửi `tên$<thứ tự>=<giá trị>` (Mono vẽ thuộc tính `value`), không gửi `on`.
- **Mã hoá dấu.** Ô của GridView mã hoá dấu tiếng Việt thành thực thể số (`B&#225;o c&#225;o`), phải giải mã khi đọc.
- **Hai cookie phiên.** Mất `.ASPXAUTH` hoặc `ASP.NET_SessionId` là bị chuyển về `Login.aspx?ReturnUrl=…`.
- **UpdatePanel.** Gửi với header `X-MicrosoftAjax: Delta=true`, trường `ctl00$sm=<UpdatePanel>|<control>` và
  `__ASYNCPOST=true`. Phản hồi có dạng `độ dài|loại|id|nội dung|`; `__VIEWSTATE` mới nằm trong mục
  `hiddenField|__VIEWSTATE`.

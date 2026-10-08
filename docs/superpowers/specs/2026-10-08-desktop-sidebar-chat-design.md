# Vala Desktop — thanh ứng dụng dọc + trang Trợ lý AI (giai đoạn giao diện)

Ngày: 08/10/2026. Nguồn: cuộc họp 07/10 (`plan/toan-van-ghi-am-cuoc-hop-07-10.md`, `plan/toan-van-ai-trong-desktop.md`,
`plan/ban-de-an-tong-the-vala-ai-desktop.md`) và trao đổi với người dùng 07–08/10. Làm **giao diện trước**; đăng nhập nhiều
đơn vị (multi-tenant), danh mục ứng dụng trên backend và mô hình AI làm sau.

## Mục tiêu

1. Bỏ thanh tab ngang. Cửa sổ = **thanh dọc bên trái** + **trang web chiếm toàn bộ bên phải** (cả chiều cao).
2. Mở app ⇒ vào **Trợ lý AI** (trang chat kiểu Claude). Chưa có mô hình AI: chạy **lệnh trực tiếp** bằng "/" (gọi thẳng
   thao tác `vala.action` của gói kịch bản — đúng ý "lệnh đơn giản gọi thẳng MCP, không cần AI").
3. Thông tin người dùng + Cài đặt ở **cuối thanh dọc**, menu là **khung nổi tự vẽ** (như Claude).
4. Giữ nút **Back / Forward / Reload** (góc trên trái); **không** hiện địa chỉ trang.

## A. Khung cửa sổ và thanh dọc

- Thanh dọc là trang cục bộ của cửa sổ (thay `resources/tabs.html`), rộng **248px**, thu gọn **56px** (chỉ biểu tượng,
  tên hiện bằng tooltip). Trạng thái thu gọn lưu trong `settings.json` (`sidebarCollapsed`).
- Trang web (mỗi mục một `WebContentsView` như hiện nay) đặt ở `x = độ rộng thanh`, `y = 0`, cao toàn cửa sổ.
- Từ trên xuống:
  1. **◀ ▶ ⟳** (áp cho mục đang xem; mờ khi đang ở trang cục bộ: Trợ lý AI, Cài đặt, Bản ghi) + nút **«/»** thu gọn.
  2. **✦ Trợ lý AI** — mục cố định, mặc định khi mở app.
  3. **ỨNG DỤNG** — các ứng dụng đã ghim: Vala (trang chính), Báo cáo (cổng), các hệ thống nguồn; giữ chấm trạng thái kết
     nối và chấm đỏ "đang ghi thao tác".
  4. **ĐANG MỞ** — mục đang mở mà không ghim: trang mở từ liên kết, Cài đặt, Bản ghi thao tác, hệ thống nguồn chưa ghim;
     có ✕ (và bấm chuột giữa) để đóng.
  5. Cuối thanh: nút **"Đã có bản … — Cập nhật"** (khi có); nhãn **DEV** (bản dev); hàng **hồ sơ** (chữ cái đầu + tên + ⌄;
     chưa đăng nhập ⇒ nút "Đăng nhập"); nút **⊞ Tất cả ứng dụng**.
- **Ghim:** khung ⊞ liệt kê mọi ứng dụng (Vala, Báo cáo, mọi hệ thống nguồn khai trên cổng) — bấm để mở, nút ghim/bỏ ghim.
  Giai đoạn này danh sách ghim lưu trên máy (`settings.json`, `pinnedApps`); mặc định ghim Vala, Báo cáo và các hệ thống
  nguồn. Ứng dụng không còn (vd nguồn bị gỡ khỏi cổng) tự bị loại khỏi danh sách ghim khi hiển thị. Sau này chuyển phần
  lưu lên backend (danh mục ứng dụng), giữ nguyên giao diện.
- **Menu hồ sơ (khung nổi):** email · Cài đặt (Ctrl+,) · Ngôn ngữ ▸ Tiếng Việt / English · Giao diện ▸ Sáng / Tối /
  Theo hệ thống · Quản lý mật khẩu · Đồng bộ phiên ngay · Kiểm tra cập nhật (+ phiên bản) · Đăng xuất · Thoát. VI/EN, nút
  sáng/tối và menu ⋯ của thanh tab cũ chuyển vào đây.
- **Menu chuột phải** trên từng mục (mật khẩu, ghi thao tác) giữ như cũ (menu của hệ điều hành).
- **Khung nổi đè lên trang web** (kể cả khi thanh thu gọn): vẽ trong một lớp `WebContentsView` trong suốt đặt trên cùng,
  chỉ hiện khi mở; bấm ra ngoài / Esc ⇒ đóng.
- Phím tắt giữ nguyên (Ctrl+Tab, Ctrl+1…9, Ctrl+W, F5, Alt+←/→) theo thứ tự trên thanh dọc.

## B. Trang Trợ lý AI

- Trang cục bộ (`resources/chat.html`), sáng/tối, song ngữ.
- **Chưa có tin nhắn:** lời chào giữa trang theo giờ ("Chào buổi sáng/chiều/tối, <tên>"), ô nhập lớn, vài **gợi ý** (thao
  tác có sẵn của hệ thống đã kết nối).
- **Có tin nhắn:** hội thoại dọc, ô nhập dính đáy; Enter gửi, Shift+Enter xuống dòng; nút **"Cuộc trò chuyện mới"**.
- **Lệnh "/":** gõ `/` ⇒ bảng chọn **hệ thống** (nguồn khai trên cổng) ⇒ **thao tác** (tên, `mo_ta`, `params` của
  `vala.action` — `sourceActions`) ⇒ **phiếu** điền tham số ⇒ **Chạy** (`runSourceAction`: chạy ngầm trong tab của hệ
  thống, không chuyển tab đang xem) ⇒ kết quả thành tin nhắn: mảng object ⇒ **bảng**; object ⇒ **thông tin – giá trị**
  (mảng con ⇒ bảng con); khác ⇒ chữ; lỗi ⇒ dòng đỏ kèm câu lỗi.
- **Câu hỏi tự do** ⇒ trợ lý trả lời cố định: "Trợ lý AI đang được kết nối. Hiện bạn có thể gõ / để chạy thao tác của các
  hệ thống." (sau này cắm mô hình vào đúng chỗ này; AI gọi các thao tác làm công cụ MCP).
- Lịch sử: cuộc trò chuyện hiện tại giữ trong bộ nhớ phiên app; danh sách hội thoại cũ làm ở giai đoạn AI.

## C. Kiểm thử, phạm vi

- Test đơn vị: chia mục vào nhóm Ứng dụng / Đang mở + gộp danh sách ghim (`tabs-model.ts`); tách lệnh "/" và chọn cách
  hiển thị kết quả (`chat-model.ts`).
- Chạy thật (Playwright `_electron`) + chụp ảnh: sáng/tối, mở rộng/thu gọn, menu hồ sơ, khung ⊞; chat
  `/` → QLVB Thử nghiệm → `lay_danh_sach_van_ban` trên hệ thống giả lập ⇒ bảng 10 văn bản.
- Ngoài phạm vi: đăng nhập nhiều đơn vị; danh mục ứng dụng / bố cục lưu trên backend; mô hình AI và agent; lịch sử hội thoại.

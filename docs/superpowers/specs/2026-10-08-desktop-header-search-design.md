# Vala Desktop — header kiểu Lark + tìm kiếm (Ctrl+K)

Ngày 08/10/2026, tiếp theo `2026-10-08-desktop-sidebar-chat-design.md`. Người dùng chọn: header thay thanh tiêu đề cửa sổ
(giống Lark), tìm cả 4 loại (lịch sử trang, ứng dụng, thao tác, hội thoại Trợ lý), nút điều hướng chuyển lên header.

## Header

- Cửa sổ không viền của hệ điều hành (`frame: false`); header cao **44px** chạy hết chiều ngang trên cùng (trang cục bộ
  của cửa sổ, `resources/tabs.html`): `✦ Vala [DEV]  ◀ ▶ ⟳  [🔍 Tìm kiếm (Ctrl+K)]  ─ □ ✕`. Kéo header để di chuyển cửa sổ,
  bấm đúp để phóng to / thu về; ✕ ẩn xuống khay như trước. Sáng/tối, song ngữ.
- Ô tìm kiếm cố định giữa header (rộng tối đa 520px) — lớp khung nổi vẽ ô nhập đúng chỗ đó khi mở tìm kiếm.
- Thanh dọc + trang web nằm dưới header (`y = 44`). Nút thu gọn thanh dọc chuyển lên đầu header (trước logo).

## Bo tròn cả hệ thống (yêu cầu thêm 08/10)

- Trang web nằm trong **khung bo góc 12px**, cách mép phải / dưới 8px, nền cửa sổ (slate-100 / slate-900) bao quanh như
  Lark. Electron 32 chưa có `View.setBorderRadius` ⇒ 4 lớp mặt nạ góc 12×12px trong suốt (`resources/corner.html`, chọn
  góc bằng `:target`, màu theo `prefers-color-scheme`) đặt trên 4 góc khung, dưới lớp khung nổi.
- Thang bo góc Tailwind của các trang cục bộ nâng một bậc (`tailwind.config.cjs`: `rounded` 8px, `md` 10px, `lg` 12px,
  `xl` 16px, `2xl` 20px) ⇒ nút, ô nhập, thẻ, khung nổi, mục thanh dọc đều mềm hơn; ô tìm kiếm header dạng viên thuốc.

## Tìm kiếm (bấm ô hoặc Ctrl+K ở bất kỳ đâu)

- Khung kết quả trên lớp khung nổi (đè được trang web). Ô trống ⇒ **Gần đây** (8 trang vừa xem) + **Hội thoại gần đây** (3).
  Gõ ⇒ 4 nhóm **Ứng dụng · Thao tác · Hội thoại · Lịch sử** (mỗi nhóm tối đa 5), so khớp không phân biệt dấu / hoa thường,
  mọi từ phải có mặt; điểm cao hơn khi khớp đầu chuỗi / đầu từ. ↑ ↓ Enter Esc.
- Chọn: lịch sử ⇒ mở lại đúng trang trong đúng ứng dụng (ứng dụng ghim ⇒ tab của nó; còn lại ⇒ tab mới); ứng dụng ⇒ mở;
  thao tác ⇒ Trợ lý AI với phiếu tham số mở sẵn; hội thoại ⇒ mở lại trong Trợ lý AI.

## Dữ liệu (chỉ trên máy)

- **Lịch sử trang** (`userData/history.json`): trang web đã mở (không gồm trang cục bộ), {url, tiêu đề, ứng dụng, thời
  điểm, số lần}; trùng địa chỉ ⇒ gộp; giữ 1000 mục mới nhất; chỉ ghi khi người dùng đang xem tab đó (tab chạy thao tác
  ngầm không ghi). Nút "Xoá lịch sử" cuối khung kết quả.
- **Đăng xuất ⇒ xoá cả ba tệp** (lịch sử, hội thoại, danh mục thao tác) — đều chứa dữ liệu của các hệ thống nguồn.
- **Hội thoại Trợ lý** (`userData/chats.json`): lưu 50 cuộc gần nhất (cả bảng kết quả; quá 1,5 MB thì bỏ bảng, giữ lời
  hỏi – đáp) để tìm và mở lại.
- **Danh mục thao tác** (`userData/actions-catalog.json`): ghi lại danh sách thao tác mỗi khi gói kịch bản của một hệ
  thống được nạp / liệt kê ⇒ tìm được thao tác mà không phải mở hệ thống trước.

## Kiểm thử

Test đơn vị `search-model.ts` (bỏ dấu, so khớp, xếp hạng, gộp lịch sử); chạy thật + chụp: header sáng/tối, "Gần đây",
tìm "chuyen" ra thao tác + lịch sử, mở lại một mục, mở hội thoại cũ.

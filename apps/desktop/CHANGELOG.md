# Vala Desktop — có gì mới

Mỗi bản phát hành một mục `## <phiên bản>` (đúng `version` trong package.json), gồm `### vi` và `### en`. Viết cho người
dùng đọc: ngắn, nói lợi ích, không dùng từ kỹ thuật. Mục này hiện trong hộp "Có gì mới" trước khi cập nhật, trong thông báo
sau khi cập nhật và ở Cài đặt → Giới thiệu. Đóng gói (`pnpm package*`, `scripts/package-win.sh`) dừng nếu bản đang build
chưa có mục ở đây (src/release-notes.ts, scripts/release-notes.cjs).

## 0.2.4

### vi
- Lưu được mật khẩu cho mọi trang mở trong Vala Desktop (ví dụ hệ thống văn bản của đơn vị), không chỉ các hệ thống có sẵn trên cổng.
- Cài đặt mở thành một tab riêng gồm Tài khoản, Mật khẩu, Giao diện, Khởi động và Giới thiệu; bật/tắt chạy cùng máy tính ngay tại đây.
- Xem, đổi, xoá mật khẩu đã lưu và bật/tắt tự đăng nhập lại ngay trong Cài đặt → Mật khẩu.
- Hết báo lỗi eTask nhầm mỗi lần mở ứng dụng.
- Nút sáng/tối dùng biểu tượng mới, hiển thị giống nhau trên mọi máy.
- Mỗi bản cập nhật có ghi chú "có gì mới" như thế này.

### en
- Save passwords for any site opened in Vala Desktop (for example your organization's document system), not only the systems listed on the portal.
- Settings now opens in its own tab with Account, Passwords, Appearance, Startup and About; turn starting with the computer on or off right there.
- View, change and delete saved passwords, and turn automatic sign-in on or off, in Settings → Passwords.
- No more false eTask errors each time the app starts.
- The light/dark button uses a new icon that looks the same on every computer.
- Every update now comes with "what's new" notes like these.

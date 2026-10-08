# Vala Desktop — có gì mới

Mỗi bản phát hành một mục `## <phiên bản>` (đúng `version` trong package.json), gồm `### vi` và `### en`. Viết cho người
dùng đọc: ngắn, nói lợi ích, không dùng từ kỹ thuật. Mục này hiện trong hộp "Có gì mới" trước khi cập nhật, trong thông báo
sau khi cập nhật và ở Cài đặt → Giới thiệu. Đóng gói (`pnpm package*`, `scripts/package-win.sh`) dừng nếu bản đang build
chưa có mục ở đây (src/release-notes.ts, scripts/release-notes.cjs).

## 0.2.5

### vi
- Giao diện mới: thanh ứng dụng bên trái, trang Trợ lý AI mở đầu tiên — gõ / để chạy ngay thao tác của các hệ thống.
- Thanh trên cùng kiểu Lark: nút quay lại / tiến tới / tải lại và ô tìm kiếm (Ctrl+K) tìm ứng dụng, thao tác, hội thoại và các ứng dụng vừa dùng (không lưu địa chỉ trang).
- Thanh ứng dụng theo danh mục do quản trị đơn vị khai (trang web, hệ thống nguồn, Báo cáo); ghim / bỏ ghim được lưu theo tài khoản, mở máy khác vẫn đúng.
- Link sang trang ngoài hệ thống đang dùng mở bằng trình duyệt mặc định của máy.
- Hội thoại với Trợ lý AI được lưu lại để mở lại sau.
- Giao diện bo tròn, gọn và hiện đại hơn.
- Màn hình đăng nhập riêng: nhập tài khoản dạng tên@đơn vị, rồi mật khẩu hoặc đăng nhập SSO của đơn vị (tài khoản được điền sẵn). Đăng nhập một lần là vào được cả tab Báo cáo.
- Đăng nhập Vala Desktop bằng SSO của đơn vị một lần là các ứng dụng dùng cùng SSO (Vala, eGov, eTask…) tự vào, kể cả sau khi tắt / mở lại máy. Mật khẩu SSO lưu một lần, dùng chung cho mọi ứng dụng khi cần đăng nhập lại. Đăng xuất là thoát luôn SSO trong ứng dụng.
- Dùng được cho nhiều đơn vị khác nhau trên cùng một máy chủ Vala.

### en
- New layout: an app bar on the left and the AI assistant page first — type / to run actions of your systems right away.
- A Lark-style top bar: back / forward / reload and a search box (Ctrl+K) for apps, actions, conversations and recently used apps (page addresses are not stored).
- The app bar follows the catalog set by your organization's administrator (web pages, source systems, Reports); pins are saved with your account, so they follow you to other computers.
- Links to pages outside the system you are using open in your default browser.
- Conversations with the AI assistant are saved so you can reopen them.
- Rounded, cleaner and more modern look.
- A dedicated sign-in screen: enter your account as name@organization, then your password or your organization's SSO (the account is filled in for you). Sign in once and the Reports tab is signed in too.
- Sign in to Vala Desktop with your organization's SSO once and the apps using the same SSO (Vala, eGov, eTask…) sign in by themselves, even after restarting. Your SSO password is saved once and shared by all apps when they need to sign in again. Signing out also signs you out of SSO inside the app.
- Works for multiple organizations on the same Vala server.

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

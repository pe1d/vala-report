# Vala Desktop: mật khẩu hệ thống nguồn lưu trong máy (T08)

Đây là việc T08 trong biên bản họp 10/2026. Người dùng nhập tài khoản eGov/eTask… **một lần**. Vala Desktop lưu tài khoản đó
bằng **kho mật khẩu của hệ điều hành** và tự đăng nhập lại mỗi khi phiên hết hạn.

## Lưu ở đâu, an toàn thế nào

- Mật khẩu được mã hoá bằng Electron `safeStorage`, tức là khoá do hệ điều hành giữ:
  - Windows: DPAPI, theo tài khoản Windows;
  - macOS: Keychain;
  - Linux: gnome-libsecret hoặc KWallet. Nếu máy không có kho bí mật (`basic_text`), app **không lưu**.
- Tệp `credentials.json` trong thư mục dữ liệu của app chỉ chứa tên đăng nhập và bản mã hoá. Mật khẩu **không bao giờ gửi
  lên máy chủ Vala**.
- Lần đầu dùng mật khẩu sau khi mở app, app hỏi xác nhận người dùng **một lần cho cả phiên**:
  - Windows: Windows Hello (vân tay, khuôn mặt hoặc PIN). App gọi WinRT `UserConsentVerifier` qua Windows PowerShell 5.1,
    không cần module gốc. Máy không có Windows Hello thì chỉ dựa vào DPAPI.
  - macOS: Touch ID.
  - Bấm Huỷ thì app không dùng mật khẩu trong phiên đó.
- Đăng xuất app thì app khoá lại. Mật khẩu đã lưu vẫn giữ trong máy.

## Trang không khai trên cổng

Ngoài hệ thống nguồn khai trên cổng, **mọi trang** mở trong app (ví dụ QLVB của một đơn vị) cũng lưu được mật khẩu. Mật
khẩu lưu theo đúng host của trang (`site:<host>`), giống trình duyệt, và chỉ được điền lại trên đúng host đó. Quản lý ở
Cài đặt → Mật khẩu (menu ⋯ → **Quản lý mật khẩu…**) hoặc chuột phải lên tab của trang đó. Trang cổng Vala Reporting không
lưu ở đây.

## Tự điền và tự đăng nhập

- App chỉ điền trên đúng các host của hệ thống đó: trang chính, `login_url`, và `login_hosts` do máy chủ gửi qua
  `/ext/sources` (ví dụ `iam.bkav.com`). Trang khác không bao giờ nhận mật khẩu.
- Trang có ô mật khẩu đang hiện:
  - nếu gói kịch bản của hệ thống có thao tác `dang_nhap({ username, password })` thì app gọi thao tác đó;
  - nếu không, app tự tìm ô tên đăng nhập đứng trước ô mật khẩu, điền rồi bấm đăng nhập.
- **Chống khoá tài khoản nguồn:**
  - Nếu form đăng nhập hiện lại trong vòng 90 giây sau lần tự đăng nhập, app coi là mật khẩu sai, dừng tự đăng nhập hệ
    thống đó và báo người dùng.
  - Chặn cứng: tối đa 3 lần tự đăng nhập mỗi giờ cho mỗi hệ thống.
  - App chỉ thử lại khi người dùng lưu mật khẩu **mới**.
- Khi đồng bộ phát hiện phiên hết hạn, app mở nền trang đăng nhập (`tryAutoRelogin`, tối đa 1 lần mỗi 30 phút). Cookie mới
  tự được gửi lên Vala. App chỉ báo "phiên hết hạn" khi không tự đăng nhập được.

## Lưu mật khẩu

- Người dùng tự đăng nhập trong app thì app hỏi **"Lưu mật khẩu?"**, có các nút: Lưu / Lúc khác / Không bao giờ cho hệ
  thống này. Preload chỉ theo dõi form khi tiến trình chính xác nhận trang là trang đăng nhập của một nguồn.
- **Cài đặt → Mật khẩu** (như `chrome://settings/passwords`) liệt kê mọi hệ thống nguồn trên cổng (kể cả chưa lưu, để lưu
  ngay tại đó), các trang khác (`site:<host>`) và danh sách "Không bao giờ lưu" (bỏ ra được). Mỗi dòng: tài khoản, thời
  điểm lưu, bật/tắt "Tự đăng nhập lại", "Lưu / Đổi…", "Xoá" (hỏi lại trước khi xoá). Trang không bao giờ nhận mật khẩu,
  chỉ nhận tên đăng nhập. Menu ⋯ có lối tắt **Quản lý mật khẩu…** tới mục này.
- **Menu ⋯ → <hệ thống>** hoặc **chuột phải lên tab của hệ thống** cũng cho:
  - xem tài khoản đã lưu;
  - bật/tắt "Tự đăng nhập lại";
  - "Lưu / Đổi mật khẩu…" (mở một hộp nhỏ để nhập tài khoản);
  - "Xoá mật khẩu".

## Giới hạn

- Trang đăng nhập có CAPTCHA hoặc mã OTP thì không tự đăng nhập được. Phần điền vẫn chạy, người dùng nhập mã còn lại.
- Form đăng nhập nằm trong iframe thì vẫn tự điền được, nhưng app không hỏi lưu mật khẩu (preload chỉ chạy ở khung chính).
- Windows Hello mới được viết theo tài liệu WinRT, **chưa chạy thử trên máy Windows thật**.

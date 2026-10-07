# Chạy nền và giữ phiên (T10)

Biên bản họp 10/2026, việc T10, nêu hai việc: Vala Desktop vẫn chạy khi người dùng tắt app, và phải phân tích phần nào đẩy
xuống dịch vụ nền. Biên bản đề xuất **đẩy phần duy trì phiên lên backend**.

## Phân công

| Việc | Ở đâu | Vì sao |
|---|---|---|
| Giữ phiên hệ thống nguồn sống (gọi nhẹ định kỳ) | **Máy chủ**: worker, `keepAliveSessions` | Vẫn chạy khi máy người dùng tắt hoặc ngủ |
| Lấy dữ liệu theo lịch | **Máy chủ**: worker hoặc Crawlab | Như trước |
| Đăng nhập lại khi phiên chết | **Vala Desktop**, bằng mật khẩu lưu trong máy (T08) | Mật khẩu chỉ nằm trong máy người dùng |
| Thao tác cần màn hình hoặc phiên người dùng | **Vala Desktop** (tab, gói kịch bản), hoặc máy chủ (runner) | Theo từng kịch bản |

## Máy chủ giữ phiên

- Worker có job `session_keepalive`, chạy mỗi 5 phút. Kết nối do Vala Desktop, tiện ích hoặc cookie cấp
  (`auth_method` = `extension` hoặc `cookie`) mà chưa được giữ trong `SESSION_KEEPALIVE_MINUTES` phút gần nhất (mặc định
  10, đặt `0` để tắt) sẽ được gọi `session_probe` của adapter **một lần**, bằng đúng cookie đang lưu.
- Request nhẹ này làm phiên kiểu "trượt" (hết hạn khi để lâu không dùng) được gia hạn.
- Nếu nguồn cấp cookie mới qua `Set-Cookie`, ví dụ ASP.NET gia hạn `.ASPXAUTH`, máy chủ lưu đè vào vault.
- Nếu nguồn từ chối phiên (chuyển sang trang đăng nhập, 401/403) hoặc vault mất phiên, kết nối được đánh dấu `expired`
  ngay, không phải chờ tới lượt crawl gặp lỗi.
- Nguồn lỗi (5xx, mạng) thì giữ nguyên trạng thái, lần sau thử lại.
- Kết nối bằng mật khẩu hoặc SSO trên máy chủ vẫn do `session_refresh` tự đăng nhập lại như trước.
- Cột `source_grants.last_keepalive_at` (migration 026) ghi lần giữ phiên gần nhất.

**Lưu ý:** phiên có thời hạn tuyệt đối (ví dụ token SSO sống 8 giờ, gọi bao nhiêu cũng không gia hạn) thì vẫn hết hạn
đúng giờ. Khi đó Vala Desktop tự đăng nhập lại (T08) ở lần đồng bộ kế tiếp, nếu máy đang bật và đã lưu mật khẩu.

## Vala Desktop chạy nền

- Đóng cửa sổ thì app chỉ ẩn xuống khay hệ thống. App vẫn giữ phiên trong máy, gửi phiên mới cho Vala và tự đăng nhập lại.
  Muốn tắt hẳn thì vào menu → **Thoát**.
- Bản cài tự khởi động cùng máy, chạy ẩn ở khay: Windows dùng `openAtLogin` kèm `--hidden`, Ubuntu dùng mục trong
  `~/.config/autostart`.
- **Không làm Windows service.** Service chạy ở session 0, tách khỏi phiên đăng nhập của người dùng: không có cookie hay
  kho phiên của app, không mở được trang để người dùng đăng nhập, không gọi được Windows Hello, và không đọc được mật khẩu
  DPAPI của người dùng. Phần cần chạy liên tục kể cả khi máy tắt đã nằm ở máy chủ (bảng trên). Phần cần người dùng thì
  phải chạy trong phiên của họ, tức là app ở khay.

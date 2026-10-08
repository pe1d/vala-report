# Vala Desktop: cài đặt, cập nhật, báo lỗi

Người dùng chốt 08/10/2026.

## Mini installer (Windows)

- `nsis-web` của electron-builder (apps/desktop/electron-builder.yml): file cài `vala-desktop-setup.exe` chỉ ~1–2 MB, chạy
  lên mới tải gói app `vala-desktop-<v>-x64.nsis.7z` từ `{PUBLIC_WEB_URL}/desktop/`, cài một chạm theo người dùng (không
  cần quyền quản trị), tạo lối tắt Desktop + Start, cài xong tự mở app.
- Gói tải về được kiểm mã băm (sha512 trong file cài). Build: `apps/desktop/scripts/package-win.sh` (đặt
  `VALA_UPDATE_URL=<máy chủ>/desktop/` để file cài mini tải gói từ máy chủ của đơn vị). Phát hành:
  `deploy/publish-desktop.sh apps/desktop/release/nsis-web` (docs/trien-khai-k3s.md mục 4b).
- Máy không ra được máy chủ: `VALA_OFFLINE=1 apps/desktop/scripts/package-win.sh` ⇒ bộ cài đầy đủ như trước.

## Chạy ngầm, tự cập nhật

- Đóng cửa sổ chỉ ẩn xuống khay; tự khởi động cùng máy (Cài đặt → Khởi động & cập nhật).
- **Tự động cập nhật** (mặc định bật): tải ngầm, tự cài im lặng khi cửa sổ ẩn xuống khay hoặc máy để không 10 phút rồi
  mở lại (apps/desktop/src/updater-model.ts). Tắt ⇒ chỉ báo, người dùng bấm Cập nhật. Ubuntu luôn để người dùng bấm.

## Ghim thanh tác vụ

docs/desktop-ghim-thanh-tac-vu.md — Ubuntu tự ghim vào dock; Windows không cho phần mềm tự ghim ⇒ hướng dẫn + GPO/Intune.

## Báo lỗi / crash

- **Tự gửi** (mặc định bật, tắt ở Cài đặt): crash native (Crashpad — minidump), lỗi JS tiến trình chính, trang bị đóng
  đột ngột, tiến trình con dừng, trang không phản hồi, lỗi trang của app, lỗi cập nhật, lỗi nạp kịch bản
  (apps/desktop/src/error-report.ts).
- **Không gửi** nội dung trang, mật khẩu, cookie. Chữ được làm sạch hai lần (app + máy chủ): bỏ token, JWT, email, tham số
  URL; địa chỉ trang chỉ giữ gốc. Mất mạng / chưa đăng nhập ⇒ hàng đợi trên máy, gửi sau.
- Máy chủ: `POST /ext/desktop/errors` (token thiết bị) và `POST /desktop-crash` (Crashpad, công khai — giới hạn 10 lần /
  10 phút mỗi IP, minidump ≤ 5 MB; app gửi kèm SHA-256 của token thiết bị để biết máy nào). Bảng `core.desktop_errors`
  (migration 029) gom lỗi giống nhau, đếm số lần. Crashpad chỉ tải lên ở bản cài.
- Xem: Vala Desktop → Quản trị → **Lỗi Desktop** (quản trị hệ thống): lọc loại / phiên bản, stack, ngữ cảnh, người gặp
  gần nhất, tải minidump, đánh dấu đã xử lý.
- Trang của tab bị đóng đột ngột tự tải lại (tối đa 3 lần / phút) thay vì để trang trắng.

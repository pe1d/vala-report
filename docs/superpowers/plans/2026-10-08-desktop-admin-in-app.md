# Quản trị đơn vị nằm trong Vala Desktop — kế hoạch

Người dùng 08/10/2026: "cấu hình cho admin ở giao diện desktop, không phải ở web nữa. Web phải phụ thuộc vào desktop chứ
desktop không phụ thuộc vào web." Chốt: CHUYỂN code các trang quản trị (React) sang Desktop; web giữ tạm các trang này cho
tới khi bản Desktop đủ, rồi bỏ khỏi web.

**Goal:** trang cục bộ "Quản trị đơn vị" trong Vala Desktop (như Cài đặt) gồm Người dùng, Ứng dụng Desktop, Kịch bản
Desktop, Hệ thống nguồn — chạy không cần cổng web (Cấu hình chung chỉ ảnh hưởng Báo cáo ⇒ ở lại cổng); gọi API quản trị qua tiến trình chính bằng phiên của app.

**Architecture:**
- `packages/ui` (@vala/ui): phần giao diện dùng chung, chuyển từ apps/web: song ngữ (`i18n`), sáng/tối (`theme`), `useAsync`,
  bộ thành phần (`ui`, `States`, `TableTools`), thương hiệu (`branding`), client API có "đường gửi" thay được
  (`configureApi`) + kiểu dữ liệu + `fmtDateTime`, CSS gốc (biến màu thương hiệu, phông) + preset Tailwind. apps/web giữ
  đúng đường dẫn cũ bằng các tệp re-export (không phải sửa import trong web).
- `packages/admin` (@vala/admin): 5 trang quản trị + nhãn dùng chung; phần phụ thuộc môi trường (người đang đăng nhập,
  chạy thử thao tác kịch bản trong Desktop, liên kết sang Báo cáo) đi qua `AdminEnvProvider`.
- apps/desktop: trang cục bộ `admin` (Vite + React, build ra `dist/admin/`), preload `valaAdmin.request(method, path, body)`
  ⇒ tiến trình chính gọi `/api/v1/…` bằng phiên cổng của app (`portalToken()`), chỉ cho các đường quản trị cần dùng; chạy
  thử thao tác ⇒ `runSourceAction` / `sourceActions` trực tiếp. Mục "Quản trị đơn vị" (menu hồ sơ, chỉ quản trị) mở trang này.
- apps/web: các trang quản trị tạm import từ @vala/admin; xong bản Desktop thì gỡ khỏi menu web.

## Task
1. `packages/ui` + chuyển web sang dùng (re-export). Typecheck + build web.
2. `packages/admin`: chuyển 5 trang + nhãn; web dùng qua `AdminEnvProvider`. Typecheck + build web.
3. Desktop: Vite build trang admin, preload + IPC API (danh sách đường cho phép), mục menu; electron-builder thêm `dist/admin`.
4. Chạy thật: mở Quản trị đơn vị trong Desktop, thêm/sửa ứng dụng, xem người dùng, sửa cấu hình chung; chụp sáng/tối.
5. (khi người dùng đồng ý) gỡ các trang quản trị khỏi menu web.

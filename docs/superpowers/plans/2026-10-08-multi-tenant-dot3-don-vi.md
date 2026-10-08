# Nhiều đơn vị — đợt 3: Quản trị hệ thống → Đơn vị

Spec: `docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md` mục 3. Người dùng 08/10/2026: trang đặt **trong Vala
Desktop** (cùng trang Quản trị, không phải cổng web); quản trị hệ thống ban đầu là **dieptx@bkav.com** và **ops@bkav.com**.

**Goal:** quản trị hệ thống tạo / sửa / tạm khoá đơn vị trên giao diện Desktop; worker dựng schema đơn vị đầy đủ (bảng,
RLS, hàm, quyền) + quản trị đầu tiên + (tuỳ chọn) chép cấu hình từ đơn vị khác. Không xoá đơn vị trên giao diện.

## Thiết kế

- **Bản nền schema đơn vị** `db/tenant-baseline.sql`: `pg_dump --schema-only` của `tenant_bkav` (bỏ phân vùng
  `raw_records_*`, chỉ mục động `records_f_*`, chủ sở hữu), tên schema thay bằng `{{schema}}`; dòng đầu ghi các migration
  đơn vị đã gồm. Sinh lại bằng `pnpm --filter @vala/core tenant-baseline` (khi thêm nhiều migration đơn vị — không bắt
  buộc: đơn vị mới vẫn được áp các migration sau bản nền). Test so cấu trúc đơn vị dựng từ bản nền với `tenant_bkav`.
- **Migration 028** (chung): `core.tenants.provision jsonb` (yêu cầu dựng: chép từ đơn vị nào, quản trị đầu tiên — mật khẩu
  đã băm; xoá khi dựng xong); ghi ops@bkav.com (nếu có) vào `core.system_admins`.
- **Dựng đơn vị** (`packages/core/src/tenant-provision.ts`, chạy ở worker bằng quyền chủ CSDL, MỘT giao dịch): schema từ bản
  nền → ghi migration đã gồm + áp migration đơn vị còn lại → `app_settings` → chép cấu hình (hệ thống nguồn, adapter, spider,
  tab tổng quan, báo cáo, kịch bản Desktop + phiên bản, ứng dụng Desktop, thương hiệu) → quản trị đầu tiên (mật khẩu tạm,
  bắt đổi) → phân vùng → `hoat_dong`. Lỗi ⇒ huỷ giao dịch, `loi` + lý do (thử lại được).
- **Worker**: việc bảo trì `tenant_provision` (API đẩy ngay khi tạo / thử lại; lúc khởi động + mỗi phút quét `dang_tao`).
- **Crawlab**: spider của đơn vị khác Bkav đặt tên `<mã đơn vị>__<mã spider>` (tránh hai đơn vị ghi đè một spider).
- **API** `/system/tenants` (chỉ quản trị hệ thống — `core.system_admins` của đơn vị đang đăng nhập): danh sách (kèm số
  người dùng), xem, tạo, sửa (tên, tên miền, cách đăng nhập, SSO + client secret vào vault, điền tài khoản, bộ chọn, trang đổi
  mật khẩu SSO), tạm khoá / mở lại, thử lại khi lỗi. `is_system_admin` trong `/me` và `/ext/apps`.
- **Desktop**: trang Quản trị thêm mục "Đơn vị" (chỉ quản trị hệ thống); menu hồ sơ hiện "Quản trị" cho quản trị đơn vị
  hoặc quản trị hệ thống. Trang `AdminTenants` ở `@vala/admin`. Cổng web không có trang này.

## Task
1. Bản nền + script sinh + migration 028 + `provisionTenant` + test CSDL.
2. Worker: việc `tenant_provision`; Crawlab đặt tên spider theo đơn vị.
3. API `/system/tenants` + `is_system_admin`; test.
4. Desktop: trang Đơn vị, IPC cho `/system/…`, mục menu.
5. Chạy thật: tạo đơn vị chép từ bkav, đăng nhập quản trị đầu tiên trên Desktop (bắt đổi mật khẩu), sửa / tạm khoá.
   Thay đơn vị `thu` dựng tay. Cập nhật `docs/nhieu-don-vi.md`.

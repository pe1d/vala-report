-- =====================================================================
-- 009 — Cấu hình adapter nằm trong CSDL, không nằm trong code.
--
-- core.source_systems.adapter_yaml = toàn bộ adapter (cách xác thực, endpoint được phép, cách lấy và chuẩn
-- hoá dữ liệu, bảng đích). Quản trị sửa ngay trên cổng (trang "Hệ thống nguồn"), máy chủ kiểm tra trước khi lưu.
-- Lần đầu chạy, hệ thống chép adapters/*.yaml trong repo vào đây; từ đó CSDL là nguồn sự thật, file trong
-- repo chỉ còn là mẫu khởi tạo.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE core.source_systems
    ADD COLUMN adapter_yaml       text,
    ADD COLUMN adapter_updated_at timestamptz,
    ADD COLUMN adapter_updated_by bigint;

COMMENT ON COLUMN core.source_systems.adapter_yaml IS
    'Adapter đầy đủ (YAML, cùng định dạng adapters/*.yaml). NULL + auth_profile NULL ⇒ lần chạy đầu chép từ repo.';

-- core.adapters: bản đã kích hoạt của từng (hệ thống × capability) — API ghi khi quản trị lưu cấu hình.
GRANT INSERT, UPDATE ON core.adapters TO app_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA core TO app_writer;

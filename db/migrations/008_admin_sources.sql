-- =====================================================================
-- 008 — Quản trị thêm hệ thống nguồn ngay trên cổng (không chỉ eGov/eTask cố định).
--
-- Hệ thống nguồn có hai loại:
--   * có adapter YAML trong repo (adapters/*.yaml): cách xác thực + cách lấy dữ liệu nằm trong file; trên
--     cổng chỉ sửa tên, địa chỉ, bật/tắt, cách kết nối cho phép. auth_profile = NULL.
--   * quản trị tạo trên cổng: auth_profile (jsonb) mô tả cookie phiên + cách kiểm tra phiên. Người dùng
--     kết nối được ngay (tiện ích / dán cookie); lấy dữ liệu cần thêm spider + báo cáo.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE core.source_systems
    ADD COLUMN mo_ta              text,
    ADD COLUMN auth_profile       jsonb,
    ADD COLUMN connection_methods text[] NOT NULL DEFAULT '{extension,cookie,password}',
    ADD COLUMN created_by         bigint,
    ADD COLUMN updated_at         timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT source_systems_code_format CHECK (code ~ '^[a-z][a-z0-9_]{1,29}$'),
    ADD CONSTRAINT source_systems_methods_known
        CHECK (connection_methods <@ ARRAY['extension', 'cookie', 'password', 'sso']::text[] AND cardinality(connection_methods) > 0);

COMMENT ON COLUMN core.source_systems.auth_profile IS
    'NULL = xác thực theo adapter YAML. Khác NULL = hệ thống do quản trị tạo: '
    '{cookies_required: [tên | [tên thay thế…]], cookies_optional: [], cookie_domain, probe: {path, pattern}}';
COMMENT ON COLUMN core.source_systems.connection_methods IS
    'Cách kết nối người dùng/quản trị được chọn: extension, cookie, password (chỉ khi adapter có password_login), sso.';

-- Quản trị (qua pool writer) thêm/sửa hệ thống nguồn. Không cho xoá: dữ liệu và lịch sử chạy tham chiếu tới.
GRANT INSERT, UPDATE ON core.source_systems TO app_writer;

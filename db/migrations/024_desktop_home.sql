-- =====================================================================
-- 024 — Trang chính của Vala Desktop do QUẢN TRỊ đặt cho cả đơn vị (Quản trị → Cấu hình chung), không phải từng người
-- dùng tự sửa. Vala Desktop đọc qua GET /api/v1/branding (công khai — chỉ là địa chỉ trang, không bí mật).
-- NULL ⇒ ứng dụng dùng trang mặc định đặt lúc build (VALA_HOME_URL).
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE app_settings ADD COLUMN desktop_home_url text
    CHECK (desktop_home_url IS NULL OR (desktop_home_url ~ '^https://[^[:space:]]+$' AND length(desktop_home_url) <= 500));

COMMENT ON COLUMN app_settings.desktop_home_url IS 'Trang mở ở tab Vala của Vala Desktop (https). NULL = mặc định của bản build.';

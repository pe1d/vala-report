-- =====================================================================
-- 022 — Cấu hình chung của đơn vị triển khai (không gắn cứng với Bkav): tên ứng dụng, tên đơn vị, dòng mô tả,
-- logo, màu chủ đạo, tên hiển thị của SSO. Quản trị sửa trên cổng (Quản trị → Cấu hình chung); trang đăng nhập đọc
-- được trước khi đăng nhập (GET /api/v1/branding) nên KHÔNG chứa gì bí mật.
-- Một dòng duy nhất (id = 1).
-- =====================================================================
SET search_path = tenant_bkav, core, public;

CREATE TABLE app_settings (
    id           smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ten_ung_dung text        NOT NULL DEFAULT 'Vala Reporting' CHECK (length(ten_ung_dung) BETWEEN 1 AND 60),
    ten_don_vi   text        CHECK (length(ten_don_vi) <= 120),
    mo_ta        text        CHECK (length(mo_ta) <= 160),
    -- Ảnh logo dạng data URL (PNG/JPEG/SVG/WebP), giới hạn kích thước để trang tải nhanh.
    logo         text        CHECK (logo IS NULL OR (logo ~ '^data:image/(png|jpeg|svg\+xml|webp);base64,' AND length(logo) <= 400000)),
    mau_chu_dao  text        NOT NULL DEFAULT '#1d4ed8' CHECK (mau_chu_dao ~ '^#[0-9a-fA-F]{6}$'),
    ten_sso      text        NOT NULL DEFAULT 'SSO' CHECK (length(ten_sso) BETWEEN 1 AND 40),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   bigint      REFERENCES app_users(id) ON DELETE SET NULL
);
INSERT INTO app_settings (id) VALUES (1);

COMMENT ON TABLE app_settings IS 'Cấu hình hiển thị của đơn vị triển khai (một dòng). Công khai cho trang đăng nhập — không chứa bí mật.';

GRANT SELECT ON app_settings TO app_reader, app_writer;
GRANT UPDATE ON app_settings TO app_writer;

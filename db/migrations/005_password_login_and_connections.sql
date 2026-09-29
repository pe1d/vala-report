-- =====================================================================
-- 005 — Đăng nhập cổng bằng tài khoản/mật khẩu, và kết nối dữ liệu do quản trị cấu hình.
--
-- Đổi so với tài liệu kỹ thuật (mục 07 "không bao giờ lưu mật khẩu"): theo quyết định của chủ
-- sản phẩm ngày 25/09/2026, quản trị được cấu hình kết nối bằng tài khoản/mật khẩu hệ thống nguồn
-- hoặc bằng cookie. Mật khẩu hệ thống nguồn CHỈ nằm trong vault; bảng dưới đây chỉ giữ cách xác thực
-- và tên đăng nhập (không bí mật) để quản trị nhận ra tài khoản.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

-- ---------------------------------------------------------------------
-- 1. Tài khoản đăng nhập cổng
-- ---------------------------------------------------------------------
ALTER TABLE app_users
    ADD COLUMN username            text UNIQUE,
    ADD COLUMN password_hash       text,          -- scrypt, xem packages/core/src/passwords.ts
    ADD COLUMN password_changed_at timestamptz,
    ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
    ADD COLUMN failed_logins       int NOT NULL DEFAULT 0,
    ADD COLUMN locked_until        timestamptz;

-- app_reader không được đọc hash mật khẩu, kể cả qua một truy vấn báo cáo viết sai.
-- Đăng nhập kiểm tra mật khẩu qua pool writer.
REVOKE SELECT ON app_users FROM app_reader;
GRANT SELECT (id, sso_subject, email, ho_ten, is_active, created_at, last_login_at, is_ops_admin, username)
    ON app_users TO app_reader;

-- sso_subject không còn bắt buộc: tài khoản tạo tại cổng có thể chưa gắn Bkav SSO.
ALTER TABLE app_users ALTER COLUMN sso_subject DROP NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Kết nối dữ liệu (dùng lại source_grants: một người dùng × một hệ thống nguồn)
-- ---------------------------------------------------------------------
ALTER TABLE source_grants
    ADD COLUMN auth_method     text NOT NULL DEFAULT 'sso'
        CHECK (auth_method IN ('sso', 'password', 'cookie')),
    ADD COLUMN source_username text,               -- tên đăng nhập bên nguồn, để quản trị nhận ra
    ADD COLUMN configured_by   bigint REFERENCES app_users(id),
    ADD COLUMN updated_at      timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN source_grants.auth_method IS
    'sso: uỷ quyền qua Bkav SSO, refresh token trong vault. '
    'password: tài khoản/mật khẩu nguồn trong vault, hệ thống tự đăng nhập lấy cookie. '
    'cookie: quản trị dán cookie, hết hạn thì phải dán lại.';

-- Host được phép đi tới trong lúc đăng nhập (ngoài base_url), vd trang đăng nhập iam.bkav.com.
-- Quản trị đặt khi cấu hình hệ thống nguồn trên giao diện (không seed trong code).
ALTER TABLE core.source_systems ADD COLUMN login_hosts text[] NOT NULL DEFAULT '{}';

-- =====================================================================
-- 018 — Hệ thống nguồn có xác thực 2 lớp (OTP) hay không.
--   'co'      ⇒ máy chủ KHÔNG tự đăng nhập bằng tài khoản/mật khẩu được (cần OTP) — chỉ kết nối qua tiện ích/cookie/SSO;
--   'khong'   ⇒ cho kết nối bằng tài khoản/mật khẩu (máy chủ tự đăng nhập lại khi hết phiên);
--   'chua_ro' ⇒ chưa xác nhận: vẫn cho dùng mật khẩu, kèm cảnh báo. Lần tự đăng nhập nào gặp OTP thì tự chuyển 'co'.
-- Quản trị đặt trên trang Hệ thống nguồn.
-- =====================================================================
ALTER TABLE core.source_systems
    ADD COLUMN mfa text NOT NULL DEFAULT 'chua_ro' CHECK (mfa IN ('co', 'khong', 'chua_ro')),
    ADD COLUMN mfa_detected_at timestamptz;
COMMENT ON COLUMN core.source_systems.mfa IS 'Xác thực 2 lớp: co | khong | chua_ro. co ⇒ không cho kết nối bằng mật khẩu.';
COMMENT ON COLUMN core.source_systems.mfa_detected_at IS 'Lần tự đăng nhập gặp OTP (hệ thống tự đánh dấu mfa = co).';

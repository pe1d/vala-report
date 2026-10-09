-- Tuỳ chọn riêng của từng người dùng trong Vala Desktop (09/10/2026), theo tài khoản (mở máy khác vẫn đúng): cỡ chữ
-- (phần trăm thu phóng nội dung trang, 50–200; null ⇒ 100%).
CREATE TABLE desktop_user_prefs (
    app_user_id  bigint      PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    co_chu       smallint    CHECK (co_chu IS NULL OR co_chu BETWEEN 50 AND 200),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON desktop_user_prefs TO app_reader, app_writer;
GRANT INSERT, UPDATE, DELETE ON desktop_user_prefs TO app_writer;

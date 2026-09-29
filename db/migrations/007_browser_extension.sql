-- =====================================================================
-- 007 — Tiện ích trình duyệt gửi phiên (cookie) hệ thống nguồn về cổng.
--
-- Người dùng đăng nhập eGov/eTask… như mọi ngày trên trình duyệt của mình; tiện ích Vala đọc đúng các
-- cookie phiên mà adapter khai (cookies_required) và gửi về API. Không ai phải dán cookie, không lưu
-- mật khẩu nguồn. Cookie vẫn chỉ nằm trong vault như mọi cách xác thực khác.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE source_grants DROP CONSTRAINT source_grants_auth_method_check;
ALTER TABLE source_grants ADD CONSTRAINT source_grants_auth_method_check
    CHECK (auth_method IN ('sso', 'password', 'cookie', 'extension'));
ALTER TABLE source_grants ADD COLUMN last_push_at timestamptz;   -- tiện ích gửi phiên lần cuối

COMMENT ON COLUMN source_grants.auth_method IS
    'sso: uỷ quyền qua Bkav SSO, refresh token trong vault. '
    'password: tài khoản/mật khẩu nguồn trong vault, hệ thống tự đăng nhập lấy cookie. '
    'cookie: dán cookie, hết hạn thì phải dán lại. '
    'extension: tiện ích trình duyệt tự gửi cookie mỗi khi người dùng đăng nhập hệ thống nguồn.';

-- Mỗi trình duyệt cài tiện ích = một thiết bị, có token riêng (chỉ lưu SHA-256), thu hồi được từ cổng.
-- Token thiết bị CHỈ gửi được phiên nguồn của chính người đó; không đọc được báo cáo.
CREATE TABLE extension_devices (
    id            bigserial PRIMARY KEY,
    app_user_id   bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash    bytea       NOT NULL UNIQUE,
    ten           text        NOT NULL,             -- "Chrome trên Windows" — người dùng nhận ra máy
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    last_used_at  timestamptz,
    revoked_at    timestamptz
);
CREATE INDEX extension_devices_user ON extension_devices (app_user_id) WHERE revoked_at IS NULL;

-- Chỉ pool writer (xác thực token) dùng bảng này; app_reader không đọc được, kể cả hash.
ALTER TABLE extension_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY ext_devices_own ON extension_devices FOR ALL
    USING (app_user_id = current_app_user())
    WITH CHECK (app_user_id = current_app_user());
REVOKE ALL ON extension_devices FROM app_reader;
GRANT SELECT, INSERT, UPDATE ON extension_devices TO app_writer;
GRANT USAGE ON SEQUENCE extension_devices_id_seq TO app_writer;

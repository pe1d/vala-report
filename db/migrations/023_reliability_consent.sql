-- =====================================================================
-- 023 — Độ tin cậy của việc lấy dữ liệu + sự đồng ý của người dùng.
--
--   * core.spider_launches.retry_of: lượt chạy theo lịch hỏng vì Crawlab chưa sẵn sàng (vừa khởi động, thiếu file
--     main.py) ⇒ worker tự chạy lại MỘT lần; retry_of trỏ về lượt hỏng để không chạy lại lần nữa.
--   * source_consents: người dùng xác nhận đã biết Vala dùng tài khoản của họ trên hệ thống nguồn để lấy dữ liệu theo
--     lịch, và nhật ký của hệ thống nguồn sẽ ghi nhận các lần truy cập đó (mô hình dữ liệu cá nhân — phương án, mục 11).
--     Lưu thời điểm + phiên bản nội dung đã đồng ý.
-- (Đóng bản ghi đã biến mất khỏi nguồn — không cần đổi bảng: records đã có valid_to.)
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE core.spider_launches ADD COLUMN retry_of bigint REFERENCES core.spider_launches(id) ON DELETE SET NULL;

CREATE TABLE source_consents (
    app_user_id   bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    source_system text        NOT NULL REFERENCES core.source_systems(code) ON DELETE CASCADE,
    version       text        NOT NULL,
    consented_at  timestamptz NOT NULL DEFAULT now(),
    via           text        NOT NULL CHECK (via IN ('portal', 'extension')),
    PRIMARY KEY (app_user_id, source_system)
);
COMMENT ON TABLE source_consents IS 'Người dùng đồng ý cho Vala dùng tài khoản của họ trên hệ thống nguồn để lấy dữ liệu (nội dung theo version).';

ALTER TABLE source_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY source_consents_own ON source_consents
    USING (app_user_id = current_app_user()) WITH CHECK (app_user_id = current_app_user());
GRANT SELECT, INSERT, UPDATE ON source_consents TO app_reader, app_writer;

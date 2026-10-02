-- =====================================================================
-- 021 — Tự cập nhật khi người dùng đang dùng (ngoài lịch định kỳ).
--
--   * Mở Tổng quan / một báo cáo ⇒ nguồn dữ liệu nào cũ hơn ngưỡng (mặc định 15 phút) thì tự lấy lại cho người đó.
--   * Tiện ích: người dùng vừa làm việc trên hệ thống nguồn (vd xử lý văn bản trên eGov) rồi rời tab ⇒ lấy lại ngay.
--   * data_source_prefs: người dùng tắt được việc tự cập nhật cho từng nguồn dữ liệu. Không có dòng = đang bật.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

CREATE TABLE data_source_prefs (
    app_user_id   bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    source_system text        NOT NULL REFERENCES core.source_systems(code) ON DELETE CASCADE,
    spider_code   text        REFERENCES core.crawl_spiders(code) ON DELETE CASCADE,
    capability    text,
    auto_refresh  boolean     NOT NULL DEFAULT true,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_source_prefs_one_target CHECK ((spider_code IS NULL) <> (capability IS NULL))
);
CREATE UNIQUE INDEX data_source_prefs_target ON data_source_prefs (app_user_id, source_system, coalesce(spider_code, ''), coalesce(capability, ''));

COMMENT ON TABLE data_source_prefs IS 'Tuỳ chọn của người dùng cho một nguồn dữ liệu: auto_refresh = tự lấy lại khi mở báo cáo / vừa làm việc trên hệ thống nguồn.';

ALTER TABLE data_source_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source_prefs FORCE ROW LEVEL SECURITY;
CREATE POLICY data_source_prefs_own ON data_source_prefs
    USING (app_user_id = current_app_user()) WITH CHECK (app_user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON data_source_prefs TO app_reader, app_writer;

-- =====================================================================
-- 010 — Hệ thống nguồn mới có chỗ chứa dữ liệu, báo cáo cấu hình được, và hiện lên Tổng quan.
--
--   * records: bảng dữ liệu CHUNG cho mọi loại bản ghi không phải văn bản/công việc (đơn nghỉ phép,
--     hợp đồng, phiếu yêu cầu…). Trường nằm trong `data` (jsonb) theo output_schema của adapter.
--     Cùng mô hình SCD2 (valid_from/valid_to, content_hash) và cùng RLS với documents/tasks.
--   * report_catalog.definition: báo cáo do quản trị cấu hình (không viết SQL) — máy chủ dựng truy vấn
--     an toàn từ danh sách trường cho phép. Báo cáo viết trong code vẫn giữ nguyên (definition = NULL).
--   * report_catalog.show_on_dashboard / dashboard_order: ô nào hiện trên Tổng quan, thứ tự.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

CREATE TABLE records (
    id                bigserial PRIMARY KEY,
    source_system     text        NOT NULL REFERENCES core.source_systems(code),
    capability        text        NOT NULL,
    record_key        text        NOT NULL,
    owner_user_id     bigint      NOT NULL REFERENCES app_users(id),
    org_unit_id       bigint      REFERENCES org_units(id),
    data              jsonb       NOT NULL,
    content_hash      bytea       NOT NULL,
    first_seen_at     timestamptz NOT NULL DEFAULT now(),
    valid_from        timestamptz NOT NULL DEFAULT now(),
    valid_to          timestamptz,
    last_crawl_run_id bigint      REFERENCES crawl_runs(id)
);
CREATE UNIQUE INDEX records_current ON records (source_system, capability, owner_user_id, record_key) WHERE valid_to IS NULL;
CREATE INDEX records_owner ON records (owner_user_id, source_system, capability) WHERE valid_to IS NULL;
CREATE INDEX records_org   ON records (org_unit_id, source_system, capability) WHERE valid_to IS NULL;

ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE records FORCE ROW LEVEL SECURITY;
CREATE POLICY records_own ON records FOR SELECT
    USING (owner_user_id = current_app_user());
CREATE POLICY records_org ON records FOR SELECT
    USING (current_setting('app.scope', true) = 'don_vi' AND org_unit_id = ANY (current_org_allowed()));
GRANT SELECT ON records TO app_reader;
GRANT SELECT, INSERT, UPDATE ON records TO app_writer;
GRANT USAGE ON SEQUENCE records_id_seq TO app_writer;

ALTER TABLE report_catalog
    ADD COLUMN definition        jsonb,
    ADD COLUMN show_on_dashboard boolean NOT NULL DEFAULT true,
    ADD COLUMN dashboard_order   int     NOT NULL DEFAULT 100,
    ADD COLUMN created_by        bigint,
    ADD COLUMN updated_at        timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN report_catalog.definition IS
    'NULL = báo cáo viết trong code (apps/api/src/reports). Khác NULL = báo cáo cấu hình: {dataset, filters, group_by, measures, columns, chart, tiles…}';

-- Quản trị (pool writer) thêm/sửa báo cáo cấu hình. Không xoá: lịch chạy tham chiếu tới; tắt bằng is_active.
GRANT INSERT, UPDATE ON report_catalog TO app_writer;

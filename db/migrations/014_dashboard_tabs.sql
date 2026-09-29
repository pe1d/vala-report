-- =====================================================================
-- 014 — Tổng quan cấu hình được: quản trị tạo TAB, mỗi tab gồm các KHỐI; mỗi khối là một báo cáo cấu hình
-- (thẻ số liệu, biểu đồ, bảng). Thay cho phần Văn bản / Công việc viết cứng trong code trước đây.
--
--   * dashboard_tabs: tên tab, hệ thống nguồn gắn với tab (để hiện tình trạng kết nối + nút Kết nối), thứ tự.
--   * report_catalog.dashboard_tab: báo cáo hiện ở tab nào (NULL = tab "Báo cáo của bạn").
--   * report_catalog.dashboard_width: độ rộng khối trên màn hình rộng, tính theo phần ba hàng (1..3).
-- =====================================================================
SET search_path = tenant_bkav, core, public;

CREATE TABLE dashboard_tabs (
    id            serial      PRIMARY KEY,
    ten           text        NOT NULL CHECK (length(btrim(ten)) BETWEEN 1 AND 60),
    source_system text        REFERENCES core.source_systems(code),
    thu_tu        int         NOT NULL DEFAULT 100,
    is_active     boolean     NOT NULL DEFAULT true,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    bigint
);
GRANT SELECT ON dashboard_tabs TO app_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_tabs TO app_writer;
GRANT USAGE ON SEQUENCE dashboard_tabs_id_seq TO app_writer;

ALTER TABLE report_catalog
    ADD COLUMN dashboard_tab   int      REFERENCES dashboard_tabs(id) ON DELETE SET NULL,
    ADD COLUMN dashboard_width smallint NOT NULL DEFAULT 3 CHECK (dashboard_width BETWEEN 1 AND 3);

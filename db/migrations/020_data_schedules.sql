-- =====================================================================
-- 020 — Lịch chạy gắn với NGUỒN DỮ LIỆU, không gắn với báo cáo.
--
-- Trước đây lịch đặt cho một báo cáo, nhưng mỗi lượt chạy là chạy NGUYÊN script crawl (hoặc cách lấy dữ liệu trong
-- adapter) — dữ liệu đó dùng chung cho mọi báo cáo cùng nguồn (vd 8 báo cáo eGov cùng dùng spider egov_van_ban).
-- Tham số báo cáo lưu trong lịch cũng chưa bao giờ ảnh hưởng tới việc lấy dữ liệu. Gây hiểu nhầm ⇒ đổi:
--
--   * data_schedules: mỗi người × một nguồn dữ liệu = một lịch. Nguồn dữ liệu là
--       - một script crawl (spider_code), hoặc
--       - một capability của adapter do worker tự chạy (capability, khi báo cáo không gắn spider).
--   * Lịch cũ (report_subscriptions) chuyển sang: cùng người × cùng nguồn dữ liệu ⇒ gộp còn một (ưu tiên lịch đang
--     bật, mới nhất); lần chạy gần nhất lấy mốc muộn nhất. Tham số báo cáo bỏ.
--   * report_subscriptions giữ lại (chỉ đọc lịch sử, không còn dùng) — xoá ở migration sau.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

CREATE TABLE data_schedules (
    id            bigserial   PRIMARY KEY,
    app_user_id   bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    source_system text        NOT NULL REFERENCES core.source_systems(code) ON DELETE CASCADE,
    spider_code   text        REFERENCES core.crawl_spiders(code) ON DELETE CASCADE,
    capability    text,
    schedule      jsonb       NOT NULL,
    timezone      text        NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    is_enabled    boolean     NOT NULL DEFAULT true,
    next_run_at   timestamptz,
    last_run_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    -- Đúng một trong hai: script crawl, hoặc capability do worker chạy.
    CONSTRAINT data_schedules_one_target CHECK ((spider_code IS NULL) <> (capability IS NULL))
);
CREATE UNIQUE INDEX data_schedules_target ON data_schedules (app_user_id, source_system, coalesce(spider_code, ''), coalesce(capability, ''));
CREATE INDEX data_schedules_due ON data_schedules (next_run_at) WHERE is_enabled;

COMMENT ON TABLE data_schedules IS 'Lịch tự lấy dữ liệu của một người cho một nguồn dữ liệu (script crawl hoặc capability adapter) — dùng chung cho mọi báo cáo của nguồn đó.';
COMMENT ON COLUMN data_schedules.schedule IS 'Lịch có cấu trúc (packages/core/src/schedule.ts), không phải cron thô.';

ALTER TABLE data_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY data_schedules_own ON data_schedules
    USING (app_user_id = current_app_user()) WITH CHECK (app_user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON data_schedules TO app_reader, app_writer;
GRANT USAGE ON SEQUENCE data_schedules_id_seq TO app_reader, app_writer;

-- Chuyển lịch cũ: nguồn dữ liệu của báo cáo = spider (nếu có) hoặc capability.
INSERT INTO data_schedules (app_user_id, source_system, spider_code, capability, schedule, timezone, is_enabled,
                            next_run_at, last_run_at, created_at)
SELECT DISTINCT ON (rs.app_user_id, rc.source_system, coalesce(rc.spider_code, ''), CASE WHEN rc.spider_code IS NULL THEN rc.capability ELSE '' END)
       rs.app_user_id, rc.source_system, rc.spider_code,
       CASE WHEN rc.spider_code IS NULL THEN rc.capability END,
       rs.schedule, rs.timezone, rs.is_enabled, rs.next_run_at,
       max(rs.last_run_at) OVER (PARTITION BY rs.app_user_id, rc.source_system, coalesce(rc.spider_code, rc.capability)),
       rs.created_at
  FROM report_subscriptions rs
  JOIN report_catalog rc ON rc.code = rs.report_code
  JOIN core.source_systems ss ON ss.code = rc.source_system
  LEFT JOIN core.crawl_spiders sp ON sp.code = rc.spider_code
 WHERE rc.spider_code IS NULL OR sp.code IS NOT NULL
 ORDER BY rs.app_user_id, rc.source_system, coalesce(rc.spider_code, ''), CASE WHEN rc.spider_code IS NULL THEN rc.capability ELSE '' END,
          rs.is_enabled DESC, rs.created_at DESC;

COMMENT ON TABLE report_subscriptions IS 'KHÔNG CÒN DÙNG từ 020 — lịch chuyển sang data_schedules (theo nguồn dữ liệu). Giữ tạm để đối chiếu, sẽ xoá.';

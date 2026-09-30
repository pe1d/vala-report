-- =====================================================================
-- 019 — Theo dõi được những gì trước đây "biến mất": lượt chạy spider hỏng NGAY trong Crawlab (thiếu file, lỗi
-- Python trước khi gọi Vala…) và lúc worker / Crawlab ngừng hoạt động.
--
--   * core.spider_launches: mỗi lần Vala bảo Crawlab chạy spider cho một người (theo lịch hay "chạy ngay").
--     Spider gọi tới Vala (POST /internal/spider/runs, kèm CRAWLAB_TASK_ID) ⇒ 'reported'. Quá vài phút không thấy
--     ⇒ worker lấy lý do từ Crawlab và ghi một lượt lỗi vào crawl_runs (hiện ở "Nhật ký chạy") ⇒ 'failed'.
--   * core.service_heartbeats: worker ghi "còn sống" mỗi phút; kết quả kiểm tra Crawlab (liên lạc được không,
--     spider nào thiếu file) ⇒ trang Vận hành hiện tình trạng.
-- =====================================================================
CREATE TABLE core.spider_launches (
    id              bigserial   PRIMARY KEY,
    spider_code     text        NOT NULL REFERENCES core.crawl_spiders(code) ON DELETE CASCADE,
    app_user_id     bigint,
    crawlab_task_id text,
    trigger_type    text        NOT NULL,
    launched_at     timestamptz NOT NULL DEFAULT now(),
    status          text        NOT NULL DEFAULT 'launched' CHECK (status IN ('launched', 'reported', 'failed')),
    checked_at      timestamptz,
    error           text
);
CREATE INDEX spider_launches_pending ON core.spider_launches (launched_at) WHERE status = 'launched';
CREATE INDEX spider_launches_task ON core.spider_launches (crawlab_task_id);

CREATE TABLE core.service_heartbeats (
    name text        PRIMARY KEY,
    at   timestamptz NOT NULL,
    info jsonb       NOT NULL DEFAULT '{}'
);

GRANT SELECT, INSERT, UPDATE ON core.spider_launches, core.service_heartbeats TO app_writer;
GRANT USAGE ON SEQUENCE core.spider_launches_id_seq TO app_writer;

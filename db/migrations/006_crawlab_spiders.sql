-- =====================================================================
-- 006 — Script crawl (spider Python) chạy trong Crawlab, do quản trị quản lý.
--
-- Luồng: Crawlab chạy spider theo lịch cố định (spider × preset) → spider hỏi API danh sách người dùng
-- đã đặt lịch preset đó → lấy cookie từng người (API tự đăng nhập lại nếu cần) → gửi bản ghi về API.
-- Spider KHÔNG bao giờ nhận mật khẩu nguồn; dữ liệu KHÔNG lưu trong MongoDB của Crawlab.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

-- Danh mục spider. Mã nguồn nằm ở crawlers/<code>/ trong repo, đồng bộ lên Crawlab.
CREATE TABLE core.crawl_spiders (
    code               text PRIMARY KEY,                     -- 'egov_van_ban'
    ten                text        NOT NULL,
    mo_ta              text,
    source_system      text        NOT NULL REFERENCES core.source_systems(code),
    entity             text        NOT NULL CHECK (entity IN ('documents', 'tasks')),
    is_enabled         boolean     NOT NULL DEFAULT true,
    crawlab_spider_id  text,                                 -- điền khi đồng bộ
    synced_at          timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- Lịch cố định trong Crawlab: mỗi (spider × preset) một lịch. Người dùng đổi lịch = đổi preset
-- trong report_subscriptions, không tạo lịch Crawlab mới (giữ nguyên quyết định ở 001).
CREATE TABLE core.spider_schedules (
    spider_code          text NOT NULL REFERENCES core.crawl_spiders(code) ON DELETE CASCADE,
    schedule_preset      text NOT NULL,
    cron_expr            text NOT NULL,
    crawlab_schedule_id  text,
    PRIMARY KEY (spider_code, schedule_preset)
);

GRANT SELECT ON core.crawl_spiders, core.spider_schedules TO app_reader, app_writer;
GRANT INSERT, UPDATE, DELETE ON core.crawl_spiders, core.spider_schedules TO app_writer;

-- Báo cáo nào lấy dữ liệu từ spider nào (cột thêm cho mọi hệ thống nguồn).
ALTER TABLE report_catalog ADD COLUMN spider_code text REFERENCES core.crawl_spiders(code);

-- Lượt chạy ghi nhận spider đã chạy.
ALTER TABLE crawl_runs ADD COLUMN spider_code text;

-- KHÔNG seed spider/báo cáo trong code: quản trị đăng ký spider và tạo báo cáo trên giao diện.

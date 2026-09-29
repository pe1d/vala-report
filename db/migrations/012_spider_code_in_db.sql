-- =====================================================================
-- 012 — Mã spider nằm trong CSDL, quản trị viết/sửa trên cổng "Script crawl".
--
-- Trước đây mã spider chỉ ở repo (crawlers/<mã>/main.py): thêm hệ thống nguồn mới phải sửa code và
-- triển khai lại. Giờ main.py lưu ở cột main_py; "Đồng bộ Crawlab" đẩy mã từ CSDL lên Crawlab.
-- Spider cũ chưa có main_py thì lần đồng bộ đầu chép mẫu trong repo vào đây (giống adapter ở 009).
--
-- An toàn: main_py là mã Python chạy trên Crawlab — chỉ quản trị vận hành (is_ops_admin) sửa được,
-- mọi lần sửa ghi audit. Đây đúng mức tin cậy đã có với Crawlab (chỉ kỹ sư vận hành truy cập).
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE core.crawl_spiders ADD COLUMN main_py    text;
ALTER TABLE core.crawl_spiders ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE core.crawl_spiders ADD COLUMN updated_by bigint;

-- Nguồn mới dùng bảng dữ liệu chung (records) cũng có spider được, không chỉ văn bản/công việc.
ALTER TABLE core.crawl_spiders DROP CONSTRAINT crawl_spiders_entity_check;
ALTER TABLE core.crawl_spiders ADD CONSTRAINT crawl_spiders_entity_check
    CHECK (entity IN ('documents', 'tasks', 'records'));

-- Mã spider dùng làm tên spider bên Crawlab: chữ thường, số, gạch dưới.
ALTER TABLE core.crawl_spiders ADD CONSTRAINT crawl_spiders_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]{1,62}$');

COMMENT ON COLUMN core.crawl_spiders.main_py IS
    'Mã main.py của spider (Python, dùng vala_sdk). NULL = chưa chép từ repo; lần đồng bộ đầu sẽ chép mẫu crawlers/<mã>/main.py.';

-- =====================================================================
-- 017 — Xoá bảng riêng theo nghiệp vụ documents / tasks.
-- Dữ liệu đã chép sang kho chung `records` ở 016 (kể cả lịch sử); đã đối chiếu 12 báo cáo trước/sau khi chuyển
-- (24/24 kết quả giống hệt) và lượt lấy dữ liệu thật eGov/eTask ghi vào records không sinh bản ghi trùng.
-- Từ đây mọi hệ thống nguồn chỉ dùng records — thêm hệ thống mới không phải đổi lược đồ CSDL.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS tasks;

-- Spider chỉ còn ghi vào kho chung.
ALTER TABLE core.crawl_spiders DROP CONSTRAINT IF EXISTS crawl_spiders_entity_check;
UPDATE core.crawl_spiders SET entity = 'records' WHERE entity <> 'records';
ALTER TABLE core.crawl_spiders ADD CONSTRAINT crawl_spiders_entity_check CHECK (entity = 'records');

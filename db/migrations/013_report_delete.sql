-- =====================================================================
-- 013 — Quản trị xoá được báo cáo (kèm lịch chạy của báo cáo đó) trên trang "Cấu hình báo cáo".
-- Mọi báo cáo giờ là báo cáo cấu hình (report_catalog.definition); không còn báo cáo viết trong code.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

GRANT DELETE ON report_catalog TO app_writer;

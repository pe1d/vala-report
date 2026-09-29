-- 004 — app_writer cần DELETE cho: xoá dữ liệu đã crawl khi người dùng yêu cầu (sau khi thu hồi),
-- và dọn crawl_runs/raw_records theo vòng đời. 001 chỉ cấp SELECT, INSERT, UPDATE.
SET search_path = tenant_bkav, core, public;
GRANT DELETE ON documents, tasks, raw_records, crawl_runs, user_source_accounts, source_grants TO app_writer;

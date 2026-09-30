-- =====================================================================
-- 016 — Một kho dữ liệu chung cho mọi hệ thống nguồn: bảng `records`.
--
-- Trước đây văn bản (documents) và công việc (tasks) có bảng riêng — nghiệp vụ riêng của eGov/eTask nằm trong lõi.
-- Từ đây mọi capability ghi vào `records` (trường trong `data` jsonb theo output_schema của cấu hình adapter),
-- kể cả eGov/eTask. Migration này:
--   1. thêm hàm hỗ trợ: rec_date (đọc ngày ISO trong jsonb, dùng được cho chỉ mục) và ensure_record_index (tạo chỉ
--      mục cho một trường khai `index: true` — tên/biểu thức do hàm tự dựng, định danh đã kiểm tra, không nhận SQL);
--   2. chép dữ liệu documents/tasks (cả lịch sử) sang records — capability lấy từ cấu hình adapter đang dùng
--      (core.adapters), không viết tên hệ thống nào trong đây;
--   3. đổi cấu hình adapter (sink.table), định nghĩa báo cáo (dataset) và spider (entity) sang records;
--   4. bỏ bảng tổng hợp theo tháng dựng trên documents (không báo cáo nào dùng nữa).
-- Bảng documents/tasks CHƯA xoá ở đây — xoá ở migration sau, khi đã đối chiếu số liệu báo cáo trước/sau.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

-- 1. Hàm hỗ trợ -----------------------------------------------------------------------------------
-- Ngày trong data luôn ở dạng ISO YYYY-MM-DD (normalizeCapability chuẩn hoá) ⇒ ép kiểu cho kết quả xác định;
-- khai IMMUTABLE để dùng được trong chỉ mục biểu thức.
CREATE OR REPLACE FUNCTION rec_date(v text) RETURNS date
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$ SELECT v::date $$;
GRANT EXECUTE ON FUNCTION rec_date(text) TO app_reader, app_writer;

-- Chỉ mục cho một trường của một (hệ thống × capability): chỉ trên bản hiện hành. Định danh kiểm bằng regex và
-- đưa vào qua format(%I / %L) ⇒ cấu hình sửa trên cổng không chèn được SQL. Chạy với quyền chủ bảng.
CREATE OR REPLACE FUNCTION ensure_record_index(p_source text, p_capability text, p_field text, p_type text)
    RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = tenant_bkav, pg_temp AS $$
DECLARE
    v_name text;
    v_expr text;
BEGIN
    IF p_source !~ '^[a-z][a-z0-9_]{0,29}$' OR p_capability !~ '^[A-Za-z][A-Za-z0-9_]{0,59}$'
       OR p_field !~ '^[A-Za-z][A-Za-z0-9_]{0,60}$' OR p_type NOT IN ('string', 'int', 'date') THEN
        RAISE EXCEPTION 'ensure_record_index: tham số không hợp lệ';
    END IF;
    v_name := 'records_f_' || substr(md5(p_source || '|' || p_capability || '|' || p_field || '|' || p_type), 1, 20);
    v_expr := CASE p_type
        WHEN 'date' THEN format('rec_date(data ->> %L)', p_field)
        WHEN 'int'  THEN format('((data ->> %L)::bigint)', p_field)
        ELSE format('(data ->> %L)', p_field) END;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON tenant_bkav.records (owner_user_id, %s) '
                   'WHERE source_system = %L AND capability = %L AND valid_to IS NULL',
                   v_name, v_expr, p_source, p_capability);
    RETURN v_name;
END $$;
REVOKE ALL ON FUNCTION ensure_record_index(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_record_index(text, text, text, text) TO app_writer;

-- 2. Chép dữ liệu sang records ------------------------------------------------------------------
CREATE TEMP TABLE legacy_caps ON COMMIT DROP AS
SELECT DISTINCT a.source_system, c ->> 'id' AS capability, c -> 'sink' ->> 'table' AS tbl
  FROM core.adapters a CROSS JOIN LATERAL jsonb_array_elements(a.spec -> 'capabilities') c
 WHERE a.is_active AND c -> 'sink' ->> 'table' IN ('documents', 'tasks');

INSERT INTO records (source_system, capability, record_key, owner_user_id, org_unit_id, data, content_hash,
                     first_seen_at, valid_from, valid_to, last_crawl_run_id)
SELECT d.source_system, lc.capability, d.ma_van_ban, d.owner_user_id, d.org_unit_id,
       to_jsonb(d) - ARRAY['id', 'source_system', 'owner_user_id', 'org_unit_id', 'content_hash', 'first_seen_at',
                           'valid_from', 'valid_to', 'last_crawl_run_id'],
       d.content_hash, d.first_seen_at, d.valid_from, d.valid_to, d.last_crawl_run_id
  FROM documents d JOIN legacy_caps lc ON lc.source_system = d.source_system AND lc.tbl = 'documents';

INSERT INTO records (source_system, capability, record_key, owner_user_id, org_unit_id, data, content_hash,
                     first_seen_at, valid_from, valid_to, last_crawl_run_id)
SELECT t.source_system, lc.capability, t.ma_cong_viec, t.owner_user_id, t.org_unit_id,
       to_jsonb(t) - ARRAY['id', 'source_system', 'owner_user_id', 'org_unit_id', 'content_hash', 'first_seen_at',
                           'valid_from', 'valid_to', 'last_crawl_run_id'],
       t.content_hash, t.first_seen_at, t.valid_from, t.valid_to, t.last_crawl_run_id
  FROM tasks t JOIN legacy_caps lc ON lc.source_system = t.source_system AND lc.tbl = 'tasks';

-- 3. Cấu hình trỏ sang records -----------------------------------------------------------------
UPDATE core.source_systems
   SET adapter_yaml = regexp_replace(adapter_yaml, '(\n[ \t]+table:[ \t]*)(documents|tasks)\M', '\1records', 'g')
 WHERE adapter_yaml ~ '\n[ \t]+table:[ \t]*(documents|tasks)\M';

UPDATE report_catalog rc
   SET definition = jsonb_set(jsonb_set(rc.definition, '{dataset}', '"records"'), '{capability}', to_jsonb(lc.capability)),
       updated_at = now()
  FROM legacy_caps lc
 WHERE rc.definition ->> 'dataset' IN ('documents', 'tasks')
   AND lc.source_system = rc.source_system AND lc.tbl = rc.definition ->> 'dataset';

UPDATE core.crawl_spiders SET entity = 'records' WHERE entity IN ('documents', 'tasks');

-- 4. Tổng hợp theo tháng dựng trên documents: không còn báo cáo nào dùng --------------------------
DROP VIEW IF EXISTS v_van_ban_theo_thang;
DROP MATERIALIZED VIEW IF EXISTS mv_van_ban_theo_thang;
DROP FUNCTION IF EXISTS refresh_aggregates();

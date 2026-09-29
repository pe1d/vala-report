-- =====================================================================
-- 002 — Vá các lỗ phát hiện khi dựng code trên lược đồ 001.
-- Mỗi mục ghi rõ lỗi gì nếu không vá.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

-- ---------------------------------------------------------------------
-- 1. Chỉ một bản hiện hành cho mỗi (nguồn, mã, chủ sở hữu).
--    Không có: hai run song song cho cùng người dùng có thể chèn hai bản hiện hành.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX documents_one_current
    ON documents (source_system, ma_van_ban, owner_user_id) WHERE valid_to IS NULL;
CREATE UNIQUE INDEX tasks_one_current
    ON tasks (source_system, ma_cong_viec, owner_user_id) WHERE valid_to IS NULL;

-- ---------------------------------------------------------------------
-- 2. Phân vùng raw_records.
--    Không có: 001 chỉ tạo 2026-10 và 2026-11 ⇒ mọi INSERT trước 01/10/2026 lỗi.
--    Thêm nữa: GRANT SELECT ON ALL TABLES trong 001 đã cấp cho app_reader quyền đọc
--    TRỰC TIẾP từng phân vùng — mà RLS của bảng cha không áp lên truy vấn vào bảng con.
--    ⇒ thu hồi quyền trên mọi phân vùng; chỉ đọc qua bảng cha.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_raw_partitions(months_ahead int DEFAULT 2) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tenant_bkav, pg_temp AS $$
DECLARE
    m     date;
    pname text;
BEGIN
    FOR i IN 0..months_ahead LOOP
        m     := (date_trunc('month', now()) + make_interval(months => i))::date;
        pname := format('raw_records_%s', to_char(m, 'YYYY_MM'));
        IF to_regclass(format('tenant_bkav.%I', pname)) IS NULL THEN
            EXECUTE format(
                'CREATE TABLE tenant_bkav.%I PARTITION OF tenant_bkav.raw_records FOR VALUES FROM (%L) TO (%L)',
                pname, m, (m + interval '1 month')::date);
        END IF;
        EXECUTE format('REVOKE ALL ON tenant_bkav.%I FROM app_reader', pname);
    END LOOP;
END $$;

-- Xoá phân vùng mà toàn bộ khoảng thời gian đã quá hạn giữ (mặc định 90 ngày).
CREATE OR REPLACE FUNCTION drop_expired_raw_partitions(keep_days int DEFAULT 90) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tenant_bkav, pg_temp AS $$
DECLARE
    r       record;
    dropped int := 0;
    upper_b date;
BEGIN
    FOR r IN
        SELECT c.relname
          FROM pg_inherits i
          JOIN pg_class c ON c.oid = i.inhrelid
          JOIN pg_class p ON p.oid = i.inhparent
          JOIN pg_namespace n ON n.oid = p.relnamespace
         WHERE p.relname = 'raw_records' AND n.nspname = 'tenant_bkav'
    LOOP
        -- tên dạng raw_records_YYYY_MM ⇒ cận trên là đầu tháng kế tiếp
        upper_b := (to_date(right(r.relname, 7), 'YYYY_MM') + interval '1 month')::date;
        IF upper_b < (now() - make_interval(days => keep_days))::date THEN
            EXECUTE format('DROP TABLE tenant_bkav.%I', r.relname);
            dropped := dropped + 1;
        END IF;
    END LOOP;
    RETURN dropped;
END $$;

REVOKE ALL ON FUNCTION ensure_raw_partitions(int), drop_expired_raw_partitions(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_raw_partitions(int), drop_expired_raw_partitions(int) TO app_writer;

SELECT ensure_raw_partitions(2);
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT c.relname FROM pg_inherits i
               JOIN pg_class c ON c.oid = i.inhrelid
              WHERE i.inhparent = 'tenant_bkav.raw_records'::regclass
    LOOP
        EXECUTE format('REVOKE ALL ON tenant_bkav.%I FROM app_reader', r.relname);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Quyền còn thiếu / thừa.
-- ---------------------------------------------------------------------
-- Đường phục vụ ghi lịch, uỷ quyền và audit bằng app_reader (vẫn chịu RLS).
GRANT INSERT, UPDATE, DELETE ON report_subscriptions, source_grants TO app_reader;
GRANT INSERT ON audit_log TO app_reader;
GRANT USAGE ON SEQUENCE report_subscriptions_id_seq, source_grants_id_seq, audit_log_id_seq TO app_reader;
-- Không có: bất kỳ người dùng nào cũng đọc được audit_log của mọi người.
REVOKE SELECT ON audit_log FROM app_reader;

-- Bảng core: 001 chỉ cấp USAGE trên schema, chưa cấp trên bảng.
GRANT SELECT ON ALL TABLES IN SCHEMA core TO app_reader, app_writer;
GRANT INSERT, UPDATE ON core.adapters, core.crawl_tasks TO app_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA core TO app_writer;
GRANT DELETE ON report_subscriptions TO app_writer;

-- ---------------------------------------------------------------------
-- 4. crawl_runs có error_detail của từng người ⇒ chỉ chính chủ đọc qua app_reader.
--    Không có: mọi người dùng đọc được nhật ký lỗi của mọi người.
--    Màn hình vận hành đọc qua pool writer, sau khi API kiểm tra is_ops_admin.
-- ---------------------------------------------------------------------
ALTER TABLE crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY runs_own ON crawl_runs FOR SELECT
    USING (app_user_id = current_app_user());

-- ---------------------------------------------------------------------
-- 5. Bổ sung cột.
-- ---------------------------------------------------------------------
-- Ai được mở màn hình vận hành (/ops/*).
ALTER TABLE app_users ADD COLUMN is_ops_admin boolean NOT NULL DEFAULT false;
-- Người kiêm nhiệm: đơn vị nào gắn vào documents.org_unit_id khi crawl.
ALTER TABLE user_org_units ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX user_org_units_one_primary ON user_org_units (app_user_id) WHERE is_primary;

-- ---------------------------------------------------------------------
-- 6. Lớp 3: materialized view không chịu RLS.
--    Không có: app_reader đọc thẳng được số liệu tổng hợp của mọi người.
--    ⇒ thu hồi quyền trên MV, chỉ mở một view security_barrier áp đúng điều kiện RLS.
-- ---------------------------------------------------------------------
REVOKE ALL ON mv_van_ban_theo_thang FROM app_reader;

CREATE VIEW v_van_ban_theo_thang WITH (security_barrier = true) AS
SELECT *
  FROM mv_van_ban_theo_thang
 WHERE owner_user_id = current_app_user()
    OR (current_setting('app.scope', true) = 'don_vi'
        AND org_unit_id = ANY (current_org_allowed()));
GRANT SELECT ON v_van_ban_theo_thang TO app_reader;

-- REFRESH cần quyền chủ sở hữu ⇒ bọc SECURITY DEFINER cho worker.
CREATE OR REPLACE FUNCTION refresh_aggregates() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = tenant_bkav, pg_temp AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant_bkav.mv_van_ban_theo_thang;
$$;
REVOKE ALL ON FUNCTION refresh_aggregates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_aggregates() TO app_writer;

-- ---------------------------------------------------------------------
-- 7. "Đang tổng hợp từ 12/18 thành viên đã uỷ quyền" (mục 07).
--    source_grants chỉ cho chính chủ đọc ⇒ app_reader không đếm được grant của người khác.
--    Hàm này chỉ trả SỐ ĐẾM, và chỉ trong các đơn vị API đã đặt ở app.org_units_allowed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_coverage(p_source text)
RETURNS TABLE (members int, granted int, oldest_success timestamptz, newest_success timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tenant_bkav, pg_temp AS $$
    WITH m AS (
        SELECT DISTINCT uou.app_user_id
          FROM user_org_units uou
          JOIN app_users u ON u.id = uou.app_user_id AND u.is_active
         WHERE current_setting('app.scope', true) = 'don_vi'
           AND uou.org_unit_id = ANY (current_org_allowed())
    ), g AS (
        SELECT m.app_user_id
          FROM m JOIN source_grants s
            ON s.app_user_id = m.app_user_id
           AND s.source_system = p_source
           AND s.revoked_at IS NULL
           AND s.session_state = 'active'
    ), last_ok AS (
        SELECT g.app_user_id, max(r.finished_at) AS at
          FROM g JOIN crawl_runs r
            ON r.app_user_id = g.app_user_id
           AND r.source_system = p_source
           AND r.status = 'ok'
         GROUP BY g.app_user_id
    )
    SELECT (SELECT count(*) FROM m)::int,
           (SELECT count(*) FROM g)::int,
           (SELECT min(at) FROM last_ok),
           (SELECT max(at) FROM last_ok);
$$;
REVOKE ALL ON FUNCTION org_coverage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_coverage(text) TO app_reader;

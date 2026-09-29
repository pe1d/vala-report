-- 001 — lược đồ gốc từ docs/schema.original.sql, hai chỗ sửa bắt buộc để chạy được:
--   * CREATE ROLE thành idempotent (vai trò là toàn cluster);
--   * raw_records: PRIMARY KEY (id, fetched_at) — PG không cho khoá chính thiếu cột phân vùng.
-- Các bản vá nằm ở 002, không sửa file này.

-- =====================================================================
-- Scheduled Reporting Platform — lược đồ CSDL (PostgreSQL 15+)
-- Phiên bản: 1.0  ·  Phạm vi bản 1: eGov + eTask  ·  Mô hình: phiên uỷ quyền per-user
--
-- Chạy theo thứ tự. Mọi bảng nằm trong schema riêng của từng đơn vị
-- (giai đoạn nội bộ chỉ có một: tenant_bkav), trừ các bảng dùng chung ở schema "core".
--
-- Quy ước:
--   * Mọi cột thời gian dùng timestamptz, lưu UTC, hiển thị theo Asia/Ho_Chi_Minh.
--   * Tên cột dữ liệu nghiệp vụ để tiếng Việt không dấu, khớp output_schema của adapter.
--   * Không bảng nào chứa credential. Phiên nằm trong vault ngoài CSDL.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- SCHEMA core — dùng chung, không chứa dữ liệu nghiệp vụ của đơn vị
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS core;

-- Hệ thống nguồn được hỗ trợ
CREATE TABLE core.source_systems (
    code            text PRIMARY KEY,              -- 'egov' | 'etask' | 'bmail'
    ten             text        NOT NULL,
    base_url        text        NOT NULL,
    auth_mode       text        NOT NULL,          -- 'delegated_session' | 'service_account' | 'oauth'
    enabled         boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hệ thống nguồn KHÔNG seed trong code: quản trị thêm trên giao diện "Hệ thống nguồn".

-- Định nghĩa adapter (bản spec đang hiệu lực, có version)
CREATE TABLE core.adapters (
    id              bigserial   PRIMARY KEY,
    source_system   text        NOT NULL REFERENCES core.source_systems(code),
    capability      text        NOT NULL,          -- 'documents_by_node'
    version         text        NOT NULL,          -- '2.0.0'
    spec            jsonb       NOT NULL,          -- toàn bộ adapter spec, xem adapter-egov.yaml
    schema_baseline jsonb,                         -- dùng để phát hiện lệch schema
    is_active       boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    UNIQUE (source_system, capability, version)
);
CREATE UNIQUE INDEX adapters_one_active
    ON core.adapters (source_system, capability) WHERE is_active;

-- Task Crawlab: TĨNH, tạo một lần lúc triển khai, không tạo theo từng người dùng.
-- Mỗi task = một (capability × schedule_preset). Với 2 capability và 4 preset
-- thì có tối đa 8 task — số lượng cố định, giao diện Crawlab vẫn đọc được.
-- Người dùng đổi lịch = đổi preset trong report_subscriptions, KHÔNG gọi API Crawlab.
CREATE TABLE core.crawl_tasks (
    id              bigserial   PRIMARY KEY,
    source_system   text        NOT NULL REFERENCES core.source_systems(code),
    capability      text        NOT NULL,
    schedule_preset text        NOT NULL,          -- hang_ngay_07 | hang_tuan_t2_08 | ...
    cron_expr       text        NOT NULL,          -- cron thật, chỉ kỹ sư thấy
    crawlab_task_id text        NOT NULL,          -- id task bên Crawlab
    is_enabled      boolean     NOT NULL DEFAULT true,
    UNIQUE (source_system, capability, schedule_preset)
);

-- Lịch crawl KHÔNG seed trong code: đặt theo hệ thống nguồn + preset khi quản trị cấu hình.

-- =====================================================================
-- SCHEMA tenant_<ma_don_vi> — dữ liệu nghiệp vụ, tách theo đơn vị
-- Giai đoạn nội bộ: tenant_bkav
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS tenant_bkav;
SET search_path = tenant_bkav, public;

-- ---------------------------------------------------------------------
-- NGƯỜI DÙNG & TỔ CHỨC
-- ---------------------------------------------------------------------

-- Người dùng của cổng báo cáo. Định danh gốc lấy từ Bkav SSO.
CREATE TABLE app_users (
    id              bigserial   PRIMARY KEY,
    sso_subject     text        NOT NULL UNIQUE,   -- định danh bền vững từ SSO
    email           text        NOT NULL UNIQUE,
    ho_ten          text        NOT NULL,
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_login_at   timestamptz
);

-- Cây tổ chức, đồng bộ định kỳ từ hệ thống nguồn hoặc từ danh bạ nội bộ.
CREATE TABLE org_units (
    id              bigint      PRIMARY KEY,       -- giữ nguyên id bên nguồn
    ten             text        NOT NULL,
    parent_id       bigint      REFERENCES org_units(id),
    path            bigint[]    NOT NULL,          -- đường dẫn từ gốc, để truy vấn cấp dưới
    synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_units_path_gin ON org_units USING gin (path);

-- Một người có thể thuộc nhiều đơn vị (kiêm nhiệm).
CREATE TABLE user_org_units (
    app_user_id     bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    org_unit_id     bigint      NOT NULL REFERENCES org_units(id),
    vai_tro         text        NOT NULL DEFAULT 'thanh_vien',  -- 'thanh_vien' | 'truong_don_vi'
    synced_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (app_user_id, org_unit_id)
);

-- Ánh xạ người dùng cổng <-> tài khoản trên từng hệ thống nguồn.
-- puid của eGov nằm ở đây, lấy được sau lần đăng nhập uỷ quyền đầu tiên.
CREATE TABLE user_source_accounts (
    id              bigserial   PRIMARY KEY,
    app_user_id     bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    source_system   text        NOT NULL REFERENCES core.source_systems(code),
    source_user_id  text        NOT NULL,          -- eGov: puid (vd '3058')
    source_username text,
    UNIQUE (app_user_id, source_system),
    UNIQUE (source_system, source_user_id)
);

-- ---------------------------------------------------------------------
-- UỶ QUYỀN & PHIÊN
-- Bảng này KHÔNG chứa cookie hay token. Chỉ chứa trạng thái + con trỏ tới vault.
-- ---------------------------------------------------------------------
CREATE TABLE source_grants (
    id                  bigserial   PRIMARY KEY,
    app_user_id         bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    source_system       text        NOT NULL REFERENCES core.source_systems(code),

    -- uỷ quyền
    granted_at          timestamptz NOT NULL DEFAULT now(),
    revoked_at          timestamptz,
    scope_capabilities  text[]      NOT NULL,      -- capability người dùng đã đồng ý

    -- trạng thái phiên (giá trị phiên nằm trong vault, không nằm đây)
    vault_ref           text        NOT NULL,      -- 'vault://tenant_bkav/users/{id}/egov'
    session_state       text        NOT NULL DEFAULT 'pending',
                                    -- pending | active | expired | revoked | failed
    session_expires_at  timestamptz,
    last_refresh_at     timestamptz,
    refresh_fail_count  int         NOT NULL DEFAULT 0,
    last_error          text,

    UNIQUE (app_user_id, source_system)
);
CREATE INDEX source_grants_crawlable
    ON source_grants (source_system, session_state)
    WHERE revoked_at IS NULL AND session_state = 'active';

COMMENT ON TABLE source_grants IS
    'Mỗi dòng là một lần người dùng cho phép hệ thống lấy dữ liệu thay mình. '
    'Thu hồi = set revoked_at; worker phải xoá phiên khỏi vault ngay khi thấy.';

-- ---------------------------------------------------------------------
-- NHẬT KÝ CHẠY
-- ---------------------------------------------------------------------
CREATE TABLE crawl_runs (
    id                  bigserial   PRIMARY KEY,
    source_system       text        NOT NULL REFERENCES core.source_systems(code),
    capability          text        NOT NULL,
    adapter_version     text        NOT NULL,
    app_user_id         bigint      REFERENCES app_users(id),  -- NULL nếu là tác vụ hệ thống
    crawlab_task_id     text,                      -- task tĩnh đã kích hoạt lần chạy này
    crawlab_run_id      text,                      -- lần chạy cụ thể; 1 lần chạy -> N dòng (N người dùng)
    trigger_type        text        NOT NULL,      -- 'schedule' | 'manual' | 'backfill'
    started_at          timestamptz NOT NULL DEFAULT now(),
    finished_at         timestamptz,
    status              text        NOT NULL DEFAULT 'running',  -- running | ok | failed | skipped
    records_seen        int,
    records_changed     int,
    http_calls          int,
    error_code          text,                      -- 'session_expired' | 'schema_drift' | ...
    error_detail        text
);
CREATE INDEX crawl_runs_latest
    ON crawl_runs (source_system, capability, app_user_id, started_at DESC);
CREATE INDEX crawl_runs_failed
    ON crawl_runs (started_at DESC) WHERE status = 'failed';

-- ---------------------------------------------------------------------
-- LỚP 1 — THÔ. Giữ nguyên response, không bao giờ sửa.
-- ---------------------------------------------------------------------
CREATE TABLE raw_records (
    id              bigserial,
    crawl_run_id    bigint      NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
    source_system   text        NOT NULL,
    capability      text        NOT NULL,
    owner_user_id   bigint      NOT NULL REFERENCES app_users(id),  -- crawl thay cho ai
    source_key      text        NOT NULL,          -- id bên hệ thống nguồn
    payload         jsonb       NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now(),
    -- [sửa] bảng phân vùng: khoá chính phải chứa cột phân vùng
    PRIMARY KEY (id, fetched_at)
) PARTITION BY RANGE (fetched_at);

-- Tạo phân vùng theo tháng; job vận hành tạo trước 2 tháng và drop phân vùng quá hạn.
CREATE TABLE raw_records_2026_10 PARTITION OF raw_records
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE raw_records_2026_11 PARTITION OF raw_records
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE INDEX raw_records_lookup
    ON raw_records (source_system, capability, source_key, fetched_at DESC);

COMMENT ON TABLE raw_records IS
    'Giữ 90 ngày rồi drop phân vùng. Mục đích: tính lại lớp chuẩn hoá khi phát hiện '
    'bóc tách sai, mà không phải gọi lại hệ thống nguồn — vốn không cho lấy dữ liệu quá khứ.';

-- ---------------------------------------------------------------------
-- LỚP 2 — CHUẨN HOÁ, CÓ LỊCH SỬ (SCD2)
-- ---------------------------------------------------------------------

-- eGov: văn bản
CREATE TABLE documents (
    id                  bigserial   PRIMARY KEY,
    source_system       text        NOT NULL DEFAULT 'egov',
    ma_van_ban          text        NOT NULL,      -- DocumentCopyId
    owner_user_id       bigint      NOT NULL REFERENCES app_users(id),
    node_id             int,                       -- functionId: 32, 222, 13, ...
    node_ten            text,                      -- 'Văn bản mới kết thúc'

    trich_yeu           text,
    so_ky_hieu          text,
    so_den_di           text,
    ngay_nhan           date,
    ngay_tao            date,
    nguoi_tao           text,
    nguoi_xu_ly_id      bigint,                    -- UserCurrentId bên nguồn
    org_unit_id         bigint REFERENCES org_units(id),
    trang_thai          text,
    loai_van_ban_id     text,

    content_hash        bytea       NOT NULL,
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    valid_from          timestamptz NOT NULL DEFAULT now(),
    valid_to            timestamptz,               -- NULL = bản hiện hành
    last_crawl_run_id   bigint REFERENCES crawl_runs(id),

    UNIQUE (source_system, ma_van_ban, owner_user_id, valid_from)
);
CREATE INDEX documents_current
    ON documents (owner_user_id, ngay_nhan DESC) WHERE valid_to IS NULL;
CREATE INDEX documents_org_current
    ON documents (org_unit_id, ngay_nhan DESC) WHERE valid_to IS NULL;
CREATE INDEX documents_node_current
    ON documents (node_id, ngay_nhan DESC) WHERE valid_to IS NULL;

-- eTask: công việc (khung — hoàn thiện sau khi khảo sát eTask)
CREATE TABLE tasks (
    id                  bigserial   PRIMARY KEY,
    source_system       text        NOT NULL DEFAULT 'etask',
    ma_cong_viec        text        NOT NULL,
    owner_user_id       bigint      NOT NULL REFERENCES app_users(id),
    tieu_de             text,
    mo_ta_ngan          text,
    nguoi_giao          text,
    nguoi_thuc_hien_id  bigint,
    org_unit_id         bigint REFERENCES org_units(id),
    trang_thai          text,
    do_uu_tien          text,
    ngay_giao           date,
    han_hoan_thanh      date,
    ngay_hoan_thanh     date,
    content_hash        bytea       NOT NULL,
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    valid_from          timestamptz NOT NULL DEFAULT now(),
    valid_to            timestamptz,
    last_crawl_run_id   bigint REFERENCES crawl_runs(id),
    UNIQUE (source_system, ma_cong_viec, owner_user_id, valid_from)
);
CREATE INDEX tasks_current
    ON tasks (owner_user_id, han_hoan_thanh) WHERE valid_to IS NULL;
CREATE INDEX tasks_org_current
    ON tasks (org_unit_id, han_hoan_thanh) WHERE valid_to IS NULL;

-- ---------------------------------------------------------------------
-- DANH MỤC BÁO CÁO & LỊCH CHẠY DO NGƯỜI DÙNG ĐẶT
-- ---------------------------------------------------------------------
CREATE TABLE report_catalog (
    code            text        PRIMARY KEY,       -- 'van_ban_ket_thuc_theo_phong'
    ten             text        NOT NULL,
    mo_ta           text,
    source_system   text        NOT NULL REFERENCES core.source_systems(code),
    capability      text        NOT NULL,
    param_schema    jsonb       NOT NULL,          -- JSON Schema cho tham số người dùng chỉnh
    default_params  jsonb       NOT NULL DEFAULT '{}',
    view_template   text        NOT NULL,          -- 'bang' | 'bang_kem_bieu_do' | 'tong_hop'
    required_scope  text        NOT NULL DEFAULT 'ca_nhan',  -- 'ca_nhan' | 'don_vi' | 'toan_don_vi'
    is_active       boolean     NOT NULL DEFAULT true
);

CREATE TABLE report_subscriptions (
    id              bigserial   PRIMARY KEY,
    app_user_id     bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    report_code     text        NOT NULL REFERENCES report_catalog(code),
    params          jsonb       NOT NULL DEFAULT '{}',
    schedule_preset text        NOT NULL,          -- khớp core.crawl_tasks.schedule_preset
    timezone        text        NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    is_enabled      boolean     NOT NULL DEFAULT true,
    next_run_at     timestamptz,
    last_run_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_subscriptions_due ON report_subscriptions (next_run_at) WHERE is_enabled;
-- Chỉ mục này là thứ spider dùng để gom người dùng của một task Crawlab:
CREATE INDEX report_subscriptions_fanout
    ON report_subscriptions (report_code, schedule_preset) WHERE is_enabled;

COMMENT ON TABLE report_subscriptions IS
    'Lịch do người dùng đặt. Đổi lịch chỉ là đổi schedule_preset — không gọi API Crawlab, '
    'không tạo task mới. Spider của task (capability × preset) tự gom người dùng khi chạy.';

-- ---------------------------------------------------------------------
-- AUDIT — ai xem gì, lúc nào. Bắt buộc, không tuỳ chọn.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id              bigserial   PRIMARY KEY,
    at              timestamptz NOT NULL DEFAULT now(),
    app_user_id     bigint      REFERENCES app_users(id),
    action          text        NOT NULL,          -- 'view_report' | 'export' | 'grant' | 'revoke' | 'schedule_change'
    object_type     text,
    object_id       text,
    detail          jsonb,
    ip              inet,
    user_agent      text
);
CREATE INDEX audit_log_user_time ON audit_log (app_user_id, at DESC);
CREATE INDEX audit_log_time ON audit_log (at DESC);

-- =====================================================================
-- ROW LEVEL SECURITY
-- Quy tắc: MẶC ĐỊNH TỪ CHỐI. Không policy nào khớp ⇒ không trả về dòng nào.
--
-- Ứng dụng đặt ba biến phiên trước mỗi truy vấn (trong cùng transaction):
--   SET LOCAL app.user_id            = '42';
--   SET LOCAL app.org_units_allowed  = '{10,11,12}';   -- đơn vị được xem, gồm cấp dưới
--   SET LOCAL app.scope              = 'don_vi';       -- ca_nhan | don_vi
-- =====================================================================

CREATE OR REPLACE FUNCTION current_app_user() RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::bigint
$$;

CREATE OR REPLACE FUNCTION current_org_allowed() RETURNS bigint[]
LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('app.org_units_allowed', true), '')::bigint[], '{}')
$$;

ALTER TABLE documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents            FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                FORCE ROW LEVEL SECURITY;
ALTER TABLE raw_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_records          FORCE ROW LEVEL SECURITY;
ALTER TABLE source_grants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_grants        FORCE ROW LEVEL SECURITY;
ALTER TABLE report_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_subscriptions FORCE ROW LEVEL SECURITY;

-- Dữ liệu của chính mình
CREATE POLICY documents_own ON documents FOR SELECT
    USING (owner_user_id = current_app_user());

-- Dữ liệu của đơn vị mình phụ trách (chỉ khi app đặt scope = 'don_vi')
CREATE POLICY documents_org ON documents FOR SELECT
    USING (
        current_setting('app.scope', true) = 'don_vi'
        AND org_unit_id = ANY (current_org_allowed())
    );

CREATE POLICY tasks_own ON tasks FOR SELECT
    USING (owner_user_id = current_app_user());
CREATE POLICY tasks_org ON tasks FOR SELECT
    USING (
        current_setting('app.scope', true) = 'don_vi'
        AND org_unit_id = ANY (current_org_allowed())
    );

-- Lớp thô: chỉ chính chủ, không mở cho cấp trên
CREATE POLICY raw_own ON raw_records FOR SELECT
    USING (owner_user_id = current_app_user());

-- Uỷ quyền và lịch: chỉ chính chủ, kể cả đọc lẫn ghi
CREATE POLICY grants_own ON source_grants FOR ALL
    USING (app_user_id = current_app_user())
    WITH CHECK (app_user_id = current_app_user());
CREATE POLICY subs_own ON report_subscriptions FOR ALL
    USING (app_user_id = current_app_user())
    WITH CHECK (app_user_id = current_app_user());

-- Vai trò ghi dữ liệu của worker: bỏ qua RLS vì nó ghi thay cho nhiều người.
-- KHÔNG BAO GIỜ dùng vai trò này cho đường phục vụ báo cáo.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') THEN
        CREATE ROLE app_writer NOLOGIN BYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_reader') THEN
        CREATE ROLE app_reader NOLOGIN;
    END IF;
END $$;
GRANT USAGE ON SCHEMA tenant_bkav, core TO app_reader, app_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA tenant_bkav TO app_reader;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA tenant_bkav TO app_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA tenant_bkav TO app_writer;

-- =====================================================================
-- LỚP 3 — TỔNG HỢP. Chỉ dựng khi báo cáo bắt đầu chậm.
-- Làm mới ngay sau khi crawl_runs ghi nhận status = 'ok'.
-- Lưu ý: materialized view KHÔNG chịu RLS ⇒ phải giữ owner_user_id/org_unit_id
-- trong view và lọc lại ở tầng truy vấn.
-- =====================================================================
CREATE MATERIALIZED VIEW mv_van_ban_theo_thang AS
SELECT owner_user_id,
       org_unit_id,
       node_id,
       date_trunc('month', ngay_nhan)::date AS thang,
       count(*)                             AS so_van_ban
  FROM documents
 WHERE valid_to IS NULL
 GROUP BY 1, 2, 3, 4;
CREATE UNIQUE INDEX ON mv_van_ban_theo_thang (owner_user_id, org_unit_id, node_id, thang);

-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_van_ban_theo_thang;

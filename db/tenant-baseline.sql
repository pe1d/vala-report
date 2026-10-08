-- Bản nền schema đơn vị — SINH TỰ ĐỘNG (packages/core/scripts/tenant-baseline.ts), không sửa tay.
-- tenant-migrations: 001_device_kind.sql, 002_desktop_apps.sql
-- FUNCTION current_app_user()
CREATE FUNCTION {{schema}}.current_app_user() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::bigint
$$;

-- FUNCTION current_org_allowed()
CREATE FUNCTION {{schema}}.current_org_allowed() RETURNS bigint[]
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce(nullif(current_setting('app.org_units_allowed', true), '')::bigint[], '{}')
$$;

-- FUNCTION drop_expired_raw_partitions(integer)
CREATE FUNCTION {{schema}}.drop_expired_raw_partitions(keep_days integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '{{schema}}', 'pg_temp'
    AS $$
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
         WHERE p.relname = 'raw_records' AND n.nspname = '{{schema}}'
    LOOP
        -- tên dạng raw_records_YYYY_MM ⇒ cận trên là đầu tháng kế tiếp
        upper_b := (to_date(right(r.relname, 7), 'YYYY_MM') + interval '1 month')::date;
        IF upper_b < (now() - make_interval(days => keep_days))::date THEN
            EXECUTE format('DROP TABLE {{schema}}.%I', r.relname);
            dropped := dropped + 1;
        END IF;
    END LOOP;
    RETURN dropped;
END $$;

-- FUNCTION ensure_raw_partitions(integer)
CREATE FUNCTION {{schema}}.ensure_raw_partitions(months_ahead integer DEFAULT 2) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '{{schema}}', 'pg_temp'
    AS $$
DECLARE
    m     date;
    pname text;
BEGIN
    FOR i IN 0..months_ahead LOOP
        m     := (date_trunc('month', now()) + make_interval(months => i))::date;
        pname := format('raw_records_%s', to_char(m, 'YYYY_MM'));
        IF to_regclass(format('{{schema}}.%I', pname)) IS NULL THEN
            EXECUTE format(
                'CREATE TABLE {{schema}}.%I PARTITION OF {{schema}}.raw_records FOR VALUES FROM (%L) TO (%L)',
                pname, m, (m + interval '1 month')::date);
        END IF;
        EXECUTE format('REVOKE ALL ON {{schema}}.%I FROM app_reader', pname);
    END LOOP;
END $$;

-- FUNCTION ensure_record_index(text, text, text, text)
CREATE FUNCTION {{schema}}.ensure_record_index(p_source text, p_capability text, p_field text, p_type text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '{{schema}}', 'pg_temp'
    AS $_$
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
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON {{schema}}.records (owner_user_id, %s) '
                   'WHERE source_system = %L AND capability = %L AND valid_to IS NULL',
                   v_name, v_expr, p_source, p_capability);
    RETURN v_name;
END $_$;

-- FUNCTION org_coverage(text)
CREATE FUNCTION {{schema}}.org_coverage(p_source text) RETURNS TABLE(members integer, granted integer, oldest_success timestamp with time zone, newest_success timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO '{{schema}}', 'pg_temp'
    AS $$
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

-- FUNCTION rec_date(text)
CREATE FUNCTION {{schema}}.rec_date(v text) RETURNS date
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$ SELECT v::date $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

-- TABLE adapters
CREATE TABLE {{schema}}.adapters (
    id bigint NOT NULL,
    source_system text NOT NULL,
    capability text NOT NULL,
    version text NOT NULL,
    spec jsonb NOT NULL,
    schema_baseline jsonb,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text
);

-- SEQUENCE adapters_id_seq
CREATE SEQUENCE {{schema}}.adapters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY adapters_id_seq
ALTER SEQUENCE {{schema}}.adapters_id_seq OWNED BY {{schema}}.adapters.id;

-- TABLE app_settings
CREATE TABLE {{schema}}.app_settings (
    id smallint DEFAULT 1 NOT NULL,
    ten_ung_dung text DEFAULT 'Vala Reporting'::text NOT NULL,
    ten_don_vi text,
    mo_ta text,
    logo text,
    mau_chu_dao text DEFAULT '#1d4ed8'::text NOT NULL,
    ten_sso text DEFAULT 'SSO'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    desktop_home_url text,
    CONSTRAINT app_settings_desktop_home_url_check CHECK (((desktop_home_url IS NULL) OR ((desktop_home_url ~ '^https://[^[:space:]]+$'::text) AND (length(desktop_home_url) <= 500)))),
    CONSTRAINT app_settings_id_check CHECK ((id = 1)),
    CONSTRAINT app_settings_logo_check CHECK (((logo IS NULL) OR ((logo ~ '^data:image/(png|jpeg|svg\+xml|webp);base64,'::text) AND (length(logo) <= 400000)))),
    CONSTRAINT app_settings_mau_chu_dao_check CHECK ((mau_chu_dao ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT app_settings_mo_ta_check CHECK ((length(mo_ta) <= 160)),
    CONSTRAINT app_settings_ten_don_vi_check CHECK ((length(ten_don_vi) <= 120)),
    CONSTRAINT app_settings_ten_sso_check CHECK (((length(ten_sso) >= 1) AND (length(ten_sso) <= 40))),
    CONSTRAINT app_settings_ten_ung_dung_check CHECK (((length(ten_ung_dung) >= 1) AND (length(ten_ung_dung) <= 60)))
);

-- COMMENT TABLE app_settings
COMMENT ON TABLE {{schema}}.app_settings IS 'Cấu hình hiển thị của đơn vị triển khai (một dòng). Công khai cho trang đăng nhập — không chứa bí mật.';

-- COMMENT COLUMN app_settings.desktop_home_url
COMMENT ON COLUMN {{schema}}.app_settings.desktop_home_url IS 'Trang mở ở tab Vala của Vala Desktop (https). NULL = mặc định của bản build.';

-- TABLE app_users
CREATE TABLE {{schema}}.app_users (
    id bigint NOT NULL,
    sso_subject text,
    email text NOT NULL,
    ho_ten text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    is_ops_admin boolean DEFAULT false NOT NULL,
    username text,
    password_hash text,
    password_changed_at timestamp with time zone,
    must_change_password boolean DEFAULT false NOT NULL,
    failed_logins integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone
);

-- SEQUENCE app_users_id_seq
CREATE SEQUENCE {{schema}}.app_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY app_users_id_seq
ALTER SEQUENCE {{schema}}.app_users_id_seq OWNED BY {{schema}}.app_users.id;

-- TABLE audit_log
CREATE TABLE {{schema}}.audit_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    app_user_id bigint,
    action text NOT NULL,
    object_type text,
    object_id text,
    detail jsonb,
    ip inet,
    user_agent text
);

-- SEQUENCE audit_log_id_seq
CREATE SEQUENCE {{schema}}.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY audit_log_id_seq
ALTER SEQUENCE {{schema}}.audit_log_id_seq OWNED BY {{schema}}.audit_log.id;

-- TABLE crawl_runs
CREATE TABLE {{schema}}.crawl_runs (
    id bigint NOT NULL,
    source_system text NOT NULL,
    capability text NOT NULL,
    adapter_version text NOT NULL,
    app_user_id bigint,
    crawlab_task_id text,
    crawlab_run_id text,
    trigger_type text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    records_seen integer,
    records_changed integer,
    http_calls integer,
    error_code text,
    error_detail text,
    spider_code text
);

ALTER TABLE ONLY {{schema}}.crawl_runs FORCE ROW LEVEL SECURITY;

-- SEQUENCE crawl_runs_id_seq
CREATE SEQUENCE {{schema}}.crawl_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY crawl_runs_id_seq
ALTER SEQUENCE {{schema}}.crawl_runs_id_seq OWNED BY {{schema}}.crawl_runs.id;

-- TABLE crawl_spiders
CREATE TABLE {{schema}}.crawl_spiders (
    code text NOT NULL,
    ten text NOT NULL,
    mo_ta text,
    source_system text NOT NULL,
    entity text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    crawlab_spider_id text,
    synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    main_py text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    CONSTRAINT crawl_spiders_code_format CHECK ((code ~ '^[a-z][a-z0-9_]{1,62}$'::text)),
    CONSTRAINT crawl_spiders_entity_check CHECK ((entity = 'records'::text))
);

-- COMMENT COLUMN crawl_spiders.main_py
COMMENT ON COLUMN {{schema}}.crawl_spiders.main_py IS 'Mã main.py của spider (Python, dùng vala_sdk). NULL = chưa chép từ repo; lần đồng bộ đầu sẽ chép mẫu crawlers/<mã>/main.py.';

-- TABLE crawl_tasks
CREATE TABLE {{schema}}.crawl_tasks (
    id bigint NOT NULL,
    source_system text NOT NULL,
    capability text NOT NULL,
    schedule_preset text NOT NULL,
    cron_expr text NOT NULL,
    crawlab_task_id text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL
);

-- SEQUENCE crawl_tasks_id_seq
CREATE SEQUENCE {{schema}}.crawl_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY crawl_tasks_id_seq
ALTER SEQUENCE {{schema}}.crawl_tasks_id_seq OWNED BY {{schema}}.crawl_tasks.id;

-- TABLE dashboard_tabs
CREATE TABLE {{schema}}.dashboard_tabs (
    id integer NOT NULL,
    ten text NOT NULL,
    source_system text,
    thu_tu integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    CONSTRAINT dashboard_tabs_ten_check CHECK (((length(btrim(ten)) >= 1) AND (length(btrim(ten)) <= 60)))
);

-- SEQUENCE dashboard_tabs_id_seq
CREATE SEQUENCE {{schema}}.dashboard_tabs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY dashboard_tabs_id_seq
ALTER SEQUENCE {{schema}}.dashboard_tabs_id_seq OWNED BY {{schema}}.dashboard_tabs.id;

-- TABLE data_schedules
CREATE TABLE {{schema}}.data_schedules (
    id bigint NOT NULL,
    app_user_id bigint NOT NULL,
    source_system text NOT NULL,
    spider_code text,
    capability text,
    schedule jsonb NOT NULL,
    timezone text DEFAULT 'Asia/Ho_Chi_Minh'::text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    next_run_at timestamp with time zone,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT data_schedules_one_target CHECK (((spider_code IS NULL) <> (capability IS NULL)))
);

ALTER TABLE ONLY {{schema}}.data_schedules FORCE ROW LEVEL SECURITY;

-- COMMENT TABLE data_schedules
COMMENT ON TABLE {{schema}}.data_schedules IS 'Lịch tự lấy dữ liệu của một người cho một nguồn dữ liệu (script crawl hoặc capability adapter) — dùng chung cho mọi báo cáo của nguồn đó.';

-- COMMENT COLUMN data_schedules.schedule
COMMENT ON COLUMN {{schema}}.data_schedules.schedule IS 'Lịch có cấu trúc (packages/core/src/schedule.ts), không phải cron thô.';

-- SEQUENCE data_schedules_id_seq
CREATE SEQUENCE {{schema}}.data_schedules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY data_schedules_id_seq
ALTER SEQUENCE {{schema}}.data_schedules_id_seq OWNED BY {{schema}}.data_schedules.id;

-- TABLE data_source_prefs
CREATE TABLE {{schema}}.data_source_prefs (
    app_user_id bigint NOT NULL,
    source_system text NOT NULL,
    spider_code text,
    capability text,
    auto_refresh boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT data_source_prefs_one_target CHECK (((spider_code IS NULL) <> (capability IS NULL)))
);

ALTER TABLE ONLY {{schema}}.data_source_prefs FORCE ROW LEVEL SECURITY;

-- COMMENT TABLE data_source_prefs
COMMENT ON TABLE {{schema}}.data_source_prefs IS 'Tuỳ chọn của người dùng cho một nguồn dữ liệu: auto_refresh = tự lấy lại khi mở báo cáo / vừa làm việc trên hệ thống nguồn.';

-- TABLE desktop_app_layouts
CREATE TABLE {{schema}}.desktop_app_layouts (
    app_user_id bigint NOT NULL,
    pinned text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- TABLE desktop_apps
CREATE TABLE {{schema}}.desktop_apps (
    ma text NOT NULL,
    ten text NOT NULL,
    kind text NOT NULL,
    url text,
    source_system text,
    icon text,
    sort integer DEFAULT 0 NOT NULL,
    pinned_default boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    CONSTRAINT desktop_apps_check CHECK (((kind <> 'web'::text) OR (url IS NOT NULL))),
    CONSTRAINT desktop_apps_check1 CHECK (((kind <> 'source'::text) OR (source_system IS NOT NULL))),
    CONSTRAINT desktop_apps_icon_check CHECK (((icon IS NULL) OR ((icon ~ '^(https?://[^[:space:]]+|data:image/(png|jpeg|svg\+xml|webp|x-icon);base64,.+)$'::text) AND (length(icon) <= 200000)))),
    CONSTRAINT desktop_apps_kind_check CHECK ((kind = ANY (ARRAY['web'::text, 'source'::text, 'reports'::text]))),
    CONSTRAINT desktop_apps_ma_check CHECK ((ma ~ '^[a-z][a-z0-9_]{1,39}$'::text)),
    CONSTRAINT desktop_apps_ten_check CHECK (((length(ten) >= 1) AND (length(ten) <= 60))),
    CONSTRAINT desktop_apps_url_check CHECK (((url IS NULL) OR ((url ~ '^https?://[^[:space:]]+$'::text) AND (length(url) <= 500))))
);

-- TABLE desktop_package_versions
CREATE TABLE {{schema}}.desktop_package_versions (
    code text NOT NULL,
    version integer NOT NULL,
    matches text[] NOT NULL,
    css text NOT NULL,
    script text NOT NULL,
    ghi_chu text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    CONSTRAINT desktop_package_versions_ghi_chu_check CHECK ((length(ghi_chu) <= 500))
);

-- TABLE desktop_packages
CREATE TABLE {{schema}}.desktop_packages (
    code text NOT NULL,
    ten text NOT NULL,
    mo_ta text,
    source_system text,
    matches text[] NOT NULL,
    css text DEFAULT ''::text NOT NULL,
    script text DEFAULT ''::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    CONSTRAINT desktop_packages_code_check CHECK ((code ~ '^[a-z][a-z0-9_]{1,62}$'::text)),
    CONSTRAINT desktop_packages_css_check CHECK ((length(css) <= 200000)),
    CONSTRAINT desktop_packages_matches_check CHECK (((cardinality(matches) >= 1) AND (cardinality(matches) <= 20))),
    CONSTRAINT desktop_packages_mo_ta_check CHECK ((length(mo_ta) <= 1000)),
    CONSTRAINT desktop_packages_script_check CHECK ((length(script) <= 500000)),
    CONSTRAINT desktop_packages_ten_check CHECK (((length(ten) >= 1) AND (length(ten) <= 200))),
    CONSTRAINT desktop_packages_version_check CHECK ((version >= 1))
);

-- COMMENT TABLE desktop_packages
COMMENT ON TABLE {{schema}}.desktop_packages IS 'Gói kịch bản Vala Desktop (CSS/JS chạy trong trang hệ thống nguồn). Bản hiện hành; lịch sử ở desktop_package_versions.';

-- TABLE extension_devices
CREATE TABLE {{schema}}.extension_devices (
    id bigint NOT NULL,
    app_user_id bigint NOT NULL,
    token_hash bytea NOT NULL,
    ten text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    kind text DEFAULT 'extension'::text NOT NULL,
    CONSTRAINT extension_devices_kind_check CHECK ((kind = ANY (ARRAY['extension'::text, 'desktop'::text])))
);

-- SEQUENCE extension_devices_id_seq
CREATE SEQUENCE {{schema}}.extension_devices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY extension_devices_id_seq
ALTER SEQUENCE {{schema}}.extension_devices_id_seq OWNED BY {{schema}}.extension_devices.id;

-- TABLE org_units
CREATE TABLE {{schema}}.org_units (
    id bigint NOT NULL,
    ten text NOT NULL,
    parent_id bigint,
    path bigint[] NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

-- TABLE raw_records
CREATE TABLE {{schema}}.raw_records (
    id bigint NOT NULL,
    crawl_run_id bigint NOT NULL,
    source_system text NOT NULL,
    capability text NOT NULL,
    owner_user_id bigint NOT NULL,
    source_key text NOT NULL,
    payload jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
)
PARTITION BY RANGE (fetched_at);

ALTER TABLE ONLY {{schema}}.raw_records FORCE ROW LEVEL SECURITY;

-- COMMENT TABLE raw_records
COMMENT ON TABLE {{schema}}.raw_records IS 'Giữ 90 ngày rồi drop phân vùng. Mục đích: tính lại lớp chuẩn hoá khi phát hiện bóc tách sai, mà không phải gọi lại hệ thống nguồn — vốn không cho lấy dữ liệu quá khứ.';

-- SEQUENCE raw_records_id_seq
CREATE SEQUENCE {{schema}}.raw_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY raw_records_id_seq
ALTER SEQUENCE {{schema}}.raw_records_id_seq OWNED BY {{schema}}.raw_records.id;

-- TABLE records
CREATE TABLE {{schema}}.records (
    id bigint NOT NULL,
    source_system text NOT NULL,
    capability text NOT NULL,
    record_key text NOT NULL,
    owner_user_id bigint NOT NULL,
    org_unit_id bigint,
    data jsonb NOT NULL,
    content_hash bytea NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_to timestamp with time zone,
    last_crawl_run_id bigint
);

ALTER TABLE ONLY {{schema}}.records FORCE ROW LEVEL SECURITY;

-- SEQUENCE records_id_seq
CREATE SEQUENCE {{schema}}.records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY records_id_seq
ALTER SEQUENCE {{schema}}.records_id_seq OWNED BY {{schema}}.records.id;

-- TABLE report_catalog
CREATE TABLE {{schema}}.report_catalog (
    code text NOT NULL,
    ten text NOT NULL,
    mo_ta text,
    source_system text NOT NULL,
    capability text NOT NULL,
    param_schema jsonb NOT NULL,
    default_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    view_template text NOT NULL,
    required_scope text DEFAULT 'ca_nhan'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    spider_code text,
    definition jsonb,
    show_on_dashboard boolean DEFAULT true NOT NULL,
    dashboard_order integer DEFAULT 100 NOT NULL,
    created_by bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dashboard_tab integer,
    dashboard_width smallint DEFAULT 3 NOT NULL,
    CONSTRAINT report_catalog_dashboard_width_check CHECK (((dashboard_width >= 1) AND (dashboard_width <= 3)))
);

-- COMMENT COLUMN report_catalog.definition
COMMENT ON COLUMN {{schema}}.report_catalog.definition IS 'NULL = báo cáo viết trong code (apps/api/src/reports). Khác NULL = báo cáo cấu hình: {dataset, filters, group_by, measures, columns, chart, tiles…}';

-- TABLE report_subscriptions
CREATE TABLE {{schema}}.report_subscriptions (
    id bigint NOT NULL,
    app_user_id bigint NOT NULL,
    report_code text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    schedule_preset text,
    timezone text DEFAULT 'Asia/Ho_Chi_Minh'::text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    next_run_at timestamp with time zone,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schedule jsonb NOT NULL
);

ALTER TABLE ONLY {{schema}}.report_subscriptions FORCE ROW LEVEL SECURITY;

-- COMMENT TABLE report_subscriptions
COMMENT ON TABLE {{schema}}.report_subscriptions IS 'KHÔNG CÒN DÙNG từ 020 — lịch chuyển sang data_schedules (theo nguồn dữ liệu). Giữ tạm để đối chiếu, sẽ xoá.';

-- COMMENT COLUMN report_subscriptions.schedule_preset
COMMENT ON COLUMN {{schema}}.report_subscriptions.schedule_preset IS 'Cũ (trước 015) — không còn dùng.';

-- COMMENT COLUMN report_subscriptions.schedule
COMMENT ON COLUMN {{schema}}.report_subscriptions.schedule IS 'Lịch có cấu trúc {kind: hang_ngay|hang_tuan|hang_thang|lap_lai|mot_lan, ...}. Worker tính next_run_at theo giờ Việt Nam.';

-- SEQUENCE report_subscriptions_id_seq
CREATE SEQUENCE {{schema}}.report_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY report_subscriptions_id_seq
ALTER SEQUENCE {{schema}}.report_subscriptions_id_seq OWNED BY {{schema}}.report_subscriptions.id;

-- TABLE source_consents
CREATE TABLE {{schema}}.source_consents (
    app_user_id bigint NOT NULL,
    source_system text NOT NULL,
    version text NOT NULL,
    consented_at timestamp with time zone DEFAULT now() NOT NULL,
    via text NOT NULL,
    CONSTRAINT source_consents_via_check CHECK ((via = ANY (ARRAY['portal'::text, 'extension'::text])))
);

ALTER TABLE ONLY {{schema}}.source_consents FORCE ROW LEVEL SECURITY;

-- COMMENT TABLE source_consents
COMMENT ON TABLE {{schema}}.source_consents IS 'Người dùng đồng ý cho Vala dùng tài khoản của họ trên hệ thống nguồn để lấy dữ liệu (nội dung theo version).';

-- TABLE source_grants
CREATE TABLE {{schema}}.source_grants (
    id bigint NOT NULL,
    app_user_id bigint NOT NULL,
    source_system text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    scope_capabilities text[] NOT NULL,
    vault_ref text NOT NULL,
    session_state text DEFAULT 'pending'::text NOT NULL,
    session_expires_at timestamp with time zone,
    last_refresh_at timestamp with time zone,
    refresh_fail_count integer DEFAULT 0 NOT NULL,
    last_error text,
    auth_method text DEFAULT 'sso'::text NOT NULL,
    source_username text,
    configured_by bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_push_at timestamp with time zone,
    last_keepalive_at timestamp with time zone,
    CONSTRAINT source_grants_auth_method_check CHECK ((auth_method = ANY (ARRAY['sso'::text, 'password'::text, 'cookie'::text, 'extension'::text])))
);

ALTER TABLE ONLY {{schema}}.source_grants FORCE ROW LEVEL SECURITY;

-- COMMENT TABLE source_grants
COMMENT ON TABLE {{schema}}.source_grants IS 'Mỗi dòng là một lần người dùng cho phép hệ thống lấy dữ liệu thay mình. Thu hồi = set revoked_at; worker phải xoá phiên khỏi vault ngay khi thấy.';

-- COMMENT COLUMN source_grants.auth_method
COMMENT ON COLUMN {{schema}}.source_grants.auth_method IS 'sso: uỷ quyền qua Bkav SSO, refresh token trong vault. password: tài khoản/mật khẩu nguồn trong vault, hệ thống tự đăng nhập lấy cookie. cookie: dán cookie, hết hạn thì phải dán lại. extension: tiện ích trình duyệt tự gửi cookie mỗi khi người dùng đăng nhập hệ thống nguồn.';

-- COMMENT COLUMN source_grants.last_keepalive_at
COMMENT ON COLUMN {{schema}}.source_grants.last_keepalive_at IS 'Lần worker gọi session_probe để giữ phiên gần nhất (keepAliveSessions).';

-- SEQUENCE source_grants_id_seq
CREATE SEQUENCE {{schema}}.source_grants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY source_grants_id_seq
ALTER SEQUENCE {{schema}}.source_grants_id_seq OWNED BY {{schema}}.source_grants.id;

-- TABLE source_systems
CREATE TABLE {{schema}}.source_systems (
    code text NOT NULL,
    ten text NOT NULL,
    base_url text NOT NULL,
    auth_mode text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    login_hosts text[] DEFAULT '{}'::text[] NOT NULL,
    mo_ta text,
    auth_profile jsonb,
    connection_methods text[] DEFAULT '{extension,cookie,password}'::text[] NOT NULL,
    created_by bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    adapter_yaml text,
    adapter_updated_at timestamp with time zone,
    adapter_updated_by bigint,
    mfa text DEFAULT 'chua_ro'::text NOT NULL,
    mfa_detected_at timestamp with time zone,
    CONSTRAINT source_systems_code_format CHECK ((code ~ '^[a-z][a-z0-9_]{1,29}$'::text)),
    CONSTRAINT source_systems_methods_known CHECK (((connection_methods <@ ARRAY['extension'::text, 'cookie'::text, 'password'::text, 'sso'::text]) AND (cardinality(connection_methods) > 0))),
    CONSTRAINT source_systems_mfa_check CHECK ((mfa = ANY (ARRAY['co'::text, 'khong'::text, 'chua_ro'::text])))
);

-- COMMENT COLUMN source_systems.auth_profile
COMMENT ON COLUMN {{schema}}.source_systems.auth_profile IS 'NULL = xác thực theo adapter YAML. Khác NULL = hệ thống do quản trị tạo: {cookies_required: [tên | [tên thay thế…]], cookies_optional: [], cookie_domain, probe: {path, pattern}}';

-- COMMENT COLUMN source_systems.connection_methods
COMMENT ON COLUMN {{schema}}.source_systems.connection_methods IS 'Cách kết nối người dùng/quản trị được chọn: extension, cookie, password (chỉ khi adapter có password_login), sso.';

-- COMMENT COLUMN source_systems.adapter_yaml
COMMENT ON COLUMN {{schema}}.source_systems.adapter_yaml IS 'Adapter đầy đủ (YAML, cùng định dạng adapters/*.yaml). NULL + auth_profile NULL ⇒ lần chạy đầu chép từ repo.';

-- COMMENT COLUMN source_systems.mfa
COMMENT ON COLUMN {{schema}}.source_systems.mfa IS 'Xác thực 2 lớp: co | khong | chua_ro. co ⇒ không cho kết nối bằng mật khẩu.';

-- COMMENT COLUMN source_systems.mfa_detected_at
COMMENT ON COLUMN {{schema}}.source_systems.mfa_detected_at IS 'Lần tự đăng nhập gặp OTP (hệ thống tự đánh dấu mfa = co).';

-- TABLE spider_launches
CREATE TABLE {{schema}}.spider_launches (
    id bigint NOT NULL,
    spider_code text NOT NULL,
    app_user_id bigint,
    crawlab_task_id text,
    trigger_type text NOT NULL,
    launched_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'launched'::text NOT NULL,
    checked_at timestamp with time zone,
    error text,
    retry_of bigint,
    CONSTRAINT spider_launches_status_check CHECK ((status = ANY (ARRAY['launched'::text, 'reported'::text, 'failed'::text])))
);

-- SEQUENCE spider_launches_id_seq
CREATE SEQUENCE {{schema}}.spider_launches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY spider_launches_id_seq
ALTER SEQUENCE {{schema}}.spider_launches_id_seq OWNED BY {{schema}}.spider_launches.id;

-- TABLE spider_schedules
CREATE TABLE {{schema}}.spider_schedules (
    spider_code text NOT NULL,
    schedule_preset text NOT NULL,
    cron_expr text NOT NULL,
    crawlab_schedule_id text
);

-- TABLE user_org_units
CREATE TABLE {{schema}}.user_org_units (
    app_user_id bigint NOT NULL,
    org_unit_id bigint NOT NULL,
    vai_tro text DEFAULT 'thanh_vien'::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);

-- TABLE user_source_accounts
CREATE TABLE {{schema}}.user_source_accounts (
    id bigint NOT NULL,
    app_user_id bigint NOT NULL,
    source_system text NOT NULL,
    source_user_id text NOT NULL,
    source_username text
);

-- SEQUENCE user_source_accounts_id_seq
CREATE SEQUENCE {{schema}}.user_source_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY user_source_accounts_id_seq
ALTER SEQUENCE {{schema}}.user_source_accounts_id_seq OWNED BY {{schema}}.user_source_accounts.id;

-- DEFAULT adapters id
ALTER TABLE ONLY {{schema}}.adapters ALTER COLUMN id SET DEFAULT nextval('{{schema}}.adapters_id_seq'::regclass);

-- DEFAULT app_users id
ALTER TABLE ONLY {{schema}}.app_users ALTER COLUMN id SET DEFAULT nextval('{{schema}}.app_users_id_seq'::regclass);

-- DEFAULT audit_log id
ALTER TABLE ONLY {{schema}}.audit_log ALTER COLUMN id SET DEFAULT nextval('{{schema}}.audit_log_id_seq'::regclass);

-- DEFAULT crawl_runs id
ALTER TABLE ONLY {{schema}}.crawl_runs ALTER COLUMN id SET DEFAULT nextval('{{schema}}.crawl_runs_id_seq'::regclass);

-- DEFAULT crawl_tasks id
ALTER TABLE ONLY {{schema}}.crawl_tasks ALTER COLUMN id SET DEFAULT nextval('{{schema}}.crawl_tasks_id_seq'::regclass);

-- DEFAULT dashboard_tabs id
ALTER TABLE ONLY {{schema}}.dashboard_tabs ALTER COLUMN id SET DEFAULT nextval('{{schema}}.dashboard_tabs_id_seq'::regclass);

-- DEFAULT data_schedules id
ALTER TABLE ONLY {{schema}}.data_schedules ALTER COLUMN id SET DEFAULT nextval('{{schema}}.data_schedules_id_seq'::regclass);

-- DEFAULT extension_devices id
ALTER TABLE ONLY {{schema}}.extension_devices ALTER COLUMN id SET DEFAULT nextval('{{schema}}.extension_devices_id_seq'::regclass);

-- DEFAULT raw_records id
ALTER TABLE ONLY {{schema}}.raw_records ALTER COLUMN id SET DEFAULT nextval('{{schema}}.raw_records_id_seq'::regclass);

-- DEFAULT records id
ALTER TABLE ONLY {{schema}}.records ALTER COLUMN id SET DEFAULT nextval('{{schema}}.records_id_seq'::regclass);

-- DEFAULT report_subscriptions id
ALTER TABLE ONLY {{schema}}.report_subscriptions ALTER COLUMN id SET DEFAULT nextval('{{schema}}.report_subscriptions_id_seq'::regclass);

-- DEFAULT source_grants id
ALTER TABLE ONLY {{schema}}.source_grants ALTER COLUMN id SET DEFAULT nextval('{{schema}}.source_grants_id_seq'::regclass);

-- DEFAULT spider_launches id
ALTER TABLE ONLY {{schema}}.spider_launches ALTER COLUMN id SET DEFAULT nextval('{{schema}}.spider_launches_id_seq'::regclass);

-- DEFAULT user_source_accounts id
ALTER TABLE ONLY {{schema}}.user_source_accounts ALTER COLUMN id SET DEFAULT nextval('{{schema}}.user_source_accounts_id_seq'::regclass);

-- CONSTRAINT adapters adapters_pkey
ALTER TABLE ONLY {{schema}}.adapters
    ADD CONSTRAINT adapters_pkey PRIMARY KEY (id);

-- CONSTRAINT adapters adapters_source_system_capability_version_key
ALTER TABLE ONLY {{schema}}.adapters
    ADD CONSTRAINT adapters_source_system_capability_version_key UNIQUE (source_system, capability, version);

-- CONSTRAINT app_settings app_settings_pkey
ALTER TABLE ONLY {{schema}}.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);

-- CONSTRAINT app_users app_users_email_key
ALTER TABLE ONLY {{schema}}.app_users
    ADD CONSTRAINT app_users_email_key UNIQUE (email);

-- CONSTRAINT app_users app_users_pkey
ALTER TABLE ONLY {{schema}}.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);

-- CONSTRAINT app_users app_users_sso_subject_key
ALTER TABLE ONLY {{schema}}.app_users
    ADD CONSTRAINT app_users_sso_subject_key UNIQUE (sso_subject);

-- CONSTRAINT app_users app_users_username_key
ALTER TABLE ONLY {{schema}}.app_users
    ADD CONSTRAINT app_users_username_key UNIQUE (username);

-- CONSTRAINT audit_log audit_log_pkey
ALTER TABLE ONLY {{schema}}.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

-- CONSTRAINT crawl_runs crawl_runs_pkey
ALTER TABLE ONLY {{schema}}.crawl_runs
    ADD CONSTRAINT crawl_runs_pkey PRIMARY KEY (id);

-- CONSTRAINT crawl_spiders crawl_spiders_pkey
ALTER TABLE ONLY {{schema}}.crawl_spiders
    ADD CONSTRAINT crawl_spiders_pkey PRIMARY KEY (code);

-- CONSTRAINT crawl_tasks crawl_tasks_pkey
ALTER TABLE ONLY {{schema}}.crawl_tasks
    ADD CONSTRAINT crawl_tasks_pkey PRIMARY KEY (id);

-- CONSTRAINT crawl_tasks crawl_tasks_source_system_capability_schedule_preset_key
ALTER TABLE ONLY {{schema}}.crawl_tasks
    ADD CONSTRAINT crawl_tasks_source_system_capability_schedule_preset_key UNIQUE (source_system, capability, schedule_preset);

-- CONSTRAINT dashboard_tabs dashboard_tabs_pkey
ALTER TABLE ONLY {{schema}}.dashboard_tabs
    ADD CONSTRAINT dashboard_tabs_pkey PRIMARY KEY (id);

-- CONSTRAINT data_schedules data_schedules_pkey
ALTER TABLE ONLY {{schema}}.data_schedules
    ADD CONSTRAINT data_schedules_pkey PRIMARY KEY (id);

-- CONSTRAINT desktop_app_layouts desktop_app_layouts_pkey
ALTER TABLE ONLY {{schema}}.desktop_app_layouts
    ADD CONSTRAINT desktop_app_layouts_pkey PRIMARY KEY (app_user_id);

-- CONSTRAINT desktop_apps desktop_apps_pkey
ALTER TABLE ONLY {{schema}}.desktop_apps
    ADD CONSTRAINT desktop_apps_pkey PRIMARY KEY (ma);

-- CONSTRAINT desktop_package_versions desktop_package_versions_pkey
ALTER TABLE ONLY {{schema}}.desktop_package_versions
    ADD CONSTRAINT desktop_package_versions_pkey PRIMARY KEY (code, version);

-- CONSTRAINT desktop_packages desktop_packages_pkey
ALTER TABLE ONLY {{schema}}.desktop_packages
    ADD CONSTRAINT desktop_packages_pkey PRIMARY KEY (code);

-- CONSTRAINT extension_devices extension_devices_pkey
ALTER TABLE ONLY {{schema}}.extension_devices
    ADD CONSTRAINT extension_devices_pkey PRIMARY KEY (id);

-- CONSTRAINT extension_devices extension_devices_token_hash_key
ALTER TABLE ONLY {{schema}}.extension_devices
    ADD CONSTRAINT extension_devices_token_hash_key UNIQUE (token_hash);

-- CONSTRAINT org_units org_units_pkey
ALTER TABLE ONLY {{schema}}.org_units
    ADD CONSTRAINT org_units_pkey PRIMARY KEY (id);

-- CONSTRAINT raw_records raw_records_pkey
ALTER TABLE ONLY {{schema}}.raw_records
    ADD CONSTRAINT raw_records_pkey PRIMARY KEY (id, fetched_at);

-- CONSTRAINT records records_pkey
ALTER TABLE ONLY {{schema}}.records
    ADD CONSTRAINT records_pkey PRIMARY KEY (id);

-- CONSTRAINT report_catalog report_catalog_pkey
ALTER TABLE ONLY {{schema}}.report_catalog
    ADD CONSTRAINT report_catalog_pkey PRIMARY KEY (code);

-- CONSTRAINT report_subscriptions report_subscriptions_pkey
ALTER TABLE ONLY {{schema}}.report_subscriptions
    ADD CONSTRAINT report_subscriptions_pkey PRIMARY KEY (id);

-- CONSTRAINT source_consents source_consents_pkey
ALTER TABLE ONLY {{schema}}.source_consents
    ADD CONSTRAINT source_consents_pkey PRIMARY KEY (app_user_id, source_system);

-- CONSTRAINT source_grants source_grants_app_user_id_source_system_key
ALTER TABLE ONLY {{schema}}.source_grants
    ADD CONSTRAINT source_grants_app_user_id_source_system_key UNIQUE (app_user_id, source_system);

-- CONSTRAINT source_grants source_grants_pkey
ALTER TABLE ONLY {{schema}}.source_grants
    ADD CONSTRAINT source_grants_pkey PRIMARY KEY (id);

-- CONSTRAINT source_systems source_systems_pkey
ALTER TABLE ONLY {{schema}}.source_systems
    ADD CONSTRAINT source_systems_pkey PRIMARY KEY (code);

-- CONSTRAINT spider_launches spider_launches_pkey
ALTER TABLE ONLY {{schema}}.spider_launches
    ADD CONSTRAINT spider_launches_pkey PRIMARY KEY (id);

-- CONSTRAINT spider_schedules spider_schedules_pkey
ALTER TABLE ONLY {{schema}}.spider_schedules
    ADD CONSTRAINT spider_schedules_pkey PRIMARY KEY (spider_code, schedule_preset);

-- CONSTRAINT user_org_units user_org_units_pkey
ALTER TABLE ONLY {{schema}}.user_org_units
    ADD CONSTRAINT user_org_units_pkey PRIMARY KEY (app_user_id, org_unit_id);

-- CONSTRAINT user_source_accounts user_source_accounts_app_user_id_source_system_key
ALTER TABLE ONLY {{schema}}.user_source_accounts
    ADD CONSTRAINT user_source_accounts_app_user_id_source_system_key UNIQUE (app_user_id, source_system);

-- CONSTRAINT user_source_accounts user_source_accounts_pkey
ALTER TABLE ONLY {{schema}}.user_source_accounts
    ADD CONSTRAINT user_source_accounts_pkey PRIMARY KEY (id);

-- CONSTRAINT user_source_accounts user_source_accounts_source_system_source_user_id_key
ALTER TABLE ONLY {{schema}}.user_source_accounts
    ADD CONSTRAINT user_source_accounts_source_system_source_user_id_key UNIQUE (source_system, source_user_id);

-- INDEX adapters_one_active
CREATE UNIQUE INDEX adapters_one_active ON {{schema}}.adapters USING btree (source_system, capability) WHERE is_active;

-- INDEX audit_log_time
CREATE INDEX audit_log_time ON {{schema}}.audit_log USING btree (at DESC);

-- INDEX audit_log_user_time
CREATE INDEX audit_log_user_time ON {{schema}}.audit_log USING btree (app_user_id, at DESC);

-- INDEX crawl_runs_failed
CREATE INDEX crawl_runs_failed ON {{schema}}.crawl_runs USING btree (started_at DESC) WHERE (status = 'failed'::text);

-- INDEX crawl_runs_latest
CREATE INDEX crawl_runs_latest ON {{schema}}.crawl_runs USING btree (source_system, capability, app_user_id, started_at DESC);

-- INDEX data_schedules_due
CREATE INDEX data_schedules_due ON {{schema}}.data_schedules USING btree (next_run_at) WHERE is_enabled;

-- INDEX data_schedules_target
CREATE UNIQUE INDEX data_schedules_target ON {{schema}}.data_schedules USING btree (app_user_id, source_system, COALESCE(spider_code, ''::text), COALESCE(capability, ''::text));

-- INDEX data_source_prefs_target
CREATE UNIQUE INDEX data_source_prefs_target ON {{schema}}.data_source_prefs USING btree (app_user_id, source_system, COALESCE(spider_code, ''::text), COALESCE(capability, ''::text));

-- INDEX desktop_apps_one_default
CREATE UNIQUE INDEX desktop_apps_one_default ON {{schema}}.desktop_apps USING btree ((true)) WHERE is_default;

-- INDEX desktop_apps_one_reports
CREATE UNIQUE INDEX desktop_apps_one_reports ON {{schema}}.desktop_apps USING btree ((true)) WHERE (kind = 'reports'::text);

-- INDEX desktop_apps_source
CREATE UNIQUE INDEX desktop_apps_source ON {{schema}}.desktop_apps USING btree (source_system) WHERE (source_system IS NOT NULL);

-- INDEX extension_devices_user
CREATE INDEX extension_devices_user ON {{schema}}.extension_devices USING btree (app_user_id) WHERE (revoked_at IS NULL);

-- INDEX org_units_path_gin
CREATE INDEX org_units_path_gin ON {{schema}}.org_units USING gin (path);

-- INDEX raw_records_lookup
CREATE INDEX raw_records_lookup ON ONLY {{schema}}.raw_records USING btree (source_system, capability, source_key, fetched_at DESC);

-- INDEX records_current
CREATE UNIQUE INDEX records_current ON {{schema}}.records USING btree (source_system, capability, owner_user_id, record_key) WHERE (valid_to IS NULL);

-- INDEX records_org
CREATE INDEX records_org ON {{schema}}.records USING btree (org_unit_id, source_system, capability) WHERE (valid_to IS NULL);

-- INDEX records_owner
CREATE INDEX records_owner ON {{schema}}.records USING btree (owner_user_id, source_system, capability) WHERE (valid_to IS NULL);

-- INDEX report_subscriptions_due
CREATE INDEX report_subscriptions_due ON {{schema}}.report_subscriptions USING btree (next_run_at) WHERE is_enabled;

-- INDEX report_subscriptions_fanout
CREATE INDEX report_subscriptions_fanout ON {{schema}}.report_subscriptions USING btree (report_code, schedule_preset) WHERE is_enabled;

-- INDEX source_grants_crawlable
CREATE INDEX source_grants_crawlable ON {{schema}}.source_grants USING btree (source_system, session_state) WHERE ((revoked_at IS NULL) AND (session_state = 'active'::text));

-- INDEX spider_launches_pending
CREATE INDEX spider_launches_pending ON {{schema}}.spider_launches USING btree (launched_at) WHERE (status = 'launched'::text);

-- INDEX spider_launches_task
CREATE INDEX spider_launches_task ON {{schema}}.spider_launches USING btree (crawlab_task_id);

-- INDEX user_org_units_one_primary
CREATE UNIQUE INDEX user_org_units_one_primary ON {{schema}}.user_org_units USING btree (app_user_id) WHERE is_primary;

-- FK CONSTRAINT adapters adapters_source_system_fkey
ALTER TABLE ONLY {{schema}}.adapters
    ADD CONSTRAINT adapters_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT app_settings app_settings_updated_by_fkey
ALTER TABLE ONLY {{schema}}.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES {{schema}}.app_users(id) ON DELETE SET NULL;

-- FK CONSTRAINT audit_log audit_log_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.audit_log
    ADD CONSTRAINT audit_log_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id);

-- FK CONSTRAINT crawl_runs crawl_runs_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.crawl_runs
    ADD CONSTRAINT crawl_runs_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id);

-- FK CONSTRAINT crawl_runs crawl_runs_source_system_fkey
ALTER TABLE ONLY {{schema}}.crawl_runs
    ADD CONSTRAINT crawl_runs_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT crawl_spiders crawl_spiders_source_system_fkey
ALTER TABLE ONLY {{schema}}.crawl_spiders
    ADD CONSTRAINT crawl_spiders_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT crawl_tasks crawl_tasks_source_system_fkey
ALTER TABLE ONLY {{schema}}.crawl_tasks
    ADD CONSTRAINT crawl_tasks_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT dashboard_tabs dashboard_tabs_source_system_fkey
ALTER TABLE ONLY {{schema}}.dashboard_tabs
    ADD CONSTRAINT dashboard_tabs_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT data_schedules data_schedules_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.data_schedules
    ADD CONSTRAINT data_schedules_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT data_schedules data_schedules_source_system_fkey
ALTER TABLE ONLY {{schema}}.data_schedules
    ADD CONSTRAINT data_schedules_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code) ON DELETE CASCADE;

-- FK CONSTRAINT data_schedules data_schedules_spider_code_fkey
ALTER TABLE ONLY {{schema}}.data_schedules
    ADD CONSTRAINT data_schedules_spider_code_fkey FOREIGN KEY (spider_code) REFERENCES {{schema}}.crawl_spiders(code) ON DELETE CASCADE;

-- FK CONSTRAINT data_source_prefs data_source_prefs_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.data_source_prefs
    ADD CONSTRAINT data_source_prefs_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT data_source_prefs data_source_prefs_source_system_fkey
ALTER TABLE ONLY {{schema}}.data_source_prefs
    ADD CONSTRAINT data_source_prefs_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code) ON DELETE CASCADE;

-- FK CONSTRAINT data_source_prefs data_source_prefs_spider_code_fkey
ALTER TABLE ONLY {{schema}}.data_source_prefs
    ADD CONSTRAINT data_source_prefs_spider_code_fkey FOREIGN KEY (spider_code) REFERENCES {{schema}}.crawl_spiders(code) ON DELETE CASCADE;

-- FK CONSTRAINT desktop_app_layouts desktop_app_layouts_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.desktop_app_layouts
    ADD CONSTRAINT desktop_app_layouts_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT desktop_apps desktop_apps_source_system_fkey
ALTER TABLE ONLY {{schema}}.desktop_apps
    ADD CONSTRAINT desktop_apps_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code) ON DELETE CASCADE;

-- FK CONSTRAINT desktop_apps desktop_apps_updated_by_fkey
ALTER TABLE ONLY {{schema}}.desktop_apps
    ADD CONSTRAINT desktop_apps_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES {{schema}}.app_users(id) ON DELETE SET NULL;

-- FK CONSTRAINT desktop_package_versions desktop_package_versions_code_fkey
ALTER TABLE ONLY {{schema}}.desktop_package_versions
    ADD CONSTRAINT desktop_package_versions_code_fkey FOREIGN KEY (code) REFERENCES {{schema}}.desktop_packages(code) ON DELETE CASCADE;

-- FK CONSTRAINT desktop_package_versions desktop_package_versions_created_by_fkey
ALTER TABLE ONLY {{schema}}.desktop_package_versions
    ADD CONSTRAINT desktop_package_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES {{schema}}.app_users(id) ON DELETE SET NULL;

-- FK CONSTRAINT desktop_packages desktop_packages_source_system_fkey
ALTER TABLE ONLY {{schema}}.desktop_packages
    ADD CONSTRAINT desktop_packages_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code) ON DELETE SET NULL;

-- FK CONSTRAINT desktop_packages desktop_packages_updated_by_fkey
ALTER TABLE ONLY {{schema}}.desktop_packages
    ADD CONSTRAINT desktop_packages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES {{schema}}.app_users(id) ON DELETE SET NULL;

-- FK CONSTRAINT extension_devices extension_devices_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.extension_devices
    ADD CONSTRAINT extension_devices_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT org_units org_units_parent_id_fkey
ALTER TABLE ONLY {{schema}}.org_units
    ADD CONSTRAINT org_units_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES {{schema}}.org_units(id);

-- FK CONSTRAINT raw_records raw_records_crawl_run_id_fkey
ALTER TABLE {{schema}}.raw_records
    ADD CONSTRAINT raw_records_crawl_run_id_fkey FOREIGN KEY (crawl_run_id) REFERENCES {{schema}}.crawl_runs(id) ON DELETE CASCADE;

-- FK CONSTRAINT raw_records raw_records_owner_user_id_fkey
ALTER TABLE {{schema}}.raw_records
    ADD CONSTRAINT raw_records_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES {{schema}}.app_users(id);

-- FK CONSTRAINT records records_last_crawl_run_id_fkey
ALTER TABLE ONLY {{schema}}.records
    ADD CONSTRAINT records_last_crawl_run_id_fkey FOREIGN KEY (last_crawl_run_id) REFERENCES {{schema}}.crawl_runs(id);

-- FK CONSTRAINT records records_org_unit_id_fkey
ALTER TABLE ONLY {{schema}}.records
    ADD CONSTRAINT records_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES {{schema}}.org_units(id);

-- FK CONSTRAINT records records_owner_user_id_fkey
ALTER TABLE ONLY {{schema}}.records
    ADD CONSTRAINT records_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES {{schema}}.app_users(id);

-- FK CONSTRAINT records records_source_system_fkey
ALTER TABLE ONLY {{schema}}.records
    ADD CONSTRAINT records_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT report_catalog report_catalog_dashboard_tab_fkey
ALTER TABLE ONLY {{schema}}.report_catalog
    ADD CONSTRAINT report_catalog_dashboard_tab_fkey FOREIGN KEY (dashboard_tab) REFERENCES {{schema}}.dashboard_tabs(id) ON DELETE SET NULL;

-- FK CONSTRAINT report_catalog report_catalog_source_system_fkey
ALTER TABLE ONLY {{schema}}.report_catalog
    ADD CONSTRAINT report_catalog_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT report_catalog report_catalog_spider_code_fkey
ALTER TABLE ONLY {{schema}}.report_catalog
    ADD CONSTRAINT report_catalog_spider_code_fkey FOREIGN KEY (spider_code) REFERENCES {{schema}}.crawl_spiders(code);

-- FK CONSTRAINT report_subscriptions report_subscriptions_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.report_subscriptions
    ADD CONSTRAINT report_subscriptions_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT report_subscriptions report_subscriptions_report_code_fkey
ALTER TABLE ONLY {{schema}}.report_subscriptions
    ADD CONSTRAINT report_subscriptions_report_code_fkey FOREIGN KEY (report_code) REFERENCES {{schema}}.report_catalog(code);

-- FK CONSTRAINT source_consents source_consents_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.source_consents
    ADD CONSTRAINT source_consents_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT source_consents source_consents_source_system_fkey
ALTER TABLE ONLY {{schema}}.source_consents
    ADD CONSTRAINT source_consents_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code) ON DELETE CASCADE;

-- FK CONSTRAINT source_grants source_grants_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.source_grants
    ADD CONSTRAINT source_grants_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT source_grants source_grants_configured_by_fkey
ALTER TABLE ONLY {{schema}}.source_grants
    ADD CONSTRAINT source_grants_configured_by_fkey FOREIGN KEY (configured_by) REFERENCES {{schema}}.app_users(id);

-- FK CONSTRAINT source_grants source_grants_source_system_fkey
ALTER TABLE ONLY {{schema}}.source_grants
    ADD CONSTRAINT source_grants_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- FK CONSTRAINT spider_launches spider_launches_retry_of_fkey
ALTER TABLE ONLY {{schema}}.spider_launches
    ADD CONSTRAINT spider_launches_retry_of_fkey FOREIGN KEY (retry_of) REFERENCES {{schema}}.spider_launches(id) ON DELETE SET NULL;

-- FK CONSTRAINT spider_launches spider_launches_spider_code_fkey
ALTER TABLE ONLY {{schema}}.spider_launches
    ADD CONSTRAINT spider_launches_spider_code_fkey FOREIGN KEY (spider_code) REFERENCES {{schema}}.crawl_spiders(code) ON DELETE CASCADE;

-- FK CONSTRAINT spider_schedules spider_schedules_spider_code_fkey
ALTER TABLE ONLY {{schema}}.spider_schedules
    ADD CONSTRAINT spider_schedules_spider_code_fkey FOREIGN KEY (spider_code) REFERENCES {{schema}}.crawl_spiders(code) ON DELETE CASCADE;

-- FK CONSTRAINT user_org_units user_org_units_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.user_org_units
    ADD CONSTRAINT user_org_units_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT user_org_units user_org_units_org_unit_id_fkey
ALTER TABLE ONLY {{schema}}.user_org_units
    ADD CONSTRAINT user_org_units_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES {{schema}}.org_units(id);

-- FK CONSTRAINT user_source_accounts user_source_accounts_app_user_id_fkey
ALTER TABLE ONLY {{schema}}.user_source_accounts
    ADD CONSTRAINT user_source_accounts_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES {{schema}}.app_users(id) ON DELETE CASCADE;

-- FK CONSTRAINT user_source_accounts user_source_accounts_source_system_fkey
ALTER TABLE ONLY {{schema}}.user_source_accounts
    ADD CONSTRAINT user_source_accounts_source_system_fkey FOREIGN KEY (source_system) REFERENCES {{schema}}.source_systems(code);

-- ROW SECURITY crawl_runs
ALTER TABLE {{schema}}.crawl_runs ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY data_schedules
ALTER TABLE {{schema}}.data_schedules ENABLE ROW LEVEL SECURITY;

-- POLICY data_schedules data_schedules_own
CREATE POLICY data_schedules_own ON {{schema}}.data_schedules USING ((app_user_id = {{schema}}.current_app_user())) WITH CHECK ((app_user_id = {{schema}}.current_app_user()));

-- ROW SECURITY data_source_prefs
ALTER TABLE {{schema}}.data_source_prefs ENABLE ROW LEVEL SECURITY;

-- POLICY data_source_prefs data_source_prefs_own
CREATE POLICY data_source_prefs_own ON {{schema}}.data_source_prefs USING ((app_user_id = {{schema}}.current_app_user())) WITH CHECK ((app_user_id = {{schema}}.current_app_user()));

-- POLICY extension_devices ext_devices_own
CREATE POLICY ext_devices_own ON {{schema}}.extension_devices USING ((app_user_id = {{schema}}.current_app_user())) WITH CHECK ((app_user_id = {{schema}}.current_app_user()));

-- ROW SECURITY extension_devices
ALTER TABLE {{schema}}.extension_devices ENABLE ROW LEVEL SECURITY;

-- POLICY source_grants grants_own
CREATE POLICY grants_own ON {{schema}}.source_grants USING ((app_user_id = {{schema}}.current_app_user())) WITH CHECK ((app_user_id = {{schema}}.current_app_user()));

-- POLICY raw_records raw_own
CREATE POLICY raw_own ON {{schema}}.raw_records FOR SELECT USING ((owner_user_id = {{schema}}.current_app_user()));

-- ROW SECURITY raw_records
ALTER TABLE {{schema}}.raw_records ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY records
ALTER TABLE {{schema}}.records ENABLE ROW LEVEL SECURITY;

-- POLICY records records_org
CREATE POLICY records_org ON {{schema}}.records FOR SELECT USING (((current_setting('app.scope'::text, true) = 'don_vi'::text) AND (org_unit_id = ANY ({{schema}}.current_org_allowed()))));

-- POLICY records records_own
CREATE POLICY records_own ON {{schema}}.records FOR SELECT USING ((owner_user_id = {{schema}}.current_app_user()));

-- ROW SECURITY report_subscriptions
ALTER TABLE {{schema}}.report_subscriptions ENABLE ROW LEVEL SECURITY;

-- POLICY crawl_runs runs_own
CREATE POLICY runs_own ON {{schema}}.crawl_runs FOR SELECT USING ((app_user_id = {{schema}}.current_app_user()));

-- ROW SECURITY source_consents
ALTER TABLE {{schema}}.source_consents ENABLE ROW LEVEL SECURITY;

-- POLICY source_consents source_consents_own
CREATE POLICY source_consents_own ON {{schema}}.source_consents USING ((app_user_id = {{schema}}.current_app_user())) WITH CHECK ((app_user_id = {{schema}}.current_app_user()));

-- ROW SECURITY source_grants
ALTER TABLE {{schema}}.source_grants ENABLE ROW LEVEL SECURITY;

-- POLICY report_subscriptions subs_own
CREATE POLICY subs_own ON {{schema}}.report_subscriptions USING ((app_user_id = {{schema}}.current_app_user())) WITH CHECK ((app_user_id = {{schema}}.current_app_user()));

-- ACL SCHEMA {{schema}}
GRANT USAGE ON SCHEMA {{schema}} TO app_reader;
GRANT USAGE ON SCHEMA {{schema}} TO app_writer;

-- ACL FUNCTION drop_expired_raw_partitions(keep_days integer)
REVOKE ALL ON FUNCTION {{schema}}.drop_expired_raw_partitions(keep_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION {{schema}}.drop_expired_raw_partitions(keep_days integer) TO app_writer;

-- ACL FUNCTION ensure_raw_partitions(months_ahead integer)
REVOKE ALL ON FUNCTION {{schema}}.ensure_raw_partitions(months_ahead integer) FROM PUBLIC;
GRANT ALL ON FUNCTION {{schema}}.ensure_raw_partitions(months_ahead integer) TO app_writer;

-- ACL FUNCTION ensure_record_index(p_source text, p_capability text, p_field text, p_type text)
REVOKE ALL ON FUNCTION {{schema}}.ensure_record_index(p_source text, p_capability text, p_field text, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION {{schema}}.ensure_record_index(p_source text, p_capability text, p_field text, p_type text) TO app_writer;

-- ACL FUNCTION org_coverage(p_source text)
REVOKE ALL ON FUNCTION {{schema}}.org_coverage(p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION {{schema}}.org_coverage(p_source text) TO app_reader;

-- ACL FUNCTION rec_date(v text)
GRANT ALL ON FUNCTION {{schema}}.rec_date(v text) TO app_reader;
GRANT ALL ON FUNCTION {{schema}}.rec_date(v text) TO app_writer;

-- ACL TABLE adapters
GRANT SELECT ON TABLE {{schema}}.adapters TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.adapters TO app_writer;

-- ACL SEQUENCE adapters_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.adapters_id_seq TO app_writer;

-- ACL TABLE app_settings
GRANT SELECT ON TABLE {{schema}}.app_settings TO app_reader;
GRANT SELECT,UPDATE ON TABLE {{schema}}.app_settings TO app_writer;

-- ACL TABLE app_users
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.app_users TO app_writer;

-- ACL COLUMN app_users.id
GRANT SELECT(id) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.sso_subject
GRANT SELECT(sso_subject) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.email
GRANT SELECT(email) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.ho_ten
GRANT SELECT(ho_ten) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.is_active
GRANT SELECT(is_active) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.created_at
GRANT SELECT(created_at) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.last_login_at
GRANT SELECT(last_login_at) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.is_ops_admin
GRANT SELECT(is_ops_admin) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL COLUMN app_users.username
GRANT SELECT(username) ON TABLE {{schema}}.app_users TO app_reader;

-- ACL SEQUENCE app_users_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.app_users_id_seq TO app_writer;

-- ACL TABLE audit_log
GRANT INSERT ON TABLE {{schema}}.audit_log TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.audit_log TO app_writer;

-- ACL SEQUENCE audit_log_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.audit_log_id_seq TO app_writer;
GRANT USAGE ON SEQUENCE {{schema}}.audit_log_id_seq TO app_reader;

-- ACL TABLE crawl_runs
GRANT SELECT ON TABLE {{schema}}.crawl_runs TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.crawl_runs TO app_writer;

-- ACL SEQUENCE crawl_runs_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.crawl_runs_id_seq TO app_writer;

-- ACL TABLE crawl_spiders
GRANT SELECT ON TABLE {{schema}}.crawl_spiders TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.crawl_spiders TO app_writer;

-- ACL TABLE crawl_tasks
GRANT SELECT ON TABLE {{schema}}.crawl_tasks TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.crawl_tasks TO app_writer;

-- ACL SEQUENCE crawl_tasks_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.crawl_tasks_id_seq TO app_writer;

-- ACL TABLE dashboard_tabs
GRANT SELECT ON TABLE {{schema}}.dashboard_tabs TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.dashboard_tabs TO app_writer;

-- ACL SEQUENCE dashboard_tabs_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.dashboard_tabs_id_seq TO app_writer;

-- ACL TABLE data_schedules
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.data_schedules TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.data_schedules TO app_writer;

-- ACL SEQUENCE data_schedules_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.data_schedules_id_seq TO app_reader;
GRANT USAGE ON SEQUENCE {{schema}}.data_schedules_id_seq TO app_writer;

-- ACL TABLE data_source_prefs
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.data_source_prefs TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.data_source_prefs TO app_writer;

-- ACL TABLE desktop_app_layouts
GRANT SELECT ON TABLE {{schema}}.desktop_app_layouts TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.desktop_app_layouts TO app_writer;

-- ACL TABLE desktop_apps
GRANT SELECT ON TABLE {{schema}}.desktop_apps TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.desktop_apps TO app_writer;

-- ACL TABLE desktop_package_versions
GRANT SELECT ON TABLE {{schema}}.desktop_package_versions TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.desktop_package_versions TO app_writer;

-- ACL TABLE desktop_packages
GRANT SELECT ON TABLE {{schema}}.desktop_packages TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.desktop_packages TO app_writer;

-- ACL TABLE extension_devices
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.extension_devices TO app_writer;

-- ACL SEQUENCE extension_devices_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.extension_devices_id_seq TO app_writer;

-- ACL TABLE org_units
GRANT SELECT ON TABLE {{schema}}.org_units TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.org_units TO app_writer;

-- ACL TABLE raw_records
GRANT SELECT ON TABLE {{schema}}.raw_records TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.raw_records TO app_writer;

-- ACL SEQUENCE raw_records_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.raw_records_id_seq TO app_writer;

-- ACL TABLE records
GRANT SELECT ON TABLE {{schema}}.records TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.records TO app_writer;

-- ACL SEQUENCE records_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.records_id_seq TO app_writer;

-- ACL TABLE report_catalog
GRANT SELECT ON TABLE {{schema}}.report_catalog TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.report_catalog TO app_writer;

-- ACL TABLE report_subscriptions
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.report_subscriptions TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.report_subscriptions TO app_writer;

-- ACL SEQUENCE report_subscriptions_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.report_subscriptions_id_seq TO app_writer;
GRANT USAGE ON SEQUENCE {{schema}}.report_subscriptions_id_seq TO app_reader;

-- ACL TABLE source_consents
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.source_consents TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.source_consents TO app_writer;

-- ACL TABLE source_grants
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.source_grants TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.source_grants TO app_writer;

-- ACL SEQUENCE source_grants_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.source_grants_id_seq TO app_writer;
GRANT USAGE ON SEQUENCE {{schema}}.source_grants_id_seq TO app_reader;

-- ACL TABLE source_systems
GRANT SELECT ON TABLE {{schema}}.source_systems TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.source_systems TO app_writer;

-- ACL TABLE spider_launches
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.spider_launches TO app_writer;

-- ACL SEQUENCE spider_launches_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.spider_launches_id_seq TO app_writer;

-- ACL TABLE spider_schedules
GRANT SELECT ON TABLE {{schema}}.spider_schedules TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.spider_schedules TO app_writer;

-- ACL TABLE user_org_units
GRANT SELECT ON TABLE {{schema}}.user_org_units TO app_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE {{schema}}.user_org_units TO app_writer;

-- ACL TABLE user_source_accounts
GRANT SELECT ON TABLE {{schema}}.user_source_accounts TO app_reader;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE {{schema}}.user_source_accounts TO app_writer;

-- ACL SEQUENCE user_source_accounts_id_seq
GRANT USAGE ON SEQUENCE {{schema}}.user_source_accounts_id_seq TO app_writer;


--
-- PostgreSQL database dump complete
--

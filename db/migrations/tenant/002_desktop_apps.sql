-- Danh mục ứng dụng của Vala Desktop theo đơn vị (họp 07/10 phần 3; docs/superpowers/specs/2026-10-08-desktop-app-catalog-design.md).
-- Quản trị đơn vị khai: trang web, hệ thống nguồn, Báo cáo (cổng Vala Reporting — chỉ là một ứng dụng). Mỗi người dùng có
-- bố cục riêng (ứng dụng ghim + thứ tự) lưu ở desktop_app_layouts; Desktop gộp hai thứ khi mở.
CREATE TABLE desktop_apps (
    ma              text        PRIMARY KEY CHECK (ma ~ '^[a-z][a-z0-9_]{1,39}$'),
    ten             text        NOT NULL CHECK (length(ten) BETWEEN 1 AND 60),
    kind            text        NOT NULL CHECK (kind IN ('web', 'source', 'reports')),
    url             text        CHECK (url IS NULL OR (url ~ '^https?://[^[:space:]]+$' AND length(url) <= 500)),
    source_system   text        REFERENCES source_systems(code) ON DELETE CASCADE,
    icon            text        CHECK (icon IS NULL OR (icon ~ '^(https?://[^[:space:]]+|data:image/(png|jpeg|svg\+xml|webp|x-icon);base64,.+)$' AND length(icon) <= 200000)),
    sort            integer     NOT NULL DEFAULT 0,
    pinned_default  boolean     NOT NULL DEFAULT true,
    is_default      boolean     NOT NULL DEFAULT false,
    enabled         boolean     NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      bigint      REFERENCES app_users(id) ON DELETE SET NULL,
    CHECK (kind <> 'web' OR url IS NOT NULL),
    CHECK (kind <> 'source' OR source_system IS NOT NULL)
);
-- Tối đa một ứng dụng mặc định, một Báo cáo, mỗi hệ thống nguồn một ứng dụng.
CREATE UNIQUE INDEX desktop_apps_one_default ON desktop_apps ((true)) WHERE is_default;
CREATE UNIQUE INDEX desktop_apps_one_reports ON desktop_apps ((true)) WHERE kind = 'reports';
CREATE UNIQUE INDEX desktop_apps_source ON desktop_apps (source_system) WHERE source_system IS NOT NULL;

CREATE TABLE desktop_app_layouts (
    app_user_id  bigint      PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    pinned       text[]      NOT NULL DEFAULT '{}',
    updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON desktop_apps, desktop_app_layouts TO app_reader, app_writer;
GRANT INSERT, UPDATE, DELETE ON desktop_apps, desktop_app_layouts TO app_writer;

-- Khởi tạo từ cấu hình đang dùng: trang chính (tab Vala cũ) là ứng dụng mặc định, rồi các hệ thống nguồn đang bật có kết
-- nối qua Desktop, cuối cùng là Báo cáo.
INSERT INTO desktop_apps (ma, ten, kind, url, sort, is_default)
SELECT 'vala', 'Vala', 'web', coalesce((SELECT desktop_home_url FROM app_settings WHERE id = 1), 'https://vala.bkav.com/'), 0, true;
INSERT INTO desktop_apps (ma, ten, kind, source_system, sort)
SELECT left('src_' || regexp_replace(code, '[^a-z0-9_]', '_', 'g'), 40), left(ten, 60), 'source', code,
       10 + row_number() OVER (ORDER BY code)
  FROM source_systems WHERE enabled AND 'extension' = ANY(connection_methods);
INSERT INTO desktop_apps (ma, ten, kind, sort) VALUES ('bao_cao', 'Báo cáo', 'reports', 1000);

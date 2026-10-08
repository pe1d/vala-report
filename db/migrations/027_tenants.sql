-- 027 — nhiều đơn vị (docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md).
--   * core.tenants: danh mục đơn vị (mã ⇒ schema tenant_<mã>, tên miền, cách đăng nhập); Bkav là đơn vị đầu tiên.
--   * core.tenant_domains: mỗi tên miền thuộc đúng một đơn vị (bước 1 của đăng nhập: tk@tênmiền ⇒ đơn vị).
--   * core.system_admins: quản trị hệ thống (đứng trên mọi đơn vị) — dùng từ đợt 3.
--   * core.tenant_migrations: migration loại đơn vị (db/migrations/tenant/) đã áp cho đơn vị nào.
--   * Danh mục hệ thống nguồn + crawl chuyển từ core vào schema đơn vị (mỗi đơn vị tự quản nguồn của mình). SET SCHEMA
--     giữ nguyên dữ liệu, sequence, khoá ngoại, chỉ mục, quyền.
CREATE TABLE core.tenants (
    ma               text        PRIMARY KEY CHECK (ma ~ '^[a-z][a-z0-9]{1,19}$'),
    ten              text        NOT NULL,
    domains          text[]      NOT NULL DEFAULT '{}',
    status           text        NOT NULL DEFAULT 'dang_tao' CHECK (status IN ('dang_tao', 'hoat_dong', 'tam_khoa', 'loi')),
    status_note      text,
    login_methods    text[]      NOT NULL DEFAULT '{password}',
    sso              jsonb,
    login_fill       text        NOT NULL DEFAULT 'account' CHECK (login_fill IN ('account', 'email')),
    login_selectors  jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN core.tenants.domains IS 'Bản sao để hiển thị; tra cứu theo core.tenant_domains (duy nhất toàn hệ thống).';

CREATE TABLE core.tenant_domains (
    domain  text PRIMARY KEY CHECK (domain = lower(domain)),
    tenant  text NOT NULL REFERENCES core.tenants(ma) ON DELETE CASCADE
);

CREATE TABLE core.system_admins (
    tenant   text   NOT NULL REFERENCES core.tenants(ma),
    user_id  bigint NOT NULL,
    PRIMARY KEY (tenant, user_id)
);

CREATE TABLE core.tenant_migrations (
    tenant      text        NOT NULL REFERENCES core.tenants(ma),
    name        text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant, name)
);

GRANT SELECT ON core.tenants, core.tenant_domains, core.system_admins TO app_reader, app_writer;
GRANT INSERT, UPDATE ON core.tenants, core.tenant_domains, core.system_admins TO app_writer;
GRANT DELETE ON core.tenant_domains, core.system_admins TO app_writer;

INSERT INTO core.tenants (ma, ten, domains, status) VALUES ('bkav', 'Bkav', '{bkav.com}', 'hoat_dong');
INSERT INTO core.tenant_domains (domain, tenant) VALUES ('bkav.com', 'bkav');

ALTER TABLE core.source_systems   SET SCHEMA tenant_bkav;
ALTER TABLE core.adapters         SET SCHEMA tenant_bkav;
ALTER TABLE core.crawl_tasks      SET SCHEMA tenant_bkav;
ALTER TABLE core.crawl_spiders    SET SCHEMA tenant_bkav;
ALTER TABLE core.spider_schedules SET SCHEMA tenant_bkav;
ALTER TABLE core.spider_launches  SET SCHEMA tenant_bkav;

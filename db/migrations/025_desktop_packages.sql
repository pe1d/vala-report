-- =====================================================================
-- 025 — Gói kịch bản của Vala Desktop (biên bản họp 10/2026, việc T09 + T11b): CSS + JS chạy trong trang hệ thống nguồn
-- để sửa lỗi giao diện khi nhúng và khai báo các thao tác có tên (lấy danh sách văn bản, tạo dự thảo…). Quản trị viết
-- trên cổng; ứng dụng tải về — đổi kịch bản không cần phát hành bản app mới.
--
-- An toàn: mã chạy trong trang người dùng đang đăng nhập ⇒ chỉ quản trị vận hành sửa, mọi lần sửa ghi audit, máy chủ ký
-- từng gói bằng khoá trong .env (không trong CSDL) và ứng dụng chỉ chạy gói đúng chữ ký.
-- Mỗi lần đổi nội dung tăng version và lưu bản đó vào desktop_package_versions (xem lại / quay về bản cũ).
-- =====================================================================
SET search_path = tenant_bkav, core, public;

CREATE TABLE desktop_packages (
    code          text        PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,62}$'),
    ten           text        NOT NULL CHECK (length(ten) BETWEEN 1 AND 200),
    mo_ta         text        CHECK (length(mo_ta) <= 1000),
    source_system text        REFERENCES core.source_systems(code) ON DELETE SET NULL,
    -- Mẫu địa chỉ trang áp dụng (https://egov.bkav.com/*); kiểm định dạng ở API.
    matches       text[]      NOT NULL CHECK (cardinality(matches) BETWEEN 1 AND 20),
    css           text        NOT NULL DEFAULT '' CHECK (length(css) <= 200000),
    script        text        NOT NULL DEFAULT '' CHECK (length(script) <= 500000),
    version       integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
    is_enabled    boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    bigint      REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE desktop_package_versions (
    code        text        NOT NULL REFERENCES desktop_packages(code) ON DELETE CASCADE,
    version     integer     NOT NULL,
    matches     text[]      NOT NULL,
    css         text        NOT NULL,
    script      text        NOT NULL,
    ghi_chu     text        CHECK (length(ghi_chu) <= 500),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  bigint      REFERENCES app_users(id) ON DELETE SET NULL,
    PRIMARY KEY (code, version)
);

COMMENT ON TABLE desktop_packages IS 'Gói kịch bản Vala Desktop (CSS/JS chạy trong trang hệ thống nguồn). Bản hiện hành; lịch sử ở desktop_package_versions.';

GRANT SELECT ON desktop_packages, desktop_package_versions TO app_reader, app_writer;
GRANT INSERT, UPDATE, DELETE ON desktop_packages, desktop_package_versions TO app_writer;

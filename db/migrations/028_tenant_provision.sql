-- 028 — nhiều đơn vị, đợt 3: Quản trị hệ thống → Đơn vị (docs/superpowers/plans/2026-10-08-multi-tenant-dot3-don-vi.md).
--   * core.tenants.provision: yêu cầu dựng đơn vị do quản trị hệ thống gửi (chép cấu hình từ đơn vị nào, quản trị đầu tiên
--     — mật khẩu ĐÃ BĂM). Worker dựng xong ⇒ xoá. Đọc bằng pool ghi / chủ CSDL, không đưa ra API.
--   * Quản trị hệ thống ban đầu của Bkav (người dùng chốt 08/10/2026): dieptx@bkav.com và ops@bkav.com — tài khoản nào có
--     sẵn lúc chạy migration thì được ghi; thêm sau bằng INSERT vào core.system_admins.
ALTER TABLE core.tenants ADD COLUMN provision jsonb;
REVOKE SELECT ON core.tenants FROM app_reader;
GRANT SELECT (ma, ten, domains, status, status_note, login_methods, sso, login_fill, login_selectors, created_at, updated_at)
    ON core.tenants TO app_reader;

INSERT INTO core.system_admins (tenant, user_id)
SELECT 'bkav', id FROM tenant_bkav.app_users WHERE email IN ('dieptx@bkav.com', 'ops@bkav.com')
ON CONFLICT DO NOTHING;

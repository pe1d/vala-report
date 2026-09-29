-- Dữ liệu mẫu tối thiểu cho môi trường dev/test. KHÔNG chạy trên production.
-- Chỉ seed một tài khoản quản trị (ops). Người dùng thật (vd dieptx) vào qua đăng nhập SSO,
-- không seed trong code. Hệ thống nguồn/báo cáo cũng do quản trị cấu hình trên giao diện.
SET search_path = tenant_bkav, core, public;

INSERT INTO org_units (id, ten, parent_id, path) VALUES
    (1, 'Bkav', NULL, '{1}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_users (id, sso_subject, email, ho_ten, is_ops_admin) VALUES
    (7, 'dev-ops', 'ops@bkav.com', 'Kỹ sư vận hành', true)
ON CONFLICT (id) DO NOTHING;
SELECT setval('app_users_id_seq', (SELECT max(id) FROM app_users));

INSERT INTO user_org_units (app_user_id, org_unit_id, vai_tro, is_primary) VALUES
    (7, 1, 'thanh_vien', true)
ON CONFLICT DO NOTHING;

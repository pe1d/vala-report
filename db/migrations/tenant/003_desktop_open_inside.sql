-- Liên kết mở trong Vala Desktop (người dùng 08/10/2026): link mở cửa sổ mới tới các tên miền này (và tên miền con) mở thành
-- tab trong app — giữ phiên đăng nhập — thay vì trình duyệt mặc định của máy. Quản trị đơn vị khai ở Vala Desktop → Quản trị
-- → Ứng dụng Desktop. Tên miền của các ứng dụng trong danh mục luôn mở trong app (không cần khai).
ALTER TABLE app_settings ADD COLUMN desktop_open_inside text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(desktop_open_inside) <= 100);

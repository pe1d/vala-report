-- Loại thiết bị của token vxt_… : tiện ích trình duyệt hay Vala Desktop. Chỉ token của Desktop đổi được lấy token cổng
-- (POST /ext/portal-token — tab Báo cáo trong ứng dụng tự có phiên sau khi đăng nhập ở màn hình đăng nhập của app).
ALTER TABLE extension_devices ADD COLUMN kind text NOT NULL DEFAULT 'extension' CHECK (kind IN ('extension', 'desktop'));
-- Token Desktop cấp trước đây (cổng cấp qua cầu nối) đặt tên "Vala Desktop trên …".
UPDATE extension_devices SET kind = 'desktop' WHERE ten LIKE 'Vala Desktop%';

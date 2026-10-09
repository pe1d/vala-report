-- Chuẩn hoá & cấu hình ứng dụng (09/10/2026): mô tả ngắn, màu ô biểu tượng, biểu tượng chọn từ bộ có sẵn (Lucide —
-- packages/ui/src/app-icons.ts) lưu dạng `lucide:<tên>` bên cạnh ảnh riêng (http(s) / data:image) như trước.
ALTER TABLE desktop_apps ADD COLUMN mo_ta text CHECK (mo_ta IS NULL OR length(mo_ta) <= 300);
ALTER TABLE desktop_apps ADD COLUMN mau text CHECK (mau IS NULL OR mau ~ '^[a-z_]{2,20}$');
ALTER TABLE desktop_apps DROP CONSTRAINT IF EXISTS desktop_apps_icon_check;
ALTER TABLE desktop_apps ADD CONSTRAINT desktop_apps_icon_check CHECK (icon IS NULL OR (
  icon ~ '^(https?://[^[:space:]]+|data:image/(png|jpeg|svg\+xml|webp|x-icon);base64,.+|lucide:[a-z0-9-]{1,60})$'
  AND length(icon) <= 200000));

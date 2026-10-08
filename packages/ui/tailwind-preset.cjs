/**
 * Preset Tailwind dùng chung (cổng web, trang Quản trị trong Vala Desktop). Nơi dùng PHẢI thêm thư mục nguồn của các gói
 * vào `content` (vd ../../packages/ui/src/**) — không thì class trong thành phần dùng chung bị loại khỏi CSS.
 */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      // Màu chủ đạo của đơn vị: cả bảng `blue-*` lấy từ biến CSS --brand-* (mặc định = blue của Tailwind, khai trong
      // base.css). Quản trị đổi màu ở "Cấu hình chung" ⇒ branding.tsx tính lại các sắc độ — không phải sửa class.
      colors: {
        blue: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `rgb(var(--brand-${s}) / <alpha-value>)`])),
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'system-ui', 'sans-serif'],
      },
    },
  },
};

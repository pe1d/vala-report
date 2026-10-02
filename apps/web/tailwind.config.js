/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Chế độ tối theo class `dark` trên <html>, do nút chuyển sáng/tối điều khiển (src/theme.ts).
  darkMode: 'class',
  theme: {
    extend: {
      // Màu chủ đạo của đơn vị: cả bảng `blue-*` lấy từ biến CSS --brand-* (mặc định = blue của Tailwind, khai trong
      // index.css). Quản trị đổi màu ở "Cấu hình chung" ⇒ src/branding.ts tính lại các sắc độ — không phải sửa class.
      colors: {
        blue: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `rgb(var(--brand-${s}) / <alpha-value>)`])),
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

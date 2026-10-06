/** Tailwind cho các trang cục bộ (Cài đặt, thanh tab: resources/*.html + src/renderer). Sáng/tối theo class 'dark' trên <html>. */
module.exports = {
  content: ['resources/*.html', 'src/renderer/**/*.ts'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};

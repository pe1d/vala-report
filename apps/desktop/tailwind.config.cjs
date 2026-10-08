/** Tailwind cho các trang cục bộ (Cài đặt, thanh tab: resources/*.html + src/renderer). Sáng/tối theo class 'dark' trên <html>. */
module.exports = {
  content: ['resources/*.html', 'src/renderer/**/*.ts'],
  darkMode: 'class',
  theme: {
    extend: {
      // Bo tròn cả hệ thống (08/10/2026): nâng thang bo góc một bậc so với mặc định — nút, ô nhập, thẻ, khung nổi đều mềm
      // hơn, khớp khung trang web bo 12px (browser.ts RADIUS). Đổi ở đây là đổi toàn bộ trang cục bộ.
      borderRadius: { sm: '0.375rem', DEFAULT: '0.5rem', md: '0.625rem', lg: '0.75rem', xl: '1rem', '2xl': '1.25rem', '3xl': '1.75rem' },
    },
  },
  plugins: [],
};

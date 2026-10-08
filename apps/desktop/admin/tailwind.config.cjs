/** Tailwind của trang Quản trị đơn vị: preset dùng chung với cổng + quét các gói giao diện (không thì class bị loại). */
module.exports = {
  presets: [require('@vala/ui/tailwind-preset')],
  content: [__dirname + '/index.html', __dirname + '/src/**/*.{ts,tsx}', __dirname + '/../../../packages/ui/src/**/*.{ts,tsx}', __dirname + '/../../../packages/admin/src/**/*.{ts,tsx}'],
};

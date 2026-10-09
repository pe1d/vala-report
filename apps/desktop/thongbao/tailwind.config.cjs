/** Tailwind của trang Trung tâm thông báo: preset dùng chung với cổng + quét gói giao diện (không thì class bị loại). */
module.exports = {
  presets: [require('@vala/ui/tailwind-preset')],
  content: [__dirname + '/index.html', __dirname + '/src/**/*.{ts,tsx}', __dirname + '/../../../packages/ui/src/**/*.{ts,tsx}'],
};

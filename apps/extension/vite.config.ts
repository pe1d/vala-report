import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json';

/**
 * Tiện ích Chrome/Edge (Manifest V3). Build ra dist/ — nạp dạng "unpacked" hoặc đóng gói phát hành.
 *
 * Quyền đọc cookie KHÔNG cấp sẵn cho tên miền nào: mỗi hệ thống nguồn (và máy chủ Vala) được xin
 * riêng qua hộp thoại của Chrome, người dùng thấy rõ tên miền trước khi đồng ý.
 * Bản dev (--mode development) cấp sẵn localhost để chạy với eGov/eTask giả lập.
 */
function manifest(dev: boolean): Plugin {
  const icons = { 16: 'icons/vala-16.png', 32: 'icons/vala-32.png', 48: 'icons/vala-48.png', 128: 'icons/vala-128.png' };
  const m = {
    manifest_version: 3,
    name: dev ? 'Vala Reporting (dev)' : 'Vala Reporting',
    short_name: 'Vala',
    version: pkg.version,
    description: 'Gửi phiên đăng nhập eGov, eTask… về Vala Reporting để hệ thống lấy dữ liệu thay bạn theo lịch. Không lưu mật khẩu.',
    permissions: ['cookies', 'storage', 'alarms', 'notifications', 'scripting'],
    host_permissions: dev ? ['http://localhost/*', 'http://127.0.0.1/*'] : [],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    background: { service_worker: 'background.js', type: 'module' },
    action: { default_popup: 'popup.html', default_title: 'Vala Reporting', default_icon: icons },
    options_ui: { page: 'options.html', open_in_tab: true },
    icons,
  };
  return {
    name: 'vala-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(m, null, 2) });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), manifest(mode === 'development')],
  build: {
    outDir: mode === 'development' ? 'dist-dev' : 'dist',
    emptyOutDir: true,
    // Không minify bản dev để dễ đọc lỗi trong chrome://extensions.
    minify: mode !== 'development',
    rollupOptions: {
      input: { popup: 'popup.html', options: 'options.html', background: 'src/background.ts', bridge: 'src/bridge.ts' },
      output: {
        entryFileNames: (c) => (c.name === 'background' || c.name === 'bridge' ? `${c.name}.js` : 'assets/[name]-[hash].js'),
      },
    },
  },
}));

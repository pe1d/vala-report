import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json';

/**
 * Tiện ích Chrome/Edge (Manifest V3). Build ra dist/ — nạp dạng "unpacked" hoặc đóng gói phát hành.
 *
 * Quyền đọc cookie KHÔNG cấp sẵn cho tên miền nào: mỗi hệ thống nguồn (và máy chủ Vala) được xin
 * riêng qua hộp thoại của Chrome, người dùng thấy rõ tên miền trước khi đồng ý.
 * Bản dev (--mode development) cấp sẵn localhost để chạy với eGov/eTask giả lập.
 *
 * Hai bản, cài song song được (tên khác nhau):
 *   pnpm build       → dist/      "Vala Reporting"        máy chủ mặc định PROD_SERVER
 *   pnpm build:dev   → dist-dev/  "Vala Reporting (dev)"  máy chủ mặc định http://localhost:5173
 *   pnpm package     → cả hai + vala-extension-<phiên bản>.zip và vala-extension-<phiên bản>-dev.zip
 * Đổi máy chủ mặc định lúc build: VITE_VALA_URL=https://… pnpm build. Người dùng vẫn đổi được trong Tùy chọn.
 */
const PROD_SERVER = 'https://qtttboard-demo.demozone.vn:5443/vala-report';
const DEV_SERVER = 'http://localhost:5173';
function manifest(dev: boolean): Plugin {
  // Bản dev: icon nền cam + dải "DEV" (public/icons-dev, tạo bằng scripts/make-dev-icons.py) để không nhầm với bản thật.
  const dir = dev ? 'icons-dev' : 'icons';
  const icons = { 16: `${dir}/vala-16.png`, 32: `${dir}/vala-32.png`, 48: `${dir}/vala-48.png`, 128: `${dir}/vala-128.png` };
  const m = {
    manifest_version: 3,
    name: dev ? 'Vala Reporting (dev)' : 'Vala Reporting',
    short_name: 'Vala',
    version: pkg.version,
    ...(dev ? { version_name: `${pkg.version}-dev` } : {}),
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
  define: {
    'import.meta.env.VITE_VALA_URL': JSON.stringify(process.env.VITE_VALA_URL ?? (mode === 'development' ? DEV_SERVER : PROD_SERVER)),
  },
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

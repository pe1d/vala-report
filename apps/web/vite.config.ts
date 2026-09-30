import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev: /api đi qua proxy sang Fastify, nên cổng web và API cùng origin (callback uỷ quyền quay về đây).
// WEB_BASE_PATH: chạy dưới đường dẫn con (vd /vala-report) thay vì gốc tên miền — mặc định '/'.
const base = `/${(process.env.WEB_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

export default defineConfig({
  base,
  plugins: [react()],
  // ECharts tách chunk riêng: cache được lâu, không làm nặng bundle chính của cổng.
  build: { chunkSizeWarningLimit: 700, rollupOptions: { output: { manualChunks: (id) => (/node_modules\/(echarts|zrender)\//.test(id) ? 'echarts' : undefined) } } },
  server: { port: 5173, proxy: { '/api': process.env.VALA_API_PROXY ?? 'http://localhost:3000' } },
});

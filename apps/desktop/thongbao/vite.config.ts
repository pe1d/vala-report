import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Trang Trung tâm thông báo của Vala Desktop (trang cục bộ, nạp bằng file://) ⇒ đường dẫn tương đối, build ra dist/thongbao.
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  plugins: [react()],
  css: { postcss: resolve(__dirname) },
  build: { outDir: resolve(__dirname, '../dist/thongbao'), emptyOutDir: true, chunkSizeWarningLimit: 900 },
});

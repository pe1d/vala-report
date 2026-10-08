import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Trang Quản trị đơn vị của Vala Desktop (trang cục bộ, nạp bằng file://) ⇒ đường dẫn tương đối, build ra dist/admin.
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  plugins: [react()],
  css: { postcss: resolve(__dirname) },
  build: { outDir: resolve(__dirname, '../dist/admin'), emptyOutDir: true, chunkSizeWarningLimit: 900 },
});

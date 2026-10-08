import { defineConfig } from 'vitest/config';

// Test thường không chạm CSDL; test CSDL (test/db) chạy riêng bằng `pnpm test:db` (vitest.db.config.ts).
export default defineConfig({
  test: { exclude: ['test/db/**', 'node_modules/**'], fileParallelism: false, testTimeout: 20000, passWithNoTests: true },
});

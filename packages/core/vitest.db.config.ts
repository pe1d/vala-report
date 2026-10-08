import { defineConfig } from 'vitest/config';

// Test chạm CSDL thật (database vala_test tạo lại mỗi lần chạy): pnpm --filter @vala/core test:db. Cần DATABASE_OWNER_URL.
export default defineConfig({
  test: { include: ['test/db/**/*.test.ts'], globalSetup: ['test/db/setup.ts'], fileParallelism: false, testTimeout: 60000, hookTimeout: 120000 },
});

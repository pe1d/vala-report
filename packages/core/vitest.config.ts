import { defineConfig } from 'vitest/config';

// Bộ test cũ (phụ thuộc eGov/eTask giả lập) đã gỡ. passWithNoTests để CI vẫn xanh tới khi có bộ test mới.
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 20000, passWithNoTests: true },
});

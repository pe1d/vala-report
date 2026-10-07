// Chép bộ hàm `vala` (packages/core/runtime/vala-runtime.js — dùng chung với máy chủ) vào dist/ để đóng gói cùng ứng dụng.
const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

mkdirSync(join(__dirname, '..', 'dist'), { recursive: true });
copyFileSync(join(__dirname, '..', '..', '..', 'packages', 'core', 'runtime', 'vala-runtime.js'), join(__dirname, '..', 'dist', 'vala-runtime.js'));

// Ghi dist/defaults.json: trang chính và máy chủ Vala Reporting mặc định cho nơi triển khai.
//   VALA_HOME_URL=https://vala.donvi.gov.vn/ VALA_URL=https://baocao.donvi.gov.vn pnpm package
// Bỏ trống ⇒ dùng mặc định trong src/settings.ts. Người dùng vẫn sửa được trong cửa sổ Cài đặt.
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const out = join(__dirname, '..', 'dist', 'defaults.json');
mkdirSync(join(__dirname, '..', 'dist'), { recursive: true });
writeFileSync(out, JSON.stringify({ homeUrl: process.env.VALA_HOME_URL || '', serverUrl: process.env.VALA_URL || '' }, null, 2));
console.log(`defaults: ${out}`);

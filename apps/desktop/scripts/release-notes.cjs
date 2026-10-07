// Ghi dist/release-notes.json: điểm mới của phiên bản trong package.json, tách từ CHANGELOG.md (src/release-notes.ts).
// Tệp này đóng kèm trong gói và được electron-builder ghi vào latest.yml (releaseInfo.releaseNotesFile).
//   node scripts/release-notes.cjs            — trong pnpm build: chưa có mục ⇒ chỉ cảnh báo (bản dev chạy bình thường)
//   node scripts/release-notes.cjs --strict   — trước khi đóng gói: chưa có mục ⇒ dừng
const { existsSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { notesFor } = require('../dist/release-notes.js');

const root = join(__dirname, '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, 'dist', 'release-notes.json');
const notes = notesFor(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version);
if (!notes) {
  if (existsSync(out)) rmSync(out);
  const msg = `CHANGELOG.md chưa có mục "## ${version}" đủ "### vi" và "### en" — viết điểm mới của bản này trước khi đóng gói`;
  if (process.argv.includes('--strict')) { console.error(msg); process.exit(1); }
  console.warn(`release-notes: ${msg}`);
} else {
  writeFileSync(out, JSON.stringify(notes));
  console.log(`release-notes: ${out} (${version})`);
}

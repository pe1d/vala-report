// Sau `vite build`: ghi dist/ui-manifest.json — danh sách tệp giao diện cổng + mã băm SHA-256. Vala Desktop đọc tệp này
// (<máy chủ>/ui-manifest.json) để tải gói giao diện về máy và chạy cổng từ bản trong máy (apps/desktop/src/ui-cache.ts);
// deploy web mới ⇒ version đổi ⇒ ứng dụng tự tải bản mới, không cần phát hành Vala Desktop.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// Thư mục build: mặc định apps/web/dist; truyền đường dẫn khác làm tham số (kiểm thử).
const dist = process.argv[2] ? resolve(process.argv[2]) : new URL('../dist/', import.meta.url).pathname;
const base = `/${(process.env.VITE_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const rel = relative(dist, p).split(sep).join('/');
    if (rel === 'ui-manifest.json') continue;
    const buf = readFileSync(p);
    files[rel] = { sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length };
  }
};
walk(dist);
const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
writeFileSync(join(dist, 'ui-manifest.json'), JSON.stringify({ format: 1, version, base, files }, null, 1));
console.log(`ui-manifest: ${Object.keys(files).length} tệp, bản ${version}, base ${base}`);

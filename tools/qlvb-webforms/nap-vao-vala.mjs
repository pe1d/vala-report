// Đưa "QLVB Thử nghiệm" (hệ thống ASP.NET WebForms giả lập, T07) vào Vala như một nguồn thật, qua API quản trị — để dựng
// lại môi trường thử. Chạy lại bao nhiêu lần cũng được (có thì cập nhật):
//   1. Hệ thống nguồn qlvb_thu + adapter (adapter.yaml) — kết nối bằng phiên Vala Desktop gửi;
//   2. spider qlvb_thu_van_ban (spider.py, dùng vala_sdk.WebForm) + Đồng bộ Crawlab (đẩy cả vala_sdk.py);
//   3. báo cáo "Văn bản (QLVB thử nghiệm)" (tạo SAU spider: báo cáo tự gắn spider đầu tiên của nguồn);
//   4. gói kịch bản Desktop qlvb_thu (kich-ban.js) — gắn với nguồn để "Chạy thử trên máy chủ" được.
//
//   VALA_PASSWORD=… node tools/qlvb-webforms/nap-vao-vala.mjs
// Biến môi trường: VALA_API (mặc định http://localhost:3000/api/v1), VALA_USER (mặc định ops — quản trị vận hành),
// VALA_PASSWORD (bắt buộc), QLVB_URL (địa chỉ hệ thống giả lập, mặc định http://localhost:4030).
import { readFileSync } from 'node:fs';

const API = (process.env.VALA_API ?? 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const USER = process.env.VALA_USER ?? 'ops';
const PASS = process.env.VALA_PASSWORD;
const BASE = (process.env.QLVB_URL ?? 'http://localhost:4030').replace(/\/+$/, '');
const SOURCE = 'qlvb_thu';
const SPIDER = 'qlvb_thu_van_ban';
const REPORT = 'qlvb_thu_van_ban';
const PACKAGE = 'qlvb_thu';
if (!PASS) { console.error('Thiếu VALA_PASSWORD (mật khẩu tài khoản quản trị vận hành)'); process.exit(1); }
const file = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

let token = null;
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'accept-language': 'vi', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
}
function must(r, what) {
  if (r.status >= 300) { console.error(`${what} lỗi: HTTP ${r.status} ${r.json?.title ?? ''} ${r.json?.detail ?? ''}`); process.exit(1); }
  return r.json;
}

token = must(await call('POST', '/auth/login', { username: USER, password: PASS }), 'Đăng nhập').access_token;

// 1. Nguồn + adapter
const sources = must(await call('GET', '/admin/sources'), 'Đọc danh sách nguồn');
const exists = (Array.isArray(sources) ? sources : sources.sources ?? []).some((s) => s.code === SOURCE);
if (!exists) {
  must(await call('POST', '/admin/sources', { code: SOURCE, ten: 'QLVB Thử nghiệm (WebForms)', base_url: BASE, mfa: 'khong',
    mo_ta: 'Hệ thống ASP.NET WebForms giả lập (tools/qlvb-webforms) — thử tích hợp hệ thống không có API (T07)',
    adapter_yaml: file('adapter.yaml') }), 'Tạo nguồn');
  console.log(`Đã tạo nguồn ${SOURCE}`);
} else {
  must(await call('PATCH', `/admin/sources/${SOURCE}`, { base_url: BASE }), 'Cập nhật nguồn');
  must(await call('PUT', `/admin/sources/${SOURCE}/adapter`, { yaml: file('adapter.yaml') }), 'Cập nhật adapter');
  console.log(`Đã cập nhật nguồn ${SOURCE}`);
}

// 2. Spider + Đồng bộ Crawlab
const spider = { ten: 'QLVB thử — danh sách văn bản', source_system: SOURCE, main_py: file('spider.py'),
  mo_ta: 'Đọc mọi trang của GridView bằng vala_sdk.WebForm (gửi lại form __doPostBack Page$N)' };
const cur = await call('GET', `/admin/spiders/${SPIDER}`);
must(cur.status === 404 ? await call('POST', '/admin/spiders', { code: SPIDER, ...spider }) : await call('PATCH', `/admin/spiders/${SPIDER}`, spider), 'Lưu spider');
must(await call('POST', '/admin/spiders/sync'), 'Đồng bộ Crawlab');
console.log(`Đã lưu spider ${SPIDER} và đồng bộ Crawlab`);

// 3. Báo cáo
const report = {
  ten: 'Văn bản (QLVB thử nghiệm)', source_system: SOURCE,
  mo_ta: 'Danh sách văn bản của hệ thống WebForms giả lập — lấy bằng spider đọc trang (không có API)',
  definition: {
    dataset: 'records', capability: 'van_ban', mode: 'list', date_field: 'ngay_tao', default_period: 'tat_ca', keyword_field: 'trich_yeu',
    param_filters: [{ field: 'trang_thai' }, { field: 'loai' }],
    columns: ['ma', 'so_ky_hieu', 'trich_yeu', 'loai', 'trang_thai', 'ngay_tao', 'nguoi_xu_ly'].map((field) => ({ field })),
    sort: { by: 'ngay_tao', dir: 'desc' },
  },
};
const reports = must(await call('GET', '/admin/reports'), 'Đọc danh sách báo cáo');
const hasReport = (Array.isArray(reports) ? reports : reports.reports ?? []).some((r) => r.code === REPORT);
must(hasReport ? await call('PATCH', `/admin/reports/${REPORT}`, report) : await call('POST', '/admin/reports', { code: REPORT, ...report }), 'Lưu báo cáo');
console.log(`Đã ${hasReport ? 'cập nhật' : 'tạo'} báo cáo ${REPORT}`);

// 4. Gói kịch bản Desktop
const goi = {
  ten: 'QLVB Thử nghiệm (WebForms giả lập)',
  mo_ta: 'T07 — 7 thao tác văn bản bằng vala.webform: danh mục, danh sách, chi tiết, tạo dự thảo, chuyển, kết thúc, phát hành',
  source_system: SOURCE, matches: [`${BASE}/*`], css: '', script: file('kich-ban.js'),
};
const pkg = await call('GET', `/admin/desktop-packages/${PACKAGE}`);
const saved = must(pkg.status === 404 ? await call('POST', '/admin/desktop-packages', { code: PACKAGE, ...goi }) : await call('PATCH', `/admin/desktop-packages/${PACKAGE}`, goi), 'Lưu gói kịch bản');
console.log(`Đã lưu gói kịch bản ${PACKAGE}, phiên bản ${saved?.version ?? '?'}`);

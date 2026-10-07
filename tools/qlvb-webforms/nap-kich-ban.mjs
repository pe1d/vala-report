// Nạp / cập nhật gói kịch bản "QLVB Thử nghiệm" (kich-ban.js) vào CSDL qua API quản trị — để dựng lại môi trường thử.
//   VALA_PASSWORD=… node tools/qlvb-webforms/nap-kich-ban.mjs
// Biến môi trường: VALA_API (mặc định http://localhost:3000/api/v1), VALA_USER (mặc định ops — quản trị vận hành),
// VALA_PASSWORD (bắt buộc), QLVB_URL (địa chỉ hệ thống giả lập, mặc định http://localhost:4030),
// QLVB_SOURCE (mã hệ thống nguồn gắn với gói, mặc định để trống — phần 4 đăng ký nguồn qlvb_thu).
// Máy chủ ký gói khi lưu; mỗi lần nội dung đổi thì phiên bản tăng, Vala Desktop tải bản mới trong 15 phút.
import { readFileSync } from 'node:fs';

const API = (process.env.VALA_API ?? 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const USER = process.env.VALA_USER ?? 'ops';
const PASS = process.env.VALA_PASSWORD;
const BASE = (process.env.QLVB_URL ?? 'http://localhost:4030').replace(/\/+$/, '');
const CODE = 'qlvb_thu';
if (!PASS) { console.error('Thiếu VALA_PASSWORD (mật khẩu tài khoản quản trị vận hành)'); process.exit(1); }

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { 'content-type': 'application/json', 'accept-language': 'vi', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
}

const login = await call('POST', '/auth/login', null, { username: USER, password: PASS });
if (login.status !== 200) { console.error('Đăng nhập lỗi:', login.status, login.json?.title ?? ''); process.exit(1); }
const token = login.json.access_token;

const goi = {
  ten: 'QLVB Thử nghiệm (WebForms giả lập)',
  mo_ta: 'T07 — 7 thao tác văn bản bằng vala.webform: danh mục, danh sách, chi tiết, tạo dự thảo, chuyển, kết thúc, phát hành',
  source_system: process.env.QLVB_SOURCE || null,
  matches: [`${BASE}/*`],
  css: '',
  script: readFileSync(new URL('./kich-ban.js', import.meta.url), 'utf8'),
};
const cur = await call('GET', `/admin/desktop-packages/${CODE}`, token);
const r = cur.status === 404
  ? await call('POST', '/admin/desktop-packages', token, { code: CODE, ...goi })
  : await call('PATCH', `/admin/desktop-packages/${CODE}`, token, goi);
if (r.status >= 300) { console.error('Lưu gói lỗi:', r.status, r.json?.title ?? '', r.json?.detail ?? ''); process.exit(1); }
console.log(`${cur.status === 404 ? 'Đã tạo' : 'Đã cập nhật'} gói ${CODE}, phiên bản ${r.json?.version ?? '?'}`);

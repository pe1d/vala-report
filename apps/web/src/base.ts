/**
 * Đường dẫn con khi cổng chạy dưới một thư mục (vd https://qtttboard-demo.demozone.vn:5443/vala-report). Lấy từ `base`
 * lúc build (VITE_BASE_PATH) — rỗng khi chạy ở gốc. Mọi URL tuyệt đối tới API / trang của cổng đi qua đây.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
/** Đường dẫn trong ứng dụng (bỏ phần đường dẫn con), vd /vala-report/uy-quyen → /uy-quyen. */
export const appPath = (pathname = window.location.pathname) =>
  BASE && (pathname === BASE || pathname.startsWith(`${BASE}/`)) ? pathname.slice(BASE.length) || '/' : pathname;

/**
 * Đường dẫn gốc của cổng: '' khi chạy ở gốc tên miền, '/vala-report' khi chạy dưới đường dẫn con
 * (build với WEB_BASE_PATH=/vala-report — xem vite.config.ts). Mọi URL tuyệt đối tới /api hay trang của cổng đi qua đây.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Đường dẫn trình duyệt (có BASE) → đường dẫn trong router (không có BASE). */
export const stripBase = (path: string): string =>
  BASE && (path === BASE || path.startsWith(`${BASE}/`)) ? path.slice(BASE.length) || '/' : path;

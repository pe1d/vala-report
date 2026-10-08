/**
 * API của cổng web: client dùng chung ở @vala/ui (kiểu dữ liệu, ApiProblem, định dạng); ở đây chỉ cấu hình cách gửi —
 * gọi thẳng máy chủ bằng token cổng (localStorage), 401 ⇒ quên token và báo App đưa người dùng về đăng nhập.
 */
import { configureApi } from '@vala/ui/api';
import { BASE } from './base';

export * from '@vala/ui/api';

const TOKEN_KEY = 'vala.token';
export const auth = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ } },
};

configureApi(async (method, path, body, lang) => {
  const headers: Record<string, string> = { 'Accept-Language': lang };
  const token = auth.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return { status: 204, ok: true };
  if (!res.ok && res.status === 401 && token) {
    // Phiên đăng nhập cổng hết hạn: báo App đưa người dùng về màn hình đăng nhập.
    auth.set(null);
    try { sessionStorage.setItem('vala.reauth', '1'); } catch { /* bỏ qua */ }
    window.dispatchEvent(new Event('vala:unauthorized'));
  }
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('json') ? { status: res.status, ok: res.ok, json: await res.json() } : { status: res.status, ok: res.ok, blob: await res.blob() };
});

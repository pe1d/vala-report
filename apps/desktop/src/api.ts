/**
 * Gọi API Vala (/api/v1/ext/*) bằng token thiết bị — cùng giao thức với tiện ích (apps/extension/src/shared.ts api()).
 * Dùng net.fetch (mạng của Chromium) chứ không dùng fetch của Node: theo đúng proxy hệ thống và chứng chỉ của máy.
 */
import { net } from 'electron';
import { messages } from './i18n';
import { getSettings, setSettings, type Settings } from './settings';

const M = messages({
  noServer: 'Chưa cấu hình địa chỉ máy chủ Vala',
  network: 'Không kết nối được máy chủ Vala',
  http: (n: number) => `Lỗi HTTP ${n}`,
}, {
  noServer: 'Vala server address is not set',
  network: 'Cannot reach the Vala server',
  http: (n: number) => `HTTP error ${n}`,
});

export class ApiError extends Error {
  constructor(readonly status: number, readonly type: string, title: string, readonly detail?: string) {
    super(title);
  }
}

export async function api<T>(method: string, path: string, body?: unknown, s?: Settings): Promise<T> {
  const st = s ?? getSettings();
  const t = M[st.lang];
  if (!st.serverUrl) throw new ApiError(0, 'no_server', t.noServer);
  const headers: Record<string, string> = { 'Accept-Language': st.lang };
  if (st.deviceToken) headers.Authorization = `Bearer ${st.deviceToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await net.fetch(`${st.serverUrl}/api/v1${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', t.network);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { type?: string; title?: string; detail?: string };
  if (!res.ok) {
    // Token bị thu hồi trên cổng / hết hạn ⇒ quên token, lần sau hiện màn hình đăng nhập.
    if (res.status === 401 && st.deviceToken) setSettings({ deviceToken: null, user: null });
    throw new ApiError(res.status, json.type ?? 'internal', json.title ?? t.http(res.status), json.detail);
  }
  return json as T;
}

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Nói chuyện với tiện ích trình duyệt Vala qua window.postMessage (tiện ích tiêm bridge.js vào đúng origin cổng).
 * Không có token hay cookie nào đi qua kênh này — chỉ "có tiện ích không", "bắt đầu kết nối", "đã kết nối".
 */
export interface ExtensionInfo {
  installed: boolean; logged_in: boolean; email: string | null; version?: string;
  /** Đang chạy trong Vala Desktop (không phải tiện ích Chrome) + tên thiết bị để hiện ở danh sách. */
  desktop?: boolean; device?: string;
  /** Vala Desktop chạy được thao tác của gói kịch bản (trang Kịch bản Desktop → Chạy thử). */
  scripts?: boolean;
  /** Vala Desktop đã đăng nhập (màn hình đăng nhập của app) ⇒ cấp sẵn phiên cổng, tab Báo cáo không phải đăng nhập lại. */
  portal_token?: string;
}
export type ExtensionEvent =
  | { type: 'connect-started'; code: string; status: string; message?: string }
  | { type: 'connected'; code: string; ten: string }
  | { type: 'connect-failed'; code: string; ten: string; message: string };

const OUT = 'vala-portal';
const IN = 'vala-extension';

export function useValaExtension(onEvent: (e: ExtensionEvent) => void) {
  const [info, setInfo] = useState<ExtensionInfo | null>(null);
  // Giữ handler mới nhất trong ref để listener chỉ gắn một lần (tránh ping lặp mỗi lần render).
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; type?: string } & Record<string, unknown>;
      if (d?.source !== IN) return;
      if (d.type === 'ready') setInfo({
        installed: true, logged_in: !!d.logged_in, email: (d.email as string) ?? null, version: d.version as string,
        desktop: d.desktop === true, device: typeof d.device === 'string' ? d.device : undefined, scripts: d.scripts === true,
        portal_token: typeof d.portal_token === 'string' ? d.portal_token : undefined,
      });
      else if (d.type === 'action-result') return;   // kết quả thao tác: desktopAction() tự nhận
      else handler.current(d as unknown as ExtensionEvent);
    };
    window.addEventListener('message', on);
    const ping = () => window.postMessage({ source: OUT, type: 'ping' }, window.location.origin);
    ping();
    // Tiện ích có thể tiêm bridge chậm hơn trang một chút; hỏi lại vài lần, và mỗi khi người dùng quay lại tab.
    const t = [300, 1200, 3000].map((ms) => setTimeout(ping, ms));
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('message', on); t.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const connect = useCallback((code: string) => window.postMessage({ source: OUT, type: 'connect', code }, window.location.origin), []);
  return { info, connect };
}

/** Chuyển token thiết bị cho Vala Desktop qua cầu nối (portal-preload của ứng dụng nhận, kiểm origin rồi mới lưu). */
export const sendDeviceToken = (token: string, user: { ho_ten: string; email: string }) =>
  window.postMessage({ source: OUT, type: 'device-token', token, user }, window.location.origin);

export interface DesktopActionInfo { name: string; pkg: string | null; mo_ta: string; params?: Record<string, string> | null }
export type DesktopActionResult =
  | { ok: true; result?: unknown; actions?: DesktopActionInfo[] }
  | { ok: false; error: string };

/**
 * Gọi Vala Desktop chạy thao tác của gói kịch bản trong tab hệ thống nguồn (bằng phiên người dùng trong ứng dụng):
 * 'list-actions' ⇒ các thao tác trang đang có; 'run-action' ⇒ chạy một thao tác. Ghép kết quả theo id.
 */
export function desktopAction(type: 'list-actions', source: string): Promise<DesktopActionResult>;
export function desktopAction(type: 'run-action', source: string, name: string, args: Record<string, unknown>): Promise<DesktopActionResult>;
export function desktopAction(type: 'list-actions' | 'run-action', source: string, name?: string, args?: Record<string, unknown>, timeoutMs = 90_000): Promise<DesktopActionResult> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve) => {
    const done = (r: DesktopActionResult) => { window.removeEventListener('message', on); clearTimeout(timer); resolve(r); };
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; type?: string; id?: string } & Record<string, unknown>;
      if (d?.source !== IN || d.type !== 'action-result' || d.id !== id) return;
      done(d.ok ? { ok: true, result: d.result, actions: d.actions as DesktopActionInfo[] | undefined } : { ok: false, error: String(d.error ?? '') });
    };
    const timer = setTimeout(() => done({ ok: false, error: 'timeout' }), timeoutMs);
    window.addEventListener('message', on);
    window.postMessage({ source: OUT, type, id, source_system: source, ...(type === 'run-action' ? { name, args } : {}) }, window.location.origin);
  });
}

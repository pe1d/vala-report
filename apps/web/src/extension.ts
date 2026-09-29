import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Nói chuyện với tiện ích trình duyệt Vala qua window.postMessage (tiện ích tiêm bridge.js vào đúng origin cổng).
 * Không có token hay cookie nào đi qua kênh này — chỉ "có tiện ích không", "bắt đầu kết nối", "đã kết nối".
 */
export interface ExtensionInfo { installed: boolean; logged_in: boolean; email: string | null; version?: string }
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
      if (d.type === 'ready') setInfo({ installed: true, logged_in: !!d.logged_in, email: (d.email as string) ?? null, version: d.version as string });
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

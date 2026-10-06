/**
 * Preload của cửa sổ chính / cổng báo cáo: giả lập cầu nối của tiện ích (apps/extension/src/bridge.ts) để cổng Vala
 * (apps/web/src/extension.ts) thấy "đã có tiện ích" và gọi được luồng kết nối. Chỉ trạng thái đi qua đây — không token,
 * không cookie. Tiến trình chính tự kiểm origin của trang trước khi trả lời (windows.ts fromPortal).
 */
import { ipcRenderer } from 'electron';

const IN = 'vala-portal';
const OUT = 'vala-extension';
const post = (data: Record<string, unknown>) => window.postMessage({ source: OUT, ...data }, location.origin);

async function hello() {
  const r = (await ipcRenderer.invoke('vala:bridge-hello').catch(() => null)) as Record<string, unknown> | null;
  if (r) post({ type: 'ready', ...r });
}

window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data as { source?: string; type?: string; code?: unknown };
  if (d?.source !== IN) return;
  if (d.type === 'ping') void hello();
  if (d.type === 'connect' && typeof d.code === 'string' && /^[a-z0-9_]{1,40}$/.test(d.code)) {
    const code = d.code;
    ipcRenderer.invoke('vala:connect', code).then(
      (r: Record<string, unknown>) => post({ type: 'connect-started', code, ...r }),
      () => post({ type: 'connect-started', code, status: 'error' }));
  }
});

ipcRenderer.on('vala:event', (_e, m: { type?: string }) => {
  if (m?.type === 'connected' || m?.type === 'connect-failed') post(m as Record<string, unknown>);
});

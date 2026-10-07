/**
 * Preload của các tab: giả lập cầu nối của tiện ích (apps/extension/src/bridge.ts) để cổng Vala (apps/web/src/extension.ts)
 * thấy "đã có Vala Desktop", gọi được luồng kết nối, và chuyển token thiết bị khi người dùng đăng nhập cổng trong ứng dụng.
 * Không cookie nào đi qua đây. Tiến trình chính tự kiểm origin của trang trước khi trả lời (windows.ts fromPortal).
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
  const d = e.data as { source?: string; type?: string; code?: unknown; token?: unknown; user?: unknown };
  if (d?.source !== IN) return;
  if (d.type === 'ping') void hello();
  // Cổng vừa cấp token thiết bị cho ứng dụng (người dùng đã đăng nhập cổng) — tiến trình chính kiểm origin rồi mới nhận.
  if (d.type === 'device-token' && typeof d.token === 'string') {
    void ipcRenderer.invoke('vala:device-token', { token: d.token, user: d.user }).then((ok) => { if (ok) void hello(); });
  }
  // Thao tác của gói kịch bản trong tab hệ thống nguồn (trang quản trị "Kịch bản Desktop" → Chạy thử). id để cổng ghép kết quả.
  const req = d as { id?: unknown; source_system?: unknown; name?: unknown; args?: unknown };
  if ((d.type === 'list-actions' || d.type === 'run-action') && typeof req.id === 'string' && req.id.length <= 64) {
    const id = req.id;
    const call = d.type === 'list-actions'
      ? ipcRenderer.invoke('vala:list-actions', req.source_system)
      : ipcRenderer.invoke('vala:run-action', { source: req.source_system, name: req.name, args: req.args });
    call.then(
      (r: Record<string, unknown>) => post({ ...r, type: 'action-result', id }),
      (err: Error) => post({ type: 'action-result', id, ok: false, error: String(err?.message ?? err) }));
  }
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

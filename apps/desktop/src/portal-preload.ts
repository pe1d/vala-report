/**
 * Preload của các tab: giả lập cầu nối của tiện ích (apps/extension/src/bridge.ts) để cổng Vala (apps/web/src/extension.ts)
 * thấy "đã có Vala Desktop", gọi được luồng kết nối, và chuyển token thiết bị khi người dùng đăng nhập cổng trong ứng dụng.
 * Không cookie nào đi qua đây. Tiến trình chính tự kiểm origin của trang trước khi trả lời (windows.ts fromPortal).
 */
import { ipcRenderer, webFrame } from 'electron';

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
  // Người đăng nhập cổng có mật khẩu không (menu hồ sơ của app hiện "Đổi mật khẩu").
  if (d.type === 'portal-user') {
    void ipcRenderer.invoke('vala:portal-user', { has_password: (d as { has_password?: unknown }).has_password });
  }
  // Cổng đổi ngôn ngữ / sáng-tối ⇒ báo ứng dụng (tiến trình chính kiểm origin, giá trị lạ bị bỏ qua).
  if (d.type === 'set-prefs') {
    const p = d as { lang?: unknown; theme?: unknown };
    void ipcRenderer.invoke('vala:set-prefs', { lang: p.lang, theme: p.theme });
  }
  if (d.type === 'connect' && typeof d.code === 'string' && /^[a-z0-9_]{1,40}$/.test(d.code)) {
    const code = d.code;
    ipcRenderer.invoke('vala:connect', code).then(
      (r: Record<string, unknown>) => post({ type: 'connect-started', code, ...r }),
      () => post({ type: 'connect-started', code, status: 'error' }));
  }
});

// ---- Người dùng tự đăng nhập hệ thống nguồn ⇒ hỏi lưu mật khẩu (T08) ----
// Chỉ theo dõi khi tiến trình chính xác nhận trang này là trang đăng nhập của một nguồn (autofill.ts sourceForUrl) — trang
// khác không bao giờ gửi gì. Lấy ô mật khẩu có giá trị + ô tên đăng nhập đứng trước nó, như phần tự điền.
let watchLogin = false;
void ipcRenderer.invoke('vala:login-host').then((ok) => { watchLogin = ok === true; }, () => {});
let lastSent = 0;
function captureLogin(scope: ParentNode) {
  if (!watchLogin || Date.now() - lastSent < 3000) return;
  const vis = (el: HTMLInputElement) => el.getClientRects().length > 0;
  const pw = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type=password]')).find((p) => p.value && vis(p));
  if (!pw) return;
  const inputs = Array.from((pw.form ?? document).querySelectorAll<HTMLInputElement>('input')).filter(vis);
  const user = inputs.slice(0, inputs.indexOf(pw)).reverse().find((i) => /^(text|email|tel|)$/i.test(i.getAttribute('type') ?? ''));
  if (!user?.value) return;
  lastSent = Date.now();
  void ipcRenderer.invoke('vala:login-captured', { username: user.value, password: pw.value });
}
window.addEventListener('submit', (e) => captureLogin((e.target as HTMLFormElement) ?? document), true);
window.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.('button, input[type=submit], input[type=button], a');
  if (b) captureLogin(b.closest('form') ?? document);
}, true);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target instanceof HTMLInputElement) captureLogin(e.target.form ?? document);
}, true);

// ---- Thông báo do chính trang tạo (vd tin nhắn Vala trên vala.bkav.com) ----
// Trang bấm thông báo thường chỉ gọi window.focus() — trong ứng dụng, trang nằm trong một tab nên lệnh đó không đưa được
// cửa sổ lên. Bọc window.Notification ở thế giới của trang (trước khi trang chạy): bấm thông báo ⇒ báo tiến trình chính
// đưa cửa sổ lên và chuyển sang đúng tab này; xử lý riêng của trang (mở cuộc trò chuyện…) vẫn chạy như cũ.
void webFrame.executeJavaScript(`(() => {
  const N = window.Notification;
  if (!N || N.__vala) return;
  const V = function Notification(title, options) {
    const n = new N(title, options);
    n.addEventListener('click', () => window.postMessage({ source: 'vala-web-notification', type: 'click' }, location.origin));
    return n;
  };
  V.prototype = N.prototype;
  Object.defineProperty(V, 'permission', { get: () => N.permission });
  Object.defineProperty(V, 'maxActions', { get: () => N.maxActions });
  V.requestPermission = (...a) => N.requestPermission(...a);
  V.__vala = true;
  window.Notification = V;
})()`).catch(() => { /* trang không cho chạy (vd about:blank) */ });
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data as { source?: string; type?: string };
  if (d?.source === 'vala-web-notification' && d.type === 'click') ipcRenderer.send('vala:web-notification-click');
});

ipcRenderer.on('vala:event', (_e, m: { type?: string }) => {
  if (m?.type === 'connected' || m?.type === 'connect-failed' || m?.type === 'prefs' || m?.type === 'command') post(m as Record<string, unknown>);
});

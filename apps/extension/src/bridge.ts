/**
 * Cầu nối cổng Vala ↔ tiện ích (content script). Chỉ được tiêm vào đúng origin máy chủ Vala đã cấu hình.
 * Trang cổng gửi window.postMessage({ source: 'vala-portal', type: 'ping' | 'connect', code }) ;
 * tiện ích trả lời bằng { source: 'vala-extension', type: 'ready' | 'connect-started' | 'connected' | 'connect-failed' }.
 * Không có token hay cookie nào đi qua đây — chỉ trạng thái.
 *
 * Tệp này KHÔNG được import gì: content script không chạy dạng ES module.
 */
const IN = 'vala-portal';
const OUT = 'vala-extension';
const post = (data: Record<string, unknown>) => window.postMessage({ source: OUT, ...data }, location.origin);

async function hello() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'bridge-hello' });
    post({ type: 'ready', ...r });
  } catch { /* tiện ích vừa được cập nhật: trang cần tải lại */ }
}

const w = window as unknown as { __valaBridge?: boolean };
if (!w.__valaBridge) {
  w.__valaBridge = true;
  // Ngôn ngữ của tiện ích (khoá 'lang', như i18n.ts — không import được). Đọc sẵn: lúc cần báo lỗi thì tiện ích có thể
  // vừa được cập nhật và storage cũng không đọc được nữa.
  let lang: 'vi' | 'en' = 'vi';
  const NO_REPLY = { vi: 'Tiện ích không phản hồi — tải lại trang', en: 'The extension is not responding — reload the page' };
  chrome.storage.local.get('lang').then((r) => { lang = r.lang === 'en' ? 'en' : 'vi'; }, () => {});
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && 'lang' in ch) lang = ch.lang?.newValue === 'en' ? 'en' : 'vi'; });
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data as { source?: string; type?: string; code?: unknown };
    if (d?.source !== IN) return;
    if (d.type === 'ping') void hello();
    if (d.type === 'connect' && typeof d.code === 'string' && /^[a-z0-9_]{1,40}$/.test(d.code)) {
      const code = d.code;
      chrome.runtime.sendMessage({ type: 'connect', code }).then(
        (r: Record<string, unknown>) => post({ type: 'connect-started', code, ...r }),
        () => post({ type: 'connect-started', code, status: 'error', message: NO_REPLY[lang] }));
    }
  });
  chrome.runtime.onMessage.addListener((m: { type?: string }) => {
    if (m?.type === 'connected' || m?.type === 'connect-failed') post(m as Record<string, unknown>);
  });
}
void hello();

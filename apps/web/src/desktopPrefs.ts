/**
 * Trong Vala Desktop: ngôn ngữ + sáng/tối của cổng là MỘT với lựa chọn của ứng dụng (thanh tab, Cài đặt).
 *   - Ứng dụng báo lựa chọn khi cầu nối chào ('ready', desktop: true) và mỗi khi đổi ('prefs') ⇒ cổng áp theo.
 *   - Người dùng đổi ngay trong cổng ⇒ báo ứng dụng ('set-prefs') ⇒ thanh tab và các tab Báo cáo khác đổi theo.
 * Cùng kênh: cổng biết mình đang ở trong app (ẩn header — thanh tab đã có, gồm cả hồ sơ / đổi mật khẩu).
 * Ngoài Vala Desktop (trình duyệt thường, tiện ích Chrome) không làm gì. Chỉ nhận tin từ chính cửa sổ, đúng origin.
 */
import { useSyncExternalStore } from 'react';
import { LANGS, onLangChange, setLang, type Lang } from './i18n';
import { normTheme, onThemeChange, setTheme } from './theme';

const OUT = 'vala-portal';
const IN = 'vala-extension';
let inDesktop = false;
const listeners = new Set<() => void>();

const post = (data: Record<string, unknown>) => window.postMessage({ source: OUT, ...data }, window.location.origin);

function applyFromDesktop(d: { lang?: unknown; theme?: unknown }) {
  if (LANGS.some(([l]) => l === d.lang)) setLang(d.lang as Lang, true);
  if (d.theme !== undefined) setTheme(normTheme(d.theme), true);
}

window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const d = e.data as { source?: string; type?: string; desktop?: unknown; lang?: unknown; theme?: unknown };
  if (d?.source !== IN) return;
  if (d.type === 'ready' && d.desktop === true) {
    if (!inDesktop) { inDesktop = true; listeners.forEach((f) => f()); }
    applyFromDesktop(d);
  } else if (d.type === 'prefs' && inDesktop) applyFromDesktop(d);
});

/** Đang chạy trong Vala Desktop (thanh tab của app đã có ngôn ngữ, sáng/tối, hồ sơ ⇒ cổng ẩn header). */
export const useInDesktop = (): boolean => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => inDesktop);

/** Mở một mục của trang Quản trị trong Vala Desktop (vd 'he-thong-nguon') — chỉ có tác dụng khi đang ở trong app. */
export const openDesktopAdmin = (section: string) => { if (inDesktop) post({ type: 'open-admin', section }); };

onLangChange((lang, external) => { if (inDesktop && !external) post({ type: 'set-prefs', lang }); });
onThemeChange((theme, external) => { if (inDesktop && !external) post({ type: 'set-prefs', theme }); });

// Hỏi cầu nối ngay (trang đăng nhập chưa chắc đã hỏi) — trình duyệt thường không có ai trả lời.
post({ type: 'ping' });

/**
 * Trong Vala Desktop: ngôn ngữ + sáng/tối của cổng là MỘT với lựa chọn của ứng dụng (thanh tab, Cài đặt).
 *   - Ứng dụng báo lựa chọn khi cầu nối chào ('ready', desktop: true) và mỗi khi đổi ('prefs') ⇒ cổng áp theo.
 *   - Người dùng đổi ngay trong cổng ⇒ báo ứng dụng ('set-prefs') ⇒ thanh tab và các tab Báo cáo khác đổi theo.
 * Cùng kênh: cổng biết mình đang ở trong app (ẩn header — thanh tab đã có), nhận lệnh từ menu của app.
 * Ngoài Vala Desktop (trình duyệt thường, tiện ích Chrome) không làm gì. Chỉ nhận tin từ chính cửa sổ, đúng origin.
 */
import { useSyncExternalStore } from 'react';
import { LANGS, onLangChange, setLang, type Lang } from './i18n';
import { normTheme, onThemeChange, setTheme } from './theme';

const OUT = 'vala-portal';
const IN = 'vala-extension';
let inDesktop = false;
const listeners = new Set<() => void>();
const commandHandlers = new Set<(name: string) => void>();
let portalUser: { has_password: boolean } | null = null;

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
    if (!inDesktop) { inDesktop = true; listeners.forEach((f) => f()); if (portalUser) post({ type: 'portal-user', ...portalUser }); }
    applyFromDesktop(d);
  } else if (d.type === 'prefs' && inDesktop) applyFromDesktop(d);
  // Lệnh từ menu của ứng dụng (vd "Đổi mật khẩu" trong menu hồ sơ trên thanh tab).
  else if (d.type === 'command' && inDesktop && typeof (d as { name?: unknown }).name === 'string') {
    const name = (d as { name: string }).name;
    commandHandlers.forEach((f) => f(name));
  }
});

/** Đang chạy trong Vala Desktop (thanh tab của app đã có ngôn ngữ, sáng/tối, hồ sơ ⇒ cổng ẩn header). */
export const useInDesktop = (): boolean => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => inDesktop);

/** Nhận lệnh từ menu của ứng dụng. */
export const onDesktopCommand = (f: (name: string) => void) => { commandHandlers.add(f); return () => { commandHandlers.delete(f); }; };

/** Báo ứng dụng người đang đăng nhập cổng có mật khẩu không (menu hồ sơ của app hiện "Đổi mật khẩu" khi có). */
export function reportPortalUser(u: { has_password: boolean } | null) {
  portalUser = u;
  if (inDesktop && u) post({ type: 'portal-user', ...u });
}

onLangChange((lang, external) => { if (inDesktop && !external) post({ type: 'set-prefs', lang }); });
onThemeChange((theme, external) => { if (inDesktop && !external) post({ type: 'set-prefs', theme }); });

// Hỏi cầu nối ngay (trang đăng nhập chưa chắc đã hỏi) — trình duyệt thường không có ai trả lời.
post({ type: 'ping' });

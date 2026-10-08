import { useSyncExternalStore } from 'react';

/**
 * Chế độ giao diện. "system" theo hệ điều hành và tự đổi khi hệ điều hành đổi. Một kho chung cho cả trang (mọi nút sáng/tối
 * cùng đổi); trong Vala Desktop đồng bộ hai chiều với lựa chọn của ứng dụng (desktopPrefs.ts).
 */
export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'vala.theme';

export const normTheme = (v: unknown): ThemeMode => (v === 'light' || v === 'dark' ? v : 'system');

function read(): ThemeMode {
  try { return normTheme(localStorage.getItem(KEY)); } catch { return 'system'; }
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function apply(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
}

let current: ThemeMode = read();
const listeners = new Set<() => void>();
/** Theo dõi thay đổi: external = đổi theo lựa chọn của Vala Desktop (không báo ngược lại). */
const watchers = new Set<(m: ThemeMode, external: boolean) => void>();
apply(current);
media().addEventListener('change', () => { if (current === 'system') apply('system'); });

export const getTheme = (): ThemeMode => current;
export function setTheme(m: ThemeMode, external = false) {
  if (m === current) return;
  current = m;
  apply(m);
  try { localStorage.setItem(KEY, m); } catch { /* trình duyệt chặn lưu trữ: vẫn đổi được trong phiên */ }
  listeners.forEach((f) => f());
  watchers.forEach((f) => f(m, external));
}
export const onThemeChange = (f: (m: ThemeMode, external: boolean) => void) => { watchers.add(f); return () => { watchers.delete(f); }; };
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function useTheme() {
  const mode = useSyncExternalStore(subscribe, getTheme);
  return [mode, (m: ThemeMode) => setTheme(m)] as const;
}

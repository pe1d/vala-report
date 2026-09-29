import { useEffect, useState } from 'react';

/** Chế độ giao diện. "system" theo hệ điều hành và tự đổi khi hệ điều hành đổi. */
export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'vala.theme';

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function apply(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(read);
  useEffect(() => {
    apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* trình duyệt chặn lưu trữ: vẫn đổi được trong phiên */ }
    if (mode !== 'system') return;
    const m = media();
    const onChange = () => apply('system');
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [mode]);
  return [mode, setMode] as const;
}

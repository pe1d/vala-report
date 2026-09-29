import { useEffect, useState } from 'react';

/**
 * Bảng màu biểu đồ — theo palette tham chiếu của skill dataviz, đã chạy validator trên đúng nền thẻ của
 * cổng (sáng #ffffff, tối slate-900 #0f172a): 3 màu hạng mục đầu đạt mọi mức kiểm cả hai chế độ.
 * Màu thứ 3 (xanh ngọc) ở chế độ sáng chỉ 2,82:1 với nền ⇒ biểu đồ dùng nó phải có nhãn số trực tiếp.
 * Chữ (nhãn, giá trị, trục) KHÔNG dùng màu dữ liệu — luôn dùng token chữ.
 */
export interface VizTokens {
  surface: string; text: string; text2: string; muted: string; grid: string; baseline: string; empty: string;
  series: [string, string, string];
  /** Tuần tự một màu (xanh), thấp → cao. Chế độ tối: thấp chìm về nền. */
  seq: string[];
  status: { good: string; warning: string; serious: string; critical: string };
}

const LIGHT: VizTokens = {
  surface: '#ffffff', text: '#0f172a', text2: '#475569', muted: '#64748b', grid: '#e2e8f0', baseline: '#cbd5e1', empty: '#f1f5f9',
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
  seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'],
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
};
const DARK: VizTokens = {
  surface: '#0f172a', text: '#f1f5f9', text2: '#cbd5e1', muted: '#94a3b8', grid: '#1e293b', baseline: '#334155', empty: '#1e293b',
  series: ['#3987e5', '#d95926', '#199e70'],
  seq: ['#104281', '#184f95', '#1c5cab', '#256abf', '#3987e5', '#6da7ec'],
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
};

/** Theo dõi class `dark` trên <html> (nút sáng/tối và chế độ "theo hệ thống" đều đổi class này). */
export function useIsDark(): boolean {
  const get = () => document.documentElement.classList.contains('dark');
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(get()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export const useViz = (): VizTokens => (useIsDark() ? DARK : LIGHT);

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Số đếm lên khi xuất hiện (bỏ qua nếu người dùng tắt hiệu ứng chuyển động). */
export function useCountUp(value: number, ms = 800): number {
  const [v, setV] = useState(prefersReducedMotion() ? value : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setV(value); return; }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

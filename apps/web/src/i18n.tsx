/**
 * Song ngữ Việt – Anh (mặc định tiếng Việt). Mỗi file tự khai chữ hiển thị của mình bằng `messages(vi, en)`:
 *
 *   const M = messages({ title: 'Lịch cập nhật', lastRun: (t: string) => `Lần gần nhất ${t}` },
 *                      { title: 'Update schedule', lastRun: (t: string) => `Last run ${t}` });
 *   const t = useT(M);   →   t.title, t.lastRun(fmtDateTime(x))
 *
 * Bản tiếng Anh BẮT BUỘC đủ khoá và cùng kiểu với bản tiếng Việt — thiếu là lỗi kiểu (TypeScript), không thể quên dịch.
 * Ngôn ngữ lưu ở localStorage (vala.lang), áp ngay cho mọi component (useSyncExternalStore), gửi lên máy chủ qua
 * Accept-Language để thông báo lỗi trả về đúng ngôn ngữ.
 */
import { useSyncExternalStore } from 'react';

export type Lang = 'vi' | 'en';
export const LANGS: Array<[Lang, string, string]> = [['vi', 'VI', 'Tiếng Việt'], ['en', 'EN', 'English']];
const KEY = 'vala.lang';

function read(): Lang {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; }
}

let current: Lang = read();
const listeners = new Set<() => void>();
document.documentElement.lang = current;

/** Theo dõi thay đổi: external = đổi theo lựa chọn của Vala Desktop (không báo ngược lại). */
const watchers = new Set<(l: Lang, external: boolean) => void>();

export const getLang = (): Lang => current;
export function setLang(l: Lang, external = false) {
  if (l === current) return;
  current = l;
  document.documentElement.lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* trình duyệt chặn lưu trữ: vẫn đổi được trong phiên */ }
  listeners.forEach((f) => f());
  watchers.forEach((f) => f(l, external));
}
export const onLangChange = (f: (l: Lang, external: boolean) => void) => { watchers.add(f); return () => { watchers.delete(f); }; };
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useLang = (): Lang => useSyncExternalStore(subscribe, getLang);

/** Locale cho định dạng số / ngày theo ngôn ngữ đang chọn (ngày vẫn dd/mm/yyyy ở cả hai). */
export const locale = (l: Lang = current) => (l === 'en' ? 'en-GB' : 'vi-VN');

/** Khai chữ của một màn hình: `en` phải có đúng các khoá và kiểu như `vi`. */
export function messages<T extends object>(vi: T, en: NoInfer<{ [K in keyof T]: T[K] }>): Record<Lang, T> {
  return { vi, en: en as T };
}
/** Chữ theo ngôn ngữ hiện tại, tự đổi khi người dùng chuyển ngôn ngữ. */
export function useT<T>(m: Record<Lang, T>): T {
  return m[useLang()];
}
/** Dùng ngoài component (hàm tiện ích, trình xử lý sự kiện): đọc ngôn ngữ tại thời điểm gọi. */
export const tr = <T,>(m: Record<Lang, T>): T => m[current];

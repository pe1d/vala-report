/**
 * Song ngữ Việt – Anh cho tiện ích (mặc định tiếng Việt) — cùng cách làm với cổng (apps/web/src/i18n.tsx) nhưng là gói
 * build riêng nên không import từ đó. Mỗi file tự khai chữ hiển thị bằng `messages(vi, en)`:
 *
 *   const M = messages({ title: 'Hệ thống nguồn', sent: (t: string) => `gửi lần cuối ${t}` },
 *                      { title: 'Source systems', sent: (t: string) => `last sent ${t}` });
 *   trong component: const t = useT(M) (ui.tsx);   ngoài component: tr(M);   service worker: M[await readLang()]
 *
 * Bản tiếng Anh BẮT BUỘC đủ khoá và cùng kiểu với bản tiếng Việt — thiếu là lỗi kiểu (TypeScript).
 * Ngôn ngữ lưu ở chrome.storage.local (khoá 'lang'), dùng chung cho popup, trang cài đặt và service worker; đổi ở đâu
 * thì mọi nơi đổi theo (chrome.storage.onChanged). Gửi lên máy chủ qua Accept-Language (xem shared.ts api()).
 *
 * Tệp này KHÔNG import React: service worker cũng dùng. Hook useLang/useT ở ui.tsx.
 */
export type Lang = 'vi' | 'en';
export const LANGS: Array<[Lang, string, string]> = [['vi', 'VI', 'Tiếng Việt'], ['en', 'EN', 'English']];
const KEY = 'lang';

const norm = (v: unknown): Lang => (v === 'en' ? 'en' : 'vi');
let current: Lang = 'vi';
const listeners = new Set<() => void>();

function apply(l: Lang) {
  if (l === current) return;
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

/** Ngôn ngữ đã biết gần nhất (đồng bộ). Service worker có thể vừa khởi động lại ⇒ dùng readLang() để chắc chắn. */
export const getLang = (): Lang => current;

/** Đọc ngôn ngữ từ storage (và cập nhật bản nhớ). */
export async function readLang(): Promise<Lang> {
  try { apply(norm((await chrome.storage.local.get(KEY))[KEY])); } catch { /* storage lỗi: giữ ngôn ngữ đang có */ }
  return current;
}

export async function setLang(l: Lang) {
  apply(l);
  await chrome.storage.local.set({ [KEY]: l });
}

export const subscribeLang = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

// Đổi ngôn ngữ ở trang khác (popup ↔ cài đặt) hoặc từ service worker ⇒ áp ngay.
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && KEY in ch) apply(norm(ch[KEY]?.newValue));
});

/** Khoá storage của ngôn ngữ — service worker nghe để sinh lại các thông báo trạng thái đã lưu. */
export const LANG_KEY = KEY;

/** Locale cho định dạng số / ngày theo ngôn ngữ đang chọn (ngày vẫn dd/mm ở cả hai). */
export const locale = (l: Lang = current) => (l === 'en' ? 'en-GB' : 'vi-VN');

/** Khai chữ của một màn hình: `en` phải có đúng các khoá và kiểu như `vi`. */
export function messages<T extends object>(vi: T, en: NoInfer<{ [K in keyof T]: T[K] }>): Record<Lang, T> {
  return { vi, en: en as T };
}

/** Dùng ngoài component (hàm tiện ích, trình xử lý sự kiện): chữ theo ngôn ngữ tại thời điểm gọi. */
export const tr = <T,>(m: Record<Lang, T>): T => m[current];

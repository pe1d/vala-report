/**
 * Song ngữ Việt – Anh (mặc định tiếng Việt), cùng cách làm với tiện ích (apps/extension/src/i18n.ts):
 * mỗi file tự khai chữ hiển thị bằng `messages(vi, en)` rồi dùng `M[getLang()]`.
 * Bản tiếng Anh BẮT BUỘC đủ khoá và cùng kiểu với bản tiếng Việt — thiếu là lỗi kiểu (TypeScript).
 * Ngôn ngữ lưu trong settings.json (xem settings.ts), gửi lên máy chủ qua Accept-Language.
 */
export type Lang = 'vi' | 'en';

export const normLang = (v: unknown): Lang => (v === 'en' ? 'en' : 'vi');

export function messages<T extends object>(vi: T, en: NoInfer<{ [K in keyof T]: T[K] }>): Record<Lang, T> {
  return { vi, en: en as T };
}

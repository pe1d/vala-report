/**
 * Ngôn ngữ + sáng/tối của Vala Desktop — MỘT lựa chọn chung cho thanh tab, cửa sổ Cài đặt và cổng Vala Reporting ở tab
 * Báo cáo: đổi ở đâu (thanh tab hay ngay trong cổng) thì mọi nơi đổi theo.
 *
 * Sáng/tối áp bằng nativeTheme.themeSource: mọi trang trong ứng dụng thấy `prefers-color-scheme` theo lựa chọn này (trang
 * theo hệ thống như cổng, vala.bkav.com… tự đổi theo); 'system' ⇒ theo hệ điều hành.
 * Cổng nhận / gửi qua cầu nối (windows.ts: bridge-hello + 'prefs' / 'vala:set-prefs').
 */
import { EventEmitter } from 'node:events';
import { nativeTheme } from 'electron';
import { normLang, type Lang } from './i18n';
import { getSettings, normTheme, setSettings, type ThemeMode } from './settings';

export interface Prefs { lang: Lang; theme: ThemeMode }

/** 'changed' (Prefs) — ngôn ngữ hoặc sáng/tối vừa đổi. */
export const prefsEvents = new EventEmitter();

export const currentPrefs = (): Prefs => { const s = getSettings(); return { lang: s.lang, theme: s.theme }; };

/** Áp sáng/tối đang lưu cho mọi trang (gọi lúc khởi động). */
export function applyTheme(): void {
  nativeTheme.themeSource = getSettings().theme;
}

/** Đổi ngôn ngữ / sáng/tối (giá trị lạ bị bỏ qua). Trả true nếu có thay đổi. */
export function setPrefs(p: { lang?: unknown; theme?: unknown }): boolean {
  const cur = currentPrefs();
  const next: Prefs = {
    lang: p.lang === undefined ? cur.lang : normLang(p.lang),
    theme: p.theme === undefined ? cur.theme : normTheme(p.theme),
  };
  if (next.lang === cur.lang && next.theme === cur.theme) return false;
  setSettings(next);
  if (next.theme !== cur.theme) nativeTheme.themeSource = next.theme;
  prefsEvents.emit('changed', next);
  return true;
}

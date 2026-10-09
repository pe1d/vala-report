/**
 * Cỡ chữ (người dùng 09/10/2026): phóng CẢ app — thanh bên, header, menu, các trang (ứng dụng web, Trợ lý, Cài đặt, Quản
 * trị, giao diện Văn bản) — theo tài khoản (apps.ts fontPercent, lưu trên máy chủ). Màn hình đăng nhập giữ cỡ gốc.
 *
 * Mỗi lớp (WebContents) phóng riêng bằng setZoomFactor (Electron: trang file:// không dùng chung mức thu phóng); browser.ts
 * nhân kích thước khung (rộng thanh bên, cao header, lề, bo góc) theo zoomFactor() để khớp với trang đã phóng.
 */
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { appsEvents, fontPercent, setFontPercent } from './apps';
import { cleanZoom, stepZoom } from './zoom-model';

/** 'changed' — cỡ chữ vừa đổi (browser.ts sắp lại bố cục khung). */
export const zoomEvents = new EventEmitter();
const tracked = new Set<WebContents>();
let applied = 100;

const current = () => cleanZoom(fontPercent());
export const zoomPercent = current;
/** Tỉ lệ đang áp (1 = 100%). */
export const zoomFactor = (): number => applied / 100;

const apply = (wc: WebContents) => { if (!wc.isDestroyed()) wc.setZoomFactor(zoomFactor()); };

/** Theo dõi một lớp: áp cỡ chữ mỗi lần nạp / điều hướng (trang web: mức thu phóng theo tên miền, đổi khi sang trang khác). */
export function trackZoom(wc: WebContents): void {
  if (tracked.has(wc)) return;
  tracked.add(wc);
  wc.on('did-finish-load', () => apply(wc));
  wc.on('did-navigate', () => apply(wc));
  wc.once('destroyed', () => tracked.delete(wc));
  apply(wc);
}

function refresh(): void {
  const p = current();
  if (p === applied) return;
  applied = p;
  for (const wc of tracked) apply(wc);
  zoomEvents.emit('changed');
}

/** Đổi cỡ chữ: +1 / −1 bước, 0 ⇒ 100%, hoặc một mức cụ thể. */
export function changeZoom(v: 1 | -1 | 0 | { pct: number }): number {
  const next = typeof v === 'object' ? cleanZoom(v.pct) : stepZoom(current(), v);
  void setFontPercent(next);   // đổi bản đệm ngay ⇒ appsEvents 'changed' ⇒ refresh
  return next;
}

export function initZoom(): void {
  applied = current();
  // Danh mục làm mới (đăng nhập / máy khác vừa đổi cỡ chữ / đăng xuất ⇒ 100%) ⇒ áp lại nếu khác.
  appsEvents.on('changed', refresh);
}

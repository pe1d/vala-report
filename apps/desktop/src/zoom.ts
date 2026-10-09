/**
 * Cỡ chữ (người dùng 09/10/2026): thu phóng NỘI DUNG trang — ứng dụng web, Trợ lý, Cài đặt, Quản trị, giao diện Văn bản —
 * theo tài khoản (apps.ts fontPercent, lưu trên máy chủ). Thanh bên / header / khung nổi giữ nguyên cỡ.
 *
 * Chromium thu phóng theo TÊN MIỀN: mọi trang cục bộ (file://) — kể cả header / thanh bên — chung một "tên miền" ⇒ trang
 * cục bộ phóng bằng CSS `zoom` của riêng trang đó; trang web (http(s), vala-ui://) dùng setZoomFactor.
 */
import type { WebContents } from 'electron';
import { appsEvents, fontPercent, setFontPercent } from './apps';
import { cleanZoom, stepZoom } from './zoom-model';

const tracked = new Set<WebContents>();
const cssKey = new WeakMap<WebContents, string>();
let applied = 100;

const current = () => cleanZoom(fontPercent());

async function apply(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  const pct = current();
  if (wc.getURL().startsWith('file:')) {
    const old = cssKey.get(wc);
    if (old) { await wc.removeInsertedCSS(old).catch(() => {}); cssKey.delete(wc); }
    if (pct !== 100) cssKey.set(wc, await wc.insertCSS(`html { zoom: ${pct / 100} !important; }`).catch(() => ''));
  } else {
    wc.setZoomFactor(pct / 100);
  }
}

/** Theo dõi một trang nội dung: áp cỡ chữ mỗi lần trang nạp (CSS chèn / mức thu phóng mất khi điều hướng). */
export function trackZoom(wc: WebContents): void {
  if (tracked.has(wc)) return;
  tracked.add(wc);
  wc.on('dom-ready', () => void apply(wc));
  wc.on('did-navigate', () => { if (!wc.getURL().startsWith('file:')) void apply(wc); });
  wc.once('destroyed', () => tracked.delete(wc));
  void apply(wc);
}

const applyAll = () => { for (const wc of tracked) void apply(wc); };

/** Đổi cỡ chữ: +1 / −1 bước, 0 ⇒ 100%, hoặc một mức cụ thể. */
export function changeZoom(v: 1 | -1 | 0 | { pct: number }): number {
  const next = typeof v === 'object' ? cleanZoom(v.pct) : stepZoom(current(), v);
  void setFontPercent(next);
  return next;
}

export const zoomPercent = current;

export function initZoom(): void {
  // Danh mục làm mới (đăng nhập / máy khác vừa đổi cỡ chữ / đăng xuất) ⇒ áp lại nếu khác.
  appsEvents.on('changed', () => { const p = current(); if (p !== applied) { applied = p; applyAll(); } });
  applied = current();
}

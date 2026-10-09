/**
 * Giám sát phiên dịch trên máy người dùng (docs/van-ban-chung.md): sau khi gói nạp vào trang chính của hệ thống, hỏi
 * __vala.health() ⇒ thiếu phụ thuộc / trang gốc đổi phiên bản ⇒ gửi về máy chủ như lỗi `kich_ban` (error-report.ts) để
 * quản trị đơn vị được báo (Quản trị → Kịch bản Desktop: tình trạng từng gói; thông báo cho quản trị — admin-alert.ts).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type WebFrameMain } from 'electron';
import { reportError } from './error-report';
import { healthEvents, type HealthResult } from './package-health-model';

const file = () => join(app.getPath('userData'), 'package-versions.json');
let versions: Record<string, string> | null = null;
const load = () => { if (!versions) { try { versions = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}; } catch { versions = {}; } } return versions!; };

/** Gọi sau khi chèn gói vào trang chính: chờ trang dựng xong (menu, đối tượng DWR…) rồi kiểm. */
export function checkFrameHealth(frame: WebFrameMain): void {
  const url = frame.url;
  setTimeout(async () => {
    try {
      if (frame.url !== url) return;   // khung đã chuyển trang (khung đã huỷ thì executeJavaScript ném lỗi — bắt ở dưới)
      const raw = await frame.executeJavaScript('window.__vala && window.__vala.health ? window.__vala.health().then((r) => JSON.stringify(r)) : "{}"') as string;
      const host = new URL(url).host;
      const { reports, versions: next } = healthEvents(JSON.parse(raw) as Record<string, HealthResult>, load(), host);
      versions = next;
      try { writeFileSync(file(), JSON.stringify(next), { mode: 0o600 }); } catch { /* giữ trong phiên */ }
      for (const r of reports) reportError('kich_ban', r.thong_bao, undefined, { goi: r.goi, kieu: r.kieu, ...r.ngu_canh });
    } catch { /* trang đã chuyển / đóng */ }
  }, 5000);
}

/**
 * Giao diện Văn bản chung (docs/van-ban-chung.md): trang vanban/ (React, build ra dist/vanban) đặt trên trang gốc của
 * một ứng dụng văn bản (browser.ts createUiView). Ở đây: IPC của trang — chỉ nhận từ đúng trang giao diện, chỉ chạy các
 * thao tác vb_* của hợp đồng trong trang gốc của CHÍNH ứng dụng đó (phiên người dùng), làm sạch kết quả (vanban-model.ts).
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { setVanbanGoc, vanbanTabOf, vanbanUis } from './browser';
import { currentPrefs, prefsEvents } from './prefs';
import { listActions, runAction } from './scripts';
import { reportError } from './error-report';
import { askDirPath, askLocalFile, expectDownload, recordSaved } from './downloads';
import { safeName, uniqueName } from './downloads-model';
import { getSettings } from './settings';
import { siteOf } from './tabs-model';
import { originOf } from './error-report-model';
import { actionFailureWorthReporting } from './package-health-model';
import { cleanChiTiet, cleanDanhSach, cleanDem, cleanMauTao, cleanThongTin, isVbAction, MAX_FILES_B64 } from './vanban-model';

/** Chờ trang gốc tải xong và phiên dịch nạp xong (có vb_thong_tin) — trang đăng nhập cũng có (thao tác báo het_phien). */
const READY_MS = 20_000;
async function ready(wc: WebContents): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < READY_MS) {
    if (wc.isDestroyed()) return false;
    if (!wc.isLoading() && (await listActions(wc)).some((a) => a.name === 'vb_thong_tin')) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Tham số: object thường; thao tác gửi form (có thể kèm tệp) được lớn hơn. */
const plain = (a: unknown, max: number): Record<string, unknown> | null => {
  if (a === undefined || a === null) return {};
  if (typeof a !== 'object' || Array.isArray(a)) return null;
  try { return JSON.stringify(a).length <= max ? (a as Record<string, unknown>) : null; } catch { return null; }
};
const FORM_ACTIONS = new Set(['vb_tao', 'vb_thuc_hien']);

const CLEAN: Record<string, (v: unknown) => unknown> = {
  vb_thong_tin: cleanThongTin, vb_dem: cleanDem, vb_danh_sach: cleanDanhSach, vb_chi_tiet: cleanChiTiet, vb_mau_tao: cleanMauTao,
};
/** Kết quả thao tác gửi form: lời báo + mã văn bản (vb_tao ⇒ mở văn bản vừa tạo). */
const cleanSent = (v: unknown) => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const id = typeof o.id === 'string' || typeof o.id === 'number' ? String(o.id).slice(0, 200) : undefined;
  return { thong_bao: String(o.thong_bao ?? '').slice(0, 500), id };
};

/**
 * Tệp đính kèm dạng cũ (vb_tep ⇒ { ten, base64 }) — như mọi lượt tải: qua khung Tải xuống (Tải về / Lưu thành… / Huỷ), hoặc
 * thẳng vào thư mục Tải về khi Cài đặt tắt "Hỏi trước khi tải".
 */
function saveFile(r: unknown, nguon: string): { ok: boolean; error?: string; saved?: string; dang_tai?: boolean } {
  const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
  if (typeof o.base64 !== 'string' || typeof o.ten !== 'string') return { ok: false, error: 'Phiên dịch không trả tệp' };
  const buf = Buffer.from(o.base64, 'base64');
  const host = nguon.replace(/^https?:\/\//, '');
  const dir = getSettings().askBeforeDownload !== false ? askDirPath() : app.getPath('downloads');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, uniqueName(new Set(readdirSync(dir)), safeName(o.ten)));
  writeFileSync(path, buf);
  if (dir === askDirPath()) { askLocalFile(path, o.ten, host); return { ok: true, dang_tai: true }; }
  recordSaved(path, host, buf.length);
  return { ok: true, saved: path };
}

export function registerVanbanPage(): void {
  const tabOf = (e: IpcMainInvokeEvent) => { const t = vanbanTabOf(e.sender); if (!t) throw new Error('forbidden'); return t; };
  prefsEvents.on('changed', () => { for (const wc of vanbanUis()) wc.send('vanban:prefs', currentPrefs()); });

  ipcMain.handle('vanban:state', (e) => { const t = tabOf(e); return { ...currentPrefs(), key: t.key, label: t.label }; });
  ipcMain.handle('vanban:goc', (e, a: { on?: unknown; url?: unknown }) => { const t = tabOf(e); setVanbanGoc(t.key, a?.on !== false, typeof a?.url === 'string' ? a.url.slice(0, 2000) : undefined); });
  ipcMain.handle('vanban:run', async (e, a: { name?: unknown; args?: unknown }) => {
    const t = tabOf(e);
    if (!isVbAction(a?.name)) return { ok: false, error: 'forbidden' };
    const args = plain(a?.args, FORM_ACTIONS.has(a.name) ? MAX_FILES_B64 + 1_000_000 : 100_000);
    if (!args) return { ok: false, error: 'Dữ liệu gửi quá lớn' };
    if (!t.goc || !(await ready(t.goc))) return { ok: false, code: 'chua_san_sang', error: 'Trang gốc chưa sẵn sàng' };
    const r = await runAction(t.goc, a.name, args, 90_000) as { ok: boolean; result?: unknown; error?: string; code?: string };
    if (!r.ok) {
      // Lỗi không phải hết phiên / nghiệp vụ ⇒ có thể trang gốc đã đổi ⇒ báo quản trị (gói nào khai thao tác này).
      if (actionFailureWorthReporting(r.code)) {
        const pkg = (await listActions(t.goc).catch(() => [])).find((x) => x.name === a.name)?.pkg ?? '?';
        reportError('kich_ban', `Gói ${pkg}: ${a.name} lỗi: ${r.error ?? ''}`, undefined, { goi: pkg, kieu: 'loi_thao_tac', thao_tac: a.name, trang: originOf(t.goc.getURL()) });
      }
      return { ok: false, error: r.error ?? '', code: r.code };
    }
    if (a.name === 'vb_tep') {
      // Phiên dịch trả địa chỉ tải (cùng hệ thống) ⇒ tải bằng phiên của trang gốc qua trình quản lý tải (tiến độ, lịch sử,
      // không dồn cả tệp vào bộ nhớ); còn dạng cũ { base64 } ⇒ lưu như trước.
      const o = r.result && typeof r.result === 'object' ? (r.result as Record<string, unknown>) : {};
      if (typeof o.url === 'string') {
        let url: URL;
        try { url = new URL(o.url, t.goc.getURL()); } catch { return { ok: false, error: 'Địa chỉ tải không hợp lệ' }; }
        if (!/^https?:$/.test(url.protocol) || siteOf(url.hostname) !== siteOf(new URL(t.goc.getURL()).hostname)) return { ok: false, error: 'Địa chỉ tải không thuộc hệ thống' };
        expectDownload(url.toString(), { ten: typeof o.ten === 'string' ? o.ten : undefined });
        t.goc.downloadURL(url.toString());
        return { ok: true, dang_tai: true };
      }
      return saveFile(r.result, originOf(t.goc.getURL()));
    }
    const clean = CLEAN[a.name];
    return { ok: true, result: clean ? clean(r.result) : cleanSent(r.result) };
  });
}

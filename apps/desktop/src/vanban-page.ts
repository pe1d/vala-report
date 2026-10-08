/**
 * Giao diện Văn bản chung (docs/van-ban-chung.md): trang vanban/ (React, build ra dist/vanban) đặt trên trang gốc của
 * một ứng dụng văn bản (browser.ts createUiView). Ở đây: IPC của trang — chỉ nhận từ đúng trang giao diện, chỉ chạy các
 * thao tác vb_* của hợp đồng trong trang gốc của CHÍNH ứng dụng đó (phiên người dùng), làm sạch kết quả (vanban-model.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { setVanbanGoc, vanbanTabOf, vanbanUis } from './browser';
import { currentPrefs, prefsEvents } from './prefs';
import { listActions, runAction } from './scripts';
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
 * Tệp đính kèm (vb_tep ⇒ { ten, base64 }): `mo` ⇒ ghi vào thư mục tạm của app rồi mở bằng ứng dụng mặc định của máy;
 * không thì hỏi chỗ lưu (mặc định thư mục Tải về).
 */
async function saveFile(sender: WebContents, r: unknown, mo: boolean): Promise<{ ok: boolean; error?: string; saved?: string }> {
  const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
  if (typeof o.base64 !== 'string' || typeof o.ten !== 'string') return { ok: false, error: 'Phiên dịch không trả tệp' };
  const name = o.ten.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200) || 'tep';
  if (mo) {
    const dir = join(app.getPath('temp'), 'vala-van-ban');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    writeFileSync(file, Buffer.from(o.base64, 'base64'));
    const err = await shell.openPath(file);
    return err ? { ok: false, error: err } : { ok: true };
  }
  const win = BrowserWindow.fromWebContents(sender) ?? undefined;
  const opts = { defaultPath: join(app.getPath('downloads'), name) };
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  if (res.canceled || !res.filePath) return { ok: false, error: '' };
  writeFileSync(res.filePath, Buffer.from(o.base64, 'base64'));
  return { ok: true, saved: res.filePath };
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
    if (!r.ok) return { ok: false, error: r.error ?? '', code: r.code };
    if (a.name === 'vb_tep') return saveFile(e.sender, r.result, args.mo === true);
    const clean = CLEAN[a.name];
    return { ok: true, result: clean ? clean(r.result) : cleanSent(r.result) };
  });
}

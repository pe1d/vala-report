/**
 * Trình quản lý tải của Vala Desktop: MỌI lượt tải trong app (trang gốc eGov / Văn bản Hà Nội…, giao diện Văn bản qua
 * vb_tep) đi qua đây — lưu thẳng vào thư mục Tải về (không hỏi mỗi lần, không ghi đè tệp đã có), theo dõi tiến độ (nút
 * "Tải xuống" trên header + khung danh sách — browser.ts / overlay), lịch sử trên máy (downloads.json; đăng xuất ⇒ xoá).
 * Không lưu địa chỉ tải (có thể kèm token) — chỉ tên máy của trang.
 */
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app, session, shell, type DownloadItem } from 'electron';
import { addItem, overall, restore, safeName, uniqueName, type TaiVe } from './downloads-model';

export const downloadEvents = new EventEmitter();
const file = () => join(app.getPath('userData'), 'downloads.json');
let list: TaiVe[] | null = null;
const load = (): TaiVe[] => {
  if (!list) { try { list = restore(existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : []); } catch { list = []; } }
  return list;
};
const save = () => { try { writeFileSync(file(), JSON.stringify(load()), { mode: 0o600 }); } catch { /* giữ trong phiên */ } };
const items = new Map<string, DownloadItem>();

// Báo thay đổi thưa (tiến độ cập nhật liên tục): tối đa ~3 lần / giây.
let timer: ReturnType<typeof setTimeout> | null = null;
const changed = (now = false) => {
  if (now) { if (timer) { clearTimeout(timer); timer = null; } downloadEvents.emit('changed'); return; }
  if (!timer) timer = setTimeout(() => { timer = null; downloadEvents.emit('changed'); }, 300);
};

/** Lượt tải sắp bắt đầu do app gọi (giao diện Văn bản): đặt tên tệp / mở khi xong. Khớp theo địa chỉ, hết hạn sau 2 phút. */
const pending = new Map<string, { ten?: string; mo?: boolean; het: number }>();
export function expectDownload(url: string, o: { ten?: string; mo?: boolean }): void {
  pending.set(url, { ...o, het: Date.now() + 120_000 });
}
function takePending(item: DownloadItem) {
  const now = Date.now();
  for (const [u, p] of pending) if (p.het < now) pending.delete(u);
  const url = [item.getURL(), ...item.getURLChain()].find((u) => pending.has(u));
  if (!url) return null;
  const p = pending.get(url)!;
  pending.delete(url);
  return p;
}
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ''; } };

export function initDownloads(): void {
  session.defaultSession.on('will-download', (_e, item, wc) => {
    const p = takePending(item);
    const dir = app.getPath('downloads');
    let names: Set<string>;
    try { names = new Set(readdirSync(dir)); } catch { names = new Set(); }
    const ten = uniqueName(names, safeName(p?.ten || item.getFilename() || 'tep'));
    const duong_dan = join(dir, ten);
    item.setSavePath(duong_dan);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const it: TaiVe = { id, ten, duong_dan, tong: item.getTotalBytes(), da_tai: 0, trang_thai: 'dang_tai', luc: Date.now(), nguon: hostOf(wc && !wc.isDestroyed() ? wc.getURL() : item.getURL()) };
    list = addItem(load(), it);
    items.set(id, item);
    changed(true);
    item.on('updated', (_ev, state) => {
      it.da_tai = item.getReceivedBytes();
      it.tong = item.getTotalBytes();
      it.trang_thai = state === 'interrupted' ? 'loi' : item.isPaused() ? 'tam_dung' : 'dang_tai';
      changed();
    });
    item.once('done', (_ev, state) => {
      items.delete(id);
      it.da_tai = item.getReceivedBytes();
      it.trang_thai = state === 'completed' ? 'xong' : state === 'cancelled' ? 'huy' : 'loi';
      save();
      changed(true);
      if (state === 'completed' && p?.mo) void shell.openPath(duong_dan);
    });
  });
}

/** Tệp đã lưu bằng cách khác (vb_tep dạng base64 cũ) ⇒ vẫn vào lịch sử. */
export function recordSaved(duong_dan: string, nguon: string, bytes: number): void {
  list = addItem(load(), { id: `${Date.now().toString(36)}s`, ten: basename(duong_dan), duong_dan, tong: bytes, da_tai: bytes, trang_thai: 'xong', luc: Date.now(), nguon });
  save();
  changed(true);
}

/** Trạng thái cho khung Tải xuống; `mat`: đã tải xong nhưng tệp không còn ở chỗ cũ (người dùng xoá / chuyển đi). */
export const downloadsState = () => ({
  list: load().map((x) => ({ ...x, mat: x.trang_thai === 'xong' && !existsSync(x.duong_dan) })),
  ...overall(load()),
});

/** Thao tác trên một mục (khung Tải xuống). */
export function downloadAction(id: string, act: 'open' | 'folder' | 'cancel' | 'remove' | 'clear'): void {
  if (act === 'clear') { list = load().filter((x) => items.has(x.id)); save(); changed(true); return; }
  const it = load().find((x) => x.id === id);
  if (!it) return;
  if (act === 'open') { if (existsSync(it.duong_dan)) void shell.openPath(it.duong_dan); else void shell.openPath(dirname(it.duong_dan)); }
  else if (act === 'folder') { if (existsSync(it.duong_dan)) shell.showItemInFolder(it.duong_dan); else void shell.openPath(dirname(it.duong_dan)); }
  else if (act === 'cancel') items.get(id)?.cancel();
  else if (act === 'remove') { list = load().filter((x) => x.id !== id || items.has(id)); save(); changed(true); }
}

/** Đăng xuất ⇒ quên lịch sử tải (tệp trên đĩa giữ nguyên); huỷ lượt đang tải. */
export function clearDownloads(): void {
  for (const it of items.values()) it.cancel();
  items.clear();
  list = [];
  save();
  changed(true);
}

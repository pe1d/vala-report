/**
 * Trình quản lý tải của Vala Desktop: MỌI lượt tải trong app (trang gốc eGov / Văn bản Hà Nội…, giao diện Văn bản qua
 * vb_tep) đi qua đây — lưu thẳng vào thư mục Tải về (không hỏi mỗi lần, không ghi đè tệp đã có), theo dõi tiến độ (nút
 * "Tải xuống" trên header + khung danh sách — browser.ts / overlay), lịch sử trên máy (downloads.json; đăng xuất ⇒ xoá).
 * Không lưu địa chỉ tải (có thể kèm token) — chỉ tên máy của trang.
 */
import { EventEmitter } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, session, shell, type DownloadItem } from 'electron';
import { getSettings } from './settings';
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
/** Sự kiện gần nhất (header làm hiệu ứng: bắt đầu ⇒ nảy + vòng tiến độ, xong ⇒ ✓, lỗi ⇒ đỏ). `so` tăng mỗi sự kiện. */
let suKien: { so: number; loai: 'bat_dau' | 'xong' | 'loi'; ten: string } | null = null;
const mark = (loai: 'bat_dau' | 'xong' | 'loi', ten: string) => { suKien = { so: (suKien?.so ?? 0) + 1, loai, ten }; };

// Báo thay đổi thưa (tiến độ cập nhật liên tục): tối đa ~3 lần / giây.
let timer: ReturnType<typeof setTimeout> | null = null;
const changed = (now = false) => {
  if (now) { if (timer) { clearTimeout(timer); timer = null; } downloadEvents.emit('changed'); return; }
  if (!timer) timer = setTimeout(() => { timer = null; downloadEvents.emit('changed'); }, 300);
};

/**
 * Lượt tải sắp bắt đầu do app gọi (giao diện Văn bản): đặt tên tệp; `mo` ⇒ mở bằng ứng dụng của máy khi xong; `xem` ⇒ tải
 * vào thư mục tạm rồi xem ngay trong app (PDF / ảnh — 'xem'), không vào lịch sử; `hoi` ⇒ hỏi nơi lưu ("Lưu thành…").
 * Khớp theo địa chỉ, hết hạn sau 2 phút.
 */
export interface DownloadOpts { ten?: string; mo?: boolean; xem?: boolean; hoi?: boolean }
const pending = new Map<string, DownloadOpts & { het: number }>();
export function expectDownload(url: string, o: DownloadOpts): void {
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

/** Thư mục tạm của tệp xem trước (xoá khi mở app / đăng xuất). */
export const previewDir = () => join(app.getPath('temp'), 'vala-xem');
const uniqueIn = (dir: string, ten: string) => {
  let names: Set<string>;
  try { names = new Set(readdirSync(dir)); } catch { names = new Set(); }
  return join(dir, uniqueName(names, safeName(ten)));
};
/** Cửa sổ chính (gốc cho hộp chọn nơi lưu). */
const mainWin = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible()) ?? BrowserWindow.getAllWindows()[0];

export function initDownloads(): void {
  try { rmSync(previewDir(), { recursive: true, force: true }); } catch { /* đang dùng */ }
  session.defaultSession.on('will-download', (_e, item, wc) => {
    const p = takePending(item);
    // Xem trước: tải vào thư mục tạm, xong ⇒ browser.ts mở tab xem (Tải về / Lưu thành… trên header). Không vào lịch sử.
    if (p?.xem) {
      mkdirSync(previewDir(), { recursive: true });
      const path = uniqueIn(previewDir(), p.ten || item.getFilename() || 'tep');
      item.setSavePath(path);
      item.once('done', (_ev, state) => downloadEvents.emit(state === 'completed' ? 'xem' : 'xem-loi', { path, ten: p.ten || item.getFilename(), nguon: hostOf(item.getURL()) }));
      return;
    }
    const dir = app.getPath('downloads');
    let names: Set<string>;
    try { names = new Set(readdirSync(dir)); } catch { names = new Set(); }
    let ten = uniqueName(names, safeName(p?.ten || item.getFilename() || 'tep'));
    let duong_dan = join(dir, ten);
    // "Lưu thành…" (lần bấm này) hoặc Cài đặt "Hỏi nơi lưu mỗi lần tải" ⇒ hộp chọn nơi lưu của hệ điều hành.
    const hoi = p?.hoi || getSettings().askDownloadPath === true;
    if (hoi) item.setSaveDialogOptions({ defaultPath: duong_dan });
    else item.setSavePath(duong_dan);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const it: TaiVe = { id, ten, duong_dan, tong: item.getTotalBytes(), da_tai: 0, trang_thai: 'dang_tai', luc: Date.now(), nguon: hostOf(wc && !wc.isDestroyed() ? wc.getURL() : item.getURL()) };
    list = addItem(load(), it);
    items.set(id, item);
    mark('bat_dau', ten);
    changed(true);
    // Trang mở ra CHỈ để tải (link mở tab / cửa sổ mới, chưa hiện trang nào) ⇒ browser.ts đóng nó, về lại tab cũ.
    if (wc && !wc.isDestroyed()) downloadEvents.emit('started', wc);
    item.on('updated', (_ev, state) => {
      // Vừa chọn nơi lưu trong hộp thoại ⇒ cập nhật tên / đường dẫn thật.
      if (hoi && item.getSavePath() && item.getSavePath() !== it.duong_dan) { duong_dan = it.duong_dan = item.getSavePath(); ten = it.ten = basename(duong_dan); }
      it.da_tai = item.getReceivedBytes();
      it.tong = item.getTotalBytes();
      it.trang_thai = state === 'interrupted' ? 'loi' : item.isPaused() ? 'tam_dung' : 'dang_tai';
      changed();
    });
    item.once('done', (_ev, state) => {
      items.delete(id);
      if (hoi && item.getSavePath()) { duong_dan = it.duong_dan = item.getSavePath(); ten = it.ten = basename(duong_dan); }
      // Bấm Huỷ ở hộp chọn nơi lưu ⇒ coi như chưa tải: bỏ khỏi danh sách, không báo gì.
      if (state === 'cancelled' && hoi && !item.getReceivedBytes()) { list = load().filter((x) => x.id !== id); save(); changed(true); return; }
      it.da_tai = item.getReceivedBytes();
      it.trang_thai = state === 'completed' ? 'xong' : state === 'cancelled' ? 'huy' : 'loi';
      if (state !== 'cancelled') mark(state === 'completed' ? 'xong' : 'loi', ten);
      save();
      changed(true);
      if (state === 'completed' && p?.mo) void shell.openPath(duong_dan);
    });
  });
}

/** Tệp đã lưu bằng cách khác (vb_tep dạng base64 cũ) ⇒ vẫn vào lịch sử. */
export function recordSaved(duong_dan: string, nguon: string, bytes: number): void {
  list = addItem(load(), { id: `${Date.now().toString(36)}s`, ten: basename(duong_dan), duong_dan, tong: bytes, da_tai: bytes, trang_thai: 'xong', luc: Date.now(), nguon });
  mark('xong', basename(duong_dan));
  save();
  changed(true);
}

/** Trạng thái cho khung Tải xuống; `mat`: đã tải xong nhưng tệp không còn ở chỗ cũ (người dùng xoá / chuyển đi). */
export const downloadsState = () => ({
  list: load().map((x) => ({ ...x, mat: x.trang_thai === 'xong' && !existsSync(x.duong_dan) })),
  ...overall(load()),
  su_kien: suKien,
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

/** Lưu một bản sao của tệp vào nơi người dùng chọn (khung Tải xuống "Lưu vào chỗ khác…", tab xem trước "Lưu thành…"). */
export async function saveCopyAs(path: string, ten: string, nguon: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const w = mainWin();
  const opts = { defaultPath: join(app.getPath('downloads'), safeName(ten)) };
  const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return null;
  copyFileSync(path, r.filePath);
  recordSaved(r.filePath, nguon, statSync(r.filePath).size);
  return r.filePath;
}

/** Tab xem trước "Tải về" ⇒ chép tệp tạm vào thư mục Tải về (không ghi đè), vào lịch sử. */
export function saveCopyToDownloads(path: string, ten: string, nguon: string): string | null {
  if (!existsSync(path)) return null;
  const to = uniqueIn(app.getPath('downloads'), ten);
  copyFileSync(path, to);
  recordSaved(to, nguon, statSync(to).size);
  return to;
}

/** Khung Tải xuống: "Lưu vào chỗ khác…" của một tệp đã tải. */
export async function downloadSaveAs(id: string): Promise<void> {
  const it = load().find((x) => x.id === id);
  if (it && it.trang_thai === 'xong') await saveCopyAs(it.duong_dan, it.ten, it.nguon);
}

/** Đăng xuất ⇒ quên lịch sử tải (tệp trên đĩa giữ nguyên); huỷ lượt đang tải. */
export function clearDownloads(): void {
  try { rmSync(previewDir(), { recursive: true, force: true }); } catch { /* đang dùng */ }
  for (const it of items.values()) it.cancel();
  items.clear();
  list = [];
  save();
  changed(true);
}

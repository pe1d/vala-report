/**
 * Trình quản lý tải của Vala Desktop: MỌI lượt tải trong app (trang gốc eGov / Văn bản Hà Nội…, giao diện Văn bản qua
 * vb_tep) đi qua đây — lưu thẳng vào thư mục Tải về (không hỏi mỗi lần, không ghi đè tệp đã có), theo dõi tiến độ (nút
 * "Tải xuống" trên header + khung danh sách — browser.ts / overlay), lịch sử trên máy (downloads.json; đăng xuất ⇒ xoá).
 * Không lưu địa chỉ tải (có thể kèm token) — chỉ tên máy của trang.
 */
import { EventEmitter } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, session, shell, type DownloadItem } from 'electron';
import { getSettings, setSettings } from './settings';
import { addItem, overall, restore, safeName, uniqueName, viewableInApp, type TaiVe } from './downloads-model';

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
/** Thư mục tạm của tệp đang chờ người dùng chọn ở hộp Tải xuống. */
const askDir = () => join(app.getPath('temp'), 'vala-tai');

/**
 * HỎI CÁCH LƯU (người dùng 09/10/2026): mỗi lần tải ⇒ khung Tải xuống dưới nút header tự xổ ra, dòng tệp có Mở / Tải về /
 * Lưu thành… / Huỷ (overlay.ts). Tệp tải
 * NGẦM vào thư mục tạm ngay lúc hỏi; chọn xong (và tải xong) ⇒ chuyển tới nơi đã chọn. Cài đặt "Hỏi trước khi tải" tắt ⇒
 * tải thẳng vào thư mục Tải về như trước.
 */
type Choice = 'mo' | 'tai' | 'luu_thanh';
interface Ask { id: string; tmp: string; ten: string; nguon: string; done: boolean; ok: boolean; choice?: { kind: Choice; target?: string } }
const asks = new Map<string, Ask>();
/** Thứ tự đang chờ hỏi (hỏi lần lượt từng tệp). */
const askQueue: string[] = [];

/** Chuyển tệp (khác ổ ⇒ chép rồi xoá). */
function moveFile(from: string, to: string): void {
  try { renameSync(from, to); } catch { copyFileSync(from, to); rmSync(from, { force: true }); }
}

/** Đã chọn + đã tải xong ⇒ đưa tệp tới nơi đã chọn. */
function finalize(a: Ask): void {
  const it = load().find((x) => x.id === a.id);
  asks.delete(a.id);
  if (!it || !a.choice) return;
  if (a.choice.kind === 'mo' && viewableInApp(a.ten)) {
    // PDF / ảnh ⇒ xem ngay trong app (tab xem trước có Tải về / Lưu thành…); không vào lịch sử.
    mkdirSync(previewDir(), { recursive: true });
    const view = uniqueIn(previewDir(), a.ten);
    moveFile(a.tmp, view);
    list = load().filter((x) => x.id !== a.id);
    save();
    changed(true);
    downloadEvents.emit('xem', { path: view, ten: a.ten, nguon: a.nguon });
    return;
  }
  const target = a.choice.target ?? uniqueIn(app.getPath('downloads'), a.ten);
  try { moveFile(a.tmp, target); } catch { it.trang_thai = 'loi'; mark('loi', a.ten); save(); changed(true); return; }
  it.duong_dan = target;
  it.ten = basename(target);
  it.trang_thai = 'xong';
  mark('xong', it.ten);
  save();
  changed(true);
  if (a.choice.kind === 'mo') void shell.openPath(target);
}

/** Còn tệp chờ người dùng chọn cách lưu (khung Tải xuống tự xổ ra). */
export const hasPendingAsk = (): boolean => askQueue.length > 0;

const dropAsk = (id: string) => { const i = askQueue.indexOf(id); if (i >= 0) askQueue.splice(i, 1); downloadEvents.emit('ask'); };

/**
 * Người dùng chọn ở hộp Tải xuống. `khongHoi` ⇒ tắt "Hỏi trước khi tải" (lần sau tải thẳng). Lưu thành… mà bấm Huỷ ở hộp
 * chọn nơi lưu ⇒ false (hộp Tải xuống vẫn mở để chọn lại).
 */
export async function chooseDownload(id: string, kind: Choice | 'huy', khongHoi = false): Promise<boolean> {
  const a = asks.get(id);
  if (!a) { dropAsk(id); return true; }
  if (kind === 'huy') {
    items.get(id)?.cancel();
    asks.delete(id);
    try { rmSync(a.tmp, { force: true }); } catch { /* đang ghi */ }
    list = load().filter((x) => x.id !== id);
    save();
    changed(true);
    dropAsk(id);
    return true;
  }
  let target: string | undefined;
  if (kind === 'luu_thanh') {
    const w = mainWin();
    const opts = { defaultPath: join(app.getPath('downloads'), safeName(a.ten)) };
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return false;
    target = r.filePath;
  }
  if (khongHoi) setSettings({ askBeforeDownload: false });
  a.choice = { kind, target };
  dropAsk(id);
  if (a.done && a.ok) finalize(a);
  return true;
}

/** Tệp đã có sẵn trên máy (vb_tep dạng base64) ⇒ cũng qua hộp Tải xuống. */
export function askLocalFile(tmp: string, ten: string, nguon: string): void {
  const id = `${Date.now().toString(36)}l${Math.random().toString(36).slice(2, 6)}`;
  const size = existsSync(tmp) ? statSync(tmp).size : 0;
  list = addItem(load(), { id, ten, duong_dan: tmp, tong: size, da_tai: size, trang_thai: 'cho_chon', luc: Date.now(), nguon });
  asks.set(id, { id, tmp, ten, nguon, done: true, ok: true });
  askQueue.push(id);
  save();
  changed(true);
  downloadEvents.emit('ask');
}
export const askDirPath = askDir;
const uniqueIn = (dir: string, ten: string) => {
  let names: Set<string>;
  try { names = new Set(readdirSync(dir)); } catch { names = new Set(); }
  return join(dir, uniqueName(names, safeName(ten)));
};
/** Cửa sổ chính (gốc cho hộp chọn nơi lưu). */
const mainWin = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible()) ?? BrowserWindow.getAllWindows()[0];

export function initDownloads(): void {
  for (const d of [previewDir(), askDir()]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* đang dùng */ } }
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
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    // Trang đã tải (tab mở ra chỉ để tải chưa có địa chỉ ⇒ lấy theo địa chỉ tệp).
    const nguon = hostOf(wc && !wc.isDestroyed() && /^https?:/.test(wc.getURL()) ? wc.getURL() : item.getURL());
    // Hộp Tải xuống (mặc định): tải ngầm vào thư mục tạm, hỏi Mở / Tải về / Lưu thành…. Lượt app tự gọi để mở (mo) ⇒ không hỏi.
    const askIt = !p?.mo && !p?.hoi && getSettings().askBeforeDownload !== false;
    // "Lưu thành…" của riêng lượt này ⇒ hộp chọn nơi lưu của hệ điều hành.
    const hoi = !!p?.hoi;
    if (askIt) {
      mkdirSync(askDir(), { recursive: true });
      ten = safeName(p?.ten || item.getFilename() || 'tep');
      duong_dan = uniqueIn(askDir(), ten);
      item.setSavePath(duong_dan);
      asks.set(id, { id, tmp: duong_dan, ten, nguon, done: false, ok: false });
      askQueue.push(id);
    } else if (hoi) item.setSaveDialogOptions({ defaultPath: duong_dan });
    else item.setSavePath(duong_dan);
    const it: TaiVe = { id, ten, duong_dan, tong: item.getTotalBytes(), da_tai: 0, trang_thai: 'dang_tai', luc: Date.now(), nguon };
    list = addItem(load(), it);
    items.set(id, item);
    mark('bat_dau', ten);
    changed(true);
    // Trang mở ra CHỈ để tải (link mở tab / cửa sổ mới, chưa hiện trang nào) ⇒ browser.ts đóng nó, về lại tab cũ — TRƯỚC khi
    // mở hộp Tải xuống (chuyển tab sau đó sẽ đè lên hộp).
    if (wc && !wc.isDestroyed()) downloadEvents.emit('started', wc);
    if (askIt) downloadEvents.emit('ask');
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
      const a = asks.get(id);
      if (a) {
        // Đang qua hộp Tải xuống: tải xong ⇒ chọn rồi thì chuyển tệp ngay, chưa chọn thì chờ ("Chờ bạn chọn").
        a.done = true;
        a.ok = state === 'completed';
        if (!a.ok) { asks.delete(id); dropAsk(id); it.trang_thai = state === 'cancelled' ? 'huy' : 'loi'; if (state !== 'cancelled') mark('loi', ten); save(); changed(true); return; }
        if (a.choice) { finalize(a); return; }
        it.trang_thai = 'cho_chon';
        save();
        changed(true);
        return;
      }
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
  list: load().map((x) => ({
    ...x, mat: x.trang_thai === 'xong' && !existsSync(x.duong_dan),
    // Đang chờ chọn cách lưu ⇒ khung Tải xuống hiện Mở / Tải về / Lưu thành… / Huỷ ngay trên dòng tệp.
    hoi: !!asks.get(x.id) && !asks.get(x.id)!.choice, xem_duoc: viewableInApp(x.ten),
  })),
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

/** Đăng xuất ⇒ quên lịch sử tải (tệp trên đĩa giữ nguyên); huỷ lượt đang tải. */
export function clearDownloads(): void {
  asks.clear();
  askQueue.length = 0;
  for (const d of [previewDir(), askDir()]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* đang dùng */ } }
  for (const it of items.values()) it.cancel();
  items.clear();
  list = [];
  save();
  changed(true);
}

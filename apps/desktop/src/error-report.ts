/**
 * Báo lỗi / crash của Vala Desktop (người dùng chốt 08/10/2026 — tự gửi, tắt được ở Cài đặt → Khởi động & cập nhật).
 * Máy chủ: POST /ext/desktop/errors (lỗi, theo lô) và /desktop-crash (minidump Crashpad); quản trị hệ thống xem ở
 * Quản trị → Lỗi Desktop. Bắt:
 *   - crash native (Crashpad, mọi tiến trình) — kèm SHA-256 token thiết bị + mã đơn vị để máy chủ biết máy nào;
 *   - lỗi JS tiến trình chính (uncaughtException / unhandledRejection);
 *   - trang bị đóng đột ngột, tiến trình con dừng, trang không phản hồi;
 *   - lỗi console của trang CỦA APP (không phải trang web bên ngoài);
 *   - lỗi cập nhật (updater.ts) và lỗi nạp kịch bản (scripts.ts) — gọi reportError().
 * Không gửi nội dung trang, mật khẩu, cookie; chữ được làm sạch (error-report-model.ts), địa chỉ chỉ giữ gốc. Hàng đợi
 * lưu xuống đĩa: mất mạng / chưa đăng nhập ⇒ gửi sau.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { join } from 'node:path';
import { app, crashReporter } from 'electron';
import { api } from './api';
import { enqueue, originOf, appPageError, type LoaiLoi, type MucLoi } from './error-report-model';
import { DEFAULT_SERVER, getSettings, setSettings } from './settings';

const enabled = () => getSettings().errorReport !== false;
const file = () => join(app.getPath('userData'), 'error-queue.json');
const he_dieu_hanh = () => `${process.platform} ${release()} ${process.arch}`;
let queue: MucLoi[] | null = null;
const load = (): MucLoi[] => {
  if (!queue) { try { queue = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as MucLoi[]) : []; } catch { queue = []; } }
  return queue;
};
const save = () => { try { writeFileSync(file(), JSON.stringify(queue ?? []), { mode: 0o600 }); } catch { /* đĩa đầy: giữ trong phiên */ } };

/** Ghi một lỗi vào hàng đợi (gửi trong vòng một phút). Tắt báo lỗi ⇒ bỏ qua. */
export function reportError(loai: LoaiLoi, thong_bao: string, stack?: string, ngu_canh?: Record<string, string>): void {
  if (!enabled() || !thong_bao) return;
  try {
    queue = enqueue(load(), { loai, thong_bao, stack, ngu_canh, phien_ban: app.getVersion(), he_dieu_hanh: he_dieu_hanh() });
    save();
  } catch { /* báo lỗi không được làm hỏng app */ }
}

let sending = false;
async function flush(): Promise<void> {
  const q = load();
  if (sending || !q.length || !enabled() || !getSettings().deviceToken) return;
  sending = true;
  const batch = q.slice(0, 50);
  try {
    await api('POST', '/ext/desktop/errors', { items: batch });
    queue = load().slice(batch.length);
    save();
  } catch { /* mất mạng / máy chủ cũ chưa có route: thử lại lần sau */ } finally { sending = false; }
}

/** Mã đơn vị + SHA-256 token thiết bị (máy chủ chỉ lưu đúng giá trị băm này) — gắn vào báo crash. */
function crashIdentity(): Record<string, string> {
  const tok = getSettings().deviceToken;
  if (!tok) return {};
  return { vala_tenant: /^vxt_([a-z][a-z0-9]{1,19})\./.exec(tok)?.[1] ?? 'bkav', vala_device: createHash('sha256').update(tok).digest('hex') };
}

/**
 * Bật Crashpad — gọi SỚM NHẤT có thể (trước app ready) để bắt cả crash lúc khởi động. Máy chủ lấy theo cấu hình lúc
 * mở app (đổi máy chủ ⇒ lần mở sau).
 */
export function startCrashReporter(): void {
  const server = (getSettings().serverUrl || DEFAULT_SERVER).replace(/\/+$/, '');
  try {
    crashReporter.start({
      submitURL: `${server}/api/v1/desktop-crash`, uploadToServer: enabled() && app.isPackaged, compress: false,
      ignoreSystemCrashHandler: true, rateLimit: true, globalExtra: { ver: app.getVersion(), ...crashIdentity() },
    });
  } catch { /* nền tảng không hỗ trợ */ }
}

/** Đăng nhập / đăng xuất ⇒ cập nhật danh tính gắn vào báo crash. */
export function refreshCrashIdentity(): void {
  const id = crashIdentity();
  for (const k of ['vala_tenant', 'vala_device']) {
    try { if (id[k]) crashReporter.addExtraParameter(k, id[k]!); else crashReporter.removeExtraParameter(k); } catch { /* bỏ qua */ }
  }
}

/** Công tắc "Tự gửi báo lỗi" trong Cài đặt. */
export function setErrorReport(on: boolean): void {
  setSettings({ errorReport: on });
  try { crashReporter.setUploadToServer(on && app.isPackaged); } catch { /* bỏ qua */ }
  if (!on) { queue = []; save(); }
}

/** Gắn các nguồn lỗi (sau app ready) + gửi định kỳ. */
export function initErrorReport(): void {
  process.on('uncaughtException', (e) => { console.error('[vala] lỗi chưa xử lý', e); reportError('loi_chinh', e.message || String(e), e.stack); });
  process.on('unhandledRejection', (r) => {
    const e = r instanceof Error ? r : new Error(String(r));
    console.error('[vala] promise bị từ chối', e);
    reportError('loi_chinh', e.message, e.stack);
  });
  app.on('render-process-gone', (_e, wc, d) => {
    if (d.reason === 'clean-exit') return;
    reportError('trang_chet', `Trang bị đóng: ${d.reason}`, undefined, { exitCode: String(d.exitCode), trang: originOf(wc.getURL()) });
  });
  app.on('child-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit' || d.reason === 'killed') return;
    reportError('tien_trinh_chet', `${d.type} dừng: ${d.reason}`, undefined, { exitCode: String(d.exitCode), ten: d.name ?? '', dichVu: d.serviceName ?? '' });
  });
  app.on('web-contents-created', (_e, wc) => {
    wc.on('unresponsive', () => reportError('trang_treo', 'Trang không phản hồi', undefined, { trang: originOf(wc.getURL()) }));
    wc.on('console-message', (_ev, level, message, line, sourceId) => {
      if (appPageError(level, sourceId)) reportError('loi_trang', message, `    at ${sourceId.replace(/^.*\/(dist|resources)\//, '$1/')}:${line}`);
    });
  });
  setTimeout(() => void flush(), 30_000);
  setInterval(() => void flush(), 60_000);
}

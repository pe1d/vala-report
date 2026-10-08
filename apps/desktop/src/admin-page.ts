/**
 * Trang Quản trị đơn vị NẰM TRONG Vala Desktop (người dùng 08/10/2026: "cấu hình cho admin ở giao diện desktop… web phụ
 * thuộc vào desktop chứ desktop không phụ thuộc vào web"). Giao diện: admin/ (React, build ra dist/admin), các trang ở
 * @vala/admin. Ở đây: API quản trị qua tiến trình chính bằng phiên cổng của ứng dụng (account.ts portalToken — không cần
 * mở cổng web), chỉ cho các đường trang cần; chạy thử thao tác kịch bản ngay trong app (windows.ts). IPC chỉ nhận từ đúng trang.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { portalApi } from './account';
import { currentPrefs, prefsEvents } from './prefs';
import { runSourceAction, sourceActions } from './windows';

export interface AdminPageHooks {
  isAdmin: (e: IpcMainInvokeEvent) => boolean;
  /** Gửi tin cho trang (nếu đang mở). */
  send: (channel: string, payload: unknown) => void;
}

/** Đường API trang Quản trị được gọi (sau /api/v1) — ngoài danh sách ⇒ từ chối. */
const ALLOWED = /^\/((admin|system)\/[\w\-/.%]+(\?[\w=&%.\-]*)?|me|branding|auth\/config)$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const CODE = /^[a-z0-9_]{1,40}$/;
const NAME = /^[a-z][a-z0-9_]{0,62}$/;

export function registerAdminPage(hooks: AdminPageHooks): void {
  const own = (e: IpcMainInvokeEvent) => { if (!hooks.isAdmin(e)) throw new Error('forbidden'); };
  prefsEvents.on('changed', () => hooks.send('admin:prefs-changed', currentPrefs()));

  ipcMain.handle('admin:prefs', (e) => { own(e); return currentPrefs(); });

  ipcMain.handle('admin:request', async (e, a: { method?: unknown; path?: unknown; body?: unknown; lang?: unknown }) => {
    own(e);
    const method = String(a?.method ?? '').toUpperCase();
    const path = typeof a?.path === 'string' ? a.path : '';
    if (!METHODS.has(method) || !ALLOWED.test(path)) return { status: 403, ok: false, json: { type: 'forbidden', title: 'forbidden' } };
    return portalApi(method, path, a?.body, a?.lang === 'en' ? 'en' : 'vi');
  });

  ipcMain.handle('admin:list-actions', async (e, code: unknown) => {
    own(e);
    if (typeof code !== 'string' || !CODE.test(code)) return { ok: false, error: 'forbidden' };
    return sourceActions(code);
  });
  ipcMain.handle('admin:run-action', async (e, a: { source?: unknown; name?: unknown; args?: unknown }) => {
    own(e);
    if (typeof a?.source !== 'string' || !CODE.test(a.source) || typeof a.name !== 'string' || !NAME.test(a.name)) return { ok: false, error: 'forbidden' };
    const args = a.args && typeof a.args === 'object' && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};
    return runSourceAction(a.source, a.name, args);
  });
}

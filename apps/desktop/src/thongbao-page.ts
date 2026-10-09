/**
 * Trang Trung tâm thông báo (09/10/2026) — mục cố định trên thanh dọc, ngay dưới Trợ lý AI: xem, lọc theo ứng dụng / trạng
 * thái, xử lý hàng loạt (đã đọc, đã xử lý, xoá). Dữ liệu: kho thông báo trên máy chủ (notifications.ts). IPC chỉ nhận từ
 * đúng trang.
 */
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { api } from './api';
import { IS_DEV } from './channel';
import { clearNotifications, createSampleNotifications, markNotifications, notificationEvents, notificationsState, openNotification, type DemThongBao, type ThongBao } from './notifications';
import { currentPrefs, prefsEvents } from './prefs';

export interface ThongBaoPageHooks { page: () => WebContents | null; isPage: (e: IpcMainInvokeEvent) => boolean }

export function registerThongBaoPage(hooks: ThongBaoPageHooks): void {
  const own = (e: IpcMainInvokeEvent) => { if (!hooks.isPage(e)) throw new Error('forbidden'); };
  const send = (ch: string, v?: unknown) => { const wc = hooks.page(); if (wc && !wc.isDestroyed()) wc.send(ch, v); };
  notificationEvents.on('changed', () => send('thongbao:changed'));
  prefsEvents.on('changed', () => send('thongbao:prefs', currentPrefs()));

  ipcMain.handle('thongbao:state', (e) => { own(e); return { ...currentPrefs(), dev: IS_DEV, apps: notificationsState().apps }; });
  // Danh sách theo bộ lọc riêng của trang (khung chuông giữ bộ lọc của nó).
  ipcMain.handle('thongbao:list', async (e, q: { trang_thai?: unknown; ung_dung?: unknown }) => {
    own(e);
    const p = new URLSearchParams({ trang_thai: q?.trang_thai === 'tat_ca' ? 'tat_ca' : 'cho_xu_ly', limit: '500' });
    if (typeof q?.ung_dung === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(q.ung_dung)) p.set('ung_dung', q.ung_dung);
    try {
      const r = await api<{ items: ThongBao[]; dem: DemThongBao }>('GET', `/ext/notifications?${p}`);
      return { ok: true, ...r, apps: notificationsState().apps };
    } catch (err) { return { ok: false, error: (err as Error).message }; }
  });
  ipcMain.handle('thongbao:act', async (e, a: { act?: unknown; ids?: unknown }) => {
    own(e);
    const ids = Array.isArray(a?.ids) ? a.ids.filter((x): x is string => typeof x === 'string' && /^\d{1,18}$/.test(x)).slice(0, 500) : [];
    if (a?.act === 'open' && ids[0]) openNotification(ids[0]);
    else if (a?.act === 'doc') await markNotifications(ids, { da_doc: true });
    else if (a?.act === 'chua_doc') await markNotifications(ids, { da_doc: false });
    else if (a?.act === 'xu_ly') await markNotifications(ids, { da_xu_ly: true });
    else if (a?.act === 'chua_xu_ly') await markNotifications(ids, { da_xu_ly: false });
    else if (a?.act === 'xoa') await clearNotifications({ ids });
    else if (a?.act === 'xoa_da_xu_ly') await clearNotifications({ da_xu_ly: true });
    else if (a?.act === 'mau' && IS_DEV) await createSampleNotifications();
    return { ok: true };
  });
}

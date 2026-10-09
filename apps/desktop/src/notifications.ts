/**
 * Trung tâm thông báo — phía Vala Desktop (09/10/2026): đọc / sửa kho thông báo của người dùng trên máy chủ
 * (GET/POST /ext/notifications…), làm mới mỗi phút + khi mở cửa sổ; thông báo MỚI chờ xử lý ⇒ thông báo của hệ điều hành
 * (bấm ⇒ mở chi tiết). Chuông trên header + khung xổ (overlay.ts), trang Trung tâm thông báo (thongbao-page.ts) dùng chung.
 * Kịch bản thu thập thông báo từ các ứng dụng (POST /ext/notifications) làm sau; bản dev có "Tạo thông báo mẫu".
 */
import { EventEmitter } from 'node:events';
import { api } from './api';
import { catalog } from './apps';
import { messages } from './i18n';
import { notify } from './notify';
import { getSettings } from './settings';

export interface ThongBao {
  id: string; ung_dung: string; tieu_de: string; noi_dung: string | null; link: string | null;
  quan_trong: boolean; da_doc: boolean; da_xu_ly: boolean; luc: string;
}
export interface DemThongBao { cho_xu_ly: number; chua_doc: number; da_xu_ly: number; theo_ung_dung: Record<string, { cho: number; chua_doc: number }> }
export interface LocThongBao { trang_thai: 'cho_xu_ly' | 'tat_ca'; ung_dung: string | null }

export const notificationEvents = new EventEmitter();
let items: ThongBao[] = [];
let dem: DemThongBao = { cho_xu_ly: 0, chua_doc: 0, da_xu_ly: 0, theo_ung_dung: {} };
let loc: LocThongBao = { trang_thai: 'cho_xu_ly', ung_dung: null };
/** Đã biết (để chỉ báo hệ điều hành thông báo thật sự mới); null ⇒ chưa nạp lần nào (lần đầu không báo). */
let seen: Set<string> | null = null;
let timer: NodeJS.Timeout | null = null;
let openHook: (n: ThongBao) => void = () => {};

const M = messages({ newMany: (n: number) => `${n} thông báo mới` }, { newMany: (n: number) => `${n} new notifications` });

export const notificationsState = () => ({ items: items.slice(), dem, loc, ...appInfo() });

/** Tên + biểu tượng của các ứng dụng (mã trong danh mục) để hiện / lọc. */
function appInfo() {
  const apps: Record<string, { ten: string; icon: string | null }> = {};
  for (const a of catalog().apps) apps[a.ma] = { ten: a.ten, icon: a.icon };
  return { apps };
}

export async function refreshNotifications(): Promise<void> {
  if (!getSettings().deviceToken) return;
  try {
    const q = new URLSearchParams({ trang_thai: loc.trang_thai, ...(loc.ung_dung ? { ung_dung: loc.ung_dung } : {}) });
    const r = await api<{ items: ThongBao[]; dem: DemThongBao }>('GET', `/ext/notifications?${q}`);
    items = r.items;
    dem = r.dem;
    // Thông báo chờ xử lý chưa từng thấy ⇒ báo hệ điều hành (chỉ khi đang xem "chờ xử lý" mọi ứng dụng — đủ danh sách).
    if (!loc.ung_dung && loc.trang_thai === 'cho_xu_ly') {
      const fresh = seen ? items.filter((n) => !n.da_xu_ly && !n.da_doc && !seen!.has(n.id)) : [];
      seen = new Set([...(seen ?? []), ...items.map((n) => n.id)]);
      if (fresh.length === 1) notify(fresh[0]!.tieu_de, fresh[0]!.noi_dung ?? '', () => openNotification(fresh[0]!.id));
      else if (fresh.length > 1) notify(M[getSettings().lang].newMany(fresh.length), fresh.slice(0, 3).map((n) => n.tieu_de).join(' · '));
    }
    notificationEvents.emit('changed');
  } catch { /* mất mạng / máy chủ cũ: giữ danh sách đang có */ }
}

export async function setNotificationFilter(next: Partial<LocThongBao>): Promise<void> {
  loc = { ...loc, ...next };
  await refreshNotifications();
}

export async function markNotifications(ids: string[], v: { da_doc?: boolean; da_xu_ly?: boolean }): Promise<void> {
  if (!ids.length) return;
  try { await api('POST', '/ext/notifications/mark', { ids, ...v }); } catch { /* lần làm mới sau */ }
  await refreshNotifications();
}

export async function clearNotifications(v: { ids?: string[]; da_xu_ly?: boolean }): Promise<void> {
  try { await api('POST', '/ext/notifications/clear', v); } catch { /* lần làm mới sau */ }
  await refreshNotifications();
}

/** Mở chi tiết (link về đúng ứng dụng — browser.ts) + đánh dấu đã đọc. */
export function openNotification(id: string): void {
  const n = items.find((x) => x.id === id);
  if (!n) return;
  openHook(n);
  if (!n.da_doc) void markNotifications([id], { da_doc: true });
}

/** Bản dev: tạo vài thông báo mẫu cho các ứng dụng trong danh mục — để xem giao diện khi chưa có kịch bản thu thập. */
export async function createSampleNotifications(): Promise<void> {
  const apps = catalog().apps.filter((a) => a.kind !== 'reports').slice(0, 4);
  const now = Date.now();
  const mau = [
    { tieu_de: 'Văn bản mới cần xử lý: V/v báo cáo tình hình thực hiện nhiệm vụ quý IV', noi_dung: 'Hạn xử lý 15/10/2026. Đơn vị gửi: Văn phòng.', quan_trong: true },
    { tieu_de: 'Phiếu nghỉ phép chờ duyệt — Nguyễn Văn A (2 ngày)', noi_dung: 'Từ 12/10 đến 13/10/2026. Lý do: việc gia đình.' },
    { tieu_de: 'Lịch họp giao ban tuần đã đổi sang 14:00 thứ Hai', noi_dung: 'Phòng họp tầng 3.' },
    { tieu_de: 'Bạn được giao nhiệm vụ: Rà soát danh mục thủ tục hành chính', noi_dung: 'Người giao: Trưởng phòng. Hạn: 20/10/2026.' },
    { tieu_de: 'Tin nhắn mới từ nhóm Dự án Vala', noi_dung: 'Mọi người xem lại bản thiết kế giúp mình nhé.' },
  ];
  const list = mau.map((m, i) => {
    const a = apps[i % Math.max(1, apps.length)];
    return { ...m, ung_dung: a?.ma ?? 'vala', nguon_id: `mau-${now}-${i}`, link: a?.url && /^https?:/.test(a.url) ? a.url : null, luc: new Date(now - i * 47 * 60_000).toISOString() };
  });
  try { await api('POST', '/ext/notifications', { items: list }); } catch { /* bỏ qua */ }
  await refreshNotifications();
}

export function initNotifications(onOpen: (n: ThongBao) => void): void {
  openHook = onOpen;
  if (!timer) timer = setInterval(() => void refreshNotifications(), 60_000);
  void refreshNotifications();
}

/** Đăng xuất ⇒ quên danh sách (của người trước). */
export function clearNotificationCache(): void {
  items = [];
  dem = { cho_xu_ly: 0, chua_doc: 0, da_xu_ly: 0, theo_ung_dung: {} };
  loc = { trang_thai: 'cho_xu_ly', ung_dung: null };
  seen = null;
  notificationEvents.emit('changed');
}

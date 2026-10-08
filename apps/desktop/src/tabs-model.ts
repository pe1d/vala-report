/** Quy tắc thuần của cửa sổ tab (không phụ thuộc Electron, có test): link mở cửa sổ mới, chấm trạng thái. */
import type { SourceFull, SyncResult } from './sync';

export type OpenTarget =
  | { kind: 'tab'; foreground: boolean }
  | { kind: 'window' }
  | { kind: 'external' }
  | { kind: 'deny' };

/** Đuôi tên miền cấp 2 của Việt Nam: tên miền gốc gồm 3 nhãn cuối (vd quangnam.gov.vn). */
const VN_SLD = new Set(['gov', 'com', 'edu', 'org', 'net', 'ac', 'info', 'name', 'pro', 'health', 'int', 'biz']);

/** Tên miền gốc của một host (so "cùng hệ thống" khi mở link): 2 nhãn cuối, 3 nhãn nếu là đuôi cấp 2 Việt Nam; IP / tên đơn giữ nguyên. */
export function siteOf(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (/^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) return h;
  const p = h.split('.');
  const n = p.length >= 3 && p[p.length - 1] === 'vn' && VN_SLD.has(p[p.length - 2]!) ? 3 : 2;
  return p.slice(-n).join('.');
}

const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ''; } };

/**
 * Trang mở cửa sổ mới ⇒ mở thành gì:
 *   - popup có kích thước (đăng nhập SSO, hộp chọn người nhận…) và form POST ⇒ cửa sổ thật trong app (trang gốc cần
 *     window.opener / dữ liệu POST);
 *   - link target=_blank / window.open thường sang tên miền gốc KHÁC trang đang mở ⇒ trình duyệt mặc định của máy;
 *   - cùng tên miền gốc (vd eGov mở chi tiết văn bản) ⇒ tab trong app, giữ phiên đăng nhập của hệ thống;
 *   - tên miền đơn vị khai "mở trong Vala Desktop" (`inside` — gồm cả tên miền con) và tên miền các ứng dụng trong danh mục
 *     ⇒ luôn là tab trong app, dù khác tên miền gốc trang đang mở.
 */
export function openTarget(d: { url: string; disposition: string; hasPostBody?: boolean; openerUrl?: string }, inside: readonly string[] = []): OpenTarget {
  if (/^(mailto|tel):/i.test(d.url)) return { kind: 'external' };
  if (!/^https?:/i.test(d.url)) return { kind: 'deny' };
  if (d.disposition === 'new-window' || d.hasPostBody) return { kind: 'window' };
  const to = hostOf(d.url);
  const opensInside = inside.some((dm) => to === dm || to.endsWith(`.${dm}`));
  const from = d.openerUrl ? hostOf(d.openerUrl) : '';
  if (from && !opensInside && siteOf(from) !== siteOf(to)) return { kind: 'external' };
  return { kind: 'tab', foreground: d.disposition !== 'background-tab' };
}

/** Ứng dụng ghim (mã) = bố cục người dùng (bỏ mục không còn) hoặc các mục ghim sẵn của đơn vị; mục mặc định đứng đầu. */
export function catalogPinned<A extends { ma: string; pinned_default: boolean; is_default: boolean }>(apps: readonly A[], pinned: readonly string[] | null): string[] {
  const byMa = new Map(apps.map((a) => [a.ma, a]));
  const list = pinned ? pinned.map((m) => byMa.get(m)).filter((a): a is A => !!a) : apps.filter((a) => a.pinned_default);
  const def = list.find((a) => a.is_default);
  return (def ? [def, ...list.filter((a) => a !== def)] : list).map((a) => a.ma);
}

export type TabStatus = 'ok' | 'warn' | 'off';

/** Chấm trạng thái tab hệ thống nguồn: xanh = đang kết nối, cam = kết nối đang có bị hết hạn/lỗi, xám = chưa kết nối. */
export function tabStatus(r: SyncResult | undefined, state: SourceFull['state']): TabStatus {
  if (!r) return 'off';
  if (r === 'sent' || r === 'unchanged' || r === 'managed') return 'ok';
  return state === 'chua_cau_hinh' || state === 'revoked' ? 'off' : 'warn';
}

/** Nhóm trên thanh dọc: Ứng dụng = mục ghim; Đang mở = mục đang mở mà không ghim (Trợ lý AI có chỗ riêng). */
export function sidebarSections(a: { pinned: readonly string[]; open: readonly string[] }): { apps: string[]; open: string[] } {
  return { apps: [...a.pinned], open: a.open.filter((k) => k !== 'chat' && !a.pinned.includes(k)) };
}

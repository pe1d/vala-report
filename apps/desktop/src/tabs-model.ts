/** Quy tắc thuần của cửa sổ tab (không phụ thuộc Electron, có test): ô địa chỉ, link mở cửa sổ mới, chấm trạng thái. */
import type { SourceFull, SyncResult } from './sync';

/** Chuỗi gõ ở ô địa chỉ ⇒ URL http(s), hoặc null. Thiếu giao thức thì coi là https. */
export function addressToUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export type OpenTarget =
  | { kind: 'tab'; foreground: boolean }
  | { kind: 'window' }
  | { kind: 'external' }
  | { kind: 'deny' };

/**
 * Trang mở cửa sổ mới ⇒ mở thành gì. Link target=_blank / window.open thường ⇒ tab (thống nhất cách mở link, mục 2.3
 * biên bản họp). Popup có kích thước (đăng nhập SSO, hộp chọn người nhận…) và form POST ⇒ cửa sổ thật, vì trang gốc
 * cần window.opener hoặc dữ liệu POST mà tab mới không giữ được.
 */
export function openTarget(d: { url: string; disposition: string; hasPostBody?: boolean }): OpenTarget {
  if (/^(mailto|tel):/i.test(d.url)) return { kind: 'external' };
  if (!/^https?:/i.test(d.url)) return { kind: 'deny' };
  if (d.disposition === 'new-window' || d.hasPostBody) return { kind: 'window' };
  return { kind: 'tab', foreground: d.disposition !== 'background-tab' };
}

export type TabStatus = 'ok' | 'warn' | 'off';

/** Chấm trạng thái tab hệ thống nguồn: xanh = đang kết nối, cam = kết nối đang có bị hết hạn/lỗi, xám = chưa kết nối. */
export function tabStatus(r: SyncResult | undefined, state: SourceFull['state']): TabStatus {
  if (!r) return 'off';
  if (r === 'sent' || r === 'unchanged' || r === 'managed') return 'ok';
  return state === 'chua_cau_hinh' || state === 'revoked' ? 'off' : 'warn';
}

/**
 * Trang chính (tab Vala) do QUẢN TRỊ đặt cho cả đơn vị trên cổng (Quản trị → Cấu hình chung → "Trang chính của Vala
 * Desktop"); người dùng không tự đổi. Đọc từ GET /api/v1/branding (công khai — chưa đăng nhập cũng đọc được), lưu lại
 * trong settings.json để mở ứng dụng khi mất mạng vẫn đúng trang. Quản trị để trống ⇒ trang mặc định của bản build.
 * Riêng bản dev được tự đặt trang chính (settings.devHomeUrl) để thử.
 */
import { net } from 'electron';
import { IS_DEV } from './channel';
import { DEFAULT_HOME, DEFAULT_SERVER, getSettings, normalizeHome, setSettings } from './settings';

/** Hỏi máy chủ trang chính hiện hành; trả true nếu khác trang đang dùng (đã lưu lại). */
export async function refreshHomeFromServer(): Promise<boolean> {
  const s = getSettings();
  // Bản dev được tự đặt trang chính để thử (cửa sổ Cài đặt) — đè trang của máy chủ.
  if (IS_DEV && s.devHomeUrl) {
    if (s.devHomeUrl === s.homeUrl) return false;
    setSettings({ homeUrl: s.devHomeUrl });
    return true;
  }
  try {
    const r = await net.fetch(`${s.serverUrl || DEFAULT_SERVER}/api/v1/branding`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return false;
    const b = (await r.json()) as { desktop_home_url?: string | null };
    const url = (b.desktop_home_url && normalizeHome(b.desktop_home_url)) || DEFAULT_HOME;
    if (url === s.homeUrl) return false;
    setSettings({ homeUrl: url });
    return true;
  } catch {
    return false;   // mất mạng / máy chủ cũ chưa có trường này: giữ trang đang dùng
  }
}

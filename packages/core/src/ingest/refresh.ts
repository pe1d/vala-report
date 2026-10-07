import { canAutoRenew, isPermanentLoginError, type AuthMethod, type ConnectionSessions } from '../connections.js';
import { withTenant, type Db } from '../db/index.js';
import { Problem } from '../errors.js';

export interface RefreshSummary {
  checked: number;
  refreshed: number;
  expired: number;
  failed: number;
  skipped: number;
}

/**
 * Làm mới chủ động (worker chạy định kỳ): phiên ứng dụng sắp hết hạn thì lấy lại trước, để lượt crawl
 * theo lịch không phải gặp phiên hỏng. Lấy lại theo cách xác thực của kết nối:
 *   - sso: refresh token SSO (giữ token sống miễn là người dùng còn uỷ quyền);
 *   - password: tự đăng nhập lại bằng tài khoản/mật khẩu do quản trị cấu hình;
 *   - cookie: KHÔNG tự làm mới được — bỏ qua, chờ quản trị dán cookie mới.
 *
 * Hết hạn hẳn (SSO từ chối, sai mật khẩu, cần OTP) ⇒ đánh dấu kết nối để quản trị / người dùng sửa.
 */
export interface KeepAliveSummary { checked: number; alive: number; rotated: number; expired: number; unavailable: number }

/**
 * Giữ phiên các kết nối do Vala Desktop / tiện ích / cookie cấp (không tự đăng nhập lại được ở máy chủ) — T10, biên bản họp
 * 10/2026 "đẩy phần duy trì phiên lên backend": mỗi `everyMinutes` gọi session_probe một lần bằng cookie đang lưu để phiên
 * không hết hạn vì để lâu không dùng, kể cả khi máy người dùng tắt. Phiên chết ⇒ đánh dấu hết hạn ngay (Vala Desktop thấy và
 * tự đăng nhập lại bằng mật khẩu lưu trong máy). Nguồn lỗi (5xx, mạng) ⇒ giữ nguyên trạng thái, lần sau thử lại.
 */
export async function keepAliveSessions(writer: Db, connections: ConnectionSessions, everyMinutes = 10): Promise<KeepAliveSummary> {
  const out: KeepAliveSummary = { checked: 0, alive: 0, rotated: 0, expired: 0, unavailable: 0 };
  if (everyMinutes <= 0) return out;
  const grants = await withTenant(writer, (t) => t.any<{ id: number; app_user_id: number; source_system: string }>(
    `SELECT id, app_user_id, source_system FROM source_grants
      WHERE revoked_at IS NULL AND session_state = 'active' AND auth_method IN ('extension', 'cookie')
        AND (last_keepalive_at IS NULL OR last_keepalive_at < now() - make_interval(mins => $1))
      ORDER BY last_keepalive_at NULLS FIRST LIMIT 200`, [everyMinutes]));
  for (const g of grants) {
    out.checked++;
    let r: Awaited<ReturnType<ConnectionSessions['keepAlive']>>;
    try { r = await connections.keepAlive(g.app_user_id, g.source_system); } catch (e) {
      r = { state: 'unavailable', rotated: 0, detail: (e as Error).message };   // vd adapter của nguồn chưa nạp
    }
    if (r.state === 'expired' || r.state === 'missing') {
      await withTenant(writer, (t) => t.none(
        `UPDATE source_grants SET session_state = 'expired', last_keepalive_at = now(), last_error = $2 WHERE id = $1`,
        [g.id, `Giữ phiên: ${r.state === 'missing' ? 'kho bí mật không còn phiên' : 'hệ thống nguồn từ chối phiên'}${r.detail ? ` — ${r.detail}` : ''}`.slice(0, 300)]));
      out.expired++;
      continue;
    }
    await withTenant(writer, (t) => t.none('UPDATE source_grants SET last_keepalive_at = now() WHERE id = $1', [g.id]));
    if (r.state === 'alive') { out.alive++; out.rotated += r.rotated; } else out.unavailable++;
  }
  return out;
}

export async function refreshExpiringSessions(
  writer: Db, connections: ConnectionSessions, withinMinutes = 60, onlyUserIds?: number[],
): Promise<RefreshSummary> {
  const grants = await withTenant(writer, (t) => t.any<{ id: number; app_user_id: number; source_system: string; auth_method: AuthMethod }>(
    `SELECT id, app_user_id, source_system, auth_method FROM source_grants
      WHERE revoked_at IS NULL AND session_state = 'active'
        AND (session_expires_at IS NULL OR session_expires_at < now() + make_interval(mins => $1))
        AND ($2::bigint[] IS NULL OR app_user_id = ANY($2::bigint[]))
      ORDER BY session_expires_at NULLS FIRST`, [withinMinutes, onlyUserIds ?? null]));
  const out: RefreshSummary = { checked: grants.length, refreshed: 0, expired: 0, failed: 0, skipped: 0 };
  // Tiện ích báo kèm thời hạn cookie phiên: quá hạn ⇒ đánh dấu hết hạn ngay (tiện ích thấy và nhắc người dùng đăng
  // nhập lại), thay vì chờ tới lượt crawl gặp lỗi 401.
  out.expired += await withTenant(writer, (t) => t.result(
    `UPDATE source_grants SET session_state = 'expired', last_error = 'Phiên trên trình duyệt đã quá thời hạn của cookie'
      WHERE revoked_at IS NULL AND session_state = 'active' AND auth_method = 'extension'
        AND session_expires_at IS NOT NULL AND session_expires_at < now()
        AND ($1::bigint[] IS NULL OR app_user_id = ANY($1::bigint[]))`, [onlyUserIds ?? null], (r) => r.rowCount));
  for (const g of grants) {
    if (!canAutoRenew(g.auth_method)) { out.skipped++; continue; }   // cookie / tiện ích: chờ người dùng
    try {
      const s = await connections.renew(g.app_user_id, g.source_system, g.auth_method);
      await withTenant(writer, (t) => t.none(
        `UPDATE source_grants SET session_expires_at = $2, last_refresh_at = now(), refresh_fail_count = 0, last_error = NULL
          WHERE id = $1`, [g.id, s.expires_at ?? null]));
      out.refreshed++;
    } catch (e) {
      // session_expired = SSO hết hạn (người dùng đăng nhập lại); permanent = sai mật khẩu / OTP (quản trị sửa).
      const permanent = (e instanceof Problem && e.type === 'session_expired') || isPermanentLoginError(e);
      const nextState = e instanceof Problem && (e.type === 'invalid_credentials' || e.type === 'otp_required') ? 'failed' : 'expired';
      await withTenant(writer, (t) => t.none(
        `UPDATE source_grants
            SET session_state = CASE WHEN $2 THEN $4 ELSE session_state END,
                refresh_fail_count = refresh_fail_count + 1, last_error = $3
          WHERE id = $1`, [g.id, permanent, (e as Error).message.slice(0, 300), nextState]));
      if (permanent) out.expired++;
      else out.failed++;
    }
  }
  return out;
}

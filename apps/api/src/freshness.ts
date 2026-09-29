import type { Tx } from '@vala/core';

export interface Freshness {
  source_system: string;
  status: 'ok' | 'stale' | 'failed' | 'no_grant';
  last_success_at: string | null;
  message: string;
  grant_state?: string | null;
  /** Chỉ có ở phạm vi đơn vị: báo cáo cấp đơn vị luôn có thể chưa đầy đủ (mục 07). */
  coverage?: { members: number; granted: number; message: string };
}

const STALE_HOURS = Number(process.env.FRESHNESS_STALE_HOURS ?? 48);

export function formatAsOf(d: Date): string {
  const time = d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${time} ngày ${date}`;
}

/** Chạy bên trong withUserContext — mọi bảng đọc ở đây đều chịu RLS hoặc là hàm chỉ trả số đếm. */
export async function computeFreshness(t: Tx, userId: number, source: string, scope: 'ca_nhan' | 'don_vi'): Promise<Freshness> {
  if (scope === 'don_vi') {
    const c = await t.one<{ members: number; granted: number; oldest_success: Date | null }>(
      'SELECT members, granted, oldest_success FROM org_coverage($1)', [source]);
    const coverage = {
      members: c.members,
      granted: c.granted,
      message: `Đang tổng hợp từ ${c.granted}/${c.members} thành viên đã uỷ quyền`,
    };
    if (!c.oldest_success) {
      return { source_system: source, status: c.granted ? 'stale' : 'no_grant', last_success_at: null, message: 'Chưa có lần lấy dữ liệu thành công nào', coverage };
    }
    const stale = Date.now() - c.oldest_success.getTime() > STALE_HOURS * 3_600_000;
    return {
      source_system: source,
      status: stale ? 'stale' : 'ok',
      last_success_at: c.oldest_success.toISOString(),
      // Lấy mốc CŨ NHẤT trong các thành viên: số liệu đơn vị chỉ "tính đến" lúc người chậm nhất.
      message: `Số liệu tính đến ${formatAsOf(c.oldest_success)}`,
      coverage,
    };
  }

  const grant = await t.oneOrNone<{ session_state: string; revoked_at: Date | null }>(
    'SELECT session_state, revoked_at FROM source_grants WHERE app_user_id = $1 AND source_system = $2', [userId, source]);
  const grantState = !grant ? null : grant.revoked_at ? 'revoked' : grant.session_state;
  const runs = await t.oneOrNone<{ last_ok: Date | null; last_failed: Date | null }>(
    `SELECT max(finished_at) FILTER (WHERE status = 'ok') AS last_ok,
            max(finished_at) FILTER (WHERE status = 'failed') AS last_failed
       FROM crawl_runs WHERE app_user_id = $1 AND source_system = $2`, [userId, source]);
  const lastOk = runs?.last_ok ?? null;

  if (!grantState || grantState === 'revoked' || grantState === 'pending') {
    return { source_system: source, status: 'no_grant', last_success_at: lastOk?.toISOString() ?? null, grant_state: grantState,
      message: lastOk ? `Chưa uỷ quyền — số liệu cũ tính đến ${formatAsOf(lastOk)}` : 'Chưa uỷ quyền lấy dữ liệu' };
  }
  if (!lastOk) {
    return { source_system: source, status: runs?.last_failed ? 'failed' : 'stale', last_success_at: null, grant_state: grantState,
      message: runs?.last_failed ? 'Lần lấy dữ liệu gần nhất bị lỗi' : 'Đang chờ lần lấy dữ liệu đầu tiên' };
  }
  const failedAfter = !!runs?.last_failed && runs.last_failed > lastOk;
  const stale = Date.now() - lastOk.getTime() > STALE_HOURS * 3_600_000;
  return {
    source_system: source,
    status: grantState === 'expired' || failedAfter ? 'failed' : stale ? 'stale' : 'ok',
    last_success_at: lastOk.toISOString(),
    grant_state: grantState,
    message: `Số liệu tính đến ${formatAsOf(lastOk)}`,
  };
}

/**
 * Xác nhận đồng ý trước khi kết nối một hệ thống nguồn (mô hình dữ liệu cá nhân — phương án, mục 11): Vala dùng tài
 * khoản của chính người dùng để lấy dữ liệu theo lịch họ đặt, và nhật ký của hệ thống nguồn sẽ ghi nhận các lần truy cập
 * đó. Nội dung khớp CONSENT_VERSION ở máy chủ (apps/api/src/consent.ts) — đổi nội dung thì tăng phiên bản ở đó.
 */
import { useState } from 'react';
import { api } from '../api';

export function consentText(sourceTen: string) {
  return `Vala sẽ dùng tài khoản ${sourceTen} của bạn để tự lấy dữ liệu công việc của chính bạn theo lịch bạn đặt (và khi bạn đang dùng cổng). `
    + `Nhật ký của ${sourceTen} sẽ ghi nhận các lần truy cập này dưới tên tài khoản của bạn. Chỉ bạn xem được dữ liệu lấy về; `
    + 'bạn có thể gỡ kết nối bất cứ lúc nào.';
}

/** Ô xác nhận: tick ⇒ lưu đồng ý lên máy chủ rồi gọi onDone. */
export function ConsentBox({ source, sourceTen, connected, onDone }: { source: string; sourceTen: string; connected: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const agree = async () => {
    setBusy(true); setErr(null);
    try { await api.post(`/me/consents/${source}`); onDone(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p>{connected && <b>Cần xác nhận: </b>}{consentText(sourceTen)}</p>
      <label className="mt-2 flex cursor-pointer items-center gap-2 font-medium">
        <input type="checkbox" disabled={busy} onChange={(e) => e.target.checked && void agree()} />
        Tôi đã hiểu và đồng ý
      </label>
      {err && <p className="mt-1 text-red-700 dark:text-red-400">{err}</p>}
    </div>
  );
}

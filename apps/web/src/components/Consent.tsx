/**
 * Xác nhận đồng ý trước khi kết nối một hệ thống nguồn (mô hình dữ liệu cá nhân — phương án, mục 11): Vala dùng tài
 * khoản của chính người dùng để lấy dữ liệu theo lịch họ đặt, và nhật ký của hệ thống nguồn sẽ ghi nhận các lần truy cập
 * đó. Nội dung khớp CONSENT_VERSION ở máy chủ (apps/api/src/consent.ts) — đổi nội dung thì tăng phiên bản ở đó.
 * Bản tiếng Anh dùng đúng câu như tiện ích trình duyệt.
 */
import { useState } from 'react';
import { api } from '../api';
import { messages, tr, useT } from '../i18n';

const M = messages({
  consentText: (src: string) =>
    `Vala sẽ dùng tài khoản ${src} của bạn để tự lấy dữ liệu công việc của chính bạn theo lịch bạn đặt (và khi bạn đang dùng cổng). `
    + `Nhật ký của ${src} sẽ ghi nhận các lần truy cập này dưới tên tài khoản của bạn. Chỉ bạn xem được dữ liệu lấy về; `
    + 'bạn có thể gỡ kết nối bất cứ lúc nào.',
  required: 'Cần xác nhận: ',
  agree: 'Tôi đã hiểu và đồng ý',
}, {
  consentText: (src: string) =>
    `Vala will use your ${src} account to automatically fetch your own work data on the schedule you set (and while you are using the portal). `
    + `${src}'s logs will record these accesses under your account. Only you can see the fetched data; `
    + 'you can remove the connection at any time.',
  required: 'Action required: ',
  agree: 'I understand and agree',
});

/** Câu đồng ý theo ngôn ngữ đang chọn (ngoài component). */
export function consentText(sourceTen: string) {
  return tr(M).consentText(sourceTen);
}

/** Ô xác nhận: tick ⇒ lưu đồng ý lên máy chủ rồi gọi onDone. */
export function ConsentBox({ source, sourceTen, connected, onDone }: { source: string; sourceTen: string; connected: boolean; onDone: () => void }) {
  const t = useT(M);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const agree = async () => {
    setBusy(true); setErr(null);
    try { await api.post(`/me/consents/${source}`); onDone(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p>{connected && <b>{t.required}</b>}{t.consentText(sourceTen)}</p>
      <label className="mt-2 flex cursor-pointer items-center gap-2 font-medium">
        <input type="checkbox" disabled={busy} onChange={(e) => e.target.checked && void agree()} />
        {t.agree}
      </label>
      {err && <p className="mt-1 text-red-700 dark:text-red-400">{err}</p>}
    </div>
  );
}

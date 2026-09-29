import { useEffect, useState } from 'react';
import { api, type Grant } from '../api';
import { startGrant } from '../reauth';
import { Button } from './ui';

export function ReauthButton({ source, label = 'Đăng nhập lại' }: { source: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="primary" disabled={busy} onClick={() => { setBusy(true); void startGrant(source).catch(() => setBusy(false)); }}>
      {busy ? 'Đang chuyển…' : label}
    </Button>
  );
}

const DISMISS_KEY = 'vala.reauth.dismissed';
const COUNTDOWN = 5;

/**
 * Phiên lấy dữ liệu hết hạn và hệ thống KHÔNG tự lấy lại được (SSO đã từ chối refresh token):
 * báo rõ và tự chuyển người dùng sang trang đăng nhập Bkav SSO (tài liệu kỹ thuật, mục 07).
 * Người dùng có thể bấm "Để sau" — khi đó chỉ nhắc lại ở lần mở cổng tiếp theo.
 */
export function ReauthGate() {
  const [expired, setExpired] = useState<Grant | null>(null);
  const [left, setLeft] = useState(COUNTDOWN);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { /* bỏ qua */ }
    // Vừa quay về từ SSO thì không chặn lại ngay (kết quả hiện ở trang Uỷ quyền).
    if (dismissed || window.location.pathname === '/uy-quyen') return;
    api.get<Grant[]>('/grants').then((gs) => setExpired(gs.find((g) => g.session_state === 'expired') ?? null), () => {});
  }, []);

  useEffect(() => {
    if (!expired) return;
    if (left <= 0) { void startGrant(expired.source_system); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [expired, left]);

  if (!expired) return null;
  const later = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* bỏ qua */ }
    setExpired(null);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 id="reauth-title" className="text-lg font-semibold">Cần đăng nhập lại {expired.ten}</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Phiên Bkav SSO dùng để lấy dữ liệu thay bạn đã hết hạn, nên hệ thống không tự lấy lại phiên {expired.ten} được nữa.
          Các lịch chạy của bạn đang tạm dừng cho tới khi bạn đăng nhập lại.
        </p>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          Tự chuyển tới trang đăng nhập Bkav SSO sau <span className="tabular-nums font-semibold">{Math.max(left, 0)}</span> giây…
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={later}>Để sau</Button>
          <ReauthButton source={expired.source_system} label="Đăng nhập lại ngay" />
        </div>
      </div>
    </div>
  );
}

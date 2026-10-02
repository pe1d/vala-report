import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Grant } from '../api';
import { appPath } from '../base';
import { startGrant } from '../reauth';
import { Button } from './ui';
import { useBranding } from '../branding';

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
 * Kết nối cần phiên mới mà hệ thống KHÔNG tự lấy lại được ⇒ báo rõ, đúng theo cách kết nối:
 *   - SSO (refresh token bị từ chối): tự chuyển sang trang đăng nhập SSO sau vài giây (tài liệu kỹ thuật, mục 07);
 *   - tiện ích / cookie / mật khẩu: nêu đúng lý do (phiên hết hạn trên nguồn, hay phiên đã lưu bị mất) và hướng dẫn
 *     mở hệ thống trên trình duyệt để tiện ích tự gửi phiên — không chuyển trang, không nói nhầm là SSO.
 * "Để sau" ⇒ chỉ nhắc lại ở lần mở cổng tiếp theo.
 */
export function ReauthGate() {
  const ssoName = useBranding().ten_sso;
  const navigate = useNavigate();
  const [expired, setExpired] = useState<Grant[]>([]);
  const [left, setLeft] = useState(COUNTDOWN);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { /* bỏ qua */ }
    // Đang ở trang Tài khoản nguồn thì không chặn (trạng thái đã hiện ở đó).
    if (dismissed || appPath() === '/uy-quyen') return;
    api.get<Grant[]>('/grants').then((gs) => setExpired(gs.filter((g) => g.session_state === 'expired')), () => {});
  }, []);

  const sso = expired.length === 1 && expired[0]!.auth_method === 'sso' ? expired[0]! : null;
  useEffect(() => {
    if (!sso) return;
    if (left <= 0) { void startGrant(sso.source_system); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [sso, left]);

  if (!expired.length) return null;
  const later = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* bỏ qua */ }
    setExpired([]);
  };
  const names = expired.map((g) => g.ten).join(', ');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {sso ? (
          <>
            <h2 id="reauth-title" className="text-lg font-semibold">Cần đăng nhập lại {sso.ten}</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Phiên {ssoName} dùng để lấy dữ liệu thay bạn đã hết hạn, nên hệ thống không tự lấy lại phiên {sso.ten} được nữa.
              Các lịch chạy của bạn đang tạm dừng cho tới khi bạn đăng nhập lại.
            </p>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
              Tự chuyển tới trang đăng nhập {ssoName} sau <span className="tabular-nums font-semibold">{Math.max(left, 0)}</span> giây…
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={later}>Để sau</Button>
              <ReauthButton source={sso.source_system} label="Đăng nhập lại ngay" />
            </div>
          </>
        ) : (
          <>
            <h2 id="reauth-title" className="text-lg font-semibold">Cần gửi lại phiên đăng nhập {names}</h2>
            <ul className="mt-3 grid gap-2">
              {expired.map((g) => (
                <li key={g.source_system} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <div className="font-medium">{g.ten}</div>
                  <div className="text-slate-600 dark:text-slate-300">{reasonOf(g)}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Mở hệ thống đó trên trình duyệt có cài tiện ích Vala và đăng nhập (kể cả mã OTP nếu được hỏi) — tiện ích tự gửi
              phiên cho Vala, không cần làm gì thêm ở đây. Các lịch chạy dùng hệ thống này tạm dừng cho tới lúc đó.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={later}>Để sau</Button>
              <Button variant="primary" onClick={() => { later(); navigate('/uy-quyen'); }}>Mở Tài khoản nguồn</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Lý do dễ hiểu từ last_error: phiên đã lưu bị mất ≠ phiên hết hạn trên nguồn. */
function reasonOf(g: Grant): string {
  const e = g.last_error ?? '';
  if (/bị mất/i.test(e)) return 'Phiên đã lưu trên máy chủ bị mất (máy chủ khởi động lại) — không phải do bạn đăng xuất.';
  if (/hết hạn|từ chối phiên|expired/i.test(e)) return `Phiên đăng nhập trên ${g.ten} đã hết hạn hoặc đã bị đăng xuất.`;
  return e || 'Phiên đăng nhập không còn dùng được.';
}

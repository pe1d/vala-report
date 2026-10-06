import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Grant } from '../api';
import { appPath } from '../base';
import { startGrant } from '../reauth';
import { Button } from './ui';
import { useBranding } from '../branding';
import { messages, tr, useT } from '../i18n';

const M = messages({
  signInAgain: 'Đăng nhập lại', redirecting: 'Đang chuyển…',
  ssoTitle: (src: string) => `Cần đăng nhập lại ${src}`,
  ssoBody: (sso: string, src: string) => `Phiên ${sso} dùng để lấy dữ liệu thay bạn đã hết hạn, nên hệ thống không tự lấy lại phiên ${src} được nữa. Các lịch chạy của bạn đang tạm dừng cho tới khi bạn đăng nhập lại.`,
  countdown: (sso: string, n: ReactNode): ReactNode => <>Tự chuyển tới trang đăng nhập {sso} sau {n} giây…</>,
  later: 'Để sau', signInNow: 'Đăng nhập lại ngay',
  resendTitle: (names: string) => `Cần gửi lại phiên đăng nhập ${names}`,
  resendBody: 'Mở hệ thống đó trên trình duyệt có cài tiện ích Vala và đăng nhập (kể cả mã OTP nếu được hỏi) — tiện ích tự gửi phiên cho Vala, không cần làm gì thêm ở đây. Các lịch chạy dùng hệ thống này tạm dừng cho tới lúc đó.',
  openSourceAccounts: 'Mở Tài khoản nguồn',
  lost: 'Phiên đã lưu trên máy chủ bị mất (máy chủ khởi động lại) — không phải do bạn đăng xuất.',
  expired: (src: string) => `Phiên đăng nhập trên ${src} đã hết hạn hoặc đã bị đăng xuất.`,
  unusable: 'Phiên đăng nhập không còn dùng được.',
}, {
  signInAgain: 'Sign in again', redirecting: 'Redirecting…',
  ssoTitle: (src: string) => `Sign in to ${src} again`,
  ssoBody: (sso: string, src: string) => `The ${sso} session used to fetch data on your behalf has expired, so the system can no longer renew your ${src} session automatically. Your scheduled runs are paused until you sign in again.`,
  countdown: (sso: string, n: ReactNode): ReactNode => <>Redirecting to the {sso} sign-in page in {n} seconds…</>,
  later: 'Later', signInNow: 'Sign in again now',
  resendTitle: (names: string) => `Send your ${names} session again`,
  resendBody: "Open that system in a browser with the Vala browser extension installed and sign in (including the OTP code if asked). The extension sends the session to Vala automatically; there's nothing else to do here. Scheduled runs using this system are paused until then.",
  openSourceAccounts: 'Open Source accounts',
  lost: "The session saved on the server was lost (the server restarted). It wasn't because you signed out.",
  expired: (src: string) => `Your ${src} session has expired or you were signed out.`,
  unusable: 'The sign-in session can no longer be used.',
});

export function ReauthButton({ source, label }: { source: string; label?: string }) {
  const t = useT(M);
  label ??= t.signInAgain;
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="primary" disabled={busy} onClick={() => { setBusy(true); void startGrant(source).catch(() => setBusy(false)); }}>
      {busy ? t.redirecting : label}
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
  const t = useT(M);
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
            <h2 id="reauth-title" className="text-lg font-semibold">{t.ssoTitle(sso.ten)}</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              {t.ssoBody(ssoName, sso.ten)}
            </p>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
              {t.countdown(ssoName, <span className="tabular-nums font-semibold">{Math.max(left, 0)}</span>)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={later}>{t.later}</Button>
              <ReauthButton source={sso.source_system} label={t.signInNow} />
            </div>
          </>
        ) : (
          <>
            <h2 id="reauth-title" className="text-lg font-semibold">{t.resendTitle(names)}</h2>
            <ul className="mt-3 grid gap-2">
              {expired.map((g) => (
                <li key={g.source_system} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <div className="font-medium">{g.ten}</div>
                  <div className="text-slate-600 dark:text-slate-300">{reasonOf(g)}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {t.resendBody}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={later}>{t.later}</Button>
              <Button variant="primary" onClick={() => { later(); navigate('/uy-quyen'); }}>{t.openSourceAccounts}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Lý do dễ hiểu từ last_error: phiên đã lưu bị mất ≠ phiên hết hạn trên nguồn. */
function reasonOf(g: Grant): string {
  const t = tr(M);
  const e = g.last_error ?? '';
  if (/bị mất|was lost/i.test(e)) return t.lost;
  if (/hết hạn|từ chối phiên|expired/i.test(e)) return t.expired(g.ten);
  return e || t.unusable;
}

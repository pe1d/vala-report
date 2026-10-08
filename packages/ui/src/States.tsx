import type { ReactNode } from 'react';
import { ApiProblem } from './api';
import { Banner, Button, LinkButton, Skeleton } from './ui';
import { messages, useT } from './i18n';

/**
 * Nút "đăng nhập lại / kết nối lại" cho lỗi phiên hệ thống nguồn — nơi dùng (cổng web) đăng ký, vì cách kết nối lại phụ
 * thuộc môi trường (cổng: chuyển sang SSO / tiện ích cũ; Vala Desktop: mở hệ thống nguồn trong app). Không đăng ký ⇒ không có nút.
 */
let ReauthButton: ((p: { source: string }) => ReactNode) | null = null;
export const setReauthButton = (c: (p: { source: string }) => ReactNode) => { ReauthButton = c; };

const M = messages({
  loading: 'Đang tải',
  sessionExpired: 'Phiên uỷ quyền đã hết hạn nên hệ thống chưa lấy được dữ liệu mới.',
  grantRequired: 'Bạn chưa cấp tài khoản hệ thống nguồn cho báo cáo này, nên chưa có số liệu để hiển thị.',
  grant: 'Cấp tài khoản', scopeDenied: 'Bạn không có quyền xem phạm vi này.',
  network: 'Không kết nối được máy chủ.', retry: 'Thử lại',
}, {
  loading: 'Loading',
  sessionExpired: "The authorization session has expired, so new data couldn't be fetched yet.",
  grantRequired: "You haven't provided a source system account for this report yet, so there's no data to show.",
  grant: 'Add account', scopeDenied: "You don't have permission to view this scope.",
  network: "Couldn't reach the server.", retry: 'Try again',
});

export function Loading({ rows = 4 }: { rows?: number }) {
  const t = useT(M);
  return <div aria-busy="true" aria-label={t.loading}>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} width={`${90 - i * 12}%`} />)}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">{children}</div>;
}

/**
 * session_expired và grant_required KHÔNG hiện như lỗi kỹ thuật: dẫn người dùng đi uỷ quyền (mục 05).
 */
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT(M);
  if (error instanceof ApiProblem && (error.type === 'grant_required' || error.type === 'session_expired')) {
    return (
      <Banner tone="warn" role="alert">
        <span>{error.type === 'session_expired'
          ? t.sessionExpired
          : t.grantRequired}</span>
        {error.type === 'session_expired' && typeof error.body?.source_system === 'string' && ReauthButton
          ? ReauthButton({ source: error.body.source_system })
          : <LinkButton variant="primary" to="/uy-quyen">{t.grant}</LinkButton>}
      </Banner>
    );
  }
  if (error instanceof ApiProblem && error.type === 'scope_denied') {
    return <Banner tone="err" role="alert">{t.scopeDenied} {error.detail}</Banner>;
  }
  const msg = error instanceof ApiProblem ? `${error.title}${error.detail ? ` — ${error.detail}` : ''}` : t.network;
  return (
    <Banner tone="err" role="alert">
      <span>{msg}</span>
      {onRetry && <Button onClick={onRetry}>{t.retry}</Button>}
    </Banner>
  );
}

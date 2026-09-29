import type { ReactNode } from 'react';
import { ApiProblem } from '../api';
import { ReauthButton } from './Reauth';
import { Banner, Button, LinkButton, Skeleton } from './ui';

export function Loading({ rows = 4 }: { rows?: number }) {
  return <div aria-busy="true" aria-label="Đang tải">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} width={`${90 - i * 12}%`} />)}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">{children}</div>;
}

/**
 * session_expired và grant_required KHÔNG hiện như lỗi kỹ thuật: dẫn người dùng đi uỷ quyền (mục 05).
 */
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiProblem && (error.type === 'grant_required' || error.type === 'session_expired')) {
    return (
      <Banner tone="warn" role="alert">
        <span>{error.type === 'session_expired'
          ? 'Phiên uỷ quyền đã hết hạn nên hệ thống chưa lấy được dữ liệu mới.'
          : 'Bạn chưa cấp tài khoản hệ thống nguồn cho báo cáo này, nên chưa có số liệu để hiển thị.'}</span>
        {error.type === 'session_expired' && typeof error.body?.source_system === 'string'
          ? <ReauthButton source={error.body.source_system} />
          : <LinkButton variant="primary" to="/uy-quyen">Cấp tài khoản</LinkButton>}
      </Banner>
    );
  }
  if (error instanceof ApiProblem && error.type === 'scope_denied') {
    return <Banner tone="err" role="alert">Bạn không có quyền xem phạm vi này. {error.detail}</Banner>;
  }
  const msg = error instanceof ApiProblem ? `${error.title}${error.detail ? ` — ${error.detail}` : ''}` : 'Không kết nối được máy chủ.';
  return (
    <Banner tone="err" role="alert">
      <span>{msg}</span>
      {onRetry && <Button onClick={onRetry}>Thử lại</Button>}
    </Banner>
  );
}

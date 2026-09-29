import type { Freshness } from '../api';
import { ReauthButton } from './Reauth';
import { Badge, Banner, type Tone } from './ui';

const LABEL: Record<Freshness['status'], [Tone, string]> = {
  ok: ['ok', 'Dữ liệu mới'], stale: ['warn', 'Dữ liệu cũ'], failed: ['err', 'Lần lấy gần nhất lỗi'], no_grant: ['neutral', 'Chưa uỷ quyền'],
};

/** Dòng "số liệu tính đến…" — bắt buộc trên mọi màn hình dữ liệu, không được bỏ (mục 05). */
export function FreshnessBar({ f }: { f: Freshness }) {
  const [tone, label] = LABEL[f.status];
  return (
    <>
      <div className="my-2 flex flex-wrap items-center gap-3">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-slate-500 dark:text-slate-400">{f.message}</span>
      </div>
      {f.grant_state === 'expired' && (
        <Banner tone="warn">
          <span>Phiên Bkav SSO đã hết hạn — đang hiển thị số liệu cũ.</span>
          <ReauthButton source={f.source_system} />
        </Banner>
      )}
      {f.coverage && f.coverage.granted < f.coverage.members && (
        // Yêu cầu chức năng (mục 07): báo cáo đơn vị không được trình bày như thể đầy đủ.
        <Banner tone="warn" role="status">
          <strong>{f.coverage.message}.</strong>
          <span>Số liệu chưa bao gồm {f.coverage.members - f.coverage.granted} thành viên chưa uỷ quyền.</span>
        </Banner>
      )}
      {f.coverage && f.coverage.granted === f.coverage.members && (
        <p className="mb-2 text-slate-500 dark:text-slate-400">{f.coverage.message}.</p>
      )}
    </>
  );
}

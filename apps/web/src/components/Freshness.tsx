import type { Freshness } from '../api';
import { ReauthButton } from './Reauth';
import { Badge, Banner, type Tone } from './ui';
import { useBranding } from '../branding';
import { messages, useT } from '../i18n';

const TONE: Record<Freshness['status'], Tone> = { ok: 'ok', stale: 'warn', failed: 'err', no_grant: 'neutral' };
const M = messages({
  status: { ok: 'Dữ liệu mới', stale: 'Dữ liệu cũ', failed: 'Lần lấy gần nhất lỗi', no_grant: 'Chưa uỷ quyền' } as Record<Freshness['status'], string>,
  ssoExpired: (sso: string) => `Phiên ${sso} đã hết hạn — đang hiển thị số liệu cũ.`,
  notCovered: (n: number) => `Số liệu chưa bao gồm ${n} thành viên chưa uỷ quyền.`,
}, {
  status: { ok: 'Up to date', stale: 'Outdated', failed: 'Last fetch failed', no_grant: 'Not authorized' },
  ssoExpired: (sso: string) => `Your ${sso} session has expired. Showing older data.`,
  notCovered: (n: number) => `Figures don't include ${n} ${n === 1 ? "member who hasn't" : "members who haven't"} authorized access yet.`,
});

/** Dòng "số liệu tính đến…" — bắt buộc trên mọi màn hình dữ liệu, không được bỏ (mục 05). */
export function FreshnessBar({ f }: { f: Freshness }) {
  const t = useT(M);
  const ssoName = useBranding().ten_sso;
  const tone = TONE[f.status];
  const label = t.status[f.status];
  return (
    <>
      <div className="my-2 flex flex-wrap items-center gap-3">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-slate-500 dark:text-slate-400">{f.message}</span>
      </div>
      {f.grant_state === 'expired' && (
        <Banner tone="warn">
          <span>{t.ssoExpired(ssoName)}</span>
          <ReauthButton source={f.source_system} />
        </Banner>
      )}
      {f.coverage && f.coverage.granted < f.coverage.members && (
        // Yêu cầu chức năng (mục 07): báo cáo đơn vị không được trình bày như thể đầy đủ.
        <Banner tone="warn" role="status">
          <strong>{f.coverage.message}.</strong>
          <span>{t.notCovered(f.coverage.members - f.coverage.granted)}</span>
        </Banner>
      )}
      {f.coverage && f.coverage.granted === f.coverage.members && (
        <p className="mb-2 text-slate-500 dark:text-slate-400">{f.coverage.message}.</p>
      )}
    </>
  );
}

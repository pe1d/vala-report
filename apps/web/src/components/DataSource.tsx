/**
 * Nguồn dữ liệu của báo cáo (script crawl hoặc cách lấy trong adapter) + lịch tự cập nhật. Lịch gắn với NGUỒN, không
 * gắn với báo cáo: một lần cập nhật làm mới số liệu cho mọi báo cáo dùng chung nguồn đó — giao diện luôn nói rõ điều này.
 */
import { useState } from 'react';
import { api, fmtDateTime, targetOf, type DataSource } from '../api';
import { useAsync } from '../hooks';
import { ScheduleDialog } from './ScheduleForm';
import { ErrorBox } from './States';
import { Badge, Banner, Button, TextLink, type Tone } from './ui';
import { messages, tr, useT } from '../i18n';

const M = messages({
  runOk: 'Thành công', runFailed: 'Lỗi', runRunning: 'Đang chạy', runSkipped: 'Bỏ qua',
  grantExpired: 'Phiên hết hạn', grantFailed: 'Lỗi đăng nhập', grantPending: 'Chờ đăng nhập', grantNone: 'Chưa kết nối',
  runSent: (ten: string, n: number) =>
    `Đã gửi yêu cầu cập nhật ${ten}. Số liệu của ${n ? `${n} báo cáo dùng nguồn này` : 'các báo cáo dùng nguồn này'} sẽ mới sau vài phút.`,
  dataFrom: 'Dữ liệu lấy từ ',
  sharedWith: (n: number) => ` · dùng chung cho ${n} báo cáo khác`,
  autoUpdate: 'Tự cập nhật: ',
  disabled: 'Đang tắt',
  noSchedule: 'Chưa đặt lịch tự cập nhật',
  lastRun: (at: string) => ` · lần gần nhất ${at}`,
  editSchedule: 'Sửa lịch', setSchedule: 'Đặt lịch',
  needConnect: 'Cần kết nối hệ thống nguồn trước',
  sending: 'Đang gửi…', updateNow: 'Cập nhật ngay',
  seeAll: ' Xem tất cả ở ', schedules: 'Lịch cập nhật',
  saved: (ten: string, label: string) => `Đã lưu lịch tự cập nhật ${ten}: ${label}.`,
}, {
  runOk: 'Succeeded', runFailed: 'Failed', runRunning: 'Running', runSkipped: 'Skipped',
  grantExpired: 'Session expired', grantFailed: 'Sign-in failed', grantPending: 'Awaiting sign-in', grantNone: 'Not connected',
  runSent: (ten: string, n: number) =>
    `Update requested for ${ten}. Data for ${n ? `the ${n} ${n === 1 ? 'report' : 'reports'} using this source` : 'the reports using this source'} will be refreshed in a few minutes.`,
  dataFrom: 'Data from ',
  sharedWith: (n: number) => ` · shared with ${n} other ${n === 1 ? 'report' : 'reports'}`,
  autoUpdate: 'Auto-update: ',
  disabled: 'Off',
  noSchedule: 'No auto-update schedule',
  lastRun: (at: string) => ` · last run ${at}`,
  editSchedule: 'Edit schedule', setSchedule: 'Set schedule',
  needConnect: 'Connect the source system first',
  sending: 'Sending…', updateNow: 'Update now',
  seeAll: ' See all in ', schedules: 'Update schedule',
  saved: (ten: string, label: string) => `Saved the auto-update schedule for ${ten}: ${label}.`,
});

type Labels = typeof M.vi;
const runStatus = (t: Labels): Record<string, [Tone, string]> => ({
  ok: ['ok', t.runOk], failed: ['err', t.runFailed], running: ['neutral', t.runRunning], skipped: ['warn', t.runSkipped],
});
const grantState = (t: Labels): Record<string, [Tone, string]> => ({
  expired: ['err', t.grantExpired], failed: ['err', t.grantFailed], pending: ['warn', t.grantPending],
  revoked: ['neutral', t.grantNone], chua_cau_hinh: ['neutral', t.grantNone],
});
/** Trạng thái lượt chạy: mã → [tone, nhãn theo ngôn ngữ đang chọn]. */
export const useRunStatus = () => runStatus(useT(M));
/** Trạng thái kết nối tài khoản nguồn: mã → [tone, nhãn theo ngôn ngữ đang chọn]. */
export const useGrantState = () => grantState(useT(M));

/** "Cập nhật ngay": gửi yêu cầu, trả câu thông báo nói rõ bao nhiêu báo cáo được làm mới. */
export async function runNow(d: DataSource): Promise<string> {
  await api.post('/data-sources/run-now', targetOf(d));
  return tr(M).runSent(d.ten, d.reports.length);
}

/** Trang báo cáo: báo cáo lấy dữ liệu từ đâu, lịch tự cập nhật, lần cập nhật gần nhất + nút sửa lịch / cập nhật ngay. */
export function DataSourceBar({ reportCode, version = 0 }: { reportCode: string; /** Đổi ⇒ tải lại (vd vừa tự cập nhật xong). */ version?: number }) {
  const t = useT(M);
  const src = useAsync(() => api.get<DataSource[]>(`/data-sources?report=${encodeURIComponent(reportCode)}`), [reportCode, version]);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const d = src.data?.[0];
  if (!d) return src.error ? <ErrorBox error={src.error} onRetry={src.reload} /> : null;
  const others = d.reports.filter((r) => r.code !== reportCode);
  const sc = d.schedule;
  const st = d.last_run ? runStatus(t)[d.last_run.status] : null;
  const update = async () => {
    setBusy(true); setErr(null); setNote(null);
    try { setNote(await runNow(d)); src.reload(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
        <span className="min-w-0 flex-1">
          {t.dataFrom}<b>{d.ten}</b>
          {others.length > 0 && <span className="text-slate-500 dark:text-slate-400" title={others.map((r) => r.ten).join('\n')}>{t.sharedWith(others.length)}</span>}
          <br />
          <span className="text-slate-600 dark:text-slate-300">
            {sc ? <>{t.autoUpdate}{sc.schedule_label}{!sc.is_enabled && <> <Badge tone="neutral">{t.disabled}</Badge></>}</> : t.noSchedule}
            {d.last_run && <>{t.lastRun(fmtDateTime(d.last_run.finished_at ?? d.last_run.started_at))}{st && <> <Badge tone={st[0]}>{st[1]}</Badge></>}</>}
          </span>
        </span>
        <Button onClick={() => setEditing(true)}>{sc ? t.editSchedule : t.setSchedule}</Button>
        <Button disabled={busy || !d.can_run} title={d.can_run ? undefined : t.needConnect} onClick={() => void update()}>
          {busy ? t.sending : t.updateNow}
        </Button>
      </div>
      {note && <Banner tone="info">{note}{t.seeAll}<TextLink to="/lich-chay">{t.schedules}</TextLink>.</Banner>}
      {err ? <ErrorBox error={err} /> : null}
      {editing && (
        <ScheduleDialog source={d} onClose={() => setEditing(false)}
          onSaved={(n) => { setEditing(false); setNote(t.saved(n.ten, n.schedule?.schedule_label ?? '')); src.reload(); }} />
      )}
    </div>
  );
}

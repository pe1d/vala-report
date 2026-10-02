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

export const RUN_STATUS: Record<string, [Tone, string]> = {
  ok: ['ok', 'Thành công'], failed: ['err', 'Lỗi'], running: ['neutral', 'Đang chạy'], skipped: ['warn', 'Bỏ qua'],
};
export const GRANT_STATE: Record<string, [Tone, string]> = {
  expired: ['err', 'Phiên hết hạn'], failed: ['err', 'Lỗi đăng nhập'], pending: ['warn', 'Chờ đăng nhập'],
  revoked: ['neutral', 'Chưa kết nối'], chua_cau_hinh: ['neutral', 'Chưa kết nối'],
};

/** "Cập nhật ngay": gửi yêu cầu, trả câu thông báo nói rõ bao nhiêu báo cáo được làm mới. */
export async function runNow(d: DataSource): Promise<string> {
  await api.post('/data-sources/run-now', targetOf(d));
  return `Đã gửi yêu cầu cập nhật ${d.ten}. Số liệu của ${d.reports.length ? `${d.reports.length} báo cáo dùng nguồn này` : 'các báo cáo dùng nguồn này'} sẽ mới sau vài phút.`;
}

/** Trang báo cáo: báo cáo lấy dữ liệu từ đâu, lịch tự cập nhật, lần cập nhật gần nhất + nút sửa lịch / cập nhật ngay. */
export function DataSourceBar({ reportCode, version = 0 }: { reportCode: string; /** Đổi ⇒ tải lại (vd vừa tự cập nhật xong). */ version?: number }) {
  const src = useAsync(() => api.get<DataSource[]>(`/data-sources?report=${encodeURIComponent(reportCode)}`), [reportCode, version]);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const d = src.data?.[0];
  if (!d) return src.error ? <ErrorBox error={src.error} onRetry={src.reload} /> : null;
  const others = d.reports.filter((r) => r.code !== reportCode);
  const sc = d.schedule;
  const st = d.last_run ? RUN_STATUS[d.last_run.status] : null;
  const update = async () => {
    setBusy(true); setErr(null); setNote(null);
    try { setNote(await runNow(d)); src.reload(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
        <span className="min-w-0 flex-1">
          Dữ liệu lấy từ <b>{d.ten}</b>
          {others.length > 0 && <span className="text-slate-500 dark:text-slate-400" title={others.map((r) => r.ten).join('\n')}> · dùng chung cho {others.length} báo cáo khác</span>}
          <br />
          <span className="text-slate-600 dark:text-slate-300">
            {sc ? <>Tự cập nhật: {sc.schedule_label}{!sc.is_enabled && <> <Badge tone="neutral">Đang tắt</Badge></>}</> : 'Chưa đặt lịch tự cập nhật'}
            {d.last_run && <> · lần gần nhất {fmtDateTime(d.last_run.finished_at ?? d.last_run.started_at)}{st && <> <Badge tone={st[0]}>{st[1]}</Badge></>}</>}
          </span>
        </span>
        <Button onClick={() => setEditing(true)}>{sc ? 'Sửa lịch' : 'Đặt lịch'}</Button>
        <Button disabled={busy || !d.can_run} title={d.can_run ? undefined : 'Cần kết nối hệ thống nguồn trước'} onClick={() => void update()}>
          {busy ? 'Đang gửi…' : 'Cập nhật ngay'}
        </Button>
      </div>
      {note && <Banner tone="info">{note} Xem tất cả ở <TextLink to="/lich-chay">Lịch cập nhật</TextLink>.</Banner>}
      {err ? <ErrorBox error={err} /> : null}
      {editing && (
        <ScheduleDialog source={d} onClose={() => setEditing(false)}
          onSaved={(n) => { setEditing(false); setNote(`Đã lưu lịch tự cập nhật ${n.ten}: ${n.schedule?.schedule_label ?? ''}.`); src.reload(); }} />
      )}
    </div>
  );
}

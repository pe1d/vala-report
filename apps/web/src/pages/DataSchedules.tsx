import { useState } from 'react';
import { api, fmtDateTime, fmtInt, targetOf, type DataSource } from '../api';
import { useAsync } from '../hooks';
import { runNow, useGrantState, useRunStatus } from '../components/DataSource';
import { ScheduleDialog } from '../components/ScheduleForm';
import { Empty, ErrorBox, Loading } from '../components/States';
import { groupRows } from '../components/TableTools';
import { Badge, Banner, Button, Card, Muted, PageTitle, TextLink } from '../components/ui';
import { messages, useT } from '../i18n';

const reportsEn = (n: number) => `${n} ${n === 1 ? 'report' : 'reports'}`;
const M = messages({
  title: 'Lịch cập nhật dữ liệu',
  subtitle: 'Mỗi nguồn dữ liệu một lịch. Mỗi lần cập nhật lấy lại dữ liệu của bạn từ hệ thống nguồn và làm mới số liệu cho mọi báo cáo dùng nguồn đó.',
  empty: 'Chưa có nguồn dữ liệu nào. Quản trị cần cấu hình báo cáo trước. ',
  catalog: 'Danh mục báo cáo',
  confirmDelete: (ten: string, n: number) => `Xoá lịch tự cập nhật ${ten}? Số liệu đã có vẫn giữ; ${n} báo cáo dùng nguồn này sẽ không tự cập nhật nữa.`,
  deleted: (ten: string) => `Đã xoá lịch ${ten}.`,
  saved: (ten: string, label: string) => `Đã lưu lịch ${ten}: ${label}.`,
  spider: (code: string | null) => `Script crawl ${code}`,
  adapter: (cap: string | null) => `Lấy theo cấu hình adapter (${cap})`,
  schedule: 'Lịch',
  noSchedule: 'Chưa đặt — chỉ cập nhật khi bấm “Cập nhật ngay”',
  doneOnce: 'Đã chạy xong', disabled: 'Đang tắt',
  next: 'Lần tới', last: 'Gần nhất',
  records: (n: string) => ` · ${n} bản ghi`,
  never: 'Chưa cập nhật lần nào',
  refreshes: (n: number) => `Làm mới ${n} báo cáo: `,
  collapse: 'thu gọn',
  more: (n: number) => `và ${n} báo cáo khác`,
  orphan: 'Không còn báo cáo nào dùng nguồn này — có thể xoá lịch.',
  autoLabel: 'Tự cập nhật khi tôi đang dùng',
  autoHelp: (src: string) => `Mở Tổng quan / báo cáo mà dữ liệu đã cũ hơn 15 phút, hoặc vừa làm việc trên ${src} rồi rời trang (cần tiện ích Vala) ⇒ tự lấy lại, không chờ lịch.`,
  editSchedule: 'Sửa lịch', setSchedule: 'Đặt lịch',
  needConnect: 'Cần kết nối hệ thống nguồn trước',
  sending: 'Đang gửi…', updateNow: 'Cập nhật ngay',
  turnOff: 'Tắt lịch', turnOn: 'Bật lịch', delete: 'Xoá lịch',
}, {
  title: 'Data update schedule',
  subtitle: 'One schedule per data source. Each update re-fetches your data from the source system and refreshes every report that uses that source.',
  empty: 'No data sources yet. An administrator needs to configure reports first. ',
  catalog: 'Report catalog',
  confirmDelete: (ten: string, n: number) => `Delete the auto-update schedule for ${ten}? Existing data is kept; the ${reportsEn(n)} using this source will no longer update automatically.`,
  deleted: (ten: string) => `Deleted the schedule for ${ten}.`,
  saved: (ten: string, label: string) => `Saved the schedule for ${ten}: ${label}.`,
  spider: (code: string | null) => `Crawl script ${code}`,
  adapter: (cap: string | null) => `Fetched via adapter configuration (${cap})`,
  schedule: 'Schedule',
  noSchedule: 'Not set — updates only when you click “Update now”',
  doneOnce: 'Completed', disabled: 'Off',
  next: 'Next run', last: 'Last run',
  records: (n: string) => ` · ${n} records`,
  never: 'Never updated',
  refreshes: (n: number) => `Refreshes ${reportsEn(n)}: `,
  collapse: 'show less',
  more: (n: number) => `and ${n} more`,
  orphan: 'No reports use this source any more — you can delete the schedule.',
  autoLabel: 'Auto-update while I’m using Vala',
  autoHelp: (src: string) => `When you open Overview or a report whose data is more than 15 minutes old, or leave a page after working in ${src} (requires the Vala browser extension), data is fetched right away without waiting for the schedule.`,
  editSchedule: 'Edit schedule', setSchedule: 'Set schedule',
  needConnect: 'Connect the source system first',
  sending: 'Sending…', updateNow: 'Update now',
  turnOff: 'Turn off', turnOn: 'Turn on', delete: 'Delete schedule',
});

/**
 * Màn hình 5 — Lịch cập nhật dữ liệu. Mỗi NGUỒN DỮ LIỆU (script crawl / cách lấy trong adapter) một lịch; mỗi lần chạy
 * làm mới số liệu cho mọi báo cáo dùng nguồn đó (liệt kê ngay trên thẻ). Đổi lịch không gọi Crawlab — worker hẹn giờ.
 */
export function DataSchedulesPage() {
  const t = useT(M);
  const list = useAsync(() => api.get<DataSource[]>('/data-sources'), []);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<DataSource | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<string | void>) => {
    setErr(null); setNote(null); setBusy(key);
    try { const m = await fn(); if (m) setNote(m); list.reload(); } catch (e) { setErr(e); } finally { setBusy(null); }
  };

  return (
    <>
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {note && <Banner tone="info">{note}</Banner>}
      {err ? <ErrorBox error={err} /> : null}
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>{t.empty}<TextLink to="/bao-cao">{t.catalog}</TextLink></Empty>}
      {list.data && groupRows(list.data, (d) => d.source_system, (d) => d.source_ten).map((g) => (
        <section key={g.key} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.label}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {g.rows.map((d) => (
              <SourceCard key={d.key} d={d} busy={busy === d.key}
                onEdit={() => { setEditing(d); setNote(null); }}
                onRunNow={() => void act(d.key, () => runNow(d))}
                onToggle={() => void act(d.key, async () => { await api.patch(`/data-schedules/${d.schedule!.id}`, { is_enabled: !d.schedule!.is_enabled }); })}
                onAuto={(on) => void act(d.key, async () => { await api.put('/data-sources/prefs', { ...targetOf(d), auto_refresh: on }); })}
                onDelete={() => confirm(t.confirmDelete(d.ten, d.reports.length))
                  && void act(d.key, async () => { await api.del(`/data-schedules/${d.schedule!.id}`); return t.deleted(d.ten); })} />
            ))}
          </div>
        </section>
      ))}
      {editing && (
        <ScheduleDialog source={editing} onClose={() => setEditing(null)}
          onSaved={(n) => { setEditing(null); setNote(t.saved(n.ten, n.schedule?.schedule_label ?? '')); list.reload(); }} />
      )}
    </>
  );
}

const SHOW_REPORTS = 4;

function SourceCard({ d, busy, onEdit, onRunNow, onToggle, onDelete, onAuto }: {
  d: DataSource; busy: boolean; onEdit: () => void; onRunNow: () => void; onToggle: () => void; onDelete: () => void; onAuto: (on: boolean) => void;
}) {
  const t = useT(M);
  const runStatus = useRunStatus();
  const grantState = useGrantState();
  const [all, setAll] = useState(false);
  const sc = d.schedule;
  const doneOnce = sc?.schedule.kind === 'mot_lan' && !sc.is_enabled && !!sc.last_run_at;
  const st = d.last_run ? runStatus[d.last_run.status] : null;
  const grant = grantState[d.grant_state];
  const shown = all ? d.reports : d.reports.slice(0, SHOW_REPORTS);
  return (
    <Card className={sc && !sc.is_enabled && !doneOnce ? 'opacity-80' : ''}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{d.ten}</div>
          <Muted className="text-xs">{d.kind === 'spider' ? t.spider(d.spider_code) : t.adapter(d.capability)}</Muted>
        </div>
        {grant && <Badge tone={grant[0]}>{grant[1]}</Badge>}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="whitespace-nowrap text-slate-500 dark:text-slate-400">{t.schedule}</dt>
        <dd>
          {sc ? sc.schedule_label : <span className="text-slate-500 dark:text-slate-400">{t.noSchedule}</span>}
          {doneOnce ? <> <Badge tone="ok">{t.doneOnce}</Badge></> : sc && !sc.is_enabled && <> <Badge tone="neutral">{t.disabled}</Badge></>}
        </dd>
        {sc?.is_enabled && <><dt className="whitespace-nowrap text-slate-500 dark:text-slate-400">{t.next}</dt><dd>{fmtDateTime(sc.next_run_at)}</dd></>}
        <dt className="whitespace-nowrap text-slate-500 dark:text-slate-400">{t.last}</dt>
        <dd>
          {d.last_run ? <>
            {fmtDateTime(d.last_run.finished_at ?? d.last_run.started_at)}
            {st && <> <Badge tone={st[0]}>{st[1]}</Badge></>}
            {d.last_run.status === 'ok' && d.last_run.records_seen !== null && <Muted className="inline">{t.records(fmtInt(d.last_run.records_seen))}</Muted>}
            {d.last_run.status === 'failed' && d.last_run.error && <div className="break-all text-xs text-red-700 dark:text-red-400">{d.last_run.error}</div>}
          </> : <span className="text-slate-500 dark:text-slate-400">{t.never}</span>}
        </dd>
      </dl>

      <div className="mt-3 text-sm">
        {d.reports.length ? <>
          <span className="text-slate-500 dark:text-slate-400">{t.refreshes(d.reports.length)}</span>
          {shown.map((r, i) => <span key={r.code}>{i > 0 && ', '}<TextLink to={`/bao-cao/${r.code}`}>{r.ten}</TextLink></span>)}
          {d.reports.length > SHOW_REPORTS && (
            <button type="button" className="ml-1 text-blue-700 hover:underline dark:text-blue-400" onClick={() => setAll(!all)}>
              {all ? t.collapse : t.more(d.reports.length - SHOW_REPORTS)}
            </button>
          )}
        </> : <span className="text-amber-700 dark:text-amber-400">{t.orphan}</span>}
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={d.auto_refresh} disabled={busy} onChange={(e) => onAuto(e.target.checked)} />
        <span>
          {t.autoLabel}
          <Muted className="text-xs">{t.autoHelp(d.source_ten)}</Muted>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Button variant={sc ? 'default' : 'primary'} onClick={onEdit}>{sc ? t.editSchedule : t.setSchedule}</Button>
        <Button disabled={busy || !d.can_run} title={d.can_run ? undefined : t.needConnect} onClick={onRunNow}>{busy ? t.sending : t.updateNow}</Button>
        {sc && !doneOnce && <Button disabled={busy} onClick={onToggle}>{sc.is_enabled ? t.turnOff : t.turnOn}</Button>}
        {sc && <Button variant="danger" disabled={busy} onClick={onDelete}>{t.delete}</Button>}
      </div>
    </Card>
  );
}

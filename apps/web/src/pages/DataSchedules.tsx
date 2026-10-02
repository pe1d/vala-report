import { useState } from 'react';
import { api, fmtDateTime, fmtInt, type DataSource } from '../api';
import { useAsync } from '../hooks';
import { GRANT_STATE, RUN_STATUS, runNow } from '../components/DataSource';
import { ScheduleDialog } from '../components/ScheduleForm';
import { Empty, ErrorBox, Loading } from '../components/States';
import { groupRows } from '../components/TableTools';
import { Badge, Banner, Button, Card, Muted, PageTitle, TextLink } from '../components/ui';

/**
 * Màn hình 5 — Lịch cập nhật dữ liệu. Mỗi NGUỒN DỮ LIỆU (script crawl / cách lấy trong adapter) một lịch; mỗi lần chạy
 * làm mới số liệu cho mọi báo cáo dùng nguồn đó (liệt kê ngay trên thẻ). Đổi lịch không gọi Crawlab — worker hẹn giờ.
 */
export function DataSchedulesPage() {
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
      <PageTitle title="Lịch cập nhật dữ liệu"
        subtitle="Mỗi nguồn dữ liệu một lịch. Mỗi lần cập nhật lấy lại dữ liệu của bạn từ hệ thống nguồn và làm mới số liệu cho mọi báo cáo dùng nguồn đó." />
      {note && <Banner tone="info">{note}</Banner>}
      {err ? <ErrorBox error={err} /> : null}
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>Chưa có nguồn dữ liệu nào. Quản trị cần cấu hình báo cáo trước. <TextLink to="/bao-cao">Danh mục báo cáo</TextLink></Empty>}
      {list.data && groupRows(list.data, (d) => d.source_system, (d) => d.source_ten).map((g) => (
        <section key={g.key} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.label}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {g.rows.map((d) => (
              <SourceCard key={d.key} d={d} busy={busy === d.key}
                onEdit={() => { setEditing(d); setNote(null); }}
                onRunNow={() => void act(d.key, () => runNow(d))}
                onToggle={() => void act(d.key, async () => { await api.patch(`/data-schedules/${d.schedule!.id}`, { is_enabled: !d.schedule!.is_enabled }); })}
                onDelete={() => confirm(`Xoá lịch tự cập nhật ${d.ten}? Số liệu đã có vẫn giữ; ${d.reports.length} báo cáo dùng nguồn này sẽ không tự cập nhật nữa.`)
                  && void act(d.key, async () => { await api.del(`/data-schedules/${d.schedule!.id}`); return `Đã xoá lịch ${d.ten}.`; })} />
            ))}
          </div>
        </section>
      ))}
      {editing && (
        <ScheduleDialog source={editing} onClose={() => setEditing(null)}
          onSaved={(n) => { setEditing(null); setNote(`Đã lưu lịch ${n.ten}: ${n.schedule?.schedule_label ?? ''}.`); list.reload(); }} />
      )}
    </>
  );
}

const SHOW_REPORTS = 4;

function SourceCard({ d, busy, onEdit, onRunNow, onToggle, onDelete }: {
  d: DataSource; busy: boolean; onEdit: () => void; onRunNow: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const [all, setAll] = useState(false);
  const sc = d.schedule;
  const doneOnce = sc?.schedule.kind === 'mot_lan' && !sc.is_enabled && !!sc.last_run_at;
  const st = d.last_run ? RUN_STATUS[d.last_run.status] : null;
  const grant = GRANT_STATE[d.grant_state];
  const shown = all ? d.reports : d.reports.slice(0, SHOW_REPORTS);
  return (
    <Card className={sc && !sc.is_enabled && !doneOnce ? 'opacity-80' : ''}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{d.ten}</div>
          <Muted className="text-xs">{d.kind === 'spider' ? `Script crawl ${d.spider_code}` : `Lấy theo cấu hình adapter (${d.capability})`}</Muted>
        </div>
        {grant && <Badge tone={grant[0]}>{grant[1]}</Badge>}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="whitespace-nowrap text-slate-500 dark:text-slate-400">Lịch</dt>
        <dd>
          {sc ? sc.schedule_label : <span className="text-slate-500 dark:text-slate-400">Chưa đặt — chỉ cập nhật khi bấm “Cập nhật ngay”</span>}
          {doneOnce ? <> <Badge tone="ok">Đã chạy xong</Badge></> : sc && !sc.is_enabled && <> <Badge tone="neutral">Đang tắt</Badge></>}
        </dd>
        {sc?.is_enabled && <><dt className="whitespace-nowrap text-slate-500 dark:text-slate-400">Lần tới</dt><dd>{fmtDateTime(sc.next_run_at)}</dd></>}
        <dt className="whitespace-nowrap text-slate-500 dark:text-slate-400">Gần nhất</dt>
        <dd>
          {d.last_run ? <>
            {fmtDateTime(d.last_run.finished_at ?? d.last_run.started_at)}
            {st && <> <Badge tone={st[0]}>{st[1]}</Badge></>}
            {d.last_run.status === 'ok' && d.last_run.records_seen !== null && <Muted className="inline"> · {fmtInt(d.last_run.records_seen)} bản ghi</Muted>}
            {d.last_run.status === 'failed' && d.last_run.error && <div className="break-all text-xs text-red-700 dark:text-red-400">{d.last_run.error}</div>}
          </> : <span className="text-slate-500 dark:text-slate-400">Chưa cập nhật lần nào</span>}
        </dd>
      </dl>

      <div className="mt-3 text-sm">
        {d.reports.length ? <>
          <span className="text-slate-500 dark:text-slate-400">Làm mới {d.reports.length} báo cáo: </span>
          {shown.map((r, i) => <span key={r.code}>{i > 0 && ', '}<TextLink to={`/bao-cao/${r.code}`}>{r.ten}</TextLink></span>)}
          {d.reports.length > SHOW_REPORTS && (
            <button type="button" className="ml-1 text-blue-700 hover:underline dark:text-blue-400" onClick={() => setAll(!all)}>
              {all ? 'thu gọn' : `và ${d.reports.length - SHOW_REPORTS} báo cáo khác`}
            </button>
          )}
        </> : <span className="text-amber-700 dark:text-amber-400">Không còn báo cáo nào dùng nguồn này — có thể xoá lịch.</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Button variant={sc ? 'default' : 'primary'} onClick={onEdit}>{sc ? 'Sửa lịch' : 'Đặt lịch'}</Button>
        <Button disabled={busy || !d.can_run} title={d.can_run ? undefined : 'Cần kết nối hệ thống nguồn trước'} onClick={onRunNow}>{busy ? 'Đang gửi…' : 'Cập nhật ngay'}</Button>
        {sc && !doneOnce && <Button disabled={busy} onClick={onToggle}>{sc.is_enabled ? 'Tắt lịch' : 'Bật lịch'}</Button>}
        {sc && <Button variant="danger" disabled={busy} onClick={onDelete}>Xoá lịch</Button>}
      </div>
    </Card>
  );
}

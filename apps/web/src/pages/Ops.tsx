import { useEffect, useState } from 'react';
import { api, fmtDateTime, fmtInt } from '../api';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Card, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';
import { messages, useT } from '../i18n';

const M = messages({
  secAgo: (n: number) => `${n} giây trước`, minAgo: (n: number) => `${n} phút trước`,
  hourAgo: (n: number) => `${n} giờ trước`, dayAgo: (n: number) => `${n} ngày trước`,
  worker: 'Worker (hẹn giờ, lấy dữ liệu)', neverRan: 'Chưa từng chạy', running: 'Đang chạy', lost: 'Mất liên lạc',
  lastBeat: 'Lần báo còn sống gần nhất', workerDown: 'Lịch sẽ không chạy cho tới khi worker hoạt động lại',
  crawlab: 'Crawlab (chạy spider)', notChecked: 'Chưa kiểm tra', notConfigured: 'Chưa cấu hình',
  spiders: (n: number) => `${n} spider`, unreachable: 'Không liên lạc được',
  unknown: 'Chưa rõ', error: 'Lỗi', fileError: 'Lỗi file', restored: 'Đã tự khôi phục', normal: 'Bình thường',
  repushed: (codes: string) => `Đã đẩy lại mã: ${codes}`, checked: (ago: string) => `Kiểm tra ${ago}`,
  overdue: 'Lịch trễ (quá giờ chưa chạy)', missed: 'Có lịch bị lỡ',
  launchFail: 'Spider không tới được Vala (24 giờ)', seeLog: 'Xem nhật ký',
  launchFailHint: 'Lỗi ngay trong Crawlab — lý do ở cột "Lỗi" bên dưới',
  overThreshold: 'Vượt ngưỡng',
  failedRatio: 'Tỉ lệ lượt chạy lỗi (1 giờ)', noRuns1h: 'Không có lượt chạy nào trong 1 giờ qua',
  expiredRatio: 'Tỉ lệ phiên hết hạn', drift: 'Lệch schema (24 giờ)',
  noSuccess: 'Người dùng không có lượt thành công 48 giờ',
  title: 'Vận hành', system: 'Hệ thống', data: 'Dữ liệu', runLog: 'Nhật ký chạy',
  searchPh: 'Tìm người dùng, nguồn, mã lỗi…', statusFilter: 'Lọc trạng thái',
  allStatuses: 'Mọi trạng thái', stFailed: 'Lỗi', stOk: 'Thành công', stSkipped: 'Bỏ qua', stRunning: 'Đang chạy',
  noRuns: 'Chưa có lượt chạy nào.',
  colUser: 'Người dùng', colStart: 'Bắt đầu', colSource: 'Nguồn', colTrigger: 'Kích hoạt', colStatus: 'Trạng thái',
  colRecords: 'Bản ghi', colChanged: 'Thay đổi', colRequests: 'Request', colError: 'Lỗi',
  systemUser: 'hệ thống', unit: 'lượt chạy',
}, {
  secAgo: (n: number) => `${n}s ago`, minAgo: (n: number) => `${n} min ago`,
  hourAgo: (n: number) => `${n} h ago`, dayAgo: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} ago`,
  worker: 'Worker (scheduling, data fetch)', neverRan: 'Never ran', running: 'Running', lost: 'Unreachable',
  lastBeat: 'Last heartbeat', workerDown: 'Schedules won’t run until the worker is back up',
  crawlab: 'Crawlab (runs spiders)', notChecked: 'Not checked', notConfigured: 'Not configured',
  spiders: (n: number) => `${n} ${n === 1 ? 'spider' : 'spiders'}`, unreachable: 'Unreachable',
  unknown: 'Unknown', error: 'Error', fileError: 'File error', restored: 'Self-restored', normal: 'Normal',
  repushed: (codes: string) => `Re-pushed code: ${codes}`, checked: (ago: string) => `Checked ${ago}`,
  overdue: 'Overdue schedules (past due, not run)', missed: 'Missed schedules',
  launchFail: 'Spiders that couldn’t reach Vala (24 h)', seeLog: 'See log',
  launchFailHint: 'Failed inside Crawlab — see the "Error" column below for the reason',
  overThreshold: 'Above threshold',
  failedRatio: 'Failed run rate (1 h)', noRuns1h: 'No runs in the past hour',
  expiredRatio: 'Expired session rate', drift: 'Schema drift (24 h)',
  noSuccess: 'Users with no successful run in 48 h',
  title: 'Operations', system: 'System', data: 'Data', runLog: 'Run log',
  searchPh: 'Search user, source, error code…', statusFilter: 'Filter by status',
  allStatuses: 'All statuses', stFailed: 'Failed', stOk: 'Succeeded', stSkipped: 'Skipped', stRunning: 'Running',
  noRuns: 'No runs yet.',
  colUser: 'User', colStart: 'Started', colSource: 'Source', colTrigger: 'Trigger', colStatus: 'Status',
  colRecords: 'Records', colChanged: 'Changed', colRequests: 'Requests', colError: 'Error',
  systemUser: 'system', unit: 'runs',
});
type Labels = typeof M.vi;

interface Run {
  id: number; ho_ten: string | null; source_system: string; capability: string; trigger_type: string; started_at: string;
  status: string; records_seen: number | null; records_changed: number | null; http_calls: number | null; error_code: string | null; error_detail: string | null;
}
interface Beat { at: string; info: Record<string, unknown> }
interface Health {
  failed_ratio_1h: number | null; expired_ratio: number | null; drift_24h: number; users_no_success_48h: number;
  overdue_schedules: number; launch_failures_24h: number; worker: Beat | null; crawlab: Beat | null;
}
type Tile = { label: string; value: string; tone: Tone; badge: string; hint?: string };

/** "30 giây trước", "5 phút trước"… */
const ago = (t: Labels, iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? t.secAgo(s) : s < 3600 ? t.minAgo(Math.round(s / 60)) : s < 86400 ? t.hourAgo(Math.round(s / 3600)) : t.dayAgo(Math.round(s / 86400));
};

/** Tình trạng dịch vụ: worker ghi "còn sống" mỗi phút; Crawlab do worker kiểm tra mỗi 10 phút. */
function systemTiles(t: Labels, h: Health): Tile[] {
  const w = h.worker;
  const wAge = w ? (Date.now() - new Date(w.at).getTime()) / 1000 : Infinity;
  const c = h.crawlab;
  const ci = (c?.info ?? {}) as { configured?: boolean; reachable?: boolean; restored?: string[]; errors?: string[]; error?: string; spiders?: number };
  const cStale = c ? (Date.now() - new Date(c.at).getTime()) / 1000 > 25 * 60 : true;
  return [
    { label: t.worker, value: w ? ago(t, w.at) : t.neverRan, tone: wAge < 180 ? 'ok' : 'err',
      badge: wAge < 180 ? t.running : t.lost, hint: wAge < 180 ? t.lastBeat : t.workerDown },
    { label: t.crawlab, value: !c ? t.notChecked : ci.configured === false ? t.notConfigured : ci.reachable ? t.spiders(ci.spiders ?? 0) : t.unreachable,
      tone: !c || cStale || ci.reachable === false || ci.errors?.length ? 'err' : ci.restored?.length ? 'warn' : 'ok',
      badge: !c || cStale ? t.unknown : ci.reachable === false ? t.error : ci.errors?.length ? t.fileError : ci.restored?.length ? t.restored : t.normal,
      hint: ci.error ?? (ci.errors?.length ? ci.errors.join('; ') : ci.restored?.length ? t.repushed(ci.restored.join(', ')) : c ? t.checked(ago(t, c.at)) : undefined) },
    { label: t.overdue, value: fmtInt(h.overdue_schedules), tone: h.overdue_schedules ? 'err' : 'ok',
      badge: h.overdue_schedules ? t.missed : t.normal },
    { label: t.launchFail, value: fmtInt(h.launch_failures_24h), tone: h.launch_failures_24h ? 'err' : 'ok',
      badge: h.launch_failures_24h ? t.seeLog : t.normal, hint: h.launch_failures_24h ? t.launchFailHint : undefined },
  ];
}

function TileCard({ t }: { t: Tile }) {
  return (
    <Card>
      <div className="text-slate-500 dark:text-slate-400">{t.label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <strong className="text-2xl tabular-nums">{t.value}</strong>
        <Badge tone={t.tone}>{t.badge}</Badge>
      </div>
      {t.hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.hint}</div>}
    </Card>
  );
}

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const TONE: Record<string, Tone> = { ok: 'ok', failed: 'err', skipped: 'warn', running: 'neutral' };

/** Màn hình 6 — Vận hành (chỉ kỹ sư). Ngưỡng cảnh báo theo monitoring.alert_when của adapter. */
export function OpsPage() {
  const t = useT(M);
  const [status, setStatus] = useState('');
  // Tải 1.000 lượt gần nhất rồi tìm/phân trang trên trình duyệt.
  const runs = useAsync(() => api.get<Run[]>(`/ops/runs?limit=1000${status ? `&status=${status}` : ''}`), [status]);
  const tv = useTableView(runs.data, (r) => `${r.ho_ten ?? t.systemUser} ${r.source_system}/${r.capability} ${r.trigger_type} ${r.status} ${r.error_code ?? ''} ${r.error_detail ?? ''}`);
  const health = useAsync(() => api.get<Health>('/ops/health'), []);
  // Tự làm mới mỗi 30 giây để thấy worker/Crawlab ngừng ngay.
  useEffect(() => { const id = setInterval(() => health.reload(), 30_000); return () => clearInterval(id); }, [health.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = health.data;
  const flag = (bad: boolean): Pick<Tile, 'tone' | 'badge'> => ({ tone: bad ? 'err' : 'ok', badge: bad ? t.overThreshold : t.normal });
  const tiles: Tile[] = h ? [
    { label: t.failedRatio, value: pct(h.failed_ratio_1h), ...flag((h.failed_ratio_1h ?? 0) > 0.1),
      hint: h.failed_ratio_1h === null ? t.noRuns1h : undefined },
    { label: t.expiredRatio, value: pct(h.expired_ratio), ...flag((h.expired_ratio ?? 0) > 0.2) },
    { label: t.drift, value: fmtInt(h.drift_24h), ...flag(h.drift_24h > 0) },
    { label: t.noSuccess, value: fmtInt(h.users_no_success_48h), ...flag(h.users_no_success_48h > 0) },
  ] : [];
  return (
    <>
      <PageTitle title={t.title} />
      {health.error ? <ErrorBox error={health.error} /> : null}
      {h && (
        <>
          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.system}</h2>
          <div className="my-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{systemTiles(t, h).map((x) => <TileCard key={x.label} t={x} />)}</div>
          <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.data}</h2>
        </>
      )}
      <div className="my-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles.map((x) => <TileCard key={x.label} t={x} />)}</div>
      <div className="mb-2 mt-6 flex items-center gap-3">
        <h2 className="flex-1 text-base font-semibold">{t.runLog}</h2>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder={t.searchPh} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t.statusFilter}>
          <option value="">{t.allStatuses}</option><option value="failed">{t.stFailed}</option><option value="ok">{t.stOk}</option>
          <option value="skipped">{t.stSkipped}</option><option value="running">{t.stRunning}</option>
        </Select>
      </div>
      {runs.loading && <Loading />}
      {runs.error ? <ErrorBox error={runs.error} onRetry={runs.reload} /> : null}
      {runs.data && !runs.data.length && <Empty>{t.noRuns}</Empty>}
      {!!runs.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>{t.colUser}</Th><Th num>{t.colStart}</Th><Th>{t.colSource}</Th><Th>{t.colTrigger}</Th><Th>{t.colStatus}</Th>
            <Th num>{t.colRecords}</Th><Th num>{t.colChanged}</Th><Th num>{t.colRequests}</Th><Th>{t.colError}</Th></tr></thead>
          <tbody>{tv.rows.map((r) => (
            <tr key={r.id}>
              <Td>{r.ho_ten ?? t.systemUser}</Td><Td num>{fmtDateTime(r.started_at)}</Td>
              <Td>{r.source_system}/{r.capability}</Td><Td>{r.trigger_type}</Td>
              <Td><Badge tone={TONE[r.status] ?? 'neutral'}>{r.status}</Badge></Td>
              <Td num>{fmtInt(r.records_seen)}</Td><Td num>{fmtInt(r.records_changed)}</Td><Td num>{fmtInt(r.http_calls)}</Td>
              <Td title={r.error_detail ?? ''}>
                {r.error_code ?? '–'}
                {r.error_detail && r.status === 'failed' && <div className="max-w-[360px] truncate text-xs text-slate-500 dark:text-slate-400">{r.error_detail}</div>}
              </Td>
            </tr>))}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit={t.unit} />
      </>)}
    </>
  );
}

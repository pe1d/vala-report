import { useEffect, useState } from 'react';
import { api, fmtDateTime, fmtInt } from '../api';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Card, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';

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
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} giây trước` : s < 3600 ? `${Math.round(s / 60)} phút trước` : s < 86400 ? `${Math.round(s / 3600)} giờ trước` : `${Math.round(s / 86400)} ngày trước`;
};

/** Tình trạng dịch vụ: worker ghi "còn sống" mỗi phút; Crawlab do worker kiểm tra mỗi 10 phút. */
function systemTiles(h: Health): Tile[] {
  const w = h.worker;
  const wAge = w ? (Date.now() - new Date(w.at).getTime()) / 1000 : Infinity;
  const c = h.crawlab;
  const ci = (c?.info ?? {}) as { configured?: boolean; reachable?: boolean; restored?: string[]; errors?: string[]; error?: string; spiders?: number };
  const cStale = c ? (Date.now() - new Date(c.at).getTime()) / 1000 > 25 * 60 : true;
  return [
    { label: 'Worker (hẹn giờ, lấy dữ liệu)', value: w ? ago(w.at) : 'Chưa từng chạy', tone: wAge < 180 ? 'ok' : 'err',
      badge: wAge < 180 ? 'Đang chạy' : 'Mất liên lạc', hint: wAge < 180 ? 'Lần báo còn sống gần nhất' : 'Lịch sẽ không chạy cho tới khi worker hoạt động lại' },
    { label: 'Crawlab (chạy spider)', value: !c ? 'Chưa kiểm tra' : ci.configured === false ? 'Chưa cấu hình' : ci.reachable ? `${ci.spiders ?? 0} spider` : 'Không liên lạc được',
      tone: !c || cStale || ci.reachable === false || ci.errors?.length ? 'err' : ci.restored?.length ? 'warn' : 'ok',
      badge: !c || cStale ? 'Chưa rõ' : ci.reachable === false ? 'Lỗi' : ci.errors?.length ? 'Lỗi file' : ci.restored?.length ? 'Đã tự khôi phục' : 'Bình thường',
      hint: ci.error ?? (ci.errors?.length ? ci.errors.join('; ') : ci.restored?.length ? `Đã đẩy lại mã: ${ci.restored.join(', ')}` : c ? `Kiểm tra ${ago(c.at)}` : undefined) },
    { label: 'Lịch trễ (quá giờ chưa chạy)', value: fmtInt(h.overdue_schedules), tone: h.overdue_schedules ? 'err' : 'ok',
      badge: h.overdue_schedules ? 'Có lịch bị lỡ' : 'Bình thường' },
    { label: 'Spider không tới được Vala (24 giờ)', value: fmtInt(h.launch_failures_24h), tone: h.launch_failures_24h ? 'err' : 'ok',
      badge: h.launch_failures_24h ? 'Xem nhật ký' : 'Bình thường', hint: h.launch_failures_24h ? 'Lỗi ngay trong Crawlab — lý do ở cột "Lỗi" bên dưới' : undefined },
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
  const [status, setStatus] = useState('');
  // Tải 1.000 lượt gần nhất rồi tìm/phân trang trên trình duyệt.
  const runs = useAsync(() => api.get<Run[]>(`/ops/runs?limit=1000${status ? `&status=${status}` : ''}`), [status]);
  const tv = useTableView(runs.data, (r) => `${r.ho_ten ?? 'hệ thống'} ${r.source_system}/${r.capability} ${r.trigger_type} ${r.status} ${r.error_code ?? ''} ${r.error_detail ?? ''}`);
  const health = useAsync(() => api.get<Health>('/ops/health'), []);
  // Tự làm mới mỗi 30 giây để thấy worker/Crawlab ngừng ngay.
  useEffect(() => { const t = setInterval(() => health.reload(), 30_000); return () => clearInterval(t); }, [health.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = health.data;
  const flag = (bad: boolean): Pick<Tile, 'tone' | 'badge'> => ({ tone: bad ? 'err' : 'ok', badge: bad ? 'Vượt ngưỡng' : 'Bình thường' });
  const tiles: Tile[] = h ? [
    { label: 'Tỉ lệ lượt chạy lỗi (1 giờ)', value: pct(h.failed_ratio_1h), ...flag((h.failed_ratio_1h ?? 0) > 0.1),
      hint: h.failed_ratio_1h === null ? 'Không có lượt chạy nào trong 1 giờ qua' : undefined },
    { label: 'Tỉ lệ phiên hết hạn', value: pct(h.expired_ratio), ...flag((h.expired_ratio ?? 0) > 0.2) },
    { label: 'Lệch schema (24 giờ)', value: fmtInt(h.drift_24h), ...flag(h.drift_24h > 0) },
    { label: 'Người dùng không có lượt thành công 48 giờ', value: fmtInt(h.users_no_success_48h), ...flag(h.users_no_success_48h > 0) },
  ] : [];
  return (
    <>
      <PageTitle title="Vận hành" />
      {health.error ? <ErrorBox error={health.error} /> : null}
      {h && (
        <>
          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Hệ thống</h2>
          <div className="my-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{systemTiles(h).map((t) => <TileCard key={t.label} t={t} />)}</div>
          <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dữ liệu</h2>
        </>
      )}
      <div className="my-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles.map((t) => <TileCard key={t.label} t={t} />)}</div>
      <div className="mb-2 mt-6 flex items-center gap-3">
        <h2 className="flex-1 text-base font-semibold">Nhật ký chạy</h2>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder="Tìm người dùng, nguồn, mã lỗi…" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option><option value="failed">Lỗi</option><option value="ok">Thành công</option>
          <option value="skipped">Bỏ qua</option><option value="running">Đang chạy</option>
        </Select>
      </div>
      {runs.loading && <Loading />}
      {runs.error ? <ErrorBox error={runs.error} onRetry={runs.reload} /> : null}
      {runs.data && !runs.data.length && <Empty>Chưa có lượt chạy nào.</Empty>}
      {!!runs.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>Người dùng</Th><Th num>Bắt đầu</Th><Th>Nguồn</Th><Th>Kích hoạt</Th><Th>Trạng thái</Th>
            <Th num>Bản ghi</Th><Th num>Thay đổi</Th><Th num>Request</Th><Th>Lỗi</Th></tr></thead>
          <tbody>{tv.rows.map((r) => (
            <tr key={r.id}>
              <Td>{r.ho_ten ?? 'hệ thống'}</Td><Td num>{fmtDateTime(r.started_at)}</Td>
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
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit="lượt chạy" />
      </>)}
    </>
  );
}

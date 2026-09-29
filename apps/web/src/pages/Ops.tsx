import { useState } from 'react';
import { api, fmtDateTime, fmtInt } from '../api';
import { useAsync } from '../hooks';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Card, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';

interface Run {
  id: number; ho_ten: string | null; source_system: string; capability: string; trigger_type: string; started_at: string;
  status: string; records_seen: number | null; records_changed: number | null; http_calls: number | null; error_code: string | null; error_detail: string | null;
}
interface Health { failed_ratio_1h: number | null; expired_ratio: number | null; drift_24h: number; users_no_success_48h: number }

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const TONE: Record<string, Tone> = { ok: 'ok', failed: 'err', skipped: 'warn', running: 'neutral' };

/** Màn hình 6 — Vận hành (chỉ kỹ sư). Ngưỡng cảnh báo theo monitoring.alert_when của adapter. */
export function OpsPage() {
  const [status, setStatus] = useState('');
  const runs = useAsync(() => api.get<Run[]>(`/ops/runs${status ? `?status=${status}` : ''}`), [status]);
  const health = useAsync(() => api.get<Health>('/ops/health'), []);
  const h = health.data;
  const tiles: Array<[string, string, boolean]> = h ? [
    ['Tỉ lệ lượt chạy lỗi (1 giờ)', pct(h.failed_ratio_1h), (h.failed_ratio_1h ?? 0) > 0.1],
    ['Tỉ lệ phiên hết hạn', pct(h.expired_ratio), (h.expired_ratio ?? 0) > 0.2],
    ['Lệch schema (24 giờ)', fmtInt(h.drift_24h), h.drift_24h > 0],
    ['Người dùng không có lượt thành công 48 giờ', fmtInt(h.users_no_success_48h), h.users_no_success_48h > 0],
  ] : [];
  return (
    <>
      <PageTitle title="Vận hành" />
      {health.error ? <ErrorBox error={health.error} /> : null}
      <div className="my-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, value, alert]) => (
          <Card key={label}>
            <div className="text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-1 flex items-center gap-3">
              <strong className="text-2xl tabular-nums">{value}</strong>
              <Badge tone={alert ? 'err' : 'ok'}>{alert ? 'Vượt ngưỡng' : 'Bình thường'}</Badge>
            </div>
          </Card>
        ))}
      </div>
      <div className="mb-2 mt-6 flex items-center gap-3">
        <h2 className="flex-1 text-base font-semibold">Nhật ký chạy</h2>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option><option value="failed">Lỗi</option><option value="ok">Thành công</option>
          <option value="skipped">Bỏ qua</option><option value="running">Đang chạy</option>
        </Select>
      </div>
      {runs.loading && <Loading />}
      {runs.error ? <ErrorBox error={runs.error} onRetry={runs.reload} /> : null}
      {runs.data && !runs.data.length && <Empty>Chưa có lượt chạy nào.</Empty>}
      {!!runs.data?.length && (
        <Table>
          <thead><tr><Th>Người dùng</Th><Th num>Bắt đầu</Th><Th>Nguồn</Th><Th>Kích hoạt</Th><Th>Trạng thái</Th>
            <Th num>Bản ghi</Th><Th num>Thay đổi</Th><Th num>Request</Th><Th>Lỗi</Th></tr></thead>
          <tbody>{runs.data.map((r) => (
            <tr key={r.id}>
              <Td>{r.ho_ten ?? 'hệ thống'}</Td><Td num>{fmtDateTime(r.started_at)}</Td>
              <Td>{r.source_system}/{r.capability}</Td><Td>{r.trigger_type}</Td>
              <Td><Badge tone={TONE[r.status] ?? 'neutral'}>{r.status}</Badge></Td>
              <Td num>{fmtInt(r.records_seen)}</Td><Td num>{fmtInt(r.records_changed)}</Td><Td num>{fmtInt(r.http_calls)}</Td>
              <Td title={r.error_detail ?? ''}>{r.error_code ?? '–'}</Td>
            </tr>))}
          </tbody>
        </Table>
      )}
    </>
  );
}

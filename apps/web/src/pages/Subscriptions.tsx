import { useState } from 'react';
import { api, fmtDateTime, type Preset, type Subscription } from '../api';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, PageTitle, Select, Table, Td, TextLink, Th, type Tone } from '../components/ui';

const STATUS: Record<string, [Tone, string]> = { ok: ['ok', 'Thành công'], failed: ['err', 'Lỗi'], running: ['neutral', 'Đang chạy'], skipped: ['warn', 'Bỏ qua'] };

/** Màn hình 5 — Lịch chạy của tôi. Đổi lịch = đổi preset; không có lời gọi nào sang Crawlab. */
export function SubscriptionsPage() {
  const subs = useAsync(() => api.get<Subscription[]>('/subscriptions'), []);
  const presets = useAsync(() => api.get<Preset[]>('/presets'), []);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const presetLabel = (code: string) => presets.data?.find((p) => p.code === code)?.label ?? code;
  const tv = useTableView(subs.data, (s) => `${s.report_ten} ${presetLabel(s.schedule_preset)} ${s.is_enabled ? '' : 'đang tắt'} ${s.last_status ? STATUS[s.last_status]?.[1] ?? '' : ''}`);
  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setErr(null); setNote(null);
    try { await fn(); if (msg) setNote(msg); subs.reload(); } catch (e) { setErr(e); }
  };

  return (
    <>
      <PageTitle title="Lịch chạy" subtitle="Hệ thống lấy dữ liệu mới theo lịch bạn đặt. Để thêm lịch, mở một báo cáo và bấm “Đặt lịch”." />
      {note && <Banner tone="info">{note}</Banner>}
      {err ? <ErrorBox error={err} /> : null}
      {subs.loading && <Loading />}
      {subs.error ? <ErrorBox error={subs.error} onRetry={subs.reload} /> : null}
      {subs.data && !subs.data.length && <Empty>Bạn chưa đặt lịch nào. <TextLink to="/bao-cao">Chọn một báo cáo</TextLink></Empty>}
      {!!subs.data?.length && <div className="mb-3"><SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder="Tìm theo báo cáo, lịch, kết quả…" /></div>}
      {!!subs.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>Báo cáo</Th><Th>Lịch</Th><Th num>Lần chạy kế tiếp</Th><Th num>Lần chạy gần nhất</Th><Th>Kết quả</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((s) => {
              const st = s.last_status ? STATUS[s.last_status] : null;
              return (
                <tr key={s.id}>
                  <Td><TextLink to={`/bao-cao/${s.report_code}`}>{s.report_ten}</TextLink></Td>
                  <Td>
                    <Select aria-label="Lịch chạy" value={s.schedule_preset}
                      onChange={(e) => void act(() => api.patch(`/subscriptions/${s.id}`, { schedule_preset: e.target.value }))}>
                      {(presets.data ?? [{ code: s.schedule_preset, label: s.schedule_preset, next_runs: [] }]).map((p) =>
                        <option key={p.code} value={p.code}>{p.label}</option>)}
                    </Select>
                  </Td>
                  <Td num>{s.is_enabled ? fmtDateTime(s.next_run_at) : <Badge tone="neutral">Đang tắt</Badge>}</Td>
                  <Td num>{fmtDateTime(s.last_run_at)}</Td>
                  <Td>{st ? <Badge tone={st[0]}>{st[1]}</Badge> : '–'}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button disabled={!s.is_enabled} onClick={() => void act(() => api.post(`/subscriptions/${s.id}/run-now`), 'Đã đưa vào hàng đợi. Kết quả sẽ có sau vài phút.')}>Chạy ngay</Button>
                      <Button onClick={() => void act(() => api.patch(`/subscriptions/${s.id}`, { is_enabled: !s.is_enabled }))}>{s.is_enabled ? 'Tắt' : 'Bật'}</Button>
                      <Button variant="danger" onClick={() => confirm('Xoá lịch này?') && void act(() => api.del(`/subscriptions/${s.id}`))}>Xoá</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit="lịch" />
      </>)}
    </>
  );
}

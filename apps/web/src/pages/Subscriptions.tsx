import { useState } from 'react';
import { api, fmtDateTime, type Schedule, type Subscription } from '../api';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { ScheduleEditor } from '../components/ScheduleForm';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Muted, PageTitle, Table, Td, TextLink, Th, type Tone } from '../components/ui';

const STATUS: Record<string, [Tone, string]> = { ok: ['ok', 'Thành công'], failed: ['err', 'Lỗi'], running: ['neutral', 'Đang chạy'], skipped: ['warn', 'Bỏ qua'] };

/**
 * Màn hình 5 — Lịch chạy của tôi. Người dùng tự đặt giờ (hàng ngày, theo thứ, hàng tháng, nhiều lần trong ngày,
 * một lần). Đổi lịch không gọi Crawlab — worker hẹn giờ theo lịch đã lưu.
 */
export function SubscriptionsPage() {
  const subs = useAsync(() => api.get<Subscription[]>('/subscriptions'), []);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const tv = useTableView(subs.data, (s) => `${s.report_ten} ${s.schedule_label} ${s.is_enabled ? '' : 'đang tắt'} ${s.last_status ? STATUS[s.last_status]?.[1] ?? '' : ''}`);
  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setErr(null); setNote(null);
    try { await fn(); if (msg) setNote(msg); subs.reload(); } catch (e) { setErr(e); }
  };
  const doneOnce = (s: Subscription) => s.schedule.kind === 'mot_lan' && !s.is_enabled && !!s.last_run_at;

  return (
    <>
      <PageTitle title="Lịch chạy" subtitle="Hệ thống tự lấy dữ liệu mới vào đúng giờ bạn hẹn. Để thêm lịch, mở một báo cáo và bấm “Đặt lịch”." />
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
              // Kết quả = lượt lấy dữ liệu gần nhất của hệ thống này; lịch chưa chạy lần nào thì chưa có kết quả.
              const st = s.last_status && s.last_run_at ? STATUS[s.last_status] : null;
              return (
                <tr key={s.id} className={s.is_enabled ? '' : 'opacity-70'}>
                  <Td><TextLink to={`/bao-cao/${s.report_code}`}>{s.report_ten}</TextLink></Td>
                  <Td>
                    <div>{s.schedule_label}</div>
                    {doneOnce(s) ? <Badge tone="ok">Đã chạy xong</Badge> : !s.is_enabled && <Badge tone="neutral">Đang tắt</Badge>}
                  </Td>
                  <Td num>{s.is_enabled ? fmtDateTime(s.next_run_at) : '–'}</Td>
                  <Td num>{fmtDateTime(s.last_run_at)}</Td>
                  <Td>{st ? <Badge tone={st[0]}>{st[1]}</Badge> : '–'}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => { setEditing(s); setNote(null); }}>Sửa lịch</Button>
                      <Button onClick={() => void act(() => api.post(`/subscriptions/${s.id}/run-now`), 'Đã gửi yêu cầu lấy dữ liệu. Kết quả sẽ có sau vài phút.')}>Chạy ngay</Button>
                      {!doneOnce(s) && (
                        <Button onClick={() => void act(() => api.patch(`/subscriptions/${s.id}`, { is_enabled: !s.is_enabled }))}>{s.is_enabled ? 'Tắt' : 'Bật'}</Button>
                      )}
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

      {editing && (
        <EditDialog sub={editing} onClose={() => setEditing(null)}
          onSaved={(label) => { setEditing(null); setNote(`Đã lưu lịch: ${label}.`); subs.reload(); }} />
      )}
    </>
  );
}

/** Sửa lịch của một báo cáo. Lưu lịch mới ⇒ lịch tự bật lại (kể cả lịch một lần đã chạy xong). */
function EditDialog({ sub, onClose, onSaved }: { sub: Subscription; onClose: () => void; onSaved: (label: string) => void }) {
  const [schedule, setSchedule] = useState<Schedule>(sub.schedule);
  const [valid, setValid] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setErr(null);
    try { const r = await api.patch<Subscription>(`/subscriptions/${sub.id}`, { schedule }); onSaved(r.schedule_label); }
    catch (e) { setErr(e); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="sua-lich"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="mx-auto mt-10 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4">
          <h2 id="sua-lich" className="text-base font-semibold">Sửa lịch</h2>
          <Muted className="text-sm">{sub.report_ten} · đang là: {sub.schedule_label}</Muted>
        </div>
        <ScheduleEditor value={schedule} onChange={setSchedule} onValid={setValid} />
        {err ? <div className="mt-3"><ErrorBox error={err} /></div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={saving || !valid} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu lịch'}</Button>
        </div>
      </div>
    </div>
  );
}

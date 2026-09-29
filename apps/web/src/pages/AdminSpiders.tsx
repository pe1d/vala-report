import { useState } from 'react';
import { api, fmtDateTime, type AdminUser } from '../api';
import { useAsync } from '../hooks';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Field, Muted, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';

interface Spider {
  code: string; ten: string; mo_ta: string | null; source_system: string; source_ten: string; entity: string;
  is_enabled: boolean; crawlab_spider_id: string | null; synced_at: string | null; schedules: number; subscribers: number;
  last_run: { status: string; started_at: string; error_code: string | null } | null;
}
interface SpiderList { crawlab_url: string | null; crawlab_configured: boolean; spiders: Spider[] }
interface SyncResult { spiders: Array<{ code: string; files: number; schedules: number }> }

const RUN: Record<string, [Tone, string]> = { ok: ['ok', 'Thành công'], failed: ['err', 'Lỗi'], running: ['neutral', 'Đang chạy'], skipped: ['warn', 'Bỏ qua'] };

/**
 * Màn hình quản trị — Script crawl. Script Python nằm trong repo (crawlers/<mã>/main.py, dùng vala_sdk)
 * và chạy trên Crawlab. "Đồng bộ Crawlab" đẩy script + tạo lịch cố định cho từng preset; người dùng
 * đặt lịch ở cổng, spider tự hỏi API ai cần crawl khi đến giờ.
 */
export function AdminSpidersPage() {
  const list = useAsync(() => api.get<SpiderList>('/admin/spiders'), []);
  const users = useAsync(() => api.get<AdminUser[]>('/admin/users'), []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [trial, setTrial] = useState<Record<string, string>>({});

  const sync = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await api.post<SyncResult>('/admin/spiders/sync');
      setNote({ tone: 'ok', text: `Đã đồng bộ ${r.spiders.length} spider lên Crawlab (${r.spiders.map((s) => `${s.code}: ${s.files} tệp, ${s.schedules} lịch`).join('; ')}).` });
      list.reload();
    } catch (e) { setNote({ tone: 'err', text: e instanceof Error ? e.message : 'Đồng bộ lỗi' }); }
    finally { setBusy(false); }
  };
  const toggle = async (s: Spider) => {
    await api.patch(`/admin/spiders/${s.code}`, { is_enabled: !s.is_enabled });
    setNote({ tone: 'info', text: `Đã ${s.is_enabled ? 'tắt' : 'bật'} ${s.code}. Bấm "Đồng bộ Crawlab" để áp dụng cho lịch bên Crawlab.` });
    list.reload();
  };
  const run = async (s: Spider) => {
    const uid = Number(trial[s.code]);
    if (!uid) return;
    setBusy(true); setNote(null);
    try {
      const r = await api.post<{ crawlab_task_ids: string[] }>(`/admin/spiders/${s.code}/run`, { user_id: uid });
      setNote({ tone: 'ok', text: `Đã chạy ${s.code} trên Crawlab (task ${r.crawlab_task_ids[0] ?? '–'}). Xem kết quả ở "Vận hành" hoặc log trong Crawlab.` });
    } catch (e) { setNote({ tone: 'err', text: e instanceof Error ? e.message : 'Chạy lỗi' }); }
    finally { setBusy(false); }
  };

  const d = list.data;
  return (
    <>
      <PageTitle title="Script crawl"
        subtitle={<>Mỗi spider là một script Python trong <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">crawlers/&lt;mã&gt;/main.py</code>, chạy trên Crawlab theo lịch cố định. Người dùng chỉ đặt lịch ở cổng; đến giờ, spider tự lấy danh sách người cần crawl và phiên của họ từ API.</>} />
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.loading && <Loading />}

      {d && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-medium">Crawlab</div>
              <Muted>{d.crawlab_configured ? d.crawlab_url : 'Chưa cấu hình — đặt CRAWLAB_URL trong .env'}</Muted>
            </div>
            <span className="flex-1" />
            {d.crawlab_url && <a className="text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400" href={d.crawlab_url} target="_blank" rel="noreferrer">Mở Crawlab (sửa script, xem log) ↗</a>}
            <Button variant="primary" disabled={busy || !d.crawlab_configured} onClick={() => void sync()}>{busy ? 'Đang đồng bộ…' : 'Đồng bộ Crawlab'}</Button>
          </div>
          <Muted className="mt-2">Đồng bộ đẩy script trong repo lên Crawlab (ghi đè bản trên Crawlab), tạo/cập nhật lịch cho mọi preset và cấu hình địa chỉ API cho spider. Sửa script trực tiếp trên Crawlab thì nhớ chép về repo, nếu không lần đồng bộ sau sẽ ghi đè.</Muted>
        </Card>
      )}

      {d && !d.spiders.length && <Empty>Chưa có spider nào.</Empty>}
      {!!d?.spiders.length && (
        <Table>
          <thead><tr><Th>Spider</Th><Th>Hệ thống</Th><Th>Đồng bộ</Th><Th num>Người đặt lịch</Th><Th>Lần chạy gần nhất</Th><Th>Chạy thử cho</Th><Th /></tr></thead>
          <tbody>
            {d.spiders.map((s) => {
              const lr = s.last_run ? RUN[s.last_run.status] ?? ['neutral', s.last_run.status] as [Tone, string] : null;
              return (
                <tr key={s.code}>
                  <Td><div className="font-medium">{s.ten}</div><Muted className="font-mono text-xs">{s.code}</Muted></Td>
                  <Td>{s.source_ten}</Td>
                  <Td>{s.crawlab_spider_id
                    ? <><Badge tone="ok">Đã đồng bộ</Badge><Muted className="mt-1 text-xs">{s.schedules} lịch · {fmtDateTime(s.synced_at)}</Muted></>
                    : <Badge tone="warn">Chưa đồng bộ</Badge>}
                    {!s.is_enabled && <div className="mt-1"><Badge tone="neutral">Đang tắt</Badge></div>}</Td>
                  <Td num>{s.subscribers}</Td>
                  <Td>{lr ? <><Badge tone={lr[0]}>{lr[1]}</Badge><Muted className="mt-1 text-xs">{fmtDateTime(s.last_run!.started_at)}{s.last_run!.error_code ? ` · ${s.last_run!.error_code}` : ''}</Muted></> : '–'}</Td>
                  <Td>
                    <Field label="">
                      <Select aria-label={`Người dùng chạy thử ${s.code}`} value={trial[s.code] ?? ''} onChange={(e) => setTrial({ ...trial, [s.code]: e.target.value })}>
                        <option value="">Chọn người dùng…</option>
                        {users.data?.map((u) => <option key={u.id} value={u.id}>{u.ho_ten}</option>)}
                      </Select>
                    </Field>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button disabled={busy || !trial[s.code] || !s.crawlab_spider_id} onClick={() => void run(s)}>Chạy thử</Button>
                      <Button onClick={() => void toggle(s)}>{s.is_enabled ? 'Tắt' : 'Bật'}</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

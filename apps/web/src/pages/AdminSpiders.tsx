import { useEffect, useState, type KeyboardEvent } from 'react';
import { ApiProblem, api, fmtDateTime, type AdminSource, type AdminUser } from '../api';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Field, Input, Muted, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';

type Entity = 'documents' | 'tasks' | 'records';
interface Spider {
  code: string; ten: string; mo_ta: string | null; source_system: string; source_ten: string; entity: Entity;
  is_enabled: boolean; crawlab_spider_id: string | null; synced_at: string | null; schedules: number; subscribers: number;
  last_run: { status: string; started_at: string; error_code: string | null } | null;
}
interface SpiderDetail { code: string; ten: string; mo_ta: string | null; source_system: string; entity: Entity; is_enabled: boolean; main_py: string; from_repo: boolean }
interface SpiderList { crawlab_url: string | null; crawlab_configured: boolean; spiders: Spider[] }
interface SyncResult { spiders: Array<{ code: string; files: number; schedules: number }> }

const RUN: Record<string, [Tone, string]> = { ok: ['ok', 'Thành công'], failed: ['err', 'Lỗi'], running: ['neutral', 'Đang chạy'], skipped: ['warn', 'Bỏ qua'] };
const ENTITY: Array<[Entity, string]> = [['documents', 'Văn bản'], ['tasks', 'Công việc'], ['records', 'Dữ liệu chung (records)']];
const ERR = (e: unknown) => (e instanceof ApiProblem ? `${e.title}${e.detail ? ` — ${e.detail}` : ''}` : e instanceof Error ? e.message : 'Lỗi');

/** Mã khởi đầu cho spider mới — khung dùng vala_sdk, quản trị sửa đường dẫn/trường cho hệ thống nguồn. */
const template = (code: string) => `"""
Spider ${code || '<mã>'} — mô tả ngắn việc spider làm.

Chạy trên Crawlab, dùng vala_sdk: backend cấp phiên (cookie) của từng người dùng; spider gọi API của
hệ thống nguồn rồi gửi bản ghi THÔ về, backend chuẩn hoá theo adapter (output_schema) của hệ thống đó.
Không in cookie hay nội dung phiên ra log.
"""
from vala_sdk import SchemaDrift, SessionExpired, Vala


def crawl(run):
    # run.session_cookies — cookie phiên (tên → giá trị) do backend cấp cho người dùng này.
    # API ở tên miền khác trang đăng nhập?  run.use_api_base('https://api.vi-du.bkav.com')
    # Header bắt buộc?                     run.http.headers['Ten-Header'] = '...'

    body = run.get('/duong-dan-api', params={}).json()
    items = body.get('items')
    if items is None:
        raise SchemaDrift('phản hồi không còn trường "items"')

    # run.account('<id người dùng bên hệ thống nguồn>')   # chống gán nhầm chủ dữ liệu
    run.save('<capability>', items)   # <capability> = id capability có sink trong adapter


if __name__ == '__main__':
    Vala().run('${code || '<mã>'}', crawl)
`;

/**
 * Màn hình quản trị — Script crawl. Mã spider (Python, dùng vala_sdk) lưu trong CSDL và viết/sửa ngay ở đây —
 * thêm hệ thống nguồn mới không cần sửa code. "Đồng bộ Crawlab" đẩy mã + tạo lịch cố định cho từng preset;
 * người dùng đặt lịch ở cổng, spider tự hỏi API ai cần crawl khi đến giờ.
 */
export function AdminSpidersPage() {
  const list = useAsync(() => api.get<SpiderList>('/admin/spiders'), []);
  const users = useAsync(() => api.get<AdminUser[]>('/admin/users'), []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [trial, setTrial] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const sync = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await api.post<SyncResult>('/admin/spiders/sync');
      setNote({ tone: 'ok', text: `Đã đồng bộ ${r.spiders.length} spider lên Crawlab (${r.spiders.map((s) => `${s.code}: ${s.schedules} lịch`).join('; ')}).` });
      list.reload();
    } catch (e) { setNote({ tone: 'err', text: ERR(e) }); }
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
    } catch (e) { setNote({ tone: 'err', text: ERR(e) }); }
    finally { setBusy(false); }
  };

  const d = list.data;
  const tv = useTableView(d?.spiders, (s) => `${s.ten} ${s.code} ${s.source_ten} ${s.is_enabled ? '' : 'đang tắt'} ${s.crawlab_spider_id ? 'đã đồng bộ' : 'chưa đồng bộ'}`);
  return (
    <>
      <PageTitle title="Script crawl"
        subtitle="Mỗi spider là một script Python (dùng vala_sdk) chạy trên Crawlab theo lịch. Viết và sửa mã ngay tại đây — thêm hệ thống nguồn mới không cần sửa code. Người dùng chỉ đặt lịch ở cổng." />
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
            {d.crawlab_url && <a className="text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400" href={d.crawlab_url} target="_blank" rel="noreferrer">Mở Crawlab (xem log) ↗</a>}
            <Button onClick={() => { setEditing('new'); setNote(null); }}>Thêm spider</Button>
            <Button variant="primary" disabled={busy || !d.crawlab_configured} onClick={() => void sync()}>{busy ? 'Đang đồng bộ…' : 'Đồng bộ Crawlab'}</Button>
          </div>
          <Muted className="mt-2">Đồng bộ đẩy mã spider đang lưu ở đây lên Crawlab (ghi đè bản trên Crawlab), tạo/cập nhật lịch cho mọi preset và cấu hình địa chỉ API cho spider. Sửa mã tại đây rồi đồng bộ — đừng sửa trực tiếp trên Crawlab vì lần đồng bộ sau sẽ ghi đè.</Muted>
        </Card>
      )}

      {d && !d.spiders.length && <Empty>Chưa có spider nào. Bấm “Thêm spider” để viết spider cho một hệ thống nguồn.</Empty>}
      {!!d?.spiders.length && <div className="mb-3"><SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder="Tìm theo tên, mã, hệ thống…" /></div>}
      {!!d?.spiders.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>Spider</Th><Th>Hệ thống</Th><Th>Đồng bộ</Th><Th num>Người đặt lịch</Th><Th>Lần chạy gần nhất</Th><Th>Chạy thử cho</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((s) => {
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
                    <Select aria-label={`Người dùng chạy thử ${s.code}`} value={trial[s.code] ?? ''} onChange={(e) => setTrial({ ...trial, [s.code]: e.target.value })}>
                      <option value="">Chọn người dùng…</option>
                      {users.data?.map((u) => <option key={u.id} value={u.id}>{u.ho_ten}</option>)}
                    </Select>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => { setEditing(s.code); setNote(null); }}>Sửa mã</Button>
                      <Button disabled={busy || !trial[s.code] || !s.crawlab_spider_id} onClick={() => void run(s)}>Chạy thử</Button>
                      <Button onClick={() => void toggle(s)}>{s.is_enabled ? 'Tắt' : 'Bật'}</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit="spider" />
      </>)}

      {editing && (
        <SpiderEditor code={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); setNote({ tone: 'ok', text: m }); list.reload(); }} />
      )}
    </>
  );
}

/** Soạn mã một spider: thông tin + mã main.py. Lưu vào CSDL; đồng bộ lên Crawlab ở ngoài. */
function SpiderEditor({ code, onClose, onSaved }: { code: string | null; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = code === null;
  const sources = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const detail = useAsync(() => (isNew ? Promise.resolve(null) : api.get<SpiderDetail>(`/admin/spiders/${code}`)), [code]);
  const [f, setF] = useState<{ code: string; ten: string; mo_ta: string; source_system: string; entity: Entity; main_py: string } | null>(
    isNew ? { code: '', ten: '', mo_ta: '', source_system: '', entity: 'records', main_py: template('') } : null);
  const [touchedCode, setTouchedCode] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const x = detail.data;
    if (x) setF({ code: x.code, ten: x.ten, mo_ta: x.mo_ta ?? '', source_system: x.source_system, entity: x.entity, main_py: x.main_py });
  }, [detail.data]);
  // Spider mới: chọn sẵn hệ thống nguồn đầu tiên.
  useEffect(() => {
    if (isNew && f && !f.source_system && sources.data?.length) setF({ ...f, source_system: sources.data[0]!.code });
  }, [isNew, f, sources.data]);

  const set = (p: Partial<NonNullable<typeof f>>) => setF((x) => (x ? { ...x, ...p } : x));
  // Spider mới: khi đổi mã mà người dùng chưa sửa mã nguồn, cập nhật khung mẫu theo mã.
  const setCode = (v: string) => set(touchedCode ? { code: v } : { code: v, main_py: template(v) });

  // Tab trong ô mã chèn 4 khoảng trắng (Python), không nhảy khỏi ô.
  const onTab = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || !f) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: en } = el;
    const next = `${f.main_py.slice(0, s)}    ${f.main_py.slice(en)}`;
    set({ main_py: next }); setTouchedCode(true);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 4; });
  };

  const save = async () => {
    if (!f) return;
    setBusy(true); setErr(null);
    const body = { ten: f.ten.trim(), mo_ta: f.mo_ta.trim() || null, source_system: f.source_system, entity: f.entity, main_py: f.main_py };
    try {
      if (isNew) await api.post('/admin/spiders', { code: f.code.trim(), ...body });
      else await api.patch(`/admin/spiders/${code}`, body);
      onSaved(`Đã lưu spider “${f.ten}”. Bấm “Đồng bộ Crawlab” để đẩy mã mới lên Crawlab.`);
    } catch (e) { setErr(ERR(e)); setBusy(false); }
  };

  const canSave = !!f && !busy && !!f.ten.trim() && !!f.source_system && !!f.main_py.trim() && (!isNew || /^[a-z][a-z0-9_]{1,62}$/.test(f.code));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 dark:bg-black/60 sm:p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-full w-full flex-col bg-white dark:bg-slate-950 sm:min-h-0 sm:max-w-5xl sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-xl dark:sm:border-slate-800 lg:h-[92vh] lg:overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="truncate text-base font-semibold">{isNew ? 'Thêm spider' : `Sửa spider: ${code}`}</h2>
          <span className="flex-1" />
          <button type="button" aria-label="Đóng" onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100">✕</button>
        </header>

        <div className="flex flex-1 flex-col gap-4 px-5 py-4 lg:min-h-0 lg:overflow-y-auto">
          {!isNew && detail.loading && <Loading />}
          {detail.error ? <ErrorBox error={detail.error} onRetry={detail.reload} /> : null}
          {f && (
            <>
              <Banner tone="info"><span>Mã này chạy trên Crawlab bằng Python — chỉ quản trị vận hành sửa được, mọi lần lưu đều ghi nhật ký. Spider dùng <code className="rounded bg-white/60 px-1 dark:bg-black/30">vala_sdk</code> để lấy phiên người dùng và gửi bản ghi về.</span></Banner>
              {!isNew && detail.data?.from_repo && <Banner tone="warn"><span>Spider này chưa có mã trong CSDL — đang hiện mẫu từ repo. Bấm Lưu để chuyển hẳn mã vào đây và sửa trên cổng từ nay.</span></Banner>}

              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {isNew && (
                  <Field label="Mã spider (chữ thường, số, gạch dưới)">
                    <Input className="w-full !min-w-0 font-mono" value={f.code} placeholder="vd hrportal_nghi_phep" onChange={(e) => setCode(e.target.value.toLowerCase())} />
                  </Field>
                )}
                <div className={isNew ? '' : 'sm:col-span-2'}>
                  <Field label="Tên hiển thị"><Input className="w-full !min-w-0" value={f.ten} placeholder="vd Cổng nhân sự — đơn nghỉ phép" onChange={(e) => set({ ten: e.target.value })} /></Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Mô tả (không bắt buộc)"><Input className="w-full !min-w-0" value={f.mo_ta} placeholder="Spider lấy gì, cho ai" onChange={(e) => set({ mo_ta: e.target.value })} /></Field>
                </div>
                <Field label="Hệ thống nguồn">
                  <Select className="w-full !min-w-0" value={f.source_system} onChange={(e) => set({ source_system: e.target.value })}>
                    {!f.source_system && <option value="">Chọn hệ thống…</option>}
                    {sources.data?.map((s) => <option key={s.code} value={s.code}>{s.ten}{s.enabled ? '' : ' (đang tắt)'}</option>)}
                  </Select>
                </Field>
                <Field label="Ghi vào bảng dữ liệu">
                  <Select className="w-full !min-w-0" value={f.entity} onChange={(e) => set({ entity: e.target.value as Entity })}>
                    {ENTITY.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </Select>
                </Field>
              </div>

              <div className="flex min-h-[420px] flex-1 flex-col">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sm font-medium">main.py</span>
                  <Muted className="text-xs">Python · Tab chèn 4 khoảng trắng</Muted>
                </div>
                <textarea aria-label="Mã main.py" spellCheck={false} value={f.main_py}
                  onChange={(e) => { set({ main_py: e.target.value }); setTouchedCode(true); }} onKeyDown={onTab}
                  className="min-h-[420px] w-full flex-1 resize-y rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/30" />
              </div>
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          {err && <p className="mr-auto text-sm text-red-700 dark:text-red-400">{err}</p>}
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{busy ? 'Đang lưu…' : isNew ? 'Tạo spider' : 'Lưu mã'}</Button>
        </footer>
      </div>
    </div>
  );
}

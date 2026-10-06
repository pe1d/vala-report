import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ApiProblem, api, fmtDateTime, type AdminSource, type AdminUser } from '../api';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Field, Input, Muted, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';
import { messages, tr, useT } from '../i18n';

const M = messages({
  run: { ok: 'Thành công', failed: 'Lỗi', running: 'Đang chạy', skipped: 'Bỏ qua' } as Record<string, string>,
  error: 'Lỗi',
  synced: (n: number, codes: string) => `Đã đồng bộ ${n} spider lên Crawlab (${codes}).`,
  toggled: (on: boolean, code: string) => `Đã ${on ? 'bật' : 'tắt'} ${code}. Lịch của người dùng dùng spider này sẽ tạm bỏ qua cho tới khi bật lại.`,
  ran: (code: string, task: string) => `Đã chạy ${code} trên Crawlab (task ${task}). Xem kết quả ở "Vận hành" hoặc log trong Crawlab.`,
  disabledKw: 'đang tắt', syncedKw: 'đã đồng bộ', notSyncedKw: 'chưa đồng bộ',
  title: 'Script crawl',
  subtitle: 'Mỗi spider là một script Python (dùng vala_sdk) chạy trên Crawlab theo lịch. Viết và sửa mã ngay tại đây — thêm hệ thống nguồn mới không cần sửa code. Người dùng chỉ đặt lịch ở cổng.',
  notConfigured: 'Chưa cấu hình — đặt CRAWLAB_URL trong .env', openCrawlab: 'Mở Crawlab (xem log) ↗',
  addSpider: 'Thêm spider', syncing: 'Đang đồng bộ…', sync: 'Đồng bộ Crawlab',
  syncHint: 'Đồng bộ đẩy mã spider đang lưu ở đây lên Crawlab (ghi đè bản trên Crawlab), xoá các lịch cố định cũ trên Crawlab (giờ chạy do worker Vala hẹn theo lịch từng người) và cấu hình địa chỉ API cho spider. Sửa mã tại đây rồi đồng bộ — đừng sửa trực tiếp trên Crawlab vì lần đồng bộ sau sẽ ghi đè.',
  empty: 'Chưa có spider nào. Bấm “Thêm spider” để viết spider cho một hệ thống nguồn.',
  search: 'Tìm theo tên, mã, hệ thống…',
  thSpider: 'Spider', thSystem: 'Hệ thống', thSync: 'Đồng bộ', thSubscribers: 'Người đặt lịch', thLastRun: 'Lần chạy gần nhất', thTrial: 'Chạy thử cho',
  syncedBadge: 'Đã đồng bộ', notSyncedBadge: 'Chưa đồng bộ', disabledBadge: 'Đang tắt',
  trialUser: (code: string) => `Người dùng chạy thử ${code}`, pickUser: 'Chọn người dùng…',
  editCode: 'Sửa mã', trialRun: 'Chạy thử', turnOff: 'Tắt', turnOn: 'Bật', unit: 'spider',
  saved: (ten: string) => `Đã lưu spider “${ten}”. Bấm “Đồng bộ Crawlab” để đẩy mã mới lên Crawlab.`,
  editTitle: (code: string) => `Sửa spider: ${code}`, close: 'Đóng',
  codeInfo: (sdk: ReactNode): ReactNode => <span>Mã này chạy trên Crawlab bằng Python — chỉ quản trị vận hành sửa được, mọi lần lưu đều ghi nhật ký. Spider dùng {sdk} để lấy phiên người dùng và gửi bản ghi về.</span>,
  fromRepo: 'Spider này chưa có mã trong CSDL — đang hiện mẫu từ repo. Bấm Lưu để chuyển hẳn mã vào đây và sửa trên cổng từ nay.',
  code: 'Mã spider (chữ thường, số, gạch dưới)', codePh: 'vd hrportal_nghi_phep',
  name: 'Tên hiển thị', namePh: 'vd Cổng nhân sự — đơn nghỉ phép',
  desc: 'Mô tả (không bắt buộc)', descPh: 'Spider lấy gì, cho ai',
  source: 'Hệ thống nguồn', pickSystem: 'Chọn hệ thống…', sourceOff: ' (đang tắt)',
  storage: 'Nơi lưu dữ liệu',
  storageText: (schema: ReactNode, save: ReactNode): ReactNode => <>Kho chung — trường theo {schema} của capability mà spider gửi ({save})</>,
  editorHint: 'Python · Tab chèn 4 khoảng trắng', codeLabel: 'Mã main.py',
  cancel: 'Huỷ', saving: 'Đang lưu…', create: 'Tạo spider', saveCode: 'Lưu mã',
}, {
  run: { ok: 'Succeeded', failed: 'Failed', running: 'Running', skipped: 'Skipped' } as Record<string, string>,
  error: 'Error',
  synced: (n: number, codes: string) => `Synced ${n} spider(s) to Crawlab (${codes}).`,
  toggled: (on: boolean, code: string) => `${code} ${on ? 'enabled' : 'disabled'}. User schedules using this spider are skipped while it is disabled.`,
  ran: (code: string, task: string) => `Ran ${code} on Crawlab (task ${task}). See the result under "Operations" or the log in Crawlab.`,
  disabledKw: 'disabled', syncedKw: 'synced', notSyncedKw: 'not synced',
  title: 'Crawl scripts',
  subtitle: 'Each spider is a Python script (using vala_sdk) that runs on Crawlab on a schedule. Write and edit the code right here — adding a new source system needs no code changes. Users only set schedules in the portal.',
  notConfigured: 'Not configured — set CRAWLAB_URL in .env', openCrawlab: 'Open Crawlab (view logs) ↗',
  addSpider: 'Add spider', syncing: 'Syncing…', sync: 'Sync to Crawlab',
  syncHint: 'Syncing pushes the spider code stored here to Crawlab (overwriting the copy there), removes old fixed schedules on Crawlab (run times are set by the Vala worker from each user’s schedule) and configures the API address for spiders. Edit the code here and then sync — don’t edit directly on Crawlab, as the next sync will overwrite it.',
  empty: 'No spiders yet. Click “Add spider” to write a spider for a source system.',
  search: 'Search by name, code, system…',
  thSpider: 'Spider', thSystem: 'System', thSync: 'Sync', thSubscribers: 'Scheduled by', thLastRun: 'Last run', thTrial: 'Test run for',
  syncedBadge: 'Synced', notSyncedBadge: 'Not synced', disabledBadge: 'Disabled',
  trialUser: (code: string) => `User for test run of ${code}`, pickUser: 'Choose a user…',
  editCode: 'Edit code', trialRun: 'Test run', turnOff: 'Disable', turnOn: 'Enable', unit: 'spiders',
  saved: (ten: string) => `Spider “${ten}” saved. Click “Sync to Crawlab” to push the new code to Crawlab.`,
  editTitle: (code: string) => `Edit spider: ${code}`, close: 'Close',
  codeInfo: (sdk: ReactNode): ReactNode => <span>This code runs as Python on Crawlab — only operations admins can edit it, and every save is logged. The spider uses {sdk} to get the user’s session and send records back.</span>,
  fromRepo: 'This spider has no code in the database yet — showing the template from the repo. Click Save to move the code here and edit it in the portal from now on.',
  code: 'Spider code (lowercase letters, digits, underscores)', codePh: 'e.g. hrportal_leave_requests',
  name: 'Display name', namePh: 'e.g. HR portal — leave requests',
  desc: 'Description (optional)', descPh: 'What the spider fetches, and for whom',
  source: 'Source system', pickSystem: 'Choose a system…', sourceOff: ' (disabled)',
  storage: 'Data storage',
  storageText: (schema: ReactNode, save: ReactNode): ReactNode => <>Shared store — fields follow the {schema} of the capability the spider sends ({save})</>,
  editorHint: 'Python · Tab inserts 4 spaces', codeLabel: 'main.py code',
  cancel: 'Cancel', saving: 'Saving…', create: 'Create spider', saveCode: 'Save code',
});

/** Mọi spider ghi vào kho chung records (theo sink trong cấu hình adapter). */
type Entity = 'records';
interface Spider {
  code: string; ten: string; mo_ta: string | null; source_system: string; source_ten: string; entity: Entity;
  is_enabled: boolean; crawlab_spider_id: string | null; synced_at: string | null; schedules: number; subscribers: number;
  last_run: { status: string; started_at: string; error_code: string | null } | null;
}
interface SpiderDetail { code: string; ten: string; mo_ta: string | null; source_system: string; entity: Entity; is_enabled: boolean; main_py: string; from_repo: boolean }
interface SpiderList { crawlab_url: string | null; crawlab_configured: boolean; spiders: Spider[] }
interface SyncResult { spiders: Array<{ code: string; files: number; schedules: number }> }

const RUN_TONE: Record<string, Tone> = { ok: 'ok', failed: 'err', running: 'neutral', skipped: 'warn' };
const ERR = (e: unknown) => (e instanceof ApiProblem ? `${e.title}${e.detail ? ` — ${e.detail}` : ''}` : e instanceof Error ? e.message : tr(M).error);

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
 * thêm hệ thống nguồn mới không cần sửa code. "Đồng bộ Crawlab" đẩy mã lên Crawlab; người dùng tự đặt lịch ở cổng,
 * worker Vala đến giờ thì chạy spider cho đúng người đó (--user).
 */
export function AdminSpidersPage() {
  const t = useT(M);
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
      setNote({ tone: 'ok', text: t.synced(r.spiders.length, r.spiders.map((s) => s.code).join(', ')) });
      list.reload();
    } catch (e) { setNote({ tone: 'err', text: ERR(e) }); }
    finally { setBusy(false); }
  };
  const toggle = async (s: Spider) => {
    await api.patch(`/admin/spiders/${s.code}`, { is_enabled: !s.is_enabled });
    setNote({ tone: 'info', text: t.toggled(!s.is_enabled, s.code) });
    list.reload();
  };
  const run = async (s: Spider) => {
    const uid = Number(trial[s.code]);
    if (!uid) return;
    setBusy(true); setNote(null);
    try {
      const r = await api.post<{ crawlab_task_ids: string[] }>(`/admin/spiders/${s.code}/run`, { user_id: uid });
      setNote({ tone: 'ok', text: t.ran(s.code, r.crawlab_task_ids[0] ?? '–') });
    } catch (e) { setNote({ tone: 'err', text: ERR(e) }); }
    finally { setBusy(false); }
  };

  const d = list.data;
  const tv = useTableView(d?.spiders, (s) => `${s.ten} ${s.code} ${s.source_ten} ${s.is_enabled ? '' : t.disabledKw} ${s.crawlab_spider_id ? t.syncedKw : t.notSyncedKw}`);
  return (
    <>
      <PageTitle title={t.title}
        subtitle={t.subtitle} />
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.loading && <Loading />}

      {d && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-medium">Crawlab</div>
              <Muted>{d.crawlab_configured ? d.crawlab_url : t.notConfigured}</Muted>
            </div>
            <span className="flex-1" />
            {d.crawlab_url && <a className="text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400" href={d.crawlab_url} target="_blank" rel="noreferrer">{t.openCrawlab}</a>}
            <Button onClick={() => { setEditing('new'); setNote(null); }}>{t.addSpider}</Button>
            <Button variant="primary" disabled={busy || !d.crawlab_configured} onClick={() => void sync()}>{busy ? t.syncing : t.sync}</Button>
          </div>
          <Muted className="mt-2">{t.syncHint}</Muted>
        </Card>
      )}

      {d && !d.spiders.length && <Empty>{t.empty}</Empty>}
      {!!d?.spiders.length && <div className="mb-3"><SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder={t.search} /></div>}
      {!!d?.spiders.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>{t.thSpider}</Th><Th>{t.thSystem}</Th><Th>{t.thSync}</Th><Th num>{t.thSubscribers}</Th><Th>{t.thLastRun}</Th><Th>{t.thTrial}</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((s) => {
              const lr = s.last_run ? (RUN_TONE[s.last_run.status] ? [RUN_TONE[s.last_run.status]!, t.run[s.last_run.status] ?? s.last_run.status] : ['neutral', s.last_run.status]) as [Tone, string] : null;
              return (
                <tr key={s.code}>
                  <Td><div className="font-medium">{s.ten}</div><Muted className="font-mono text-xs">{s.code}</Muted></Td>
                  <Td>{s.source_ten}</Td>
                  <Td>{s.crawlab_spider_id
                    ? <><Badge tone="ok">{t.syncedBadge}</Badge><Muted className="mt-1 text-xs">{fmtDateTime(s.synced_at)}</Muted></>
                    : <Badge tone="warn">{t.notSyncedBadge}</Badge>}
                    {!s.is_enabled && <div className="mt-1"><Badge tone="neutral">{t.disabledBadge}</Badge></div>}</Td>
                  <Td num>{s.subscribers}</Td>
                  <Td>{lr ? <><Badge tone={lr[0]}>{lr[1]}</Badge><Muted className="mt-1 text-xs">{fmtDateTime(s.last_run!.started_at)}{s.last_run!.error_code ? ` · ${s.last_run!.error_code}` : ''}</Muted></> : '–'}</Td>
                  <Td>
                    <Select aria-label={t.trialUser(s.code)} value={trial[s.code] ?? ''} onChange={(e) => setTrial({ ...trial, [s.code]: e.target.value })}>
                      <option value="">{t.pickUser}</option>
                      {users.data?.map((u) => <option key={u.id} value={u.id}>{u.ho_ten}</option>)}
                    </Select>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => { setEditing(s.code); setNote(null); }}>{t.editCode}</Button>
                      <Button disabled={busy || !trial[s.code] || !s.crawlab_spider_id} onClick={() => void run(s)}>{t.trialRun}</Button>
                      <Button onClick={() => void toggle(s)}>{s.is_enabled ? t.turnOff : t.turnOn}</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit={t.unit} />
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
  const t = useT(M);
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
    const body = { ten: f.ten.trim(), mo_ta: f.mo_ta.trim() || null, source_system: f.source_system, entity: 'records' as const, main_py: f.main_py };
    try {
      if (isNew) await api.post('/admin/spiders', { code: f.code.trim(), ...body });
      else await api.patch(`/admin/spiders/${code}`, body);
      onSaved(t.saved(f.ten));
    } catch (e) { setErr(ERR(e)); setBusy(false); }
  };

  const canSave = !!f && !busy && !!f.ten.trim() && !!f.source_system && !!f.main_py.trim() && (!isNew || /^[a-z][a-z0-9_]{1,62}$/.test(f.code));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 dark:bg-black/60 sm:p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-full w-full flex-col bg-white dark:bg-slate-950 sm:min-h-0 sm:max-w-5xl sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-xl dark:sm:border-slate-800 lg:h-[92vh] lg:overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="truncate text-base font-semibold">{isNew ? t.addSpider : t.editTitle(code)}</h2>
          <span className="flex-1" />
          <button type="button" aria-label={t.close} onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100">✕</button>
        </header>

        <div className="flex flex-1 flex-col gap-4 px-5 py-4 lg:min-h-0 lg:overflow-y-auto">
          {!isNew && detail.loading && <Loading />}
          {detail.error ? <ErrorBox error={detail.error} onRetry={detail.reload} /> : null}
          {f && (
            <>
              <Banner tone="info">{t.codeInfo(<code className="rounded bg-white/60 px-1 dark:bg-black/30">vala_sdk</code>)}</Banner>
              {!isNew && detail.data?.from_repo && <Banner tone="warn"><span>{t.fromRepo}</span></Banner>}

              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {isNew && (
                  <Field label={t.code}>
                    <Input className="w-full !min-w-0 font-mono" value={f.code} placeholder={t.codePh} onChange={(e) => setCode(e.target.value.toLowerCase())} />
                  </Field>
                )}
                <div className={isNew ? '' : 'sm:col-span-2'}>
                  <Field label={t.name}><Input className="w-full !min-w-0" value={f.ten} placeholder={t.namePh} onChange={(e) => set({ ten: e.target.value })} /></Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label={t.desc}><Input className="w-full !min-w-0" value={f.mo_ta} placeholder={t.descPh} onChange={(e) => set({ mo_ta: e.target.value })} /></Field>
                </div>
                <Field label={t.source}>
                  <Select className="w-full !min-w-0" value={f.source_system} onChange={(e) => set({ source_system: e.target.value })}>
                    {!f.source_system && <option value="">{t.pickSystem}</option>}
                    {sources.data?.map((s) => <option key={s.code} value={s.code}>{s.ten}{s.enabled ? '' : t.sourceOff}</option>)}
                  </Select>
                </Field>
                <Field label={t.storage}>
                  <div className="py-1.5 text-sm text-slate-600 dark:text-slate-300">{t.storageText(<code>output_schema</code>, <code>run.save</code>)}</div>
                </Field>
              </div>

              <div className="flex min-h-[420px] flex-1 flex-col">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sm font-medium">main.py</span>
                  <Muted className="text-xs">{t.editorHint}</Muted>
                </div>
                <textarea aria-label={t.codeLabel} spellCheck={false} value={f.main_py}
                  onChange={(e) => { set({ main_py: e.target.value }); setTouchedCode(true); }} onKeyDown={onTab}
                  className="min-h-[420px] w-full flex-1 resize-y rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/30" />
              </div>
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          {err && <p className="mr-auto text-sm text-red-700 dark:text-red-400">{err}</p>}
          <Button onClick={onClose}>{t.cancel}</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{busy ? t.saving : isNew ? t.create : t.saveCode}</Button>
        </footer>
      </div>
    </div>
  );
}

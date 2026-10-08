import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ApiProblem, api, fmtDateTime, type AdminSource, type AdminUser } from '@vala/ui/api';
import { useAsync } from '@vala/ui/hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '@vala/ui/TableTools';
import { Empty, ErrorBox, Loading } from '@vala/ui/States';
import { Badge, Banner, Button, Card, Field, Input, Muted, PageTitle, Select, Table, Td, Th } from '@vala/ui/ui';
import { useAdminEnv, type DesktopActionInfo } from './env';
import { messages, tr, useT } from '@vala/ui/i18n';

const M = messages({
  title: 'Kịch bản Desktop',
  subtitle: 'Gói CSS + JavaScript chạy trong trang hệ thống nguồn mở bằng Vala Desktop: sửa lỗi giao diện khi nhúng và khai báo thao tác có tên (lấy danh sách văn bản, tạo dự thảo…). Lưu là ứng dụng của mọi người tự tải bản mới — không cần phát hành bản app mới.',
  error: 'Lỗi',
  keyInfo: (fp: ReactNode): ReactNode => <>Máy chủ ký từng gói; Vala Desktop chỉ chạy gói đúng chữ ký. Dấu vân tay khoá: {fp}</>,
  inDesktop: 'Đang mở trong Vala Desktop — chạy thử được thao tác ngay trên máy này.',
  notInDesktop: 'Mở cổng trong Vala Desktop (tab Báo cáo) để chạy thử thao tác.',
  add: 'Thêm gói', empty: 'Chưa có gói kịch bản nào. Bấm “Thêm gói” để viết kịch bản cho một hệ thống nguồn.',
  search: 'Tìm theo tên, mã, hệ thống, địa chỉ…', unit: 'gói',
  thPackage: 'Gói', thSystem: 'Hệ thống', thMatches: 'Áp dụng cho trang', thVersion: 'Phiên bản', thUpdated: 'Cập nhật',
  disabled: 'Đang tắt', noSystem: '—', edit: 'Sửa', turnOff: 'Tắt', turnOn: 'Bật',
  toggled: (on: boolean, code: string) => on ? `Đã bật ${code}. Vala Desktop nhận gói ở lần kiểm kế tiếp (tối đa 15 phút, hoặc khi mở lại ứng dụng).` : `Đã tắt ${code}. Trang mở sau lần kiểm kế tiếp sẽ không còn chạy gói này.`,
  saved: (ten: string, v: number) => `Đã lưu “${ten}” — bản ${v}. Vala Desktop tải bản mới ở lần kiểm kế tiếp (tối đa 15 phút); trang đang mở nhận ngay khi tải xong.`,
  savedSame: (ten: string) => `Đã lưu “${ten}” (nội dung kịch bản không đổi).`,
  newTitle: 'Thêm gói kịch bản', editTitle: (code: string) => `Sửa gói: ${code}`, close: 'Đóng',
  codeInfo: 'Mã này chạy trong trang người dùng đang đăng nhập hệ thống nguồn — chỉ quản trị vận hành sửa được, mọi lần lưu đều ghi nhật ký và tạo phiên bản mới.',
  code: 'Mã gói (chữ thường, số, gạch dưới)', codePh: 'vd egov_van_ban',
  name: 'Tên hiển thị', namePh: 'vd eGov — sửa giao diện và thao tác văn bản',
  desc: 'Mô tả (không bắt buộc)',
  source: 'Hệ thống nguồn', noSource: 'Không gắn hệ thống (chỉ sửa giao diện)',
  sourceHint: 'Gắn hệ thống để chạy thử thao tác trong tab của hệ thống đó.',
  matches: 'Áp dụng cho trang (mỗi dòng một mẫu)',
  matchesHint: 'Dạng https://egov.bkav.com/* hoặc https://*.bkav.com/qlvb/* — dấu * khớp mọi thứ. Gói chạy ở mọi khung (cả iframe) có địa chỉ khớp.',
  fillFromSource: 'Lấy theo địa chỉ hệ thống',
  css: 'CSS (sửa giao diện)', cssHint: 'Áp dụng mỗi khi trang khớp tải xong.',
  script: 'JavaScript', scriptHint: 'Thân một hàm async nhận vala · Tab chèn 2 khoảng trắng',
  apiHelp: 'vala.$ / $$ · waitFor(selector) · click · fill(selector, giá trị) · read · table · form · request(url, { form | json }) · css · log · action(tên, { mo_ta, params }, async (args) => …)',
  note: 'Ghi chú cho bản này (không bắt buộc)', notePh: 'vd sửa nút Lưu bị che trên màn hình nhỏ',
  enabled: 'Bật gói',
  cancel: 'Huỷ', saving: 'Đang lưu…', create: 'Tạo gói', save: 'Lưu',
  versions: 'Phiên bản', current: 'Hiện tại', loadVersion: 'Nạp vào ô soạn', rollback: 'Quay về bản này',
  rollbackConfirm: (v: number) => `Quay về nội dung của bản ${v}? Hệ thống tạo một bản mới có nội dung đó (không xoá bản nào).`,
  rolledBack: (from: number, v: number) => `Đã quay về nội dung bản ${from} (thành bản ${v}).`,
  loadedVersion: (v: number) => `Đã nạp nội dung bản ${v} vào ô soạn — bấm Lưu để dùng.`,
  testHint: 'Chạy bằng bản ĐÃ LƯU, trong tab của hệ thống nguồn trên máy này (tab chưa mở thì mở nền), bằng phiên bạn đang đăng nhập hệ thống đó.',
  testNeedDesktop: 'Chỉ chạy thử được khi mở cổng trong Vala Desktop.',
  testNeedSource: 'Gắn hệ thống nguồn và lưu gói để chạy thử.',
  listActions: 'Xem thao tác', loadingActions: 'Đang mở trang…', pickAction: 'Chọn thao tác…',
  args: 'Tham số (JSON)', badJson: 'Tham số không phải JSON hợp lệ (dạng { "trang": 1 })',
  run: 'Chạy', running: 'Đang chạy…', result: 'Kết quả', failed: 'Lỗi',
  timeout: 'Vala Desktop không trả lời — kiểm tra ứng dụng còn chạy.',
  test2: 'Chạy thử', where: 'Nơi chạy', whereDesktop: 'Vala Desktop trên máy này', whereServer: 'Máy chủ (trình duyệt tự động)',
  serverHint: 'Chạy bằng bản ĐÃ LƯU trên máy chủ: trình duyệt không giao diện mở hệ thống nguồn bằng phiên đã lưu của người dùng được chọn — cùng kịch bản với Vala Desktop.',
  forUser: 'Cho người dùng', pickUser: 'Chọn người dùng…',
}, {
  title: 'Desktop scripts',
  subtitle: 'CSS + JavaScript packages that run inside source-system pages opened in Vala Desktop: fix display problems when embedding and declare named actions (list documents, create a draft…). Saving makes everyone’s app download the new version — no new app release needed.',
  error: 'Error',
  keyInfo: (fp: ReactNode): ReactNode => <>The server signs every package; Vala Desktop only runs packages with a valid signature. Key fingerprint: {fp}</>,
  inDesktop: 'Open in Vala Desktop — you can test actions right on this computer.',
  notInDesktop: 'Open the portal in Vala Desktop (Reports tab) to test actions.',
  add: 'Add package', empty: 'No script packages yet. Click “Add package” to write scripts for a source system.',
  search: 'Search by name, code, system, address…', unit: 'packages',
  thPackage: 'Package', thSystem: 'System', thMatches: 'Applies to pages', thVersion: 'Version', thUpdated: 'Updated',
  disabled: 'Disabled', noSystem: '—', edit: 'Edit', turnOff: 'Disable', turnOn: 'Enable',
  toggled: (on: boolean, code: string) => on ? `${code} enabled. Vala Desktop picks it up at its next check (within 15 minutes, or when the app reopens).` : `${code} disabled. Pages opened after the next check no longer run it.`,
  saved: (ten: string, v: number) => `Saved “${ten}” — version ${v}. Vala Desktop downloads it at its next check (within 15 minutes); open pages get it as soon as it downloads.`,
  savedSame: (ten: string) => `Saved “${ten}” (script content unchanged).`,
  newTitle: 'Add script package', editTitle: (code: string) => `Edit package: ${code}`, close: 'Close',
  codeInfo: 'This code runs in the page where the user is signed in to the source system — only operations admins can edit it, and every save is logged and creates a new version.',
  code: 'Package code (lowercase letters, digits, underscores)', codePh: 'e.g. egov_documents',
  name: 'Display name', namePh: 'e.g. eGov — display fixes and document actions',
  desc: 'Description (optional)',
  source: 'Source system', noSource: 'No system (display fixes only)',
  sourceHint: 'Link a system to test actions in that system’s tab.',
  matches: 'Applies to pages (one pattern per line)',
  matchesHint: 'Like https://egov.bkav.com/* or https://*.bkav.com/docs/* — * matches anything. The package runs in every frame (iframes too) whose address matches.',
  fillFromSource: 'Use the system’s address',
  css: 'CSS (display fixes)', cssHint: 'Applied whenever a matching page finishes loading.',
  script: 'JavaScript', scriptHint: 'Body of an async function receiving vala · Tab inserts 2 spaces',
  apiHelp: 'vala.$ / $$ · waitFor(selector) · click · fill(selector, value) · read · table · form · request(url, { form | json }) · css · log · action(name, { mo_ta, params }, async (args) => …)',
  note: 'Note for this version (optional)', notePh: 'e.g. fix the Save button hidden on small screens',
  enabled: 'Package enabled',
  cancel: 'Cancel', saving: 'Saving…', create: 'Create package', save: 'Save',
  versions: 'Versions', current: 'Current', loadVersion: 'Load into editor', rollback: 'Restore this version',
  rollbackConfirm: (v: number) => `Restore the content of version ${v}? A new version with that content is created (nothing is deleted).`,
  rolledBack: (from: number, v: number) => `Restored the content of version ${from} (now version ${v}).`,
  loadedVersion: (v: number) => `Loaded version ${v} into the editor — click Save to use it.`,
  testHint: 'Runs the SAVED version, in the source system’s tab on this computer (opened in the background if needed), using the session you are signed in with.',
  testNeedDesktop: 'Testing only works when the portal is open in Vala Desktop.',
  testNeedSource: 'Link a source system and save the package to test it.',
  listActions: 'Show actions', loadingActions: 'Opening the page…', pickAction: 'Choose an action…',
  args: 'Arguments (JSON)', badJson: 'Arguments are not valid JSON (e.g. { "page": 1 })',
  run: 'Run', running: 'Running…', result: 'Result', failed: 'Error',
  timeout: 'Vala Desktop did not answer — check that the app is still running.',
  test2: 'Test run', where: 'Run on', whereDesktop: 'Vala Desktop on this computer', whereServer: 'Server (automated browser)',
  serverHint: 'Runs the SAVED version on the server: a headless browser opens the source system with the selected user’s stored session — the same script as in Vala Desktop.',
  forUser: 'For user', pickUser: 'Choose a user…',
});

interface PackageRow {
  code: string; ten: string; mo_ta: string | null; source_system: string | null; source_ten: string | null; matches: string[];
  version: number; is_enabled: boolean; updated_at: string; updated_by: string | null; css_bytes: number; script_bytes: number;
}
interface PackageList { key_fingerprint: string; packages: PackageRow[] }
interface Version { version: number; ghi_chu: string | null; created_at: string; created_by: string | null; bytes: number }
interface PackageDetail {
  code: string; ten: string; mo_ta: string | null; source_system: string | null; matches: string[]; css: string; script: string;
  version: number; is_enabled: boolean; versions: Version[];
}
interface Form { code: string; ten: string; mo_ta: string; source_system: string; matches: string; css: string; script: string; is_enabled: boolean; ghi_chu: string }

const ERR = (e: unknown) => (e instanceof ApiProblem ? `${e.title}${e.detail ? ` — ${e.detail}` : ''}` : e instanceof Error ? e.message : tr(M).error);

const TEMPLATE = `// Chạy mỗi lần một trang khớp mẫu địa chỉ tải xong (cả trong iframe).
// Sửa giao diện: ô CSS ở trên, hoặc vala.css('...') khi cần điều kiện.

vala.action('tieu_de_trang', { mo_ta: 'Ví dụ: đọc tiêu đề trang đang mở' }, async () => {
  return { tieu_de: document.title, dia_chi: location.pathname };
});
`;

const textareaCls = 'w-full resize-y rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/30';

/** Tab trong ô mã chèn 2 khoảng trắng, không nhảy khỏi ô. */
function tabInserts(value: string, set: (v: string) => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: en } = el;
    set(`${value.slice(0, s)}  ${value.slice(en)}`);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
  };
}

/**
 * Màn hình quản trị — Kịch bản Desktop. Gói (CSS + JS) lưu CSDL, mỗi lần đổi nội dung là một phiên bản; Vala Desktop tải gói
 * đã ký và chạy trong trang hệ thống nguồn khớp mẫu địa chỉ. "Chạy thử" gọi thẳng Vala Desktop đang mở cổng này.
 */
export function AdminDesktopScriptsPage() {
  const t = useT(M);
  const list = useAsync(() => api.get<PackageList>('/admin/desktop-packages'), []);
  const env = useAdminEnv();
  const [note, setNote] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const toggle = async (p: PackageRow) => {
    try {
      await api.patch(`/admin/desktop-packages/${p.code}`, { is_enabled: !p.is_enabled });
      setNote({ tone: 'info', text: t.toggled(!p.is_enabled, p.code) });
      list.reload();
    } catch (e) { setNote({ tone: 'err', text: ERR(e) }); }
  };

  const d = list.data;
  const tv = useTableView(d?.packages, (p) => `${p.ten} ${p.code} ${p.source_ten ?? ''} ${p.matches.join(' ')}`);
  return (
    <>
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.loading && <Loading />}

      {d && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm">{t.keyInfo(<code className="font-mono">{d.key_fingerprint}</code>)}</div>
              <Muted className="mt-1">{env.desktop ? t.inDesktop : t.notInDesktop}</Muted>
            </div>
            <Button variant="primary" onClick={() => { setEditing('new'); setNote(null); }}>{t.add}</Button>
          </div>
        </Card>
      )}

      {d && !d.packages.length && <Empty>{t.empty}</Empty>}
      {!!d?.packages.length && <div className="mb-3"><SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder={t.search} /></div>}
      {!!d?.packages.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>{t.thPackage}</Th><Th>{t.thSystem}</Th><Th>{t.thMatches}</Th><Th num>{t.thVersion}</Th><Th>{t.thUpdated}</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((p) => (
              <tr key={p.code}>
                <Td><div className="font-medium">{p.ten}</div><Muted className="font-mono text-xs">{p.code}</Muted>
                  {!p.is_enabled && <div className="mt-1"><Badge tone="neutral">{t.disabled}</Badge></div>}</Td>
                <Td>{p.source_ten ?? t.noSystem}</Td>
                <Td><div className="max-w-xs space-y-0.5 font-mono text-xs">{p.matches.map((m) => <div key={m} className="truncate" title={m}>{m}</div>)}</div></Td>
                <Td num>v{p.version}</Td>
                <Td><div className="text-sm">{fmtDateTime(p.updated_at)}</div>{p.updated_by && <Muted className="text-xs">{p.updated_by}</Muted>}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button onClick={() => { setEditing(p.code); setNote(null); }}>{t.edit}</Button>
                    <Button onClick={() => void toggle(p)}>{p.is_enabled ? t.turnOff : t.turnOn}</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit={t.unit} />
      </>)}

      {editing && (
        <PackageEditor code={editing === 'new' ? null : editing} canTest={!!env.desktop}
          onClose={() => { setEditing(null); list.reload(); }}
          onSaved={(m, keepOpen) => { setNote({ tone: 'ok', text: m }); list.reload(); if (!keepOpen) setEditing(null); }} />
      )}
    </>
  );
}

function PackageEditor({ code, canTest, onClose, onSaved }: {
  code: string | null; canTest: boolean; onClose: () => void; onSaved: (m: string, keepOpen?: boolean) => void;
}) {
  const t = useT(M);
  const isNew = code === null;
  const sources = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const detail = useAsync(() => (isNew ? Promise.resolve(null) : api.get<PackageDetail>(`/admin/desktop-packages/${code}`)), [code]);
  const [f, setF] = useState<Form | null>(isNew
    ? { code: '', ten: '', mo_ta: '', source_system: '', matches: '', css: '', script: TEMPLATE, is_enabled: true, ghi_chu: '' } : null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const x = detail.data;
    if (x) setF({ code: x.code, ten: x.ten, mo_ta: x.mo_ta ?? '', source_system: x.source_system ?? '', matches: x.matches.join('\n'),
      css: x.css, script: x.script, is_enabled: x.is_enabled, ghi_chu: '' });
  }, [detail.data]);

  const set = (p: Partial<Form>) => setF((x) => (x ? { ...x, ...p } : x));
  const sourceUrl = (sc: string) => sources.data?.find((s) => s.code === sc)?.effective_base_url;
  const patternFor = (url?: string) => { try { return url ? `${new URL(url).origin}/*` : ''; } catch { return ''; } };
  const pickSource = (sc: string) => set(f && !f.matches.trim() && sc ? { source_system: sc, matches: patternFor(sourceUrl(sc)) } : { source_system: sc });

  const save = async () => {
    if (!f) return;
    setBusy(true); setErr(null); setInfo(null);
    const body = {
      ten: f.ten.trim(), mo_ta: f.mo_ta.trim() || null, source_system: f.source_system || null,
      matches: f.matches.split('\n').map((m) => m.trim()).filter(Boolean), css: f.css, script: f.script, is_enabled: f.is_enabled,
      ...(f.ghi_chu.trim() ? { ghi_chu: f.ghi_chu.trim() } : {}),
    };
    try {
      if (isNew) {
        const r = await api.post<{ version: number }>('/admin/desktop-packages', { code: f.code.trim(), ...body });
        onSaved(t.saved(f.ten, r.version));
      } else {
        const r = await api.patch<{ version: number; changed: boolean }>(`/admin/desktop-packages/${code}`, body);
        onSaved(r.changed ? t.saved(f.ten, r.version) : t.savedSame(f.ten), true);
        set({ ghi_chu: '' });
        detail.reload();
      }
    } catch (e) { setErr(ERR(e)); }
    finally { setBusy(false); }
  };

  const loadVersion = async (v: number) => {
    try {
      const x = await api.get<{ matches: string[]; css: string; script: string }>(`/admin/desktop-packages/${code}/versions/${v}`);
      set({ matches: x.matches.join('\n'), css: x.css, script: x.script });
      setInfo(t.loadedVersion(v));
    } catch (e) { setErr(ERR(e)); }
  };
  const rollback = async (v: number) => {
    if (!window.confirm(t.rollbackConfirm(v))) return;
    try {
      const r = await api.post<{ version: number }>(`/admin/desktop-packages/${code}/rollback`, { version: v });
      onSaved(t.rolledBack(v, r.version), true);
      detail.reload();
    } catch (e) { setErr(ERR(e)); }
  };

  const canSave = !!f && !busy && !!f.ten.trim() && !!f.matches.trim() && (!isNew || /^[a-z][a-z0-9_]{1,62}$/.test(f.code));
  const savedSource = detail.data?.source_system ?? null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 dark:bg-black/60 sm:p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-full w-full flex-col bg-white dark:bg-slate-950 sm:min-h-0 sm:max-w-5xl sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-xl dark:sm:border-slate-800 lg:h-[92vh] lg:overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="truncate text-base font-semibold">{isNew ? t.newTitle : t.editTitle(code)}</h2>
          {!isNew && detail.data && <Badge tone="neutral">v{detail.data.version}</Badge>}
          <span className="flex-1" />
          <button type="button" aria-label={t.close} onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100">✕</button>
        </header>

        {/* Khối con không co lại (shrink-0): cột flex cuộn được sẽ ép khối mã về min-h ⇒ dòng gợi ý tràn đè lên ô Ghi chú. */}
        <div className="flex flex-1 flex-col gap-4 px-5 py-4 lg:min-h-0 lg:overflow-y-auto [&>*]:shrink-0">
          {!isNew && detail.loading && <Loading />}
          {detail.error ? <ErrorBox error={detail.error} onRetry={detail.reload} /> : null}
          {f && (
            <>
              <Banner tone="info">{t.codeInfo}</Banner>
              {info && <Banner tone="info" role="status">{info}</Banner>}

              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {isNew && (
                  <Field label={t.code}>
                    <Input className="w-full !min-w-0 font-mono" value={f.code} placeholder={t.codePh} onChange={(e) => set({ code: e.target.value.toLowerCase() })} />
                  </Field>
                )}
                <div className={isNew ? '' : 'sm:col-span-2'}>
                  <Field label={t.name}><Input className="w-full !min-w-0" value={f.ten} placeholder={t.namePh} onChange={(e) => set({ ten: e.target.value })} /></Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label={t.desc}><Input className="w-full !min-w-0" value={f.mo_ta} onChange={(e) => set({ mo_ta: e.target.value })} /></Field>
                </div>
                <div>
                  <Field label={t.source}>
                    <Select className="w-full !min-w-0" value={f.source_system} onChange={(e) => pickSource(e.target.value)}>
                      <option value="">{t.noSource}</option>
                      {sources.data?.map((s) => <option key={s.code} value={s.code}>{s.ten}</option>)}
                    </Select>
                  </Field>
                  <Muted className="mt-1 text-xs">{t.sourceHint}</Muted>
                </div>
                <label className="flex items-center gap-2 self-center text-sm">
                  <input type="checkbox" checked={f.is_enabled} onChange={(e) => set({ is_enabled: e.target.checked })} />{t.enabled}
                </label>
                <div className="sm:col-span-2">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-sm font-medium">{t.matches}</span>
                    <span className="flex-1" />
                    {f.source_system && sourceUrl(f.source_system) && (
                      <button type="button" className="text-xs text-blue-700 hover:underline dark:text-blue-400"
                        onClick={() => set({ matches: patternFor(sourceUrl(f.source_system)) })}>{t.fillFromSource}</button>
                    )}
                  </div>
                  <textarea aria-label={t.matches} rows={3} spellCheck={false} value={f.matches} placeholder="https://egov.bkav.com/*"
                    onChange={(e) => set({ matches: e.target.value })} className={textareaCls} />
                  <Muted className="mt-1 text-xs">{t.matchesHint}</Muted>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-2"><span className="text-sm font-medium">{t.css}</span><Muted className="text-xs">{t.cssHint}</Muted></div>
                <textarea aria-label={t.css} rows={5} spellCheck={false} value={f.css} placeholder=".thanh-thong-bao-loi { display: none }"
                  onChange={(e) => set({ css: e.target.value })} onKeyDown={tabInserts(f.css, (v) => set({ css: v }))} className={textareaCls} />
              </div>

              <div className="flex flex-1 flex-col">
                <div className="mb-1.5 flex items-center gap-2"><span className="text-sm font-medium">{t.script}</span><Muted className="text-xs">{t.scriptHint}</Muted></div>
                <textarea aria-label={t.script} spellCheck={false} value={f.script}
                  onChange={(e) => set({ script: e.target.value })} onKeyDown={tabInserts(f.script, (v) => set({ script: v }))}
                  className={`${textareaCls} min-h-[360px] flex-1`} />
                <Muted className="mt-1 break-words font-mono text-xs">{t.apiHelp}</Muted>
              </div>

              <Field label={t.note}><Input className="w-full !min-w-0" value={f.ghi_chu} placeholder={t.notePh} onChange={(e) => set({ ghi_chu: e.target.value })} /></Field>

              {!isNew && <TestPanel code={code} source={savedSource} canTest={canTest} />}

              {!isNew && !!detail.data?.versions.length && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t.versions}</h3>
                  <Table>
                    <tbody>
                      {detail.data.versions.map((v) => (
                        <tr key={v.version}>
                          <Td num>v{v.version}</Td>
                          <Td><div className="text-sm">{fmtDateTime(v.created_at)}</div>{v.created_by && <Muted className="text-xs">{v.created_by}</Muted>}</Td>
                          <Td>{v.ghi_chu ?? ''}</Td>
                          <Td>
                            <div className="flex justify-end gap-1.5">
                              {v.version === detail.data!.version ? <Badge tone="ok">{t.current}</Badge> : (<>
                                <Button onClick={() => void loadVersion(v.version)}>{t.loadVersion}</Button>
                                <Button onClick={() => void rollback(v.version)}>{t.rollback}</Button>
                              </>)}
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          {err && <p className="mr-auto text-sm text-red-700 dark:text-red-400">{err}</p>}
          <Button onClick={onClose}>{isNew ? t.cancel : t.close}</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{busy ? t.saving : isNew ? t.create : t.save}</Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Chạy thử thao tác của gói (bản đã lưu): trong Vala Desktop đang mở cổng này, hoặc trên máy chủ (runner) bằng phiên đã lưu
 * của một người dùng — cùng kịch bản, hai nơi chạy.
 */
function TestPanel({ code, source, canTest }: { code: string; source: string | null; canTest: boolean }) {
  const t = useT(M);
  const env = useAdminEnv();
  const [where, setWhere] = useState<'desktop' | 'server'>(canTest ? 'desktop' : 'server');
  const users = useAsync(() => api.get<AdminUser[]>('/admin/users'), []);
  const [userId, setUserId] = useState('');
  const [actions, setActions] = useState<DesktopActionInfo[] | null>(null);
  const [name, setName] = useState('');
  const [args, setArgs] = useState('{}');
  const [busy, setBusy] = useState<'list' | 'run' | null>(null);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);

  const msg = (e: string) => (e === 'timeout' ? t.timeout : e);
  /** Gọi nơi chạy đang chọn; không có name ⇒ liệt kê thao tác. */
  const call = async (action?: string, a?: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; actions?: DesktopActionInfo[]; error?: string }> => {
    if (where === 'desktop') {
      if (!env.desktop) return { ok: false, error: t.testNeedDesktop };
      return action ? env.desktop.runAction(source!, action, a ?? {}) : env.desktop.listActions(source!);
    }
    try {
      return await api.post(`/admin/desktop-packages/${code}/run-server`, { user_id: Number(userId), ...(action ? { action, args: a ?? {} } : {}) });
    } catch (e) { return { ok: false, error: ERR(e) }; }
  };
  const list = async () => {
    setBusy('list'); setOut(null);
    const r = await call();
    setBusy(null);
    if (!r.ok) { setOut({ ok: false, text: msg(r.error ?? '') }); return; }
    setActions(r.actions ?? []);
    if (r.actions?.length && !r.actions.some((x) => x.name === name)) setName(r.actions[0]!.name);
  };
  const run = async () => {
    if (!name) return;
    let parsed: Record<string, unknown>;
    try {
      const v = JSON.parse(args.trim() || '{}') as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
      parsed = v as Record<string, unknown>;
    } catch { setOut({ ok: false, text: t.badJson }); return; }
    setBusy('run'); setOut(null);
    const r = await call(name, parsed);
    setBusy(null);
    setOut(r.ok ? { ok: true, text: JSON.stringify(r.result ?? null, null, 2) } : { ok: false, text: msg(r.error ?? '') });
  };

  const ready = !!source && (where === 'desktop' ? canTest : !!userId);
  const hint = !source ? t.testNeedSource : where === 'desktop' ? (canTest ? t.testHint : t.testNeedDesktop) : t.serverHint;
  const sel = actions?.find((a) => a.name === name);
  return (
    <Card>
      <h3 className="text-sm font-semibold">{t.test2}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select aria-label={t.where} value={where} onChange={(e) => { setWhere(e.target.value as 'desktop' | 'server'); setActions(null); setOut(null); }}>
          <option value="desktop">{t.whereDesktop}</option>
          <option value="server">{t.whereServer}</option>
        </Select>
        {where === 'server' && (
          <Select aria-label={t.forUser} value={userId} onChange={(e) => { setUserId(e.target.value); setActions(null); setOut(null); }}>
            <option value="">{t.pickUser}</option>
            {users.data?.map((u) => <option key={u.id} value={u.id}>{u.ho_ten}</option>)}
          </Select>
        )}
      </div>
      <Muted className="mt-1 text-xs">{hint}</Muted>
      {ready && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!!busy} onClick={() => void list()}>{busy === 'list' ? t.loadingActions : t.listActions}</Button>
            {actions && (
              <Select aria-label={t.pickAction} value={name} onChange={(e) => setName(e.target.value)}>
                {!actions.length && <option value="">{t.pickAction}</option>}
                {actions.map((a) => <option key={a.name} value={a.name}>{a.name}{a.mo_ta ? ` — ${a.mo_ta}` : ''}</option>)}
              </Select>
            )}
          </div>
          {actions && !!actions.length && (
            <>
              {sel?.params && <Muted className="font-mono text-xs">{Object.entries(sel.params).map(([k, v]) => `${k}: ${v}`).join(' · ')}</Muted>}
              <div>
                <div className="mb-1 text-sm font-medium">{t.args}</div>
                <textarea aria-label={t.args} rows={3} spellCheck={false} value={args} onChange={(e) => setArgs(e.target.value)} className={textareaCls} />
              </div>
              <Button variant="primary" disabled={!!busy || !name} onClick={() => void run()}>{busy === 'run' ? t.running : t.run}</Button>
            </>
          )}
        </div>
      )}
      {out && (
        <div className="mt-3">
          <div className={`mb-1 text-sm font-medium ${out.ok ? '' : 'text-red-700 dark:text-red-400'}`}>{out.ok ? t.result : t.failed}</div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">{out.text}</pre>
        </div>
      )}
    </Card>
  );
}

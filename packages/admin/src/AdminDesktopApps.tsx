import { useState, type ReactNode } from 'react';
import { ApiProblem, api, type AdminSource } from '@vala/ui/api';
import { useAsync } from '@vala/ui/hooks';
import { Empty, ErrorBox, Loading } from '@vala/ui/States';
import { Badge, Banner, Button, Card, Field, Input, Menu, Muted, PageTitle, Select, Table, Td, Th } from '@vala/ui/ui';
import { messages, useT } from '@vala/ui/i18n';

/**
 * Quản trị → Ứng dụng Desktop: danh mục ứng dụng Vala Desktop của đơn vị (họp 07/10 phần 3) — trang web, hệ thống nguồn,
 * Báo cáo. Thứ tự, ghim sẵn, một ứng dụng mặc định. Báo cáo luôn có (chỉ đổi tên, biểu tượng, thứ tự, ghim sẵn).
 * Mỗi người dùng tự ghim / bỏ ghim trong ứng dụng (bố cục riêng lưu trên máy chủ).
 */
interface DesktopApp {
  ma: string; ten: string; kind: 'web' | 'source' | 'reports'; url: string | null; source_system: string | null; icon: string | null;
  sort: number; pinned_default: boolean; is_default: boolean; enabled: boolean;
}
type Draft = Omit<DesktopApp, 'sort'> & { isNew: boolean };

const M = messages({
  title: 'Ứng dụng Desktop',
  subtitle: 'Các ứng dụng hiện trên thanh bên của Vala Desktop cho mọi người trong đơn vị. Ứng dụng mặc định đứng đầu và được nạp sẵn khi mở app. Người dùng tự ghim / bỏ ghim trong ứng dụng; thay đổi ở đây tới máy người dùng trong vòng 15 phút.',
  add: 'Thêm ứng dụng', empty: 'Chưa có ứng dụng nào.',
  thOrder: 'Thứ tự', thApp: 'Ứng dụng', thKind: 'Loại', thTarget: 'Địa chỉ / hệ thống', thFlags: 'Hiển thị', thActions: '',
  kinds: { web: 'Trang web', source: 'Hệ thống nguồn', reports: 'Báo cáo' } as Record<DesktopApp['kind'], string>,
  reportsTarget: 'Cổng Vala Reporting (đi kèm Vala Desktop)',
  isDefault: 'Mặc định', pinned: 'Ghim sẵn', notPinned: 'Trong ⊞', off: 'Đang tắt',
  up: 'Lên', down: 'Xuống', edit: 'Sửa', turnOff: 'Tắt', turnOn: 'Bật', remove: 'Xoá',
  removeConfirm: (ten: string) => `Xoá ứng dụng “${ten}” khỏi danh mục? Người dùng sẽ không còn thấy ứng dụng này.`,
  newTitle: 'Thêm ứng dụng', editTitle: (ten: string) => `Sửa: ${ten}`,
  kind: 'Loại ứng dụng', name: 'Tên hiển thị', namePh: 'vd Vala, eGov, Báo điện tử…',
  code: 'Mã (chữ thường, số, gạch dưới)', codePh: 'vd bao_dien_tu', codeHint: 'Dùng để lưu bố cục của người dùng — không đổi được sau khi tạo.',
  url: 'Địa chỉ trang', urlPh: 'https://…',
  source: 'Hệ thống nguồn', pickSource: 'Chọn hệ thống…', sourceHint: 'Mở trang đăng nhập của hệ thống; Vala Desktop giữ phiên và chạy kịch bản như hiện nay.',
  icon: 'Biểu tượng (không bắt buộc)', iconPh: 'https://…/favicon.png', iconUpload: 'Tải ảnh lên', iconClear: 'Bỏ biểu tượng',
  iconHint: 'Để trống ⇒ dùng biểu tượng của trang (favicon) hoặc chữ cái đầu.', iconTooBig: 'Ảnh quá lớn (tối đa 150 KB).',
  pinnedDefault: 'Ghim sẵn trên thanh bên (người dùng chưa tự sắp xếp)', defaultApp: 'Ứng dụng mặc định (đứng đầu, nạp sẵn)', enabledLabel: 'Bật',
  reportsNote: 'Báo cáo luôn đi kèm Vala Desktop (phiên các hệ thống nguồn, kết nối, lịch dữ liệu ở đây): không tắt / xoá được.',
  cancel: 'Huỷ', save: 'Lưu', create: 'Thêm', saving: 'Đang lưu…',
  saved: (ten: string) => `Đã lưu “${ten}”. Vala Desktop nhận thay đổi ở lần làm mới kế tiếp (tối đa 15 phút).`,
}, {
  title: 'Desktop apps',
  subtitle: "Apps shown on the Vala Desktop sidebar for everyone in your organization. The default app comes first and is preloaded when the app opens. Users pin / unpin apps themselves; changes here reach users' computers within 15 minutes.",
  add: 'Add app', empty: 'No apps yet.',
  thOrder: 'Order', thApp: 'App', thKind: 'Type', thTarget: 'Address / system', thFlags: 'Display', thActions: '',
  kinds: { web: 'Web page', source: 'Source system', reports: 'Reports' } as Record<DesktopApp['kind'], string>,
  reportsTarget: 'Vala Reporting portal (built into Vala Desktop)',
  isDefault: 'Default', pinned: 'Pinned', notPinned: 'In ⊞', off: 'Disabled',
  up: 'Up', down: 'Down', edit: 'Edit', turnOff: 'Disable', turnOn: 'Enable', remove: 'Delete',
  removeConfirm: (ten: string) => `Remove “${ten}” from the catalog? Users will no longer see this app.`,
  newTitle: 'Add app', editTitle: (ten: string) => `Edit: ${ten}`,
  kind: 'App type', name: 'Display name', namePh: 'e.g. Vala, eGov, News…',
  code: 'Code (lowercase letters, digits, underscores)', codePh: 'e.g. news', codeHint: "Used to store users' layouts — can't be changed after creation.",
  url: 'Page address', urlPh: 'https://…',
  source: 'Source system', pickSource: 'Choose a system…', sourceHint: 'Opens the system’s sign-in page; Vala Desktop keeps the session and runs scripts as before.',
  icon: 'Icon (optional)', iconPh: 'https://…/favicon.png', iconUpload: 'Upload image', iconClear: 'Remove icon',
  iconHint: "Leave empty to use the page's favicon or the first letter.", iconTooBig: 'Image too large (max 150 KB).',
  pinnedDefault: "Pinned on the sidebar (for users who haven't arranged their own)", defaultApp: 'Default app (first, preloaded)', enabledLabel: 'Enabled',
  reportsNote: 'Reports is always part of Vala Desktop (source-system sessions, connections and data schedules live there): it cannot be disabled or deleted.',
  cancel: 'Cancel', save: 'Save', create: 'Add', saving: 'Saving…',
  saved: (ten: string) => `Saved “${ten}”. Vala Desktop picks up the change at its next refresh (within 15 minutes).`,
});

const blank = (): Draft => ({ isNew: true, ma: '', ten: '', kind: 'web', url: '', source_system: null, icon: null, pinned_default: true, is_default: false, enabled: true });
/** Mã gợi ý từ tên: bỏ dấu, chữ thường, gạch dưới. */
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'a_$1').slice(0, 40);

function AppIcon({ a }: { a: Pick<DesktopApp, 'icon' | 'ten'> }) {
  const [bad, setBad] = useState(false);
  if (a.icon && !bad) return <img src={a.icon} alt="" className="h-6 w-6 shrink-0 rounded-md object-contain" onError={() => setBad(true)} />;
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[11px] font-semibold text-white">{(a.ten.trim()[0] ?? '•').toUpperCase()}</span>;
}

export function AdminDesktopAppsPage() {
  const t = useT(M);
  const apps = useAsync(() => api.get<DesktopApp[]>('/admin/desktop-apps'), []);
  const sources = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: ReactNode } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => setNote({ tone: 'err', text: e instanceof ApiProblem ? <><b>{e.title}</b>{e.detail ? ` — ${e.detail}` : ''}</> : String(e) });
  const list = apps.data ?? [];

  const move = async (i: number, d: -1 | 1) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    try { await api.post('/admin/desktop-apps/order', { ma: next.map((a) => a.ma) }); apps.reload(); } catch (e) { fail(e); }
  };
  const patch = async (a: DesktopApp, body: Partial<DesktopApp>) => {
    try { await api.patch(`/admin/desktop-apps/${a.ma}`, body); apps.reload(); } catch (e) { fail(e); }
  };
  const remove = async (a: DesktopApp) => {
    if (!window.confirm(t.removeConfirm(a.ten))) return;
    try { await api.del(`/admin/desktop-apps/${a.ma}`); apps.reload(); } catch (e) { fail(e); }
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true); setNote(null);
    const { isNew, ...b } = draft;
    const body = { ...b, url: b.kind === 'web' ? b.url : null, source_system: b.kind === 'source' ? b.source_system : null };
    try {
      if (isNew) await api.post('/admin/desktop-apps', body);
      else { const { ma: _m, ...rest } = body; await api.patch(`/admin/desktop-apps/${draft.ma}`, rest); }
      setNote({ tone: 'ok', text: t.saved(draft.ten) });
      setDraft(null);
      apps.reload();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const upload = (f: File | undefined) => {
    if (!f || !draft) return;
    if (f.size > 150_000) { setNote({ tone: 'err', text: t.iconTooBig }); return; }
    const r = new FileReader();
    r.onload = () => setDraft((d) => (d ? { ...d, icon: String(r.result) } : d));
    r.readAsDataURL(f);
  };

  // Hệ thống nguồn chưa có trong danh mục (mỗi hệ thống một ứng dụng) — khi sửa thì giữ hệ thống đang chọn.
  const usedSources = new Set(list.filter((a) => a.source_system && a.ma !== draft?.ma).map((a) => a.source_system));
  const sourceOptions = (sources.data ?? []).filter((s) => s.enabled && !usedSources.has(s.code));

  return (
    <div>
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {note && <Banner tone={note.tone} role={note.tone === 'err' ? 'alert' : 'status'}>{note.text}</Banner>}

      {draft ? (
        <Card className="mb-4 max-w-2xl rounded-2xl">
          <h2 className="mb-3 text-base font-semibold">{draft.isNew ? t.newTitle : t.editTitle(draft.ten)}</h2>
          <div className="grid gap-3">
            {draft.kind === 'reports' ? <Muted>{t.reportsNote}</Muted> : (
              <Field label={t.kind}>
                <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}>
                  <option value="web">{t.kinds.web}</option>
                  <option value="source">{t.kinds.source}</option>
                </Select>
              </Field>
            )}
            <Field label={t.name}>
              <Input value={draft.ten} placeholder={t.namePh} maxLength={60}
                onChange={(e) => setDraft({ ...draft, ten: e.target.value, ...(draft.isNew ? { ma: slug(e.target.value) } : {}) })} />
            </Field>
            {draft.isNew && (
              <Field label={t.code}>
                <Input value={draft.ma} placeholder={t.codePh} maxLength={40} onChange={(e) => setDraft({ ...draft, ma: e.target.value })} />
                <span className="font-normal text-slate-400">{t.codeHint}</span>
              </Field>
            )}
            {draft.kind === 'web' && (
              <Field label={t.url}>
                <Input type="url" value={draft.url ?? ''} placeholder={t.urlPh} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              </Field>
            )}
            {draft.kind === 'source' && (
              <Field label={t.source}>
                <Select value={draft.source_system ?? ''} onChange={(e) => {
                  const s = sourceOptions.find((x) => x.code === e.target.value);
                  setDraft({ ...draft, source_system: e.target.value || null, ...(s && !draft.ten ? { ten: s.ten, ma: draft.isNew ? slug(s.ten) : draft.ma } : {}) });
                }}>
                  <option value="">{t.pickSource}</option>
                  {sourceOptions.map((s) => <option key={s.code} value={s.code}>{s.ten} ({s.code})</option>)}
                </Select>
                <span className="font-normal text-slate-400">{t.sourceHint}</span>
              </Field>
            )}
            <Field label={t.icon}>
              <div className="flex items-center gap-2">
                <AppIcon a={{ icon: draft.icon, ten: draft.ten || '?' }} />
                <Input className="min-w-0 flex-1" value={draft.icon?.startsWith('data:') ? '' : draft.icon ?? ''} placeholder={draft.icon?.startsWith('data:') ? '✓' : t.iconPh}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value || null })} />
                <label className="cursor-pointer whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  {t.iconUpload}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon" hidden onChange={(e) => upload(e.target.files?.[0])} />
                </label>
                {draft.icon && <Button onClick={() => setDraft({ ...draft, icon: null })}>{t.iconClear}</Button>}
              </div>
              <span className="font-normal text-slate-400">{t.iconHint}</span>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.pinned_default} onChange={(e) => setDraft({ ...draft, pinned_default: e.target.checked })} />{t.pinnedDefault}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} />{t.defaultApp}</label>
            {draft.kind !== 'reports' && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />{t.enabledLabel}</label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setDraft(null)}>{t.cancel}</Button>
              <Button variant="primary" disabled={busy || !draft.ten.trim() || !draft.ma} onClick={() => void save()}>
                {busy ? t.saving : draft.isNew ? t.create : t.save}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="mb-3 flex justify-end"><Button variant="primary" onClick={() => { setNote(null); setDraft(blank()); }}>{t.add}</Button></div>
      )}

      {apps.loading && !apps.data && <Loading rows={4} />}
      {apps.error ? <ErrorBox error={apps.error} onRetry={apps.reload} /> : null}
      {apps.data && !list.length && <Empty>{t.empty}</Empty>}
      {list.length > 0 && (
        <Table>
          <thead><tr><Th>{t.thOrder}</Th><Th>{t.thApp}</Th><Th>{t.thKind}</Th><Th>{t.thTarget}</Th><Th>{t.thFlags}</Th><Th>{t.thActions}</Th></tr></thead>
          <tbody>
            {list.map((a, i) => (
              <tr key={a.ma} className={a.enabled ? '' : 'opacity-60'}>
                <Td>
                  <div className="flex gap-1">
                    <Button aria-label={t.up} title={t.up} disabled={i === 0} onClick={() => void move(i, -1)} className="px-2 py-0.5">↑</Button>
                    <Button aria-label={t.down} title={t.down} disabled={i === list.length - 1} onClick={() => void move(i, 1)} className="px-2 py-0.5">↓</Button>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <AppIcon a={a} />
                    <div className="min-w-0"><div className="font-medium">{a.ten}</div><div className="font-mono text-xs text-slate-500">{a.ma}</div></div>
                  </div>
                </Td>
                <Td>{t.kinds[a.kind]}</Td>
                <Td><span className="break-all text-sm">{a.kind === 'reports' ? t.reportsTarget : a.kind === 'source' ? a.source_system : a.url}</span></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {a.is_default && <Badge tone="info">{t.isDefault}</Badge>}
                    <Badge tone={a.pinned_default ? 'ok' : 'neutral'}>{a.pinned_default ? t.pinned : t.notPinned}</Badge>
                    {!a.enabled && <Badge tone="warn">{t.off}</Badge>}
                  </div>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button onClick={() => { setNote(null); setDraft({ ...a, isNew: false }); }}>{t.edit}</Button>
                    {/* Báo cáo luôn đi kèm Desktop: không tắt / xoá. */}
                    {a.kind !== 'reports' && <Menu items={[
                      { label: a.enabled ? t.turnOff : t.turnOn, onClick: () => void patch(a, { enabled: !a.enabled }) },
                      { label: t.remove, danger: true, onClick: () => void remove(a) },
                    ]} />}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

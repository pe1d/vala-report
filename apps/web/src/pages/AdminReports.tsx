import { useEffect, useState, type ReactNode } from 'react';
import { ApiProblem, api, fmtDateTime, type AdminSource, type ReportResult, type StatTile } from '../api';
import { ChartView } from '../components/Charts';
import { DataTable } from '../components/DataTable';
import { StatTiles } from '../components/StatTiles';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Field, Input, Menu, Muted, PageTitle, Select, Table, Tabs, Td, Th } from '../components/ui';
import { useAsync } from '../hooks';
import { GroupChips, GroupSection, NoMatch, Pager, TableToolbar, groupRows, usePaged, useTableView } from '../components/TableTools';

// ---- kiểu định nghĩa (khớp apps/api/src/reports/defined.ts) --------------------------------------
type FieldType = 'string' | 'int' | 'date';
interface FieldInfo { name: string; label: string; type: FieldType }
interface DatasetInfo { dataset: 'documents' | 'tasks' | 'records'; capability: string; label: string }
type Op = 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'not_null'
  | 'truoc_hom_nay' | 'tu_hom_nay' | 'hom_nay' | 'den_hom_nay' | 'thang_nay' | 'trong_n_ngay_toi' | 'trong_n_ngay_qua';
/** Chỉ dùng cho trường ngày. */
const DATE_OPS: Op[] = ['truoc_hom_nay', 'tu_hom_nay', 'hom_nay', 'den_hom_nay', 'thang_nay', 'trong_n_ngay_toi', 'trong_n_ngay_qua'];
const DAYS_OPS: Op[] = ['trong_n_ngay_toi', 'trong_n_ngay_qua'];
interface Filter { field: string; op: Op; value?: string | number }
interface Measure { fn: 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max' | 'ty_le'; field?: string; label: string; filters: Filter[] }
interface Tile extends Measure { warn_if_gt?: number; err_if_gt?: number; trend_field?: string }
type ChartKind = 'bar' | 'column' | 'line' | 'donut' | 'heatmap';
interface Definition {
  dataset: DatasetInfo['dataset']; capability?: string; mode: 'list' | 'summary';
  date_field?: string; default_period: string; keyword_field?: string;
  filters: Filter[]; param_filters: Array<{ field: string }>;
  columns: Array<{ field: string }>; group_by: Array<{ field: string; bucket?: 'day' | 'month' }>;
  measures: Measure[]; chart?: { kind: ChartKind }; tiles: Tile[];
  sort?: { by: string; dir: 'asc' | 'desc' };
}
interface ReportRow {
  code: string; ten: string; mo_ta: string | null; source_system: string; source_ten: string; kind: 'config' | 'missing';
  required_scope: 'ca_nhan' | 'don_vi'; is_active: boolean; show_on_dashboard: boolean; dashboard_order: number;
  dashboard_tab: number | null; dashboard_width: 1 | 2 | 3;
  definition: Definition | null; lich: number; updated_at: string;
}
interface DashTab { id: number; ten: string; source_system: string | null; source_ten: string | null; thu_tu: number; is_active: boolean; khoi: number }

const OPS: Array<[Op, string, boolean]> = [
  ['eq', 'bằng', true], ['neq', 'khác', true], ['contains', 'chứa', true], ['gt', 'lớn hơn', true], ['gte', 'từ', true],
  ['lt', 'nhỏ hơn', true], ['lte', 'đến', true], ['is_null', 'trống', false], ['not_null', 'có giá trị', false],
  ['truoc_hom_nay', 'trước hôm nay', false], ['hom_nay', 'đúng hôm nay', false], ['den_hom_nay', 'đến hết hôm nay', false], ['tu_hom_nay', 'từ hôm nay trở đi', false],
  ['thang_nay', 'trong tháng này', false], ['trong_n_ngay_toi', 'trong số ngày tới', true], ['trong_n_ngay_qua', 'trong số ngày qua', true],
];
const FNS: Array<[Measure['fn'], string]> = [['count', 'Đếm'], ['count_distinct', 'Đếm khác nhau'], ['sum', 'Tổng'], ['avg', 'Trung bình'],
  ['min', 'Nhỏ nhất'], ['max', 'Lớn nhất'], ['ty_le', 'Tỉ lệ % thoả điều kiện']];
const PERIODS: Array<[string, string]> = [['thang_hien_tai', 'Tháng hiện tại'], ['thang_truoc', 'Tháng trước'], ['quy_hien_tai', 'Quý hiện tại'],
  ['30_ngay_qua', '30 ngày qua'], ['6_thang_qua', '6 tháng qua'], ['12_thang_qua', '12 tháng qua'],
  ['7_ngay_toi', '7 ngày tới'], ['14_ngay_toi', '14 ngày tới'], ['30_ngay_toi', '30 ngày tới'], ['tat_ca', 'Toàn bộ thời gian']];
const CHARTS: Array<[ChartKind, string]> = [['bar', 'Cột ngang — so sánh hạng mục'], ['column', 'Cột đứng — theo ngày/tháng'],
  ['line', 'Đường — xu hướng theo thời gian'], ['donut', 'Vành khuyên — phần của tổng (ít nhóm)'], ['heatmap', 'Lịch nhiệt — mật độ theo ngày']];
const WIDTHS: Array<[1 | 2 | 3, string]> = [[3, 'Cả hàng'], [2, '2/3 hàng'], [1, '1/3 hàng']];
const EMPTY = (dataset: DatasetInfo): Definition => ({
  dataset: dataset.dataset, capability: dataset.dataset === 'records' ? dataset.capability : undefined, mode: 'summary',
  default_period: 'thang_hien_tai', filters: [], param_filters: [], columns: [], group_by: [],
  measures: [{ fn: 'count', label: 'Số lượng', filters: [] }], tiles: [],
});
const ERR = (e: unknown) => (e instanceof ApiProblem ? `${e.title}${e.detail ? ` — ${e.detail}` : ''}` : 'Lỗi');

/**
 * Quản trị — Cấu hình báo cáo. Dựng báo cáo trên dữ liệu của bất kỳ hệ thống nguồn nào mà không viết code:
 * chọn dữ liệu, bộ lọc, nhóm, phép tính, biểu đồ, thẻ KPI; xem thử; bật "Hiện trên Tổng quan".
 */
export function AdminReportsPage() {
  const list = useAsync(() => api.get<ReportRow[]>('/admin/reports'), []);
  const tabs = useAsync(() => api.get<DashTab[]>('/admin/dashboard-tabs'), []);
  const [view, setView] = useState<'reports' | 'tabs'>('reports');
  const tabName = (id: number | null) => (id === null ? 'Báo cáo của bạn' : tabs.data?.find((t) => t.id === id)?.ten ?? '?');
  // Tìm trên toàn bộ rồi chia nhóm theo hệ thống nguồn; mỗi nhóm tự phân trang khi dài.
  const tv = useTableView(list.data, (r) => `${r.ten} ${r.code} ${r.source_ten} ${r.mo_ta ?? ''} ${r.show_on_dashboard ? tabName(r.dashboard_tab) : ''}`, 10_000);
  const [src, setSrc] = useState('');
  const groups = groupRows(tv.rows, (r) => r.source_system, (r) => r.source_ten);
  const [editing, setEditing] = useState<ReportRow | 'new' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const patch = async (r: ReportRow, body: Partial<ReportRow>, msg: string) => {
    await api.patch(`/admin/reports/${r.code}`, body);
    setNote(msg);
    list.reload();
  };
  const remove = async (r: ReportRow) => {
    const lich = r.lich ? `\n\n${r.lich} lịch chạy đang bật của báo cáo này cũng bị xoá.` : '';
    if (!confirm(`Xoá hẳn báo cáo “${r.ten}”?${lich}\n\nDữ liệu đã lấy về không bị ảnh hưởng. Không hoàn tác được.`)) return;
    try {
      await api.del(`/admin/reports/${r.code}`);
      setNote(`Đã xoá báo cáo “${r.ten}”.`);
      list.reload();
    } catch (e) { setNote(ERR(e)); }
  };

  return (
    <>
      <PageTitle title="Cấu hình báo cáo"
        subtitle="Tạo báo cáo trên dữ liệu của mọi hệ thống nguồn — không cần viết code. Báo cáo bật “Hiện trên Tổng quan” xuất hiện ngay trên trang Tổng quan của người dùng có dữ liệu." />
      {note && <Banner tone="ok" role="status">{note}</Banner>}
      <Tabs label="Phần cấu hình" value={view} onChange={(v) => { setView(v as 'reports' | 'tabs'); setNote(null); }}
        items={[{ id: 'reports', label: 'Báo cáo', count: list.data ? { n: list.data.length } : undefined },
          { id: 'tabs', label: 'Tab trên Tổng quan', count: tabs.data ? { n: tabs.data.length } : undefined }]} />
      {view === 'tabs' ? <TabManager tabs={tabs} onNote={setNote} onChanged={() => { tabs.reload(); list.reload(); }} /> : (<>
      <TableToolbar q={tv.q} onQ={tv.setQ} placeholder="Tìm theo tên, mã, hệ thống, tab…">
        <GroupChips groups={groups.map((g) => ({ key: g.key, label: g.label, n: g.rows.length }))} value={src} onChange={setSrc} />
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setEditing('new'); setNote(null); }}>Tạo báo cáo</Button>
      </TableToolbar>
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>Chưa có báo cáo nào.</Empty>}
      {!!list.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {groups.filter((g) => !src || g.key === src).map((g) => (
        <GroupSection key={g.key} id={`cau-hinh-${g.key}`} title={g.label} count={g.rows.length} unit="báo cáo"
          extra={g.rows.some((r) => !r.is_active) && <Muted className="text-sm">· {g.rows.filter((r) => !r.is_active).length} đang tắt</Muted>}>
          <ReportGroup rows={g.rows} tabName={tabName} onEdit={(r) => { setEditing(r); setNote(null); }} patch={patch} remove={remove} />
        </GroupSection>
      ))}
      </>)}
      {editing && <ReportEditor report={editing === 'new' ? null : editing} tabs={tabs.data ?? []} onClose={() => setEditing(null)}
        onSaved={(m) => { setEditing(null); setNote(m); list.reload(); tabs.reload(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
function ReportEditor({ report, tabs, onClose, onSaved }: { report: ReportRow | null; tabs: DashTab[]; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = !report;
  const configurable = true;   // mọi báo cáo là báo cáo cấu hình
  const sources = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const [code, setCode] = useState('');
  const [ten, setTen] = useState(report?.ten ?? '');
  const [moTa, setMoTa] = useState(report?.mo_ta ?? '');
  const [source, setSource] = useState(report?.source_system ?? '');
  const [scope, setScope] = useState<'ca_nhan' | 'don_vi'>(report?.required_scope ?? 'ca_nhan');
  const [onDash, setOnDash] = useState(report?.show_on_dashboard ?? true);
  const [order, setOrder] = useState(report?.dashboard_order ?? 100);
  const [tab, setTab] = useState<number | null>(report?.dashboard_tab ?? null);
  const [width, setWidth] = useState<1 | 2 | 3>(report?.dashboard_width ?? 3);
  const [def, setDef] = useState<Definition | null>(report?.definition ?? null);
  const [preview, setPreview] = useState<ReportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!source && sources.data?.length) setSource(sources.data.find((s) => s.enabled)?.code ?? ''); }, [sources.data, source]);
  const meta = useAsync(() => (source && configurable
    ? api.get<{ datasets: DatasetInfo[]; fields: FieldInfo[]; selected: DatasetInfo | null }>(
      `/admin/report-fields?source=${source}${def ? `&dataset=${def.dataset}${def.capability ? `&capability=${def.capability}` : ''}` : ''}`)
    : Promise.resolve(null)), [source, def?.dataset, def?.capability]);
  // Đổi hệ thống / chưa có định nghĩa ⇒ khởi tạo theo tập dữ liệu đầu tiên của hệ thống đó.
  useEffect(() => {
    const d = meta.data;
    if (!configurable || !d) return;
    if (!def || !d.datasets.some((x) => x.dataset === def.dataset && (def.dataset !== 'records' || x.capability === def.capability))) {
      setDef(d.datasets[0] ? EMPTY(d.datasets[0]) : null);
    }
  }, [meta.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields = meta.data?.fields ?? [];
  const ofType = (...t: FieldType[]) => fields.filter((f) => t.includes(f.type));
  const up = (p: Partial<Definition>) => { setDef((d) => (d ? { ...d, ...p } : d)); setPreview(null); };

  const runPreview = async () => {
    if (!def) return;
    setBusy(true); setErr(null);
    try { setPreview(await api.post<ReportResult>('/admin/reports/preview', { source_system: source, definition: def, scope })); }
    catch (e) { setErr(ERR(e)); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setErr(null);
    const meta2 = { ten, mo_ta: moTa || null, required_scope: scope, show_on_dashboard: onDash, dashboard_order: order, dashboard_tab: tab, dashboard_width: width };
    try {
      if (isNew) await api.post('/admin/reports', { code, source_system: source, definition: def, ...meta2 });
      else await api.patch(`/admin/reports/${report.code}`, configurable ? { ...meta2, source_system: source, definition: def } : meta2);
      onSaved(`Đã lưu “${ten}”.${onDash ? ' Báo cáo hiện trên Tổng quan của người dùng có dữ liệu.' : ''}`);
    } catch (e) { setErr(ERR(e)); setBusy(false); }
  };

  const canSave = !busy && !!ten.trim() && (!isNew || !!code) && (!configurable || !!def);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 dark:bg-black/60 sm:p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-full w-full flex-col bg-white dark:bg-slate-950 sm:min-h-0 sm:max-w-[1600px] sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-xl dark:sm:border-slate-800 lg:h-[90vh] lg:overflow-hidden">
        {/* Đầu trang: tên báo cáo đang sửa + đóng */}
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{isNew ? 'Tạo báo cáo' : `Sửa báo cáo: ${report.ten}`}</h2>
            {report?.updated_at && <Muted className="text-xs">Sửa lần cuối {fmtDateTime(report.updated_at)}</Muted>}
          </div>
          <span className="flex-1" />
          <button type="button" aria-label="Đóng" onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100">✕</button>
        </header>

        {/* Thân: cấu hình bên trái, xem thử dính bên phải (xuống dòng dọc khi màn hình hẹp) */}
        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <div className="px-5 py-4 lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
            {report?.kind === 'missing' && <Banner tone="warn">Báo cáo này chưa có định nghĩa — dựng lại bên dưới rồi lưu, hoặc xoá nó.</Banner>}

            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {isNew && <Field label="Mã báo cáo"><Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="vd phieu_theo_trang_thai" /></Field>}
              <div className={isNew ? '' : 'sm:col-span-2'}><Field label="Tên báo cáo"><Input value={ten} onChange={(e) => setTen(e.target.value)} placeholder="vd Phiếu việc theo trạng thái" /></Field></div>
              <div className="sm:col-span-2"><Field label="Mô tả (không bắt buộc)"><Input value={moTa} onChange={(e) => setMoTa(e.target.value)} placeholder="Một câu ngắn giải thích báo cáo cho người xem" /></Field></div>
              {configurable && (
                <Field label="Hệ thống nguồn">
                  <Select value={source} onChange={(e) => { setSource(e.target.value); setDef(null); }}>
                    {sources.data?.map((s) => <option key={s.code} value={s.code}>{s.ten}{s.enabled ? '' : ' (đang tắt)'}</option>)}
                  </Select>
                </Field>
              )}
              {configurable && (
                <Field label="Dữ liệu">
                  <Select value={def ? `${def.dataset}:${def.capability ?? ''}` : ''} disabled={!meta.data?.datasets.length}
                    onChange={(e) => { const d = meta.data!.datasets.find((x) => `${x.dataset}:${x.dataset === 'records' ? x.capability : ''}` === e.target.value); if (d) { setDef(EMPTY(d)); setPreview(null); } }}>
                    {meta.data?.datasets.map((d) => <option key={`${d.dataset}:${d.capability}`} value={`${d.dataset}:${d.dataset === 'records' ? d.capability : ''}`}>{d.label}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Phạm vi xem">
                <Select value={scope} onChange={(e) => setScope(e.target.value as 'ca_nhan' | 'don_vi')}>
                  <option value="ca_nhan">Cá nhân — dữ liệu của chính người xem</option>
                  <option value="don_vi">Đơn vị — trưởng đơn vị xem cả đơn vị</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={onDash} onChange={(e) => setOnDash(e.target.checked)} />
                Hiện trên Tổng quan của người dùng có dữ liệu
              </label>
              {onDash && (
                <div className="grid gap-x-4 gap-y-3 sm:col-span-2 sm:grid-cols-3">
                  <Field label="Ở tab">
                    <Select value={tab ?? ''} onChange={(e) => setTab(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Báo cáo của bạn</option>
                      {tabs.map((t) => <option key={t.id} value={t.id}>{t.ten}{t.is_active ? '' : ' (đang tắt)'}</option>)}
                    </Select>
                  </Field>
                  <Field label="Độ rộng khối">
                    <Select value={width} disabled={tab === null} onChange={(e) => setWidth(Number(e.target.value) as 1 | 2 | 3)}>
                      {WIDTHS.map(([w, t]) => <option key={w} value={w}>{t}</option>)}
                    </Select>
                  </Field>
                  <Field label="Thứ tự (nhỏ đứng trước)"><Input type="number" min={0} value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
                </div>
              )}
            </div>

            {configurable && meta.loading && <div className="mt-4"><Loading /></div>}
            {configurable && meta.data && !meta.data.datasets.length && (
              <Banner tone="info">Hệ thống này chưa có dữ liệu để dựng báo cáo. Vào “Hệ thống nguồn → Cấu hình adapter”, khai một capability có <code>sink</code> để hệ thống lấy dữ liệu về kho.</Banner>
            )}
            {configurable && def && fields.length > 0 && <Builder def={def} fields={fields} ofType={ofType} up={up} />}
          </div>

          {/* Xem thử — dính bên phải trên màn hình rộng để vừa chỉnh vừa xem */}
          <aside className="flex shrink-0 flex-col border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 lg:min-h-0 lg:w-[40%] lg:min-w-[320px] lg:max-w-[560px] lg:border-l lg:border-t-0">
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
              <h3 className="text-sm font-semibold">Xem thử</h3>
              {preview && <Muted className="text-xs tabular-nums">{preview.total_rows} dòng</Muted>}
              <span className="flex-1" />
              {configurable && <Button disabled={busy || !def} onClick={() => void runPreview()}>{busy ? 'Đang chạy…' : preview ? 'Chạy lại' : 'Xem thử'}</Button>}
            </div>
            <div className="grow p-4 lg:overflow-y-auto">
              {err && <Banner tone="err">{err}</Banner>}
              {!err && !preview && <Empty>Bấm “Xem thử” để chạy báo cáo trên dữ liệu hiện có của bạn và kiểm tra trước khi lưu.</Empty>}
              {preview && <PreviewBody r={preview} />}
            </div>
          </aside>
        </div>

        {/* Thanh hành động cố định */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu báo cáo'}</Button>
        </footer>
      </div>
    </div>
  );
}

/** Phần dựng định nghĩa: kiểu, cột / nhóm + phép tính, thời gian, bộ lọc, thẻ KPI. */
function Builder({ def, fields, ofType, up }: {
  def: Definition; fields: FieldInfo[]; ofType: (...t: FieldType[]) => FieldInfo[]; up: (p: Partial<Definition>) => void;
}) {
  const label = (n?: string) => fields.find((f) => f.name === n)?.label ?? n ?? '';
  const typeOf = (n?: string) => fields.find((f) => f.name === n)?.type;
  return (
    <div className="mt-5 grid gap-5 border-t border-slate-200 pt-4 dark:border-slate-800">
      <Section title="Kiểu báo cáo">
        <div className="flex flex-wrap gap-4 text-sm">
          {([['summary', 'Thống kê — nhóm theo trường, đếm/tính tổng, có biểu đồ'], ['list', 'Danh sách — từng bản ghi, chọn cột']] as const).map(([m, t]) => (
            <label key={m} className="flex items-center gap-2"><input type="radio" checked={def.mode === m} onChange={() => up({ mode: m, chart: m === 'list' ? undefined : def.chart })} />{t}</label>
          ))}
        </div>
      </Section>

      {def.mode === 'list' ? (
        <Section title="Cột hiển thị">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {fields.map((f) => (
              <label key={f.name} className="flex items-center gap-2">
                <input type="checkbox" checked={def.columns.some((c) => c.field === f.name)}
                  onChange={(e) => up({ columns: e.target.checked ? [...def.columns, { field: f.name }] : def.columns.filter((c) => c.field !== f.name) })} />
                {f.label}
              </label>
            ))}
          </div>
        </Section>
      ) : (
        <Section title="Nhóm theo và phép tính">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nhóm theo">
              <Select value={def.group_by[0]?.field ?? ''} onChange={(e) => up({ group_by: e.target.value ? [{ field: e.target.value, bucket: typeOf(e.target.value) === 'date' ? 'month' : undefined }] : [] })}>
                <option value="">— không nhóm (chỉ thẻ KPI) —</option>
                {fields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
              </Select>
            </Field>
            {typeOf(def.group_by[0]?.field) === 'date' && (
              <Field label="Gộp theo">
                <Select value={def.group_by[0]!.bucket ?? 'month'} onChange={(e) => up({ group_by: [{ ...def.group_by[0]!, bucket: e.target.value as 'day' | 'month' }] })}>
                  <option value="month">Tháng</option><option value="day">Ngày</option>
                </Select>
              </Field>
            )}
            <Field label="Biểu đồ">
              <Select value={def.chart?.kind ?? ''} onChange={(e) => {
                const kind = e.target.value as ChartKind | '';
                // Lịch nhiệt cần nhóm theo ngày ⇒ tự chuyển "Gộp theo" sang Ngày nếu đang nhóm theo trường ngày.
                const g = def.group_by[0];
                up({ chart: kind ? { kind } : undefined, ...(kind === 'heatmap' && g && typeOf(g.field) === 'date' ? { group_by: [{ ...g, bucket: 'day' as const }] } : {}) });
              }}>
                <option value="">Không</option>
                {CHARTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <MeasureList items={def.measures} fields={fields} max={4} onChange={(measures) => up({ measures })} />
        </Section>
      )}

      <Section title="Thời gian và tìm kiếm">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Lọc theo khoảng thời gian của">
            <Select value={def.date_field ?? ''} onChange={(e) => up({ date_field: e.target.value || undefined })}>
              <option value="">— không lọc theo thời gian —</option>
              {ofType('date').map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </Select>
          </Field>
          {def.date_field && (
            <Field label="Khoảng mặc định">
              <Select value={def.default_period} onChange={(e) => up({ default_period: e.target.value })}>
                {PERIODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Ô từ khoá tìm trong">
            <Select value={def.keyword_field ?? ''} onChange={(e) => up({ keyword_field: e.target.value || undefined })}>
              <option value="">— không có ô từ khoá —</option>
              {ofType('string').map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-2 text-sm">
          <span className="mr-3 font-medium">Người xem tự lọc theo:</span>
          {ofType('string', 'int').map((f) => (
            <label key={f.name} className="mr-4 inline-flex items-center gap-1.5">
              <input type="checkbox" checked={def.param_filters.some((p) => p.field === f.name)}
                disabled={!def.param_filters.some((p) => p.field === f.name) && def.param_filters.length >= 3}
                onChange={(e) => up({ param_filters: e.target.checked ? [...def.param_filters, { field: f.name }] : def.param_filters.filter((p) => p.field !== f.name) })} />
              {f.label}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Điều kiện cố định" hint="Chỉ lấy các bản ghi thoả mọi điều kiện dưới đây.">
        <FilterList items={def.filters} fields={fields} onChange={(filters) => up({ filters })} />
      </Section>

      <Section title="Thẻ KPI" hint="Con số hiện to ở đầu báo cáo và trên Tổng quan. Có thể đổi màu cảnh báo khi vượt ngưỡng.">
        <MeasureList items={def.tiles} fields={fields} max={4} tile onChange={(tiles) => up({ tiles: tiles as Tile[] })} />
      </Section>
      <Muted className="text-xs">Đang dùng: {def.dataset === 'records' ? `dữ liệu chung (${def.capability})` : def.dataset === 'documents' ? 'văn bản' : 'công việc'}
        {def.group_by[0] ? ` · nhóm theo ${label(def.group_by[0].field).toLowerCase()}` : ''}</Muted>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {hint && <Muted className="text-xs">{hint}</Muted>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function FilterRow({ f, fields, onChange, onRemove }: { f: Filter; fields: FieldInfo[]; onChange: (f: Filter) => void; onRemove: () => void }) {
  const type = fields.find((x) => x.name === f.field)?.type;
  const ops = OPS.filter(([o]) => (DATE_OPS.includes(o) ? type === 'date' : o === 'contains' ? type === 'string' : true));
  const days = DAYS_OPS.includes(f.op);
  const needValue = OPS.find(([o]) => o === f.op)?.[2];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Trường" value={f.field} onChange={(e) => onChange({ ...f, field: e.target.value })}>
        {fields.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
      </Select>
      <Select aria-label="Phép so sánh" value={f.op} onChange={(e) => { const op = e.target.value as Op; onChange({ ...f, op, value: DAYS_OPS.includes(op) ? 7 : DAYS_OPS.includes(f.op) ? '' : f.value }); }}>
        {ops.map(([o, t]) => <option key={o} value={o}>{t}</option>)}
      </Select>
      {needValue && (
        days ? (
          <span className="flex items-center gap-2 text-sm">
            <Input aria-label="Số ngày" className="w-20 !min-w-0 text-right" type="number" min={1} max={3650} value={String(f.value ?? '')}
              onChange={(e) => onChange({ ...f, value: Number(e.target.value) })} />ngày
          </span>
        ) : (
          <div className="min-w-[7rem] flex-1"><Input aria-label="Giá trị" className="w-full !min-w-0" type={type === 'date' ? 'date' : type === 'int' ? 'number' : 'text'} value={String(f.value ?? '')}
            onChange={(e) => onChange({ ...f, value: type === 'int' ? Number(e.target.value) : e.target.value })} /></div>
        )
      )}
      <Button variant="danger" className="ml-auto shrink-0" onClick={onRemove} aria-label="Xoá điều kiện">✕</Button>
    </div>
  );
}

function FilterList({ items, fields, onChange }: { items: Filter[]; fields: FieldInfo[]; onChange: (f: Filter[]) => void }) {
  return (
    <div className="grid gap-2">
      {items.map((f, i) => <FilterRow key={i} f={f} fields={fields} onChange={(n) => onChange(items.map((x, j) => (j === i ? n : x)))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />)}
      {items.length < 10 && <Button className="justify-self-start" onClick={() => onChange([...items, { field: fields[0]!.name, op: 'eq', value: '' }])}>+ Thêm điều kiện</Button>}
    </div>
  );
}

function MeasureList({ items, fields, max, tile, onChange }: { items: Array<Measure | Tile>; fields: FieldInfo[]; max: number; tile?: boolean; onChange: (m: Array<Measure | Tile>) => void }) {
  const set = (i: number, p: Partial<Tile>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="mt-2 grid gap-3">
      {items.map((m, i) => (
        <div key={i} className="grid gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[8rem] flex-1"><Input aria-label="Nhãn" className="w-full !min-w-0" value={m.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Nhãn hiển thị" /></div>
            <Select aria-label="Phép tính" value={m.fn} onChange={(e) => {
              const fn = e.target.value as Measure['fn'];
              set(i, { fn, field: fn === 'count' || fn === 'ty_le' ? undefined : m.field ?? fields[0]?.name, ...(fn === 'ty_le' ? { trend_field: undefined } : {}) });
            }}>
              {FNS.filter(([f]) => tile || f !== 'ty_le').map(([f, t]) => <option key={f} value={f}>{t}</option>)}
            </Select>
            {m.fn !== 'count' && m.fn !== 'ty_le' && (
              <Select aria-label="Trường tính" value={m.field ?? ''} onChange={(e) => set(i, { field: e.target.value })}>
                {fields.filter((f) => (m.fn === 'sum' || m.fn === 'avg' ? f.type === 'int' : true)).map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
              </Select>
            )}
            <Button variant="danger" className="ml-auto shrink-0" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Xoá">✕</Button>
          </div>
          {tile && m.fn !== 'ty_le' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span>Số của tháng này theo</span>
              <Select aria-label="Xu hướng theo tháng của trường" value={(m as Tile).trend_field ?? ''} onChange={(e) => set(i, { trend_field: e.target.value || undefined })}>
                <option value="">— không (tính trên mọi bản ghi) —</option>
                {fields.filter((f) => f.type === 'date').map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
              </Select>
              {(m as Tile).trend_field && <span>· kèm so với tháng trước và xu hướng 12 tháng</span>}
            </div>
          )}
          {tile && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <span>Cảnh báo (vàng) khi &gt;</span>
              <Input aria-label="Ngưỡng cảnh báo" className="w-20 !min-w-0 text-right" type="number" value={(m as Tile).warn_if_gt ?? ''} onChange={(e) => set(i, { warn_if_gt: e.target.value === '' ? undefined : Number(e.target.value) })} />
              <span className="ml-1">Nghiêm trọng (đỏ) khi &gt;</span>
              <Input aria-label="Ngưỡng nghiêm trọng" className="w-20 !min-w-0 text-right" type="number" value={(m as Tile).err_if_gt ?? ''} onChange={(e) => set(i, { err_if_gt: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          )}
          <div className="text-xs text-slate-500 dark:text-slate-400">{m.fn === 'ty_le' ? 'Phần được tính (tử số) — bản ghi thoả:' : 'Chỉ tính trên bản ghi thoả:'}</div>
          <FilterList items={m.filters} fields={fields} onChange={(filters) => set(i, { filters })} />
        </div>
      ))}
      {items.length < max && <Button className="justify-self-start" onClick={() => onChange([...items, { fn: 'count', label: tile ? 'Tổng số' : 'Số lượng', filters: [] }])}>{tile ? '+ Thêm thẻ KPI' : '+ Thêm phép tính'}</Button>}
    </div>
  );
}

function PreviewBody({ r }: { r: ReportResult }) {
  const chart = r.charts?.[0];
  const tiles = (r.tiles ?? []) as StatTile[];
  const nothing = !tiles.length && !chart && !r.columns.length;
  return (
    <div className="grid gap-4">
      {tiles.length > 0 && <StatTiles tiles={tiles} />}
      {chart && <ChartView chart={chart} rows={r.chart_rows ?? r.rows} />}
      {r.columns.length > 0 && (r.rows.length
        ? <div className="overflow-x-auto"><DataTable columns={r.columns} rows={r.rows.slice(0, 20)} /></div>
        : <Muted>Không có dòng nào khớp với dữ liệu hiện có của bạn.</Muted>)}
      {nothing && <Muted>Chưa có gì để hiển thị — thêm phép tính, cột hoặc thẻ KPI ở phần cấu hình.</Muted>}
    </div>
  );
}

/**
 * Tab trên Tổng quan: tên, hệ thống nguồn gắn với tab (để tab hiện tình trạng kết nối + nút Kết nối), thứ tự.
 * Khối trong tab là các báo cáo chọn "Ở tab" này khi sửa báo cáo.
 */
function TabManager({ tabs, onNote, onChanged }: {
  tabs: ReturnType<typeof useAsync<DashTab[]>>; onNote: (m: string) => void; onChanged: () => void;
}) {
  const sources = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const [form, setForm] = useState<{ id: number | null; ten: string; source_system: string; thu_tu: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setErr(null);
    try { await fn(); onNote(msg); setForm(null); onChanged(); } catch (e) { setErr(ERR(e)); }
  };
  const save = () => {
    if (!form) return;
    const body = { ten: form.ten.trim(), source_system: form.source_system || null, thu_tu: form.thu_tu };
    void run(() => (form.id === null ? api.post('/admin/dashboard-tabs', body) : api.patch(`/admin/dashboard-tabs/${form.id}`, body)), `Đã lưu tab “${body.ten}”.`);
  };
  const remove = (t: DashTab) => {
    if (!confirm(`Xoá tab “${t.ten}”?${t.khoi ? `\n\n${t.khoi} khối trong tab chuyển về tab “Báo cáo của bạn” (báo cáo không bị xoá).` : ''}`)) return;
    void run(() => api.del(`/admin/dashboard-tabs/${t.id}`), `Đã xoá tab “${t.ten}”.`);
  };
  const next = Math.max(0, ...(tabs.data ?? []).map((t) => t.thu_tu)) + 10;
  const tv = useTableView(tabs.data, (t) => `${t.ten} ${t.source_ten ?? ''}`);
  return (
    <>
      <Muted className="mb-3 text-sm">Mỗi tab là một trang trên Tổng quan. Thêm khối vào tab bằng cách sửa báo cáo → “Ở tab”. Tab không có khối nào người dùng xem được sẽ tự ẩn.</Muted>
      <TableToolbar q={tv.q} onQ={tv.setQ} placeholder="Tìm theo tên tab, hệ thống…">
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setForm({ id: null, ten: '', source_system: '', thu_tu: next }); setErr(null); }}>Thêm tab</Button>
      </TableToolbar>
      {err && <Banner tone="err">{err}</Banner>}
      {form && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
            <Field label="Tên tab"><Input value={form.ten} maxLength={60} onChange={(e) => setForm({ ...form, ten: e.target.value })} placeholder="vd Văn bản" /></Field>
            <Field label="Hệ thống nguồn của tab (không bắt buộc)">
              <Select value={form.source_system} onChange={(e) => setForm({ ...form, source_system: e.target.value })}>
                <option value="">— không gắn —</option>
                {sources.data?.map((s) => <option key={s.code} value={s.code}>{s.ten}</option>)}
              </Select>
            </Field>
            <Field label="Thứ tự"><Input type="number" min={0} value={form.thu_tu} onChange={(e) => setForm({ ...form, thu_tu: Number(e.target.value) })} /></Field>
            <div className="flex gap-2">
              <Button onClick={() => setForm(null)}>Huỷ</Button>
              <Button variant="primary" disabled={!form.ten.trim()} onClick={save}>{form.id === null ? 'Thêm' : 'Lưu'}</Button>
            </div>
          </div>
        </Card>
      )}
      {tabs.loading && <Loading />}
      {tabs.error ? <ErrorBox error={tabs.error} onRetry={tabs.reload} /> : null}
      {tabs.data && !tabs.data.length && <Empty>Chưa có tab nào — mọi báo cáo hiện trên Tổng quan nằm ở tab “Báo cáo của bạn”.</Empty>}
      {!!tabs.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>Tab</Th><Th>Hệ thống nguồn</Th><Th num>Thứ tự</Th><Th num>Số khối</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((t) => (
              <tr key={t.id} className={t.is_active ? '' : 'opacity-60'}>
                <Td><span className="font-medium">{t.ten}</span>{!t.is_active && <Badge tone="neutral">Đang tắt</Badge>}</Td>
                <Td>{t.source_ten ?? <Muted>—</Muted>}</Td>
                <Td num>{t.thu_tu}</Td>
                <Td num>{t.khoi}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button onClick={() => { setForm({ id: t.id, ten: t.ten, source_system: t.source_system ?? '', thu_tu: t.thu_tu }); setErr(null); }}>Sửa</Button>
                    <Button onClick={() => void run(() => api.patch(`/admin/dashboard-tabs/${t.id}`, { is_active: !t.is_active }), `Đã ${t.is_active ? 'tắt' : 'bật'} tab “${t.ten}”.`)}>{t.is_active ? 'Tắt' : 'Bật'}</Button>
                    <Menu label={`Thêm thao tác cho tab ${t.ten}`} items={[{ label: 'Xoá tab', danger: true, onClick: () => remove(t) }]} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit="tab" />
      </>)}
    </>
  );
}

/** Bảng báo cáo của một hệ thống nguồn (cột "Hệ thống" bỏ vì đã là tiêu đề nhóm). */
function ReportGroup({ rows, tabName, onEdit, patch, remove }: {
  rows: ReportRow[]; tabName: (id: number | null) => string; onEdit: (r: ReportRow) => void;
  patch: (r: ReportRow, body: Partial<ReportRow>, msg: string) => Promise<void>; remove: (r: ReportRow) => Promise<void>;
}) {
  const pg = usePaged(rows);
  return (
    <>
      <Table fixed>
        <colgroup><col /><col className="w-28" /><col className="w-72" /><col className="w-32" /><col className="w-52" /></colgroup>
        <thead><tr><Th>Báo cáo</Th><Th>Phạm vi</Th><Th>Tổng quan</Th><Th num>Lịch đang bật</Th><Th /></tr></thead>
        <tbody>
          {pg.rows.map((r) => (
            <tr key={r.code} className={r.is_active ? '' : 'opacity-60'}>
              <Td>
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.ten}</span>
                  {r.kind === 'missing' && <Badge tone="warn">Chưa có định nghĩa</Badge>}
                  {!r.is_active && <Badge tone="neutral">Đang tắt</Badge>}</div>
                <Muted className="font-mono text-xs">{r.code}</Muted>
              </Td>
              <Td>{r.required_scope === 'ca_nhan' ? 'Cá nhân' : 'Đơn vị'}</Td>
              <Td>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={r.show_on_dashboard}
                    onChange={() => void patch(r, { show_on_dashboard: !r.show_on_dashboard }, `${r.show_on_dashboard ? 'Đã ẩn' : 'Đã hiện'} “${r.ten}” trên Tổng quan.`)} />
                  <span>{r.show_on_dashboard ? `${tabName(r.dashboard_tab)} · thứ tự ${r.dashboard_order}` : 'Ẩn'}</span>
                </label>
              </Td>
              <Td num>{r.lich}</Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <Button onClick={() => onEdit(r)}>Sửa</Button>
                  <Button onClick={() => void patch(r, { is_active: !r.is_active }, `Đã ${r.is_active ? 'tắt' : 'bật'} “${r.ten}”.`)}>{r.is_active ? 'Tắt' : 'Bật'}</Button>
                  <Menu label={`Thêm thao tác cho ${r.ten}`} items={[{ label: 'Xoá báo cáo', danger: true, onClick: () => void remove(r) }]} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {pg.total > 20 && <Pager page={pg.page} pageSize={pg.pageSize} total={pg.total} onPage={pg.setPage} onPageSize={pg.setPageSize} unit="báo cáo" />}
    </>
  );
}

/**
 * Báo cáo CẤU HÌNH (report_catalog.definition) — quản trị dựng trên cổng, không viết SQL.
 *
 * An toàn: định nghĩa chỉ chứa TÊN TRƯỜNG (tra trong danh mục trường cho phép của từng tập dữ liệu) và GIÁ TRỊ
 * (luôn đi qua tham số). Máy chủ tự ghép SQL từ biểu thức cố định của từng trường ⇒ không thể chèn SQL.
 * Chạy bên trong withUserContext trên pool reader ⇒ RLS lọc theo phạm vi như mọi báo cáo khác.
 */
import { z } from 'zod';
import { Problem, type Tx } from '@vala/core';
import { SINK_TABLES, loadAllSpecs } from '@vala/core/adapter';
import { resolvePeriod } from '../params.js';
import type { Column, ReportInput, ReportOutput, Tile } from './index.js';

export type FieldType = 'string' | 'int' | 'date';
export interface FieldDef { name: string; label: string; type: FieldType; expr: string }
export type Dataset = 'documents' | 'tasks' | 'records';

// ---- danh mục trường ----------------------------------------------------------------------------
const LABELS: Record<string, string> = {
  ma_van_ban: 'Mã văn bản', trich_yeu: 'Trích yếu', so_ky_hieu: 'Số ký hiệu', so_den_di: 'Số đến/đi', ngay_nhan: 'Ngày nhận',
  ngay_tao: 'Ngày tạo', nguoi_tao: 'Người tạo', nguoi_xu_ly_id: 'Mã người xử lý', trang_thai: 'Trạng thái', loai_van_ban_id: 'Loại văn bản',
  node_id: 'Mã thư mục', node_ten: 'Thư mục', ma_cong_viec: 'Mã công việc', tieu_de: 'Tiêu đề', mo_ta_ngan: 'Mô tả',
  nguoi_giao: 'Người giao', nguoi_thuc_hien_id: 'Mã người thực hiện', do_uu_tien: 'Ưu tiên', ngay_giao: 'Ngày giao',
  han_hoan_thanh: 'Hạn hoàn thành', ngay_hoan_thanh: 'Ngày hoàn thành',
};
const DATE_COLS = new Set(['ngay_nhan', 'ngay_tao', 'ngay_giao', 'han_hoan_thanh', 'ngay_hoan_thanh']);
const INT_COLS = new Set(['nguoi_xu_ly_id', 'node_id', 'nguoi_thuc_hien_id']);

/** Trường chung của mọi tập dữ liệu: người sở hữu dữ liệu, đơn vị, lần đầu hệ thống thấy bản ghi. */
const COMMON: FieldDef[] = [
  { name: 'nguoi_dung', label: 'Của người dùng', type: 'string', expr: 'u.ho_ten' },
  { name: 'don_vi', label: 'Đơn vị', type: 'string', expr: `coalesce(o.ten, 'Chưa xác định đơn vị')` },
  { name: 'lan_dau_thay', label: 'Lần đầu thấy', type: 'date', expr: '(t.first_seen_at AT TIME ZONE \'Asia/Ho_Chi_Minh\')::date' },
];

/** Trường của một tập dữ liệu. records: theo output_schema của capability trong cấu hình adapter. */
export function datasetFields(dataset: Dataset, source: string, capability?: string): FieldDef[] {
  if (dataset === 'records') {
    const spec = loadAllSpecs().find((s) => s.source_system === source);
    const cap = spec?.capabilities.find((c) => c.id === capability && c.sink?.table === 'records');
    if (!cap) throw new Problem('invalid_params', 'Hệ thống này không có dữ liệu chung với capability đã chọn', `${source}/${capability ?? '?'}`);
    const fields: FieldDef[] = cap.output_schema.map((f) => {
      // Tên trường đã qua kiểm tra trong parseSpec? Chưa chắc ⇒ chỉ nhận [a-z0-9_] rồi mới đưa vào biểu thức.
      if (!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(f.field)) throw new Problem('invalid_params', 'Tên trường không hợp lệ trong cấu hình adapter', f.field);
      const raw = `(t.data->>'${f.field}')`;
      const expr = f.type === 'int' ? `${raw}::bigint` : f.type === 'date' ? `${raw}::date` : raw;
      return { name: f.field, label: f.label ?? f.field, type: f.type, expr };
    });
    for (const e of cap.sink!.extra) {
      if (e !== 'org_unit_id' && /^[a-z][a-z0-9_]{0,40}$/.test(e)) fields.push({ name: e, label: e, type: 'string', expr: `(t.data->>'${e}')` });
    }
    return [...fields, ...COMMON];
  }
  const t = SINK_TABLES[dataset];
  const cols = [t.key, ...t.columns.filter((c) => c !== 'org_unit_id')];
  return [
    ...cols.map((c) => ({ name: c, label: LABELS[c] ?? c, type: (DATE_COLS.has(c) ? 'date' : INT_COLS.has(c) ? 'int' : 'string') as FieldType, expr: `t.${c}` })),
    ...COMMON,
  ];
}

/** Tập dữ liệu hệ thống nguồn có (theo sink trong cấu hình adapter). */
export function sourceDatasets(source: string): Array<{ dataset: Dataset; capability: string; label: string }> {
  const out: Array<{ dataset: Dataset; capability: string; label: string }> = [];
  for (const s of loadAllSpecs().filter((x) => x.source_system === source)) {
    for (const c of s.capabilities) {
      if (!c.sink) continue;
      const label = c.sink.table === 'documents' ? 'Văn bản' : c.sink.table === 'tasks' ? 'Công việc' : c.ten;
      out.push({ dataset: c.sink.table, capability: c.id, label: `${label} (${c.id})` });
    }
  }
  return out;
}

// ---- định nghĩa --------------------------------------------------------------------------------
const FieldName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,60}$/);
const Value = z.union([z.string().max(200), z.number(), z.boolean()]);
const FilterSchema = z.object({
  field: FieldName,
  op: z.enum(['eq', 'neq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null',
    'truoc_hom_nay', 'tu_hom_nay', 'hom_nay', 'den_hom_nay', 'thang_nay', 'trong_n_ngay_toi', 'trong_n_ngay_qua']),
  value: z.union([Value, z.array(Value).max(50)]).optional(),
});
const MeasureSchema = z.object({
  /** ty_le = % bản ghi thoả điều kiện (filters) trên tổng số bản ghi. */
  fn: z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'ty_le']),
  field: FieldName.optional(),
  label: z.string().min(1).max(80),
  /** Chỉ đếm/tính trên các dòng thoả điều kiện này (vd "quá hạn"). */
  filters: z.array(FilterSchema).max(5).default([]),
});
/** Điều kiện so với hôm nay (giờ Việt Nam) — không cần giá trị, chỉ dùng cho trường ngày. */
const TODAY_OPS: string[] = ['truoc_hom_nay', 'tu_hom_nay', 'hom_nay', 'den_hom_nay', 'thang_nay'];
/** Trong N ngày tới / qua (tính cả hôm nay) — giá trị là số ngày, chỉ dùng cho trường ngày. */
const DAYS_OPS: string[] = ['trong_n_ngay_toi', 'trong_n_ngay_qua'];
export const PERIODS = ['thang_hien_tai', 'thang_truoc', 'quy_hien_tai', '30_ngay_qua', '6_thang_qua', '12_thang_qua',
  '7_ngay_toi', '14_ngay_toi', '30_ngay_toi', 'tat_ca', 'tuy_chon'] as const;

export const DefinitionSchema = z.object({
  dataset: z.enum(['documents', 'tasks', 'records']),
  capability: z.string().max(60).optional(),
  mode: z.enum(['list', 'summary']),
  /** Trường ngày dùng cho tham số "Khoảng thời gian". Bỏ trống = không lọc theo thời gian. */
  date_field: FieldName.optional(),
  default_period: z.enum(PERIODS).default('thang_hien_tai'),
  /** Trường văn bản cho ô "Từ khoá". */
  keyword_field: FieldName.optional(),
  filters: z.array(FilterSchema).max(10).default([]),
  /** Bộ lọc người xem tự chọn (nhiều giá trị), danh sách lựa chọn lấy từ chính dữ liệu — vd thư mục, trạng thái. */
  param_filters: z.array(z.object({ field: FieldName, label: z.string().max(80).optional() })).max(3).default([]),
  columns: z.array(z.object({ field: FieldName, label: z.string().max(80).optional() })).max(15).default([]),
  group_by: z.array(z.object({ field: FieldName, label: z.string().max(80).optional(), bucket: z.enum(['day', 'month']).optional() })).max(2).default([]),
  measures: z.array(MeasureSchema).max(4).default([]),
  sort: z.object({ by: z.string().max(60), dir: z.enum(['asc', 'desc']).default('desc') }).optional(),
  limit: z.number().int().min(1).max(1000).default(500),
  chart: z.object({ kind: z.enum(['bar', 'column', 'line', 'donut', 'heatmap']), title: z.string().max(120).optional() }).optional(),
  tiles: z.array(MeasureSchema.extend({
    warn_if_gt: z.number().optional(),
    err_if_gt: z.number().optional(),
    /** Trường ngày: thẻ hiện số của THÁNG NÀY theo trường này, so với tháng trước, kèm xu hướng 12 tháng. */
    trend_field: FieldName.optional(),
  })).max(4).default([]),
});
export type Definition = z.infer<typeof DefinitionSchema>;

/**
 * Kiểm tra định nghĩa với danh mục trường thật của tập dữ liệu; lỗi ⇒ 422 nói rõ chỗ sai.
 * Trả về định nghĩa đã chuẩn hoá + param_schema/default_params sinh ra cho form tham số.
 */
export function checkDefinition(source: string, raw: unknown) {
  const p = DefinitionSchema.safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0]!;
    throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${i.path.join('.')}: ${i.message}`);
  }
  const def = p.data;
  if (def.dataset === 'records' && !def.capability) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', 'Dữ liệu chung cần chọn capability');
  const fields = new Map(datasetFields(def.dataset, source, def.capability).map((f) => [f.name, f]));
  const need = (name: string, where: string, type?: FieldType) => {
    const f = fields.get(name);
    if (!f) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${where}: không có trường '${name}'`);
    if (type && f.type !== type) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${where}: '${name}' phải là trường ${type === 'date' ? 'ngày' : 'số'}`);
    return f;
  };
  const checkFilters = (fs: Definition['filters'], where: string) => fs.forEach((f, i) => {
    const fd = need(f.field, `${where}[${i}]`);
    if ([...TODAY_OPS, ...DAYS_OPS].includes(f.op) && fd.type !== 'date') throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${where}[${i}]: so với hôm nay chỉ dùng cho trường ngày`);
    if (!['is_null', 'not_null', ...TODAY_OPS].includes(f.op) && f.value === undefined) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${where}[${i}]: cần giá trị`);
    if (DAYS_OPS.includes(f.op) && !(Number.isInteger(Number(f.value)) && Number(f.value) >= 1 && Number(f.value) <= 3650)) {
      throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${where}[${i}]: số ngày phải từ 1 đến 3650`);
    }
  });
  const checkMeasure = (m: Definition['measures'][number], where: string) => {
    if (m.fn === 'ty_le' && !m.filters.length) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${where}: tỉ lệ cần ít nhất một điều kiện (phần được tính)`);
    if (m.fn !== 'count' && m.fn !== 'ty_le' && !m.field) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `${where}: phép ${m.fn} cần chọn trường`);
    if (m.field) need(m.field, where, m.fn === 'sum' || m.fn === 'avg' ? 'int' : undefined);
    checkFilters(m.filters, `${where}.filters`);
  };
  if (def.date_field) need(def.date_field, 'date_field', 'date');
  if (def.keyword_field) need(def.keyword_field, 'keyword_field', 'string');
  checkFilters(def.filters, 'filters');
  def.param_filters.forEach((f, i) => { if (need(f.field, `param_filters[${i}]`).type === 'date') throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `param_filters[${i}]: không lọc chọn-nhiều trên trường ngày`); });
  def.tiles.forEach((m, i) => {
    checkMeasure(m, `tiles[${i}]`);
    if (m.trend_field) need(m.trend_field, `tiles[${i}].trend_field`, 'date');
    if (m.trend_field && m.fn === 'ty_le') throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `tiles[${i}]: thẻ tỉ lệ không kèm xu hướng theo tháng`);
  });
  if (def.mode === 'list') {
    if (!def.columns.length) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', 'Danh sách cần ít nhất một cột');
    def.columns.forEach((c, i) => need(c.field, `columns[${i}]`));
    if (def.sort && !fields.has(def.sort.by)) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', `sort: không có trường '${def.sort.by}'`);
    if (def.chart) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', 'Biểu đồ chỉ dùng cho kiểu Thống kê');
  } else {
    if (!def.group_by.length && !def.tiles.length) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', 'Thống kê cần nhóm theo ít nhất một trường (hoặc có thẻ KPI)');
    if (def.group_by.length && !def.measures.length) def.measures.push({ fn: 'count', label: 'Số lượng', filters: [] });
    def.group_by.forEach((g, i) => { need(g.field, `group_by[${i}]`, g.bucket ? 'date' : undefined); });
    def.measures.forEach((m, i) => checkMeasure(m, `measures[${i}]`));
    if (def.chart && def.group_by.length !== 1) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', 'Biểu đồ cần nhóm theo đúng một trường');
    if (def.chart?.kind === 'heatmap' && def.group_by[0]?.bucket !== 'day') throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', 'Lịch nhiệt cần nhóm theo một trường ngày, gộp theo ngày');
    if (def.sort && !/^(g|m)\d$/.test(def.sort.by)) throw new Problem('invalid_params', 'Định nghĩa báo cáo chưa hợp lệ', 'sort.by của Thống kê là g0/g1 (nhóm) hoặc m0…m3 (phép tính)');
  }
  const properties: Record<string, unknown> = {};
  const defaults: Record<string, unknown> = {};
  if (def.date_field) {
    properties.khoang_thoi_gian = { type: 'string', title: `Khoảng thời gian (${fields.get(def.date_field)!.label})`, enum: [...PERIODS] };
    properties.tu_ngay = { type: 'string', title: 'Từ ngày', format: 'date' };
    properties.den_ngay = { type: 'string', title: 'Đến ngày', format: 'date' };
    defaults.khoang_thoi_gian = def.default_period;
  }
  for (const f of def.param_filters) {
    const fd = fields.get(f.field)!;
    properties[`loc_${f.field}`] = { type: 'array', title: f.label ?? fd.label, maxItems: 50,
      items: { type: fd.type === 'int' ? 'integer' : 'string' }, 'x-options': { field: f.field } };
  }
  if (def.keyword_field) properties.tu_khoa = { type: 'string', title: `Từ khoá trong ${fields.get(def.keyword_field)!.label.toLowerCase()}`, maxLength: 200 };
  const view_template = def.tiles.length ? 'tong_hop' : def.chart ? 'bang_kem_bieu_do' : 'bang';
  return { def, param_schema: { type: 'object', additionalProperties: false, properties }, default_params: defaults, view_template };
}

// ---- chạy --------------------------------------------------------------------------------------
const TODAY = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const CAST: Record<FieldType, string> = { string: 'text', int: 'bigint', date: 'date' };

class Sql {
  readonly args: Record<string, unknown> = {};
  private n = 0;
  param(v: unknown, type: FieldType): string {
    const k = `p${this.n++}`;
    this.args[k] = v;
    return `$<${k}>::${CAST[type]}`;
  }
  params(vs: unknown[], type: FieldType): string {
    const k = `p${this.n++}`;
    this.args[k] = vs;
    return `$<${k}>::${CAST[type]}[]`;
  }
}

function filterSql(q: Sql, f: Definition['filters'][number], fd: FieldDef): string {
  const e = fd.expr;
  switch (f.op) {
    case 'is_null': return `${e} IS NULL`;
    case 'not_null': return `${e} IS NOT NULL`;
    case 'truoc_hom_nay': return `${e} < ${TODAY}`;
    case 'tu_hom_nay': return `${e} >= ${TODAY}`;
    case 'hom_nay': return `${e} = ${TODAY}`;
    case 'den_hom_nay': return `${e} <= ${TODAY}`;
    case 'thang_nay': return `date_trunc('month', ${e}) = date_trunc('month', ${TODAY})`;
    case 'trong_n_ngay_toi': return `${e} BETWEEN ${TODAY} AND ${TODAY} + (${q.param(Number(f.value), 'int')})::int`;
    case 'trong_n_ngay_qua': return `${e} BETWEEN ${TODAY} - (${q.param(Number(f.value), 'int')})::int AND ${TODAY}`;
    case 'contains': return `${e}::text ILIKE '%' || ${q.param(String(f.value), 'string')} || '%'`;
    case 'in': return `${e} = ANY(${q.params(Array.isArray(f.value) ? f.value : [f.value], fd.type)})`;
    default: {
      const op = { eq: '=', neq: 'IS DISTINCT FROM', gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op];
      return `${e} ${op} ${q.param(Array.isArray(f.value) ? f.value[0] : f.value, fd.type)}`;
    }
  }
}

function measureSql(q: Sql, m: Definition['measures'][number], fields: Map<string, FieldDef>): string {
  const e = m.field ? fields.get(m.field)!.expr : '*';
  const where = m.filters.length ? ` FILTER (WHERE ${m.filters.map((f) => filterSql(q, f, fields.get(f.field)!)).join(' AND ')})` : '';
  switch (m.fn) {
    case 'count': return `count(*)${where}`;
    case 'ty_le': return `round(100.0 * count(*)${where} / nullif(count(*), 0), 1)`;
    case 'count_distinct': return `count(DISTINCT ${e})${where}`;
    case 'avg': return `round(avg(${e})${where}, 2)`;
    default: return `${m.fn}(${e})${where}`;
  }
}

export async function runDefinition(t: Tx, source: string, raw: unknown, input: ReportInput): Promise<ReportOutput> {
  const { def } = checkDefinition(source, raw);
  const fields = new Map(datasetFields(def.dataset, source, def.capability).map((f) => [f.name, f]));
  const q = new Sql();
  const from = `${def.dataset} t LEFT JOIN app_users u ON u.id = t.owner_user_id LEFT JOIN org_units o ON o.id = t.org_unit_id`;
  const where = [`t.valid_to IS NULL`, `t.source_system = ${q.param(source, 'string')}`];
  if (def.dataset === 'records') where.push(`t.capability = ${q.param(def.capability, 'string')}`);
  let applied: { tu_ngay: string; den_ngay: string } | undefined;
  let periodCond: string | null = null;
  if (def.date_field && input.params.khoang_thoi_gian !== 'tat_ca') {
    const period = resolvePeriod(input.params);
    applied = period;
    periodCond = `${fields.get(def.date_field)!.expr} BETWEEN ${q.param(period.tu_ngay, 'date')} AND ${q.param(period.den_ngay, 'date')}`;
    where.push(periodCond);
  }
  if (def.keyword_field && typeof input.params.tu_khoa === 'string' && input.params.tu_khoa.trim()) {
    where.push(`${fields.get(def.keyword_field)!.expr} ILIKE '%' || ${q.param(input.params.tu_khoa.trim(), 'string')} || '%'`);
  }
  for (const f of def.filters) where.push(filterSql(q, f, fields.get(f.field)!));
  for (const f of def.param_filters) {
    const v = input.params[`loc_${f.field}`];
    const fd = fields.get(f.field)!;
    if (Array.isArray(v) && v.length) where.push(`${fd.expr} = ANY(${q.params(v, fd.type)})`);
  }
  const W = where.join(' AND ');

  // Thẻ KPI: một truy vấn, mỗi thẻ một phép tính (thẻ tỉ lệ lấy thêm tử số / mẫu số).
  let tiles: Tile[] | undefined;
  if (def.tiles.length) {
    const exprs = def.tiles.flatMap((m, i) => {
      const out = [`${measureSql(q, m, fields)} AS k${i}`];
      if (m.fn === 'ty_le') {
        out.push(`count(*) FILTER (WHERE ${m.filters.map((f) => filterSql(q, f, fields.get(f.field)!)).join(' AND ')}) AS p${i}`, `count(*) AS w${i}`);
      }
      return out;
    }).join(', ');
    const k = await t.one<Record<string, number | string | null>>(`SELECT ${exprs} FROM ${from} WHERE ${W}`, q.args);
    const tone = (m: Definition['tiles'][number], value: number): Tile['tone'] =>
      m.err_if_gt !== undefined && value > m.err_if_gt ? 'err' : m.warn_if_gt !== undefined && value > m.warn_if_gt ? 'warn'
        : m.err_if_gt !== undefined || m.warn_if_gt !== undefined ? 'ok' : 'neutral';
    // Xu hướng theo tháng không bị cắt bởi khoảng thời gian của báo cáo — luôn là 12 tháng gần nhất.
    const Wtrend = where.filter((c) => c !== periodCond).join(' AND ');
    tiles = [];
    for (const [i, m] of def.tiles.entries()) {
      if (m.trend_field) {
        const e = fields.get(m.trend_field)!.expr;
        const series = await t.map(
          `SELECT coalesce(x.v, 0)::float8 AS v
             FROM generate_series(date_trunc('month', ${TODAY}) - interval '11 months', date_trunc('month', ${TODAY}), interval '1 month') AS mm(m)
             LEFT JOIN (SELECT date_trunc('month', ${e}) AS m, ${measureSql(q, m, fields)} AS v FROM ${from}
                         WHERE ${Wtrend} AND ${e} >= (date_trunc('month', ${TODAY}) - interval '11 months')::date AND ${e} <= ${TODAY}
                         GROUP BY 1) x ON x.m = mm.m
            ORDER BY mm.m`, q.args, (r: { v: number }) => Number(r.v));
        const now = series.at(-1) ?? 0;
        tiles.push({ key: `k${i}`, label: m.label, value: now, tone: tone(m, now), trend: series, delta: { now, before: series.at(-2) ?? 0, vs: 'tháng trước' } });
        continue;
      }
      const value = Number(k[`k${i}`] ?? 0);
      tiles.push(m.fn === 'ty_le'
        ? { key: `k${i}`, label: m.label, value, tone: tone(m, value), unit: '%', part: Number(k[`p${i}`] ?? 0), whole: Number(k[`w${i}`] ?? 0) }
        : { key: `k${i}`, label: m.label, value, tone: tone(m, value) });
    }
  }

  const { page, pageSize } = input;
  if (def.mode === 'list') {
    const cols = def.columns.map((c) => ({ c, f: fields.get(c.field)! }));
    const sel = cols.map(({ f }) => `${f.expr} AS "${f.name}"`).join(', ');
    const sortF = def.sort ? fields.get(def.sort.by)! : def.date_field ? fields.get(def.date_field)! : null;
    const order = sortF ? `${sortF.expr} ${def.sort?.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, t.id DESC` : 't.id DESC';
    // Tìm trong bảng: khớp một phần ở bất kỳ cột nào đang hiện (ngày so theo dạng DD/MM/YYYY như trên màn hình).
    let WL = W;
    if (input.q) {
      const needle = q.param(input.q, 'string');
      WL += ` AND (${cols.map(({ f }) => `${f.type === 'date' ? `to_char(${f.expr}, 'DD/MM/YYYY')` : `${f.expr}::text`} ILIKE '%' || ${needle} || '%'`).join(' OR ')})`;
    }
    const total = await t.one(`SELECT count(*)::int AS n FROM ${from} WHERE ${WL}`, q.args, (r: { n: number }) => r.n);
    const limit = Math.min(pageSize, def.limit);
    const rows = await t.any(`SELECT ${sel} FROM ${from} WHERE ${WL} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, q.args);
    const columns: Column[] = cols.map(({ c, f }) => ({ field: f.name, label: c.label ?? f.label, type: f.type, width: colWidth(f) }));
    return { columns, rows, total_rows: Math.min(total, def.limit), tiles, applied };
  }

  if (!def.group_by.length) return { columns: [], rows: [], total_rows: 0, tiles, applied };
  const groups = def.group_by.map((g, i) => {
    const f = fields.get(g.field)!;
    const expr = g.bucket === 'month' ? `to_char(date_trunc('month', ${f.expr}), 'MM/YYYY')`
      : g.bucket === 'day' ? `to_char(${f.expr}, 'DD/MM/YYYY')` : f.expr;
    const sortExpr = g.bucket ? `date_trunc('${g.bucket}', ${f.expr})` : f.expr;
    return { key: `g${i}`, label: g.label ?? f.label + (g.bucket === 'month' ? ' (tháng)' : g.bucket === 'day' ? ' (ngày)' : ''), expr, sortExpr, type: (g.bucket ? 'string' : f.type) as FieldType, bucket: !!g.bucket };
  });
  const measures = def.measures.map((m, i) => ({ key: `m${i}`, label: m.label, sql: measureSql(q, m, fields) }));
  const sel = [...groups.map((g) => `${g.expr} AS ${g.key}`), ...measures.map((m) => `${m.sql} AS ${m.key}`),
    ...groups.map((g, i) => `${g.sortExpr} AS s${i}`)].join(', ');
  const groupBy = groups.map((_, i) => `${i + 1}`).concat(groups.map((_, i) => `${groups.length + measures.length + i + 1}`)).join(', ');
  // Mặc định: nhóm theo ngày/tháng ⇒ theo thời gian tăng dần; nhóm thường ⇒ phép tính đầu giảm dần.
  const order = def.sort
    ? `${def.sort.by.startsWith('g') ? `s${def.sort.by.slice(1)}` : def.sort.by} ${def.sort.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`
    : groups[0]!.bucket ? 's0 ASC' : 'm0 DESC NULLS LAST, g0';
  const all = await t.any<Record<string, unknown>>(`SELECT ${sel} FROM ${from} WHERE ${W} GROUP BY ${groupBy} ORDER BY ${order} LIMIT ${def.limit}`, q.args);
  let rows = all.map((r) => {
    const o: Record<string, unknown> = {};
    for (const g of groups) o[g.key] = r[g.key];
    for (const m of measures) o[m.key] = r[m.key] === null ? null : Number(r[m.key]);
    return o;
  });
  // Nhóm theo ngày/tháng của chính trường thời gian ⇒ điền đủ mọi ngày/tháng trong khoảng (ngày không có = 0),
  // để đường/cột không "nhảy cóc". Lịch nhiệt tự có ô trống nên không cần.
  const g0 = def.group_by[0]!;
  if (groups.length === 1 && g0.bucket && !def.sort && applied && g0.field === def.date_field && def.chart?.kind !== 'heatmap') {
    const keys = bucketKeys(applied.tu_ngay, applied.den_ngay, g0.bucket);
    if (keys) {
      const zero = Object.fromEntries(def.measures.map((m, i) => [`m${i}`, ['count', 'count_distinct', 'sum', 'ty_le'].includes(m.fn) ? 0 : null]));
      const have = new Map(rows.map((r) => [r.g0, r]));
      rows = keys.map((key) => have.get(key) ?? { g0: key, ...zero });
    }
  }
  const columns: Column[] = [
    ...groups.map((g) => ({ field: g.key, label: g.label, type: g.type, width: 220 })),
    ...measures.map((m) => ({ field: m.key, label: m.label, type: 'int' as const, width: 140 })),
  ];
  const chart = def.chart;
  // Tìm trong bảng thống kê: lọc theo nhãn nhóm; biểu đồ vẫn vẽ đủ mọi nhóm.
  const needle = input.q?.toLocaleLowerCase('vi');
  const shown = needle ? rows.filter((r) => groups.some((g) => String(r[g.key] ?? '').toLocaleLowerCase('vi').includes(needle))) : rows;
  return {
    columns, rows: shown.slice((page - 1) * pageSize, page * pageSize), total_rows: shown.length, tiles, applied,
    charts: chart ? [{
      kind: chart.kind, title: chart.title ?? `${measures[0]!.label} theo ${groups[0]!.label.toLowerCase()}`, x_field: 'g0',
      series: [{ field: 'm0', label: measures[0]!.label }],
      range: chart.kind === 'heatmap' ? applied ?? dayRange(rows) : undefined,
    }] : undefined,
    chart_rows: chart ? rows.slice(0, g0.bucket === 'day' ? 400 : 60) : undefined,
  };
}

/** Bề rộng tối thiểu của cột: trường chữ dài (trích yếu, tiêu đề, mô tả) rộng hơn để không xuống dòng quá nhiều. */
const LONG_TEXT = new Set(['trich_yeu', 'tieu_de', 'mo_ta_ngan']);
const colWidth = (f: FieldDef) => (LONG_TEXT.has(f.name) ? 420 : f.type === 'string' ? 180 : 120);

const pad = (n: number) => String(n).padStart(2, '0');
/** Mọi nhãn ngày (DD/MM/YYYY) hoặc tháng (MM/YYYY) trong [tu, den] — null nếu quá dài để điền. */
function bucketKeys(tu: string, den: string, bucket: 'day' | 'month'): string[] | null {
  const out: string[] = [];
  const d = new Date(`${tu}T00:00:00Z`);
  const end = new Date(`${den}T00:00:00Z`);
  if (bucket === 'month') d.setUTCDate(1);
  while (d <= end) {
    out.push(bucket === 'day' ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : `${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`);
    if (out.length > (bucket === 'day' ? 400 : 120)) return null;
    if (bucket === 'day') d.setUTCDate(d.getUTCDate() + 1); else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** Khoảng ngày của dữ liệu nhóm theo ngày (DD/MM/YYYY) — cho lịch nhiệt khi báo cáo không có khoảng thời gian. */
function dayRange(rows: Record<string, unknown>[]): { tu_ngay: string; den_ngay: string } | undefined {
  const iso = rows.map((r) => String(r.g0 ?? '')).filter((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(x))
    .map((x) => `${x.slice(6)}-${x.slice(3, 5)}-${x.slice(0, 2)}`).sort();
  return iso.length ? { tu_ngay: iso[0]!, den_ngay: iso.at(-1)! } : undefined;
}

/**
 * Danh sách lựa chọn cho một tham số lọc (x-options {field}): giá trị có thật trong dữ liệu người xem được
 * phép thấy. Tên trường tra trong danh mục trường của tập dữ liệu.
 */
export async function paramOptions(t: Tx, source: string, definition: unknown | null, xo: unknown): Promise<Array<{ value: unknown; label: string }>> {
  const o = (xo ?? {}) as { field?: string };
  if (!definition) throw new Problem('not_found', 'Không có báo cáo này');
  const { def } = checkDefinition(source, definition);
  const dataset: Dataset = def.dataset;
  const capability = def.capability;
  const valueF = o.field ?? '';
  const labelF = valueF;
  const fields = new Map(datasetFields(dataset, source, capability).map((f) => [f.name, f]));
  const v = fields.get(valueF);
  const l = fields.get(labelF);
  if (!v || !l) throw new Problem('invalid_params', 'x-options không hợp lệ', `${valueF}/${labelF}`);
  const q = new Sql();
  const where = [`t.valid_to IS NULL`, `t.source_system = ${q.param(source, 'string')}`, `${v.expr} IS NOT NULL`];
  if (dataset === 'records') where.push(`t.capability = ${q.param(capability, 'string')}`);
  return t.any(
    `SELECT DISTINCT ${v.expr} AS value, ${l.expr}::text AS label
       FROM ${dataset} t LEFT JOIN app_users u ON u.id = t.owner_user_id LEFT JOIN org_units o ON o.id = t.org_unit_id
      WHERE ${where.join(' AND ')} ORDER BY 2 LIMIT 300`, q.args);
}

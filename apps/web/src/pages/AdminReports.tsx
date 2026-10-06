import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiProblem, api, periodLabels, fmtDateTime, type AdminSource, type ReportResult, type StatTile } from '../api';
import { ChartView } from '../components/Charts';
import { DataTable } from '../components/DataTable';
import { StatTiles } from '../components/StatTiles';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Field, HelpTip, Input, Menu, Muted, PageTitle, Select, Table, Tabs, Td, Th } from '../components/ui';
import { useAsync } from '../hooks';
import { GroupChips, GroupSection, NoMatch, Pager, TableToolbar, groupRows, usePaged, useTableView } from '../components/TableTools';
import { messages, tr, useT } from '../i18n';

// ---- kiểu định nghĩa (khớp apps/api/src/reports/defined.ts) --------------------------------------
type FieldType = 'string' | 'int' | 'date';
interface FieldInfo { name: string; label: string; type: FieldType }
/** Tập dữ liệu = (hệ thống × capability) trong kho chung records. */
interface DatasetInfo { dataset: 'records'; capability: string; label: string }
type Op = 'eq' | 'neq' | 'in' | 'not_in' | 'contains' | 'like' | 'not_like' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'not_null'
  | 'truoc_hom_nay' | 'tu_hom_nay' | 'hom_nay' | 'den_hom_nay' | 'thang_nay' | 'trong_n_ngay_toi' | 'trong_n_ngay_qua';
/** Chỉ dùng cho trường ngày. */
const DATE_OPS: Op[] = ['truoc_hom_nay', 'tu_hom_nay', 'hom_nay', 'den_hom_nay', 'thang_nay', 'trong_n_ngay_toi', 'trong_n_ngay_qua'];
const DAYS_OPS: Op[] = ['trong_n_ngay_toi', 'trong_n_ngay_qua'];
type Scalar = string | number;
interface Filter { field: string; op: Op; value?: Scalar | Scalar[] }
/** Phép so có nhiều giá trị (mảng) / chỉ dùng cho chuỗi. */
const MULTI_OPS: Op[] = ['in', 'not_in'];
const TEXT_OPS: Op[] = ['contains', 'like', 'not_like'];
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

/** Giải thích từng phép so (nút "?" cạnh điều kiện) — `vd` là ví dụ, `luu_y` là điều dễ nhầm. */
type OpHelp = Record<Op, { y_nghia: string; vd?: string[]; luu_y?: string }>;

const M = messages({
  error: 'Lỗi',
  yourReports: 'Báo cáo của bạn',
  off: ' (đang tắt)',
  disabled: 'Đang tắt',
  cancel: 'Huỷ', save: 'Lưu', add: 'Thêm', edit: 'Sửa', enable: 'Bật', disable: 'Tắt', remove: 'Xoá', close: 'Đóng',
  unitReport: (_n: number) => 'báo cáo',
  unitTab: (_n: number) => 'tab',
  page: {
    title: 'Cấu hình báo cáo',
    subtitle: 'Tạo báo cáo trên dữ liệu của mọi hệ thống nguồn — không cần viết code. Báo cáo bật “Hiện trên Tổng quan” xuất hiện ngay trên trang Tổng quan của người dùng có dữ liệu.',
    sections: 'Phần cấu hình', reports: 'Báo cáo', tabs: 'Tab trên Tổng quan',
    search: 'Tìm theo tên, mã, hệ thống, tab…',
    create: 'Tạo báo cáo',
    empty: 'Chưa có báo cáo nào.',
    nOff: (n: number) => `${n} đang tắt`,
    confirmRemove: (ten: string) => `Xoá hẳn báo cáo “${ten}”?\n\nDữ liệu đã lấy về và lịch tự cập nhật của nguồn dữ liệu không bị ảnh hưởng. Không hoàn tác được.`,
    removed: (ten: string) => `Đã xoá báo cáo “${ten}”.`,
  },
  editor: {
    editTitle: (ten: string) => `Sửa báo cáo: ${ten}`,
    lastEdited: (d: string) => `Sửa lần cuối ${d}`,
    missing: 'Báo cáo này chưa có định nghĩa — dựng lại bên dưới rồi lưu, hoặc xoá nó.',
    code: 'Mã báo cáo', codePh: 'vd phieu_theo_trang_thai',
    name: 'Tên báo cáo', namePh: 'vd Phiếu việc theo trạng thái',
    desc: 'Mô tả (không bắt buộc)', descPh: 'Một câu ngắn giải thích báo cáo cho người xem',
    source: 'Hệ thống nguồn', data: 'Dữ liệu',
    onDash: 'Hiện trên Tổng quan của người dùng có dữ liệu',
    tab: 'Ở tab', width: 'Độ rộng khối', order: 'Thứ tự (nhỏ đứng trước)',
    widths: { 3: 'Cả hàng', 2: '2/3 hàng', 1: '1/3 hàng' } as Record<1 | 2 | 3, string>,
    noData: (): ReactNode => <>Hệ thống này chưa có dữ liệu để dựng báo cáo. Vào “Hệ thống nguồn → Cấu hình adapter”, khai một capability có <code>sink</code> để hệ thống lấy dữ liệu về kho.</>,
    preview: 'Xem thử', rows: (n: number) => `${n} dòng`, running: 'Đang chạy…', rerun: 'Chạy lại',
    previewHint: 'Bấm “Xem thử” để chạy báo cáo trên dữ liệu hiện có của bạn và kiểm tra trước khi lưu.',
    saving: 'Đang lưu…', saveReport: 'Lưu báo cáo',
    saved: (ten: string, onDash: boolean) => `Đã lưu “${ten}”.${onDash ? ' Báo cáo hiện trên Tổng quan của người dùng có dữ liệu.' : ''}`,
  },
  builder: {
    type: 'Kiểu báo cáo',
    modes: { summary: 'Thống kê — nhóm theo trường, đếm/tính tổng, có biểu đồ', list: 'Danh sách — từng bản ghi, chọn cột' },
    columns: 'Cột hiển thị',
    groupCalc: 'Nhóm theo và phép tính',
    groupBy: 'Nhóm theo', noGroup: '— không nhóm (chỉ thẻ KPI) —',
    bucket: 'Gộp theo', month: 'Tháng', day: 'Ngày',
    chart: 'Biểu đồ', none: 'Không',
    charts: {
      bar: 'Cột ngang — so sánh hạng mục', column: 'Cột đứng — theo ngày/tháng', line: 'Đường — xu hướng theo thời gian',
      donut: 'Vành khuyên — phần của tổng (ít nhóm)', heatmap: 'Lịch nhiệt — mật độ theo ngày',
    } as Record<ChartKind, string>,
    timeSearch: 'Thời gian và tìm kiếm',
    dateField: 'Lọc theo khoảng thời gian của', noDate: '— không lọc theo thời gian —',
    period: 'Khoảng mặc định',
    keyword: 'Ô từ khoá tìm trong', noKeyword: '— không có ô từ khoá —',
    viewerFilters: 'Người xem tự lọc theo:',
    filters: 'Điều kiện cố định', filtersHint: 'Chỉ lấy các bản ghi thoả mọi điều kiện dưới đây.',
    tiles: 'Thẻ KPI', tilesHint: 'Con số hiện to ở đầu báo cáo và trên Tổng quan. Có thể đổi màu cảnh báo khi vượt ngưỡng.',
    using: (cap: string) => `Đang dùng: dữ liệu ${cap}`,
    groupedBy: (l: string) => ` · nhóm theo ${l}`,
  },
  ops: {
    eq: 'bằng', neq: 'khác', in: 'là một trong', not_in: 'không thuộc',
    contains: 'chứa', like: 'khớp mẫu (%, _)', not_like: 'không khớp mẫu', gt: 'lớn hơn', gte: 'từ',
    lt: 'nhỏ hơn', lte: 'đến', is_null: 'trống', not_null: 'có giá trị',
    truoc_hom_nay: 'trước hôm nay', hom_nay: 'đúng hôm nay', den_hom_nay: 'đến hết hôm nay', tu_hom_nay: 'từ hôm nay trở đi',
    thang_nay: 'trong tháng này', trong_n_ngay_toi: 'trong số ngày tới', trong_n_ngay_qua: 'trong số ngày qua',
  } as Record<Op, string>,
  opHelp: {
    eq: { y_nghia: 'Giá trị phải giống hệt (kể cả dấu cách, hoa thường).', vd: ['Trạng thái bằng "Đã xử lý"'], luu_y: 'Không chắc cách viết thì dùng "chứa" hoặc chọn từ danh sách với "là một trong".' },
    neq: { y_nghia: 'Lấy mọi bản ghi có giá trị khác giá trị này. Bản ghi để trống cũng được lấy.', vd: ['Trạng thái khác "Hủy"'] },
    in: { y_nghia: 'Chọn nhiều giá trị: lấy bản ghi khớp MỘT trong số đó (tương đương IN trong SQL).', vd: ['Thư mục là một trong [Văn bản đến, Văn bản đang theo dõi]'], luu_y: 'Chọn từ danh sách gợi ý (giá trị có thật trong dữ liệu) để khỏi gõ sai; gõ tay thì Enter hoặc dấu phẩy để thêm.' },
    not_in: { y_nghia: 'Bỏ các bản ghi có giá trị nằm trong danh sách (tương đương NOT IN). Bản ghi để trống vẫn được lấy.', vd: ['Thư mục không thuộc [Văn bản mới kết thúc]'] },
    contains: { y_nghia: 'Có chứa đoạn chữ ở bất kỳ vị trí nào, không phân biệt hoa thường.', vd: ['Trích yếu chứa "quá hạn"'], luu_y: 'Có phân biệt dấu: "qua han" không khớp "quá hạn".' },
    like: {
      y_nghia: 'So theo mẫu như LIKE trong SQL, không phân biệt hoa thường. % là chuỗi bất kỳ (kể cả rỗng), _ là đúng một ký tự.',
      vd: ['báo cáo% → bắt đầu bằng "báo cáo"', '%/QĐ-UBND → kết thúc bằng "/QĐ-UBND"', '%theo dõi% → có chứa "theo dõi" (giống "chứa")', '%công%văn% → có "công", sau đó có "văn"', 'KQ__ → "KQ" và đúng 2 ký tự nữa'],
      luu_y: 'Không có % thì phải khớp nguyên cả chuỗi. Có phân biệt dấu.',
    },
    not_like: { y_nghia: 'Ngược với "khớp mẫu": bỏ các bản ghi khớp mẫu. Bản ghi để trống vẫn được lấy.', vd: ['Trích yếu không khớp mẫu %test% → bỏ văn bản thử nghiệm'] },
    gt: { y_nghia: 'Lớn hơn hẳn (số) hoặc sau ngày (ngày), không tính chính giá trị đó.', vd: ['Số ngày trễ lớn hơn 3'] },
    gte: { y_nghia: 'Từ giá trị này trở lên (tính cả giá trị đó).', vd: ['Ngày nhận từ 01/09/2026'] },
    lt: { y_nghia: 'Nhỏ hơn hẳn (số) hoặc trước ngày (ngày), không tính chính giá trị đó.' },
    lte: { y_nghia: 'Đến giá trị này (tính cả giá trị đó).', vd: ['Ngày nhận đến 30/09/2026'] },
    is_null: { y_nghia: 'Ô này để trống (nguồn không có dữ liệu).', vd: ['Số ký hiệu trống → văn bản chưa có số'] },
    not_null: { y_nghia: 'Ô này có giá trị.' },
    truoc_hom_nay: { y_nghia: 'Ngày trước hôm nay (giờ Việt Nam). Mốc tự đổi mỗi ngày.', vd: ['Hạn xử lý trước hôm nay → việc quá hạn'] },
    hom_nay: { y_nghia: 'Đúng ngày hôm nay.' },
    den_hom_nay: { y_nghia: 'Từ trước tới hết hôm nay (tính cả hôm nay).' },
    tu_hom_nay: { y_nghia: 'Từ hôm nay trở đi (tính cả hôm nay).', vd: ['Hạn xử lý từ hôm nay trở đi → việc còn hạn'] },
    thang_nay: { y_nghia: 'Trong tháng hiện tại.' },
    trong_n_ngay_toi: { y_nghia: 'Từ hôm nay đến N ngày tới.', vd: ['Hạn xử lý trong 3 ngày tới → việc sắp đến hạn'] },
    trong_n_ngay_qua: { y_nghia: 'Từ N ngày trước đến hôm nay.', vd: ['Ngày nhận trong 7 ngày qua'] },
  } satisfies OpHelp as OpHelp,
  note: 'Lưu ý: ',
  filtersHelp: {
    title: 'Cách đặt điều kiện',
    body: (): ReactNode => (
      <span className="grid gap-2">
        <span>Mỗi dòng gồm <b>trường</b> · <b>phép so</b> · <b>giá trị</b>. Có nhiều dòng thì bản ghi phải thoả <b>TẤT CẢ</b> (AND).
          Muốn "hoặc" trên cùng một trường thì dùng <b>là một trong</b>.</span>
        <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <b>bằng / khác</b><span>giống hệt / khác giá trị</span>
          <b>là một trong / không thuộc</b><span>chọn nhiều giá trị (IN / NOT IN)</span>
          <b>chứa</b><span>có đoạn chữ ở đâu cũng được</span>
          <b>khớp mẫu</b><span>như LIKE: <code>%</code> chuỗi bất kỳ, <code>_</code> một ký tự</span>
          <b>lớn hơn, từ, nhỏ hơn, đến</b><span>so số hoặc ngày (từ/đến có tính mốc)</span>
          <b>trống / có giá trị</b><span>ô không có / có dữ liệu</span>
          <b>…hôm nay, …số ngày</b><span>chỉ cho trường ngày, mốc tự đổi theo ngày</span>
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Bấm nút "?" cạnh mỗi điều kiện để xem giải thích và ví dụ của phép so đang chọn. Chữ thường/hoa không quan trọng với "chứa" và "khớp mẫu", nhưng dấu tiếng Việt thì có.</span>
      </span>
    ),
  },
  filter: {
    field: 'Trường', op: 'Phép so sánh',
    opTitle: (op: string) => `"${op}" nghĩa là gì?`, opExplain: 'Giải thích phép so',
    days: 'Số ngày', daysUnit: 'ngày', value: 'Giá trị',
    likePh: 'vd %theo dõi%',
    likeTitle: 'Giống LIKE trong SQL, không phân biệt hoa thường: %abc% = có chứa abc, abc% = bắt đầu bằng abc, %abc = kết thúc bằng abc',
    removeCond: 'Xoá điều kiện',
    addCond: '+ Thêm điều kiện',
  },
  multi: {
    drop: (v: string) => `Bỏ ${v}`, add: 'Thêm giá trị', addMore: 'Thêm…', pickOrType: 'Chọn hoặc gõ giá trị rồi Enter',
    nRecords: (n: number) => `${n} bản ghi`,
  },
  measure: {
    label: 'Nhãn', labelPh: 'Nhãn hiển thị', fn: 'Phép tính', field: 'Trường tính',
    fns: {
      count: 'Đếm', count_distinct: 'Đếm khác nhau', sum: 'Tổng', avg: 'Trung bình',
      min: 'Nhỏ nhất', max: 'Lớn nhất', ty_le: 'Tỉ lệ % thoả điều kiện',
    } as Record<Measure['fn'], string>,
    trendBy: 'Số của tháng này theo', trendAria: 'Xu hướng theo tháng của trường', noTrend: '— không (tính trên mọi bản ghi) —',
    trendNote: '· kèm so với tháng trước và xu hướng 12 tháng',
    warnWhen: 'Cảnh báo (vàng) khi >', warnAria: 'Ngưỡng cảnh báo',
    errWhen: 'Nghiêm trọng (đỏ) khi >', errAria: 'Ngưỡng nghiêm trọng',
    numerator: 'Phần được tính (tử số) — bản ghi thoả:', onlyMatching: 'Chỉ tính trên bản ghi thoả:',
    defTile: 'Tổng số', defMeasure: 'Số lượng',
    addTile: '+ Thêm thẻ KPI', addMeasure: '+ Thêm phép tính',
  },
  previewBody: {
    noRows: 'Không có dòng nào khớp với dữ liệu hiện có của bạn.',
    nothing: 'Chưa có gì để hiển thị — thêm phép tính, cột hoặc thẻ KPI ở phần cấu hình.',
  },
  tabs: {
    intro: 'Mỗi tab là một trang trên Tổng quan. Thêm khối vào tab bằng cách sửa báo cáo → “Ở tab”. Tab không có khối nào người dùng xem được sẽ tự ẩn.',
    search: 'Tìm theo tên tab, hệ thống…', add: 'Thêm tab',
    name: 'Tên tab', namePh: 'vd Văn bản', source: 'Hệ thống nguồn của tab (không bắt buộc)', noSource: '— không gắn —', order: 'Thứ tự',
    empty: 'Chưa có tab nào — mọi báo cáo hiện trên Tổng quan nằm ở tab “Báo cáo của bạn”.',
    colTab: 'Tab', colSource: 'Hệ thống nguồn', colOrder: 'Thứ tự', colBlocks: 'Số khối',
    saved: (ten: string) => `Đã lưu tab “${ten}”.`,
    confirmRemove: (ten: string, khoi: number) => `Xoá tab “${ten}”?${khoi ? `\n\n${khoi} khối trong tab chuyển về tab “Báo cáo của bạn” (báo cáo không bị xoá).` : ''}`,
    removed: (ten: string) => `Đã xoá tab “${ten}”.`,
    toggled: (wasActive: boolean, ten: string) => `Đã ${wasActive ? 'tắt' : 'bật'} tab “${ten}”.`,
    more: (ten: string) => `Thêm thao tác cho tab ${ten}`,
    remove: 'Xoá tab',
  },
  group: {
    colReport: 'Báo cáo', colDash: 'Tổng quan',
    schedTitle: 'Số người có lịch tự cập nhật đang bật cho nguồn dữ liệu của báo cáo (dùng chung với báo cáo cùng nguồn)',
    sched: 'Người có lịch',
    noDef: 'Chưa có định nghĩa',
    dashToggled: (wasShown: boolean, ten: string) => `${wasShown ? 'Đã ẩn' : 'Đã hiện'} “${ten}” trên Tổng quan.`,
    onDash: (tab: string, order: number) => `${tab} · thứ tự ${order}`,
    hidden: 'Ẩn',
    toggled: (wasActive: boolean, ten: string) => `Đã ${wasActive ? 'tắt' : 'bật'} “${ten}”.`,
    more: (ten: string) => `Thêm thao tác cho ${ten}`,
    remove: 'Xoá báo cáo',
  },
}, {
  error: 'Error',
  yourReports: 'Your reports',
  off: ' (disabled)',
  disabled: 'Disabled',
  cancel: 'Cancel', save: 'Save', add: 'Add', edit: 'Edit', enable: 'Enable', disable: 'Disable', remove: 'Remove', close: 'Close',
  unitReport: (n: number) => (n === 1 ? 'report' : 'reports'),
  unitTab: (n: number) => (n === 1 ? 'tab' : 'tabs'),
  page: {
    title: 'Report configuration',
    subtitle: 'Build reports on data from any source system — no code needed. Reports with “Show on Overview” turned on appear right away on the Overview page of users who have data.',
    sections: 'Configuration sections', reports: 'Reports', tabs: 'Overview tabs',
    search: 'Search by name, code, system, tab…',
    create: 'New report',
    empty: 'No reports yet.',
    nOff: (n: number) => `${n} disabled`,
    confirmRemove: (ten: string) => `Permanently delete the report “${ten}”?\n\nData already fetched and the data source's update schedule are not affected. This cannot be undone.`,
    removed: (ten: string) => `Deleted the report “${ten}”.`,
  },
  editor: {
    editTitle: (ten: string) => `Edit report: ${ten}`,
    lastEdited: (d: string) => `Last edited ${d}`,
    missing: 'This report has no definition yet — rebuild it below and save, or delete it.',
    code: 'Report code', codePh: 'e.g. tickets_by_status',
    name: 'Report name', namePh: 'e.g. Tickets by status',
    desc: 'Description (optional)', descPh: 'A short sentence explaining the report to viewers',
    source: 'Source system', data: 'Data',
    onDash: 'Show on the Overview of users who have data',
    tab: 'On tab', width: 'Block width', order: 'Order (lower comes first)',
    widths: { 3: 'Full row', 2: '2/3 row', 1: '1/3 row' },
    noData: (): ReactNode => <>This system has no data to build reports on yet. Go to “Source systems → Adapter configuration” and declare a capability with <code>sink</code> so the system pulls data into the store.</>,
    preview: 'Preview', rows: (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`, running: 'Running…', rerun: 'Run again',
    previewHint: 'Click “Preview” to run the report on your current data and check it before saving.',
    saving: 'Saving…', saveReport: 'Save report',
    saved: (ten: string, onDash: boolean) => `Saved “${ten}”.${onDash ? ' The report shows on the Overview of users who have data.' : ''}`,
  },
  builder: {
    type: 'Report type',
    modes: { summary: 'Summary — group by a field, count or total, with a chart', list: 'List — individual records, pick columns' },
    columns: 'Columns',
    groupCalc: 'Grouping and calculations',
    groupBy: 'Group by', noGroup: '— no grouping (KPI tiles only) —',
    bucket: 'Bucket by', month: 'Month', day: 'Day',
    chart: 'Chart', none: 'None',
    charts: {
      bar: 'Bar — compare categories', column: 'Column — by day or month', line: 'Line — trend over time',
      donut: 'Donut — share of total (few groups)', heatmap: 'Calendar heatmap — density by day',
    },
    timeSearch: 'Time and search',
    dateField: 'Filter time range by', noDate: '— no time filter —',
    period: 'Default period',
    keyword: 'Keyword box searches in', noKeyword: '— no keyword box —',
    viewerFilters: 'Viewers can filter by:',
    filters: 'Fixed conditions', filtersHint: 'Only records that meet every condition below are included.',
    tiles: 'KPI tiles', tilesHint: 'Large numbers shown at the top of the report and on the Overview. Can change to a warning color when a threshold is exceeded.',
    using: (cap: string) => `Using: ${cap} data`,
    groupedBy: (l: string) => ` · grouped by ${l}`,
  },
  ops: {
    eq: 'equals', neq: 'does not equal', in: 'is one of', not_in: 'is not one of',
    contains: 'contains', like: 'matches pattern (%, _)', not_like: 'does not match pattern', gt: 'greater than', gte: 'from',
    lt: 'less than', lte: 'up to', is_null: 'is empty', not_null: 'has a value',
    truoc_hom_nay: 'before today', hom_nay: 'is today', den_hom_nay: 'up to end of today', tu_hom_nay: 'today onwards',
    thang_nay: 'this month', trong_n_ngay_toi: 'in the next N days', trong_n_ngay_qua: 'in the last N days',
  },
  opHelp: {
    eq: { y_nghia: 'The value must be exactly the same (including spaces and letter case).', vd: ['Status equals "Processed"'], luu_y: 'Not sure how it is spelled? Use "contains", or pick from the list with "is one of".' },
    neq: { y_nghia: 'Includes every record whose value differs from this one. Records left empty are included too.', vd: ['Status does not equal "Cancelled"'] },
    in: { y_nghia: 'Pick several values: includes records matching ANY of them (like IN in SQL).', vd: ['Folder is one of [Incoming documents, Followed documents]'], luu_y: 'Pick from the suggestions (values that actually exist in the data) to avoid typos; when typing, press Enter or a comma to add.' },
    not_in: { y_nghia: 'Excludes records whose value is in the list (like NOT IN). Records left empty are still included.', vd: ['Folder is not one of [Recently closed documents]'] },
    contains: { y_nghia: 'Contains the text anywhere, case-insensitive.', vd: ['Summary contains "overdue"'], luu_y: 'Diacritics matter: "qua han" does not match "quá hạn".' },
    like: {
      y_nghia: 'Pattern match like SQL LIKE, case-insensitive. % is any text (including none), _ is exactly one character.',
      vd: ['report% → starts with "report"', '%/QĐ-UBND → ends with "/QĐ-UBND"', '%follow-up% → contains "follow-up" (same as "contains")', '%official%letter% → has "official", then "letter"', 'KQ__ → "KQ" plus exactly 2 more characters'],
      luu_y: 'Without %, the whole value must match. Diacritics matter.',
    },
    not_like: { y_nghia: 'Opposite of "matches pattern": excludes records that match. Records left empty are still included.', vd: ['Summary does not match pattern %test% → excludes test documents'] },
    gt: { y_nghia: 'Strictly greater (numbers) or after the date (dates), not including the value itself.', vd: ['Days late greater than 3'] },
    gte: { y_nghia: 'This value or higher (inclusive).', vd: ['Received date from 01/09/2026'] },
    lt: { y_nghia: 'Strictly less (numbers) or before the date (dates), not including the value itself.' },
    lte: { y_nghia: 'Up to this value (inclusive).', vd: ['Received date up to 30/09/2026'] },
    is_null: { y_nghia: 'The cell is empty (the source has no data).', vd: ['Document number is empty → documents not yet numbered'] },
    not_null: { y_nghia: 'The cell has a value.' },
    truoc_hom_nay: { y_nghia: 'Dates before today (Vietnam time). The cut-off moves every day.', vd: ['Due date before today → overdue tasks'] },
    hom_nay: { y_nghia: 'Exactly today.' },
    den_hom_nay: { y_nghia: 'Any date up to the end of today (including today).' },
    tu_hom_nay: { y_nghia: 'Today and later (including today).', vd: ['Due date today onwards → tasks not yet due'] },
    thang_nay: { y_nghia: 'Within the current month.' },
    trong_n_ngay_toi: { y_nghia: 'From today to N days ahead.', vd: ['Due date in the next 3 days → tasks coming due'] },
    trong_n_ngay_qua: { y_nghia: 'From N days ago to today.', vd: ['Received date in the last 7 days'] },
  },
  note: 'Note: ',
  filtersHelp: {
    title: 'How to set conditions',
    body: (): ReactNode => (
      <span className="grid gap-2">
        <span>Each row is a <b>field</b> · <b>comparison</b> · <b>value</b>. With several rows, a record must meet <b>ALL</b> of them (AND).
          For "or" on the same field, use <b>is one of</b>.</span>
        <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <b>equals / does not equal</b><span>exactly the same / a different value</span>
          <b>is one of / is not one of</b><span>pick several values (IN / NOT IN)</span>
          <b>contains</b><span>the text appears anywhere</span>
          <b>matches pattern</b><span>like LIKE: <code>%</code> any text, <code>_</code> one character</span>
          <b>greater than, from, less than, up to</b><span>compare numbers or dates (from/up to include the bound)</span>
          <b>is empty / has a value</b><span>the cell has no data / has data</span>
          <b>…today, …N days</b><span>date fields only; the cut-off moves with the date</span>
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Click the "?" button next to each condition to see an explanation and examples for the selected comparison. Letter case does not matter for "contains" and "matches pattern", but Vietnamese diacritics do.</span>
      </span>
    ),
  },
  filter: {
    field: 'Field', op: 'Comparison',
    opTitle: (op: string) => `What does "${op}" mean?`, opExplain: 'Explain comparison',
    days: 'Number of days', daysUnit: 'days', value: 'Value',
    likePh: 'e.g. %follow-up%',
    likeTitle: 'Like SQL LIKE, case-insensitive: %abc% = contains abc, abc% = starts with abc, %abc = ends with abc',
    removeCond: 'Remove condition',
    addCond: '+ Add condition',
  },
  multi: {
    drop: (v: string) => `Remove ${v}`, add: 'Add value', addMore: 'Add…', pickOrType: 'Pick or type a value, then press Enter',
    nRecords: (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`,
  },
  measure: {
    label: 'Label', labelPh: 'Display label', fn: 'Calculation', field: 'Field to calculate',
    fns: {
      count: 'Count', count_distinct: 'Count distinct', sum: 'Sum', avg: 'Average',
      min: 'Minimum', max: 'Maximum', ty_le: '% meeting conditions',
    },
    trendBy: "This month's figure by", trendAria: 'Monthly trend field', noTrend: '— none (all records) —',
    trendNote: '· with change vs. last month and 12-month trend',
    warnWhen: 'Warning (yellow) when >', warnAria: 'Warning threshold',
    errWhen: 'Critical (red) when >', errAria: 'Critical threshold',
    numerator: 'Counted part (numerator) — records matching:', onlyMatching: 'Only records matching:',
    defTile: 'Total', defMeasure: 'Count',
    addTile: '+ Add KPI tile', addMeasure: '+ Add calculation',
  },
  previewBody: {
    noRows: 'No rows match your current data.',
    nothing: 'Nothing to show yet — add a calculation, column or KPI tile in the configuration.',
  },
  tabs: {
    intro: 'Each tab is a page on the Overview. Add blocks to a tab by editing a report → “On tab”. Tabs with no blocks the user can see are hidden automatically.',
    search: 'Search by tab name, system…', add: 'Add tab',
    name: 'Tab name', namePh: 'e.g. Documents', source: 'Tab source system (optional)', noSource: '— none —', order: 'Order',
    empty: 'No tabs yet — every report on the Overview is in the “Your reports” tab.',
    colTab: 'Tab', colSource: 'Source system', colOrder: 'Order', colBlocks: 'Blocks',
    saved: (ten: string) => `Saved tab “${ten}”.`,
    confirmRemove: (ten: string, khoi: number) => `Delete tab “${ten}”?${khoi ? `\n\n${khoi} ${khoi === 1 ? 'block' : 'blocks'} in this tab will move to the “Your reports” tab (the reports are not deleted).` : ''}`,
    removed: (ten: string) => `Deleted tab “${ten}”.`,
    toggled: (wasActive: boolean, ten: string) => `${wasActive ? 'Disabled' : 'Enabled'} tab “${ten}”.`,
    more: (ten: string) => `More actions for tab ${ten}`,
    remove: 'Delete tab',
  },
  group: {
    colReport: 'Report', colDash: 'Overview',
    schedTitle: "Number of people with an active update schedule for this report's data source (shared with reports on the same source)",
    sched: 'Scheduled users',
    noDef: 'No definition',
    dashToggled: (wasShown: boolean, ten: string) => (wasShown ? `Removed “${ten}” from the Overview.` : `Added “${ten}” to the Overview.`),
    onDash: (tab: string, order: number) => `${tab} · order ${order}`,
    hidden: 'Hidden',
    toggled: (wasActive: boolean, ten: string) => `${wasActive ? 'Disabled' : 'Enabled'} “${ten}”.`,
    more: (ten: string) => `More actions for ${ten}`,
    remove: 'Delete report',
  },
});

/** [mã phép so, cần nhập giá trị] — nhãn lấy từ M.ops. */
const OPS: Array<[Op, boolean]> = [
  ['eq', true], ['neq', true], ['in', true], ['not_in', true],
  ['contains', true], ['like', true], ['not_like', true], ['gt', true], ['gte', true],
  ['lt', true], ['lte', true], ['is_null', false], ['not_null', false],
  ['truoc_hom_nay', false], ['hom_nay', false], ['den_hom_nay', false], ['tu_hom_nay', false],
  ['thang_nay', false], ['trong_n_ngay_toi', true], ['trong_n_ngay_qua', true],
];

function OpHelpBody({ op }: { op: Op }) {
  const t = useT(M);
  const h = t.opHelp[op];
  return (
    <span className="grid gap-1.5">
      <span>{h.y_nghia}</span>
      {h.vd && <span className="grid gap-0.5">{h.vd.map((x) => <code key={x} className="block rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{x}</code>)}</span>}
      {h.luu_y && <span className="text-xs text-amber-700 dark:text-amber-400">{t.note}{h.luu_y}</span>}
    </span>
  );
}

/** Hướng dẫn chung cho khối điều kiện: cách các điều kiện kết hợp + bảng tóm tắt phép so. */
function FiltersHelp() {
  const t = useT(M);
  return (
    <HelpTip title={t.filtersHelp.title}>
      {t.filtersHelp.body()}
    </HelpTip>
  );
}

const FNS: Array<Measure['fn']> = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'ty_le'];
const CHARTS: ChartKind[] = ['bar', 'column', 'line', 'donut', 'heatmap'];
const WIDTHS: Array<1 | 2 | 3> = [3, 2, 1];
const EMPTY = (dataset: DatasetInfo): Definition => ({
  dataset: 'records', capability: dataset.capability, mode: 'summary',
  default_period: 'thang_hien_tai', filters: [], param_filters: [], columns: [], group_by: [],
  measures: [{ fn: 'count', label: tr(M).measure.defMeasure, filters: [] }], tiles: [],
});
const ERR = (e: unknown) => (e instanceof ApiProblem ? `${e.title}${e.detail ? ` — ${e.detail}` : ''}` : tr(M).error);

/**
 * Quản trị — Cấu hình báo cáo. Dựng báo cáo trên dữ liệu của bất kỳ hệ thống nguồn nào mà không viết code:
 * chọn dữ liệu, bộ lọc, nhóm, phép tính, biểu đồ, thẻ KPI; xem thử; bật "Hiện trên Tổng quan".
 */
export function AdminReportsPage() {
  const t = useT(M);
  const list = useAsync(() => api.get<ReportRow[]>('/admin/reports'), []);
  const tabs = useAsync(() => api.get<DashTab[]>('/admin/dashboard-tabs'), []);
  const [view, setView] = useState<'reports' | 'tabs'>('reports');
  const tabName = (id: number | null) => (id === null ? t.yourReports : tabs.data?.find((x) => x.id === id)?.ten ?? '?');
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
    // Lịch tự cập nhật gắn với nguồn dữ liệu (dùng chung với báo cáo khác) nên không bị xoá theo báo cáo.
    if (!confirm(t.page.confirmRemove(r.ten))) return;
    try {
      await api.del(`/admin/reports/${r.code}`);
      setNote(t.page.removed(r.ten));
      list.reload();
    } catch (e) { setNote(ERR(e)); }
  };

  return (
    <>
      <PageTitle title={t.page.title}
        subtitle={t.page.subtitle} />
      {note && <Banner tone="ok" role="status">{note}</Banner>}
      <Tabs label={t.page.sections} value={view} onChange={(v) => { setView(v as 'reports' | 'tabs'); setNote(null); }}
        items={[{ id: 'reports', label: t.page.reports, count: list.data ? { n: list.data.length } : undefined },
          { id: 'tabs', label: t.page.tabs, count: tabs.data ? { n: tabs.data.length } : undefined }]} />
      {view === 'tabs' ? <TabManager tabs={tabs} onNote={setNote} onChanged={() => { tabs.reload(); list.reload(); }} /> : (<>
      <TableToolbar q={tv.q} onQ={tv.setQ} placeholder={t.page.search}>
        <GroupChips groups={groups.map((g) => ({ key: g.key, label: g.label, n: g.rows.length }))} value={src} onChange={setSrc} />
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setEditing('new'); setNote(null); }}>{t.page.create}</Button>
      </TableToolbar>
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>{t.page.empty}</Empty>}
      {!!list.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {groups.filter((g) => !src || g.key === src).map((g) => (
        <GroupSection key={g.key} id={`cau-hinh-${g.key}`} title={g.label} count={g.rows.length} unit={t.unitReport(g.rows.length)}
          extra={g.rows.some((r) => !r.is_active) && <Muted className="text-sm">· {t.page.nOff(g.rows.filter((r) => !r.is_active).length)}</Muted>}>
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
/** Giá trị có thật của một trường (gợi ý cho "là một trong / không thuộc"). Builder nhận qua context, nạp lười theo trường. */
interface FieldValue { value: Scalar; n: number }
const ValuesCtx = createContext<(field: string) => Promise<FieldValue[]>>(async () => []);

function ReportEditor({ report, tabs, onClose, onSaved }: { report: ReportRow | null; tabs: DashTab[]; onClose: () => void; onSaved: (m: string) => void }) {
  const t = useT(M);
  const isNew = !report;
  const configurable = true;   // mọi báo cáo là báo cáo cấu hình
  const sources = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const [code, setCode] = useState('');
  const [ten, setTen] = useState(report?.ten ?? '');
  const [moTa, setMoTa] = useState(report?.mo_ta ?? '');
  const [source, setSource] = useState(report?.source_system ?? '');
  // Báo cáo luôn là dữ liệu cá nhân của người xem (bỏ phạm vi đơn vị). Báo cáo cũ đặt "đơn vị" lưu lại sẽ về cá nhân.
  const scope = 'ca_nhan' as const;
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
    if (!def || !d.datasets.some((x) => x.capability === def.capability)) {
      setDef(d.datasets[0] ? EMPTY(d.datasets[0]) : null);
    }
  }, [meta.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields = meta.data?.fields ?? [];
  const ofType = (...ty: FieldType[]) => fields.filter((f) => ty.includes(f.type));
  const up = (p: Partial<Definition>) => { setDef((d) => (d ? { ...d, ...p } : d)); setPreview(null); };
  const valuesCache = useRef(new Map<string, Promise<FieldValue[]>>());
  const loadValues = useCallback((field: string) => {
    const k = `${source}|${def?.capability ?? ''}|${field}`;
    let p = valuesCache.current.get(k);
    if (!p) {
      p = api.get<FieldValue[]>(`/admin/report-values?source=${encodeURIComponent(source)}&capability=${encodeURIComponent(def?.capability ?? '')}&field=${encodeURIComponent(field)}`).catch(() => []);
      valuesCache.current.set(k, p);
    }
    return p;
  }, [source, def?.capability]);

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
      onSaved(t.editor.saved(ten, onDash));
    } catch (e) { setErr(ERR(e)); setBusy(false); }
  };

  const canSave = !busy && !!ten.trim() && (!isNew || !!code) && (!configurable || !!def);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 dark:bg-black/60 sm:p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-full w-full flex-col bg-white dark:bg-slate-950 sm:min-h-0 sm:max-w-[1600px] sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-xl dark:sm:border-slate-800 lg:h-[90vh] lg:overflow-hidden">
        {/* Đầu trang: tên báo cáo đang sửa + đóng */}
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{isNew ? t.page.create : t.editor.editTitle(report.ten)}</h2>
            {report?.updated_at && <Muted className="text-xs">{t.editor.lastEdited(fmtDateTime(report.updated_at))}</Muted>}
          </div>
          <span className="flex-1" />
          <button type="button" aria-label={t.close} onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100">✕</button>
        </header>

        {/* Thân: cấu hình bên trái, xem thử dính bên phải (xuống dòng dọc khi màn hình hẹp) */}
        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <div className="px-5 py-4 lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
            {report?.kind === 'missing' && <Banner tone="warn">{t.editor.missing}</Banner>}

            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {isNew && <Field label={t.editor.code}><Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder={t.editor.codePh} /></Field>}
              <div className={isNew ? '' : 'sm:col-span-2'}><Field label={t.editor.name}><Input value={ten} onChange={(e) => setTen(e.target.value)} placeholder={t.editor.namePh} /></Field></div>
              <div className="sm:col-span-2"><Field label={t.editor.desc}><Input value={moTa} onChange={(e) => setMoTa(e.target.value)} placeholder={t.editor.descPh} /></Field></div>
              {configurable && (
                <Field label={t.editor.source}>
                  <Select value={source} onChange={(e) => { setSource(e.target.value); setDef(null); }}>
                    {sources.data?.map((s) => <option key={s.code} value={s.code}>{s.ten}{s.enabled ? '' : t.off}</option>)}
                  </Select>
                </Field>
              )}
              {configurable && (
                <Field label={t.editor.data}>
                  <Select value={def?.capability ?? ''} disabled={!meta.data?.datasets.length}
                    onChange={(e) => { const d = meta.data!.datasets.find((x) => x.capability === e.target.value); if (d) { setDef(EMPTY(d)); setPreview(null); } }}>
                    {meta.data?.datasets.map((d) => <option key={d.capability} value={d.capability}>{d.label} ({d.capability})</option>)}
                  </Select>
                </Field>
              )}
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={onDash} onChange={(e) => setOnDash(e.target.checked)} />
                {t.editor.onDash}
              </label>
              {onDash && (
                <div className="grid gap-x-4 gap-y-3 sm:col-span-2 sm:grid-cols-3">
                  <Field label={t.editor.tab}>
                    <Select value={tab ?? ''} onChange={(e) => setTab(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{t.yourReports}</option>
                      {tabs.map((x) => <option key={x.id} value={x.id}>{x.ten}{x.is_active ? '' : t.off}</option>)}
                    </Select>
                  </Field>
                  <Field label={t.editor.width}>
                    <Select value={width} disabled={tab === null} onChange={(e) => setWidth(Number(e.target.value) as 1 | 2 | 3)}>
                      {WIDTHS.map((w) => <option key={w} value={w}>{t.editor.widths[w]}</option>)}
                    </Select>
                  </Field>
                  <Field label={t.editor.order}><Input type="number" min={0} value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
                </div>
              )}
            </div>

            {configurable && meta.loading && <div className="mt-4"><Loading /></div>}
            {configurable && meta.data && !meta.data.datasets.length && (
              <Banner tone="info">{t.editor.noData()}</Banner>
            )}
            {configurable && def && fields.length > 0 && <ValuesCtx.Provider value={loadValues}><Builder def={def} fields={fields} ofType={ofType} up={up} /></ValuesCtx.Provider>}
          </div>

          {/* Xem thử — dính bên phải trên màn hình rộng để vừa chỉnh vừa xem */}
          <aside className="flex shrink-0 flex-col border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 lg:min-h-0 lg:w-[40%] lg:min-w-[320px] lg:max-w-[560px] lg:border-l lg:border-t-0">
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
              <h3 className="text-sm font-semibold">{t.editor.preview}</h3>
              {preview && <Muted className="text-xs tabular-nums">{t.editor.rows(preview.total_rows)}</Muted>}
              <span className="flex-1" />
              {configurable && <Button disabled={busy || !def} onClick={() => void runPreview()}>{busy ? t.editor.running : preview ? t.editor.rerun : t.editor.preview}</Button>}
            </div>
            <div className="grow p-4 lg:overflow-y-auto">
              {err && <Banner tone="err">{err}</Banner>}
              {!err && !preview && <Empty>{t.editor.previewHint}</Empty>}
              {preview && <PreviewBody r={preview} />}
            </div>
          </aside>
        </div>

        {/* Thanh hành động cố định */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <Button onClick={onClose}>{t.cancel}</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{busy ? t.editor.saving : t.editor.saveReport}</Button>
        </footer>
      </div>
    </div>
  );
}

/** Phần dựng định nghĩa: kiểu, cột / nhóm + phép tính, thời gian, bộ lọc, thẻ KPI. */
function Builder({ def, fields, ofType, up }: {
  def: Definition; fields: FieldInfo[]; ofType: (...t: FieldType[]) => FieldInfo[]; up: (p: Partial<Definition>) => void;
}) {
  const t = useT(M);
  const label = (n?: string) => fields.find((f) => f.name === n)?.label ?? n ?? '';
  const typeOf = (n?: string) => fields.find((f) => f.name === n)?.type;
  /** Khoảng mặc định của báo cáo (không có "Tuỳ chọn…" — người xem tự chọn ngày khi xem). Đọc lúc vẽ để nhãn theo ngôn ngữ hiện tại. */
  const periods = periodLabels().filter(([c]) => c !== 'tuy_chon');
  return (
    <div className="mt-5 grid gap-5 border-t border-slate-200 pt-4 dark:border-slate-800">
      <Section title={t.builder.type}>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['summary', 'list'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2"><input type="radio" checked={def.mode === m} onChange={() => up({ mode: m, chart: m === 'list' ? undefined : def.chart })} />{t.builder.modes[m]}</label>
          ))}
        </div>
      </Section>

      {def.mode === 'list' ? (
        <Section title={t.builder.columns}>
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
        <Section title={t.builder.groupCalc}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t.builder.groupBy}>
              <Select value={def.group_by[0]?.field ?? ''} onChange={(e) => up({ group_by: e.target.value ? [{ field: e.target.value, bucket: typeOf(e.target.value) === 'date' ? 'month' : undefined }] : [] })}>
                <option value="">{t.builder.noGroup}</option>
                {fields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
              </Select>
            </Field>
            {typeOf(def.group_by[0]?.field) === 'date' && (
              <Field label={t.builder.bucket}>
                <Select value={def.group_by[0]!.bucket ?? 'month'} onChange={(e) => up({ group_by: [{ ...def.group_by[0]!, bucket: e.target.value as 'day' | 'month' }] })}>
                  <option value="month">{t.builder.month}</option><option value="day">{t.builder.day}</option>
                </Select>
              </Field>
            )}
            <Field label={t.builder.chart}>
              <Select value={def.chart?.kind ?? ''} onChange={(e) => {
                const kind = e.target.value as ChartKind | '';
                // Lịch nhiệt cần nhóm theo ngày ⇒ tự chuyển "Gộp theo" sang Ngày nếu đang nhóm theo trường ngày.
                const g = def.group_by[0];
                up({ chart: kind ? { kind } : undefined, ...(kind === 'heatmap' && g && typeOf(g.field) === 'date' ? { group_by: [{ ...g, bucket: 'day' as const }] } : {}) });
              }}>
                <option value="">{t.builder.none}</option>
                {CHARTS.map((k) => <option key={k} value={k}>{t.builder.charts[k]}</option>)}
              </Select>
            </Field>
          </div>
          <MeasureList items={def.measures} fields={fields} max={4} onChange={(measures) => up({ measures })} />
        </Section>
      )}

      <Section title={t.builder.timeSearch}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t.builder.dateField}>
            <Select value={def.date_field ?? ''} onChange={(e) => up({ date_field: e.target.value || undefined })}>
              <option value="">{t.builder.noDate}</option>
              {ofType('date').map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </Select>
          </Field>
          {def.date_field && (
            <Field label={t.builder.period}>
              <Select value={def.default_period} onChange={(e) => up({ default_period: e.target.value })}>
                {periods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t.builder.keyword}>
            <Select value={def.keyword_field ?? ''} onChange={(e) => up({ keyword_field: e.target.value || undefined })}>
              <option value="">{t.builder.noKeyword}</option>
              {ofType('string').map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-2 text-sm">
          <span className="mr-3 font-medium">{t.builder.viewerFilters}</span>
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

      <Section title={t.builder.filters} hint={t.builder.filtersHint} help={<FiltersHelp />}>
        <FilterList items={def.filters} fields={fields} onChange={(filters) => up({ filters })} />
      </Section>

      <Section title={t.builder.tiles} hint={t.builder.tilesHint}>
        <MeasureList items={def.tiles} fields={fields} max={4} tile onChange={(tiles) => up({ tiles: tiles as Tile[] })} />
      </Section>
      <Muted className="text-xs">{t.builder.using(def.capability ?? '')}
        {def.group_by[0] ? t.builder.groupedBy(label(def.group_by[0].field).toLowerCase()) : ''}</Muted>
    </div>
  );
}

function Section({ title, hint, help, children }: { title: string; hint?: string; help?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold">{title}{help}</h3>
      {hint && <Muted className="text-xs">{hint}</Muted>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function FilterRow({ f, fields, onChange, onRemove }: { f: Filter; fields: FieldInfo[]; onChange: (f: Filter) => void; onRemove: () => void }) {
  const t = useT(M);
  const type = fields.find((x) => x.name === f.field)?.type;
  const ops = OPS.filter(([o]) => (DATE_OPS.includes(o) ? type === 'date' : TEXT_OPS.includes(o) ? type === 'string' : true));
  const days = DAYS_OPS.includes(f.op);
  const multi = MULTI_OPS.includes(f.op);
  const needValue = OPS.find(([o]) => o === f.op)?.[1];
  const first = Array.isArray(f.value) ? f.value[0] : f.value;
  /** Đổi phép so: giữ giá trị nếu còn hợp (1 giá trị ⇄ danh sách), về mặc định khi sang/ra "số ngày". */
  const changeOp = (op: Op) => {
    const value = DAYS_OPS.includes(op) ? 7
      : DAYS_OPS.includes(f.op) ? (MULTI_OPS.includes(op) ? [] : '')
      : MULTI_OPS.includes(op) ? (Array.isArray(f.value) ? f.value : first === undefined || first === '' ? [] : [first])
      : first ?? '';
    onChange({ ...f, op, value });
  };
  const like = f.op === 'like' || f.op === 'not_like';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label={t.filter.field} value={f.field} onChange={(e) => onChange({ ...f, field: e.target.value })}>
        {fields.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
      </Select>
      <Select aria-label={t.filter.op} value={f.op} onChange={(e) => changeOp(e.target.value as Op)}>
        {ops.map(([o]) => <option key={o} value={o}>{t.ops[o]}</option>)}
      </Select>
      <HelpTip title={t.filter.opTitle(t.ops[f.op] ?? f.op)} label={t.filter.opExplain}>
        <OpHelpBody op={f.op} />
      </HelpTip>
      {needValue && (
        multi ? (
          <MultiValue field={f.field} type={type} value={Array.isArray(f.value) ? f.value : first === undefined || first === '' ? [] : [first]}
            onChange={(value) => onChange({ ...f, value })} />
        ) : days ? (
          <span className="flex items-center gap-2 text-sm">
            <Input aria-label={t.filter.days} className="w-20 !min-w-0 text-right" type="number" min={1} max={3650} value={String(f.value ?? '')}
              onChange={(e) => onChange({ ...f, value: Number(e.target.value) })} />{t.filter.daysUnit}
          </span>
        ) : (
          <div className="min-w-[7rem] flex-1"><Input aria-label={t.filter.value} className="w-full !min-w-0" type={type === 'date' ? 'date' : type === 'int' ? 'number' : 'text'} value={String(first ?? '')}
            placeholder={like ? t.filter.likePh : undefined}
            title={like ? t.filter.likeTitle : undefined}
            onChange={(e) => onChange({ ...f, value: type === 'int' ? Number(e.target.value) : e.target.value })} /></div>
        )
      )}
      <Button variant="danger" className="ml-auto shrink-0" onClick={onRemove} aria-label={t.filter.removeCond}>✕</Button>
    </div>
  );
}

/**
 * Ô chọn nhiều giá trị (cho "là một trong / không thuộc"): chọn từ giá trị có thật trong dữ liệu hoặc gõ rồi Enter
 * (dán nhiều giá trị cách nhau bởi dấu phẩy cũng được). Tối đa 50 giá trị.
 */
function MultiValue({ field, type, value, onChange }: { field: string; type?: FieldType; value: Scalar[]; onChange: (v: Scalar[]) => void }) {
  const t = useT(M);
  const load = useContext(ValuesCtx);
  const listId = useId();
  const [opts, setOpts] = useState<FieldValue[] | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    let on = true;
    setOpts(null);
    void load(field).then((v) => { if (on) setOpts(v); });
    return () => { on = false; };
  }, [field, load]);
  const has = (v: Scalar) => value.some((x) => String(x) === String(v));
  const add = (raw: string) => {
    const parts = raw.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
      .map((x) => (type === 'int' ? Number(x) : x)).filter((x) => !(typeof x === 'number' && Number.isNaN(x)));
    const next = [...value];
    for (const p of parts) if (!next.some((x) => String(x) === String(p))) next.push(p);
    onChange(next.slice(0, 50));
    setText('');
  };
  const rest = (opts ?? []).filter((o) => !has(o.value));
  return (
    <div className="grid min-w-[12rem] flex-1 gap-1">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-blue-400">
        {value.map((v) => (
          <span key={String(v)} className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            {String(v)}
            <button type="button" className="text-blue-500 hover:text-red-600" aria-label={t.multi.drop(String(v))} onClick={() => onChange(value.filter((x) => String(x) !== String(v)))}>×</button>
          </span>
        ))}
        <input aria-label={t.multi.add} list={listId} className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm text-slate-900 outline-none dark:text-slate-100"
          value={text} placeholder={value.length ? t.multi.addMore : t.multi.pickOrType}
          onChange={(e) => { const v = e.target.value; if (opts?.some((o) => String(o.value) === v)) add(v); else setText(v); }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && text.trim()) { e.preventDefault(); add(text); }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => { if (text.trim()) add(text); }} />
        <datalist id={listId}>{rest.map((o) => <option key={String(o.value)} value={String(o.value)}>{t.multi.nRecords(o.n)}</option>)}</datalist>
      </div>
      {rest.length > 0 && rest.length <= 12 && (
        <div className="flex flex-wrap gap-1">
          {rest.map((o) => (
            <button key={String(o.value)} type="button" onClick={() => add(String(o.value))}
              className="rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-blue-300">
              + {String(o.value)} <span className="text-slate-400">({o.n})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterList({ items, fields, onChange }: { items: Filter[]; fields: FieldInfo[]; onChange: (f: Filter[]) => void }) {
  const t = useT(M);
  return (
    <div className="grid gap-2">
      {items.map((f, i) => <FilterRow key={i} f={f} fields={fields} onChange={(n) => onChange(items.map((x, j) => (j === i ? n : x)))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />)}
      {items.length < 10 && <Button className="justify-self-start" onClick={() => onChange([...items, { field: fields[0]!.name, op: 'eq', value: '' }])}>{t.filter.addCond}</Button>}
    </div>
  );
}

function MeasureList({ items, fields, max, tile, onChange }: { items: Array<Measure | Tile>; fields: FieldInfo[]; max: number; tile?: boolean; onChange: (m: Array<Measure | Tile>) => void }) {
  const t = useT(M);
  const set = (i: number, p: Partial<Tile>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="mt-2 grid gap-3">
      {items.map((m, i) => (
        <div key={i} className="grid gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[8rem] flex-1"><Input aria-label={t.measure.label} className="w-full !min-w-0" value={m.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={t.measure.labelPh} /></div>
            <Select aria-label={t.measure.fn} value={m.fn} onChange={(e) => {
              const fn = e.target.value as Measure['fn'];
              set(i, { fn, field: fn === 'count' || fn === 'ty_le' ? undefined : m.field ?? fields[0]?.name, ...(fn === 'ty_le' ? { trend_field: undefined } : {}) });
            }}>
              {FNS.filter((f) => tile || f !== 'ty_le').map((f) => <option key={f} value={f}>{t.measure.fns[f]}</option>)}
            </Select>
            {m.fn !== 'count' && m.fn !== 'ty_le' && (
              <Select aria-label={t.measure.field} value={m.field ?? ''} onChange={(e) => set(i, { field: e.target.value })}>
                {fields.filter((f) => (m.fn === 'sum' || m.fn === 'avg' ? f.type === 'int' : true)).map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
              </Select>
            )}
            <Button variant="danger" className="ml-auto shrink-0" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t.remove}>✕</Button>
          </div>
          {tile && m.fn !== 'ty_le' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span>{t.measure.trendBy}</span>
              <Select aria-label={t.measure.trendAria} value={(m as Tile).trend_field ?? ''} onChange={(e) => set(i, { trend_field: e.target.value || undefined })}>
                <option value="">{t.measure.noTrend}</option>
                {fields.filter((f) => f.type === 'date').map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
              </Select>
              {(m as Tile).trend_field && <span>{t.measure.trendNote}</span>}
            </div>
          )}
          {tile && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <span>{t.measure.warnWhen}</span>
              <Input aria-label={t.measure.warnAria} className="w-20 !min-w-0 text-right" type="number" value={(m as Tile).warn_if_gt ?? ''} onChange={(e) => set(i, { warn_if_gt: e.target.value === '' ? undefined : Number(e.target.value) })} />
              <span className="ml-1">{t.measure.errWhen}</span>
              <Input aria-label={t.measure.errAria} className="w-20 !min-w-0 text-right" type="number" value={(m as Tile).err_if_gt ?? ''} onChange={(e) => set(i, { err_if_gt: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          )}
          <div className="text-xs text-slate-500 dark:text-slate-400">{m.fn === 'ty_le' ? t.measure.numerator : t.measure.onlyMatching}</div>
          <FilterList items={m.filters} fields={fields} onChange={(filters) => set(i, { filters })} />
        </div>
      ))}
      {items.length < max && <Button className="justify-self-start" onClick={() => onChange([...items, { fn: 'count', label: tile ? t.measure.defTile : t.measure.defMeasure, filters: [] }])}>{tile ? t.measure.addTile : t.measure.addMeasure}</Button>}
    </div>
  );
}

function PreviewBody({ r }: { r: ReportResult }) {
  const t = useT(M);
  const chart = r.charts?.[0];
  const tiles = (r.tiles ?? []) as StatTile[];
  const nothing = !tiles.length && !chart && !r.columns.length;
  return (
    <div className="grid gap-4">
      {tiles.length > 0 && <StatTiles tiles={tiles} />}
      {chart && <ChartView chart={chart} rows={r.chart_rows ?? r.rows} />}
      {r.columns.length > 0 && (r.rows.length
        ? <div className="overflow-x-auto"><DataTable columns={r.columns} rows={r.rows.slice(0, 20)} /></div>
        : <Muted>{t.previewBody.noRows}</Muted>)}
      {nothing && <Muted>{t.previewBody.nothing}</Muted>}
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
  const t = useT(M);
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
    void run(() => (form.id === null ? api.post('/admin/dashboard-tabs', body) : api.patch(`/admin/dashboard-tabs/${form.id}`, body)), t.tabs.saved(body.ten));
  };
  const remove = (x: DashTab) => {
    if (!confirm(t.tabs.confirmRemove(x.ten, x.khoi))) return;
    void run(() => api.del(`/admin/dashboard-tabs/${x.id}`), t.tabs.removed(x.ten));
  };
  const next = Math.max(0, ...(tabs.data ?? []).map((x) => x.thu_tu)) + 10;
  const tv = useTableView(tabs.data, (x) => `${x.ten} ${x.source_ten ?? ''}`);
  return (
    <>
      <Muted className="mb-3 text-sm">{t.tabs.intro}</Muted>
      <TableToolbar q={tv.q} onQ={tv.setQ} placeholder={t.tabs.search}>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setForm({ id: null, ten: '', source_system: '', thu_tu: next }); setErr(null); }}>{t.tabs.add}</Button>
      </TableToolbar>
      {err && <Banner tone="err">{err}</Banner>}
      {form && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
            <Field label={t.tabs.name}><Input value={form.ten} maxLength={60} onChange={(e) => setForm({ ...form, ten: e.target.value })} placeholder={t.tabs.namePh} /></Field>
            <Field label={t.tabs.source}>
              <Select value={form.source_system} onChange={(e) => setForm({ ...form, source_system: e.target.value })}>
                <option value="">{t.tabs.noSource}</option>
                {sources.data?.map((s) => <option key={s.code} value={s.code}>{s.ten}</option>)}
              </Select>
            </Field>
            <Field label={t.tabs.order}><Input type="number" min={0} value={form.thu_tu} onChange={(e) => setForm({ ...form, thu_tu: Number(e.target.value) })} /></Field>
            <div className="flex gap-2">
              <Button onClick={() => setForm(null)}>{t.cancel}</Button>
              <Button variant="primary" disabled={!form.ten.trim()} onClick={save}>{form.id === null ? t.add : t.save}</Button>
            </div>
          </div>
        </Card>
      )}
      {tabs.loading && <Loading />}
      {tabs.error ? <ErrorBox error={tabs.error} onRetry={tabs.reload} /> : null}
      {tabs.data && !tabs.data.length && <Empty>{t.tabs.empty}</Empty>}
      {!!tabs.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>{t.tabs.colTab}</Th><Th>{t.tabs.colSource}</Th><Th num>{t.tabs.colOrder}</Th><Th num>{t.tabs.colBlocks}</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((x) => (
              <tr key={x.id} className={x.is_active ? '' : '[&>td:not(:last-child)]:opacity-60'}>
                <Td><span className="font-medium">{x.ten}</span>{!x.is_active && <Badge tone="neutral">{t.disabled}</Badge>}</Td>
                <Td>{x.source_ten ?? <Muted>—</Muted>}</Td>
                <Td num>{x.thu_tu}</Td>
                <Td num>{x.khoi}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button onClick={() => { setForm({ id: x.id, ten: x.ten, source_system: x.source_system ?? '', thu_tu: x.thu_tu }); setErr(null); }}>{t.edit}</Button>
                    <Button onClick={() => void run(() => api.patch(`/admin/dashboard-tabs/${x.id}`, { is_active: !x.is_active }), t.tabs.toggled(x.is_active, x.ten))}>{x.is_active ? t.disable : t.enable}</Button>
                    <Menu label={t.tabs.more(x.ten)} items={[{ label: t.tabs.remove, danger: true, onClick: () => remove(x) }]} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit={t.unitTab(tv.total)} />
      </>)}
    </>
  );
}

/** Bảng báo cáo của một hệ thống nguồn (cột "Hệ thống" bỏ vì đã là tiêu đề nhóm). */
function ReportGroup({ rows, tabName, onEdit, patch, remove }: {
  rows: ReportRow[]; tabName: (id: number | null) => string; onEdit: (r: ReportRow) => void;
  patch: (r: ReportRow, body: Partial<ReportRow>, msg: string) => Promise<void>; remove: (r: ReportRow) => Promise<void>;
}) {
  const t = useT(M);
  const pg = usePaged(rows);
  return (
    <>
      <Table fixed>
        <colgroup><col /><col className="w-72" /><col className="w-32" /><col className="w-52" /></colgroup>
        <thead><tr><Th>{t.group.colReport}</Th><Th>{t.group.colDash}</Th><Th num><span title={t.group.schedTitle}>{t.group.sched}</span></Th><Th /></tr></thead>
        <tbody>
          {pg.rows.map((r) => (
            <tr key={r.code} className={r.is_active ? '' : '[&>td:not(:last-child)]:opacity-60'}>
              <Td>
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.ten}</span>
                  {r.kind === 'missing' && <Badge tone="warn">{t.group.noDef}</Badge>}
                  {!r.is_active && <Badge tone="neutral">{t.disabled}</Badge>}</div>
                <Muted className="font-mono text-xs">{r.code}</Muted>
              </Td>
              <Td>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={r.show_on_dashboard}
                    onChange={() => void patch(r, { show_on_dashboard: !r.show_on_dashboard }, t.group.dashToggled(r.show_on_dashboard, r.ten))} />
                  <span>{r.show_on_dashboard ? t.group.onDash(tabName(r.dashboard_tab), r.dashboard_order) : t.group.hidden}</span>
                </label>
              </Td>
              <Td num>{r.lich}</Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <Button onClick={() => onEdit(r)}>{t.edit}</Button>
                  <Button onClick={() => void patch(r, { is_active: !r.is_active }, t.group.toggled(r.is_active, r.ten))}>{r.is_active ? t.disable : t.enable}</Button>
                  <Menu label={t.group.more(r.ten)} items={[{ label: t.group.remove, danger: true, onClick: () => void remove(r) }]} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {pg.total > 20 && <Pager page={pg.page} pageSize={pg.pageSize} total={pg.total} onPage={pg.setPage} onPageSize={pg.setPageSize} unit={t.unitReport(pg.total)} />}
    </>
  );
}

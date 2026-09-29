/**
 * Định nghĩa truy vấn của từng báo cáo trong report_catalog (db/migrations/003).
 * Mọi hàm run() chạy BÊN TRONG withUserContext trên pool reader ⇒ RLS đã lọc sẵn theo phạm vi.
 * Không tự thêm điều kiện owner/org ở đây: phân quyền là việc của CSDL, không phải của báo cáo.
 */
import type { Scope, Tx } from '@vala/core';
import { resolvePeriod } from '../params.js';

export interface Column {
  field: string;
  label: string;
  type: 'string' | 'int' | 'date' | 'money';
  width?: number;
}

export interface Chart {
  kind: 'line' | 'bar';
  title: string;
  x_field: string;
  series: Array<{ field: string; label: string }>;
}

export interface ReportInput {
  params: Record<string, unknown>;
  scope: Scope;
  page: number;
  pageSize: number;
}

export interface ReportOutput {
  columns: Column[];
  rows: Record<string, unknown>[];
  total_rows: number;
  charts?: Chart[];
  /** Thẻ số liệu cho dashboard (view_template = 'tong_hop'). tone chỉ để tô màu, luôn kèm nhãn chữ. */
  /** Dữ liệu riêng cho biểu đồ khi khác bảng (vd bảng là danh sách việc, biểu đồ là số việc theo trạng thái). */
  chart_rows?: Record<string, unknown>[];
  tiles?: Array<{ key: string; label: string; value: number; tone: 'ok' | 'warn' | 'err' | 'neutral' }>;
  /** Mô tả khoảng dữ liệu thực tế đã áp dụng, để người xem không phải đoán "tháng hiện tại" là tháng nào. */
  applied?: Record<string, unknown>;
}

export interface ReportDef {
  code: string;
  run(t: Tx, input: ReportInput): Promise<ReportOutput>;
}

const vanBanTheoThuMuc: ReportDef = {
  code: 'van_ban_theo_thu_muc',
  async run(t, { params, scope, page, pageSize }) {
    const period = resolvePeriod(params);
    const nodeIds = (params.node_ids as number[] | undefined)?.length ? (params.node_ids as number[]) : null;
    const keyword = typeof params.tu_khoa === 'string' && params.tu_khoa.trim() ? `%${params.tu_khoa.trim()}%` : null;
    const where = `d.valid_to IS NULL
      AND d.ngay_nhan BETWEEN $<tu>::date AND $<den>::date
      AND ($<nodes>::int[] IS NULL OR d.node_id = ANY($<nodes>::int[]))
      AND ($<kw>::text IS NULL OR d.trich_yeu ILIKE $<kw>)`;
    const args = { tu: period.tu_ngay, den: period.den_ngay, nodes: nodeIds, kw: keyword, limit: pageSize, offset: (page - 1) * pageSize };
    const total = await t.one(`SELECT count(*)::int AS n FROM documents d WHERE ${where}`, args, (r: { n: number }) => r.n);
    const rows = await t.any(
      `SELECT d.trich_yeu, d.so_ky_hieu, d.so_den_di, d.ngay_nhan, d.node_ten, d.nguoi_tao, d.trang_thai,
              u.ho_ten AS nguoi_uy_quyen
         FROM documents d JOIN app_users u ON u.id = d.owner_user_id
        WHERE ${where}
        ORDER BY d.ngay_nhan DESC NULLS LAST, d.id DESC
        LIMIT $<limit> OFFSET $<offset>`, args);
    const columns: Column[] = [
      { field: 'trich_yeu', label: 'Trích yếu', type: 'string', width: 420 },
      { field: 'so_ky_hieu', label: 'Số ký hiệu', type: 'string', width: 140 },
      { field: 'so_den_di', label: 'Số đến/đi', type: 'string', width: 100 },
      { field: 'ngay_nhan', label: 'Ngày nhận', type: 'date', width: 110 },
      { field: 'node_ten', label: 'Thư mục', type: 'string', width: 200 },
      { field: 'nguoi_tao', label: 'Người tạo', type: 'string', width: 160 },
    ];
    if (scope === 'don_vi') columns.push({ field: 'nguoi_uy_quyen', label: 'Của thành viên', type: 'string', width: 160 });
    return { columns, rows, total_rows: total, applied: period };
  },
};

const vanBanKetThucTheoPhong: ReportDef = {
  code: 'van_ban_ket_thuc_theo_phong',
  async run(t, { params, page, pageSize }) {
    const period = resolvePeriod(params);
    // node 32 = "Văn bản mới kết thúc" (adapter-egov.yaml, fixture thật)
    const all = await t.any<{ phong_ban: string; so_van_ban: number; so_thanh_vien: number }>(
      `SELECT coalesce(o.ten, 'Chưa xác định đơn vị') AS phong_ban,
              count(*)::int AS so_van_ban,
              count(DISTINCT d.owner_user_id)::int AS so_thanh_vien
         FROM documents d LEFT JOIN org_units o ON o.id = d.org_unit_id
        WHERE d.valid_to IS NULL AND d.node_id = 32
          AND d.ngay_nhan BETWEEN $1::date AND $2::date
        GROUP BY 1 ORDER BY so_van_ban DESC, phong_ban`,
      [period.tu_ngay, period.den_ngay]);
    return {
      columns: [
        { field: 'phong_ban', label: 'Phòng ban', type: 'string', width: 280 },
        { field: 'so_van_ban', label: 'Số văn bản kết thúc', type: 'int', width: 160 },
        { field: 'so_thanh_vien', label: 'Số thành viên có dữ liệu', type: 'int', width: 180 },
      ],
      rows: all.slice((page - 1) * pageSize, page * pageSize),
      total_rows: all.length,
      charts: [{ kind: 'bar', title: 'Văn bản kết thúc theo phòng ban', x_field: 'phong_ban', series: [{ field: 'so_van_ban', label: 'Số văn bản' }] }],
      applied: period,
    };
  },
};

const vanBanTheoThang: ReportDef = {
  code: 'van_ban_theo_thang',
  async run(t, { params }) {
    const months = Number(params.so_thang ?? 12);
    // Đọc lớp 3 qua view security_barrier (MV không chịu RLS — xem db/migrations/002 mục 6).
    const rows = await t.any<{ thang: string; so_van_ban: number }>(
      `WITH m AS (
         SELECT generate_series(
                  date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')) - make_interval(months => $1 - 1),
                  date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')),
                  interval '1 month')::date AS thang)
       SELECT to_char(m.thang, 'MM/YYYY') AS thang, coalesce(sum(v.so_van_ban), 0)::int AS so_van_ban
         FROM m LEFT JOIN v_van_ban_theo_thang v ON v.thang = m.thang
        GROUP BY m.thang ORDER BY m.thang`,
      [months]);
    return {
      columns: [
        { field: 'thang', label: 'Tháng', type: 'string', width: 120 },
        { field: 'so_van_ban', label: 'Số văn bản nhận', type: 'int', width: 160 },
      ],
      rows,
      total_rows: rows.length,
      charts: [{ kind: 'line', title: 'Số văn bản nhận theo tháng', x_field: 'thang', series: [{ field: 'so_van_ban', label: 'Số văn bản' }] }],
      applied: { so_thang: months },
    };
  },
};

// eTask thật trả tên trạng thái/độ ưu tiên tiếng Việt sẵn (spider dịch id→tên, xem docs/etask-api.md).
const STATUS_LABEL = `coalesce(t.trang_thai, 'Không rõ')`;
const PRIORITY_LABEL = `coalesce(t.do_uu_tien, 'Không rõ')`;
const PRIORITY_ORDER = `CASE t.do_uu_tien WHEN 'Rất cao' THEN 0 WHEN 'Cao' THEN 1 WHEN 'Trung bình' THEN 2 WHEN 'Thấp' THEN 3 ELSE 4 END`;

/** Dashboard "Việc của tôi hôm nay" — dữ liệu từ spider etask_viec_cua_toi. */
const viecCuaToiHomNay: ReportDef = {
  code: 'viec_cua_toi_hom_nay',
  async run(t, { params, page, pageSize }) {
    const ngay = typeof params.ngay === 'string' && params.ngay
      ? params.ngay
      : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const done = `t.trang_thai = 'Đã hoàn thành'`;
    const k = await t.one<{ den_han: number; qua_han: number; dang_lam: number; xong: number }>(
      `SELECT count(*) FILTER (WHERE t.han_hoan_thanh = $1::date AND NOT ${done})::int AS den_han,
              count(*) FILTER (WHERE t.han_hoan_thanh < $1::date AND NOT ${done})::int AS qua_han,
              count(*) FILTER (WHERE t.trang_thai = 'Đang thực hiện')::int              AS dang_lam,
              count(*) FILTER (WHERE t.ngay_hoan_thanh = $1::date)::int                  AS xong
         FROM tasks t WHERE t.valid_to IS NULL`, [ngay]);
    // Việc cần chú ý hôm nay: quá hạn, đến hạn hôm nay, hoặc vừa xong hôm nay.
    const where = `t.valid_to IS NULL AND ((t.han_hoan_thanh <= $1::date AND NOT ${done}) OR t.ngay_hoan_thanh = $1::date)`;
    const total = await t.one(`SELECT count(*)::int AS n FROM tasks t WHERE ${where}`, [ngay], (r: { n: number }) => r.n);
    const rows = await t.any(
      `SELECT t.tieu_de, t.nguoi_giao, t.han_hoan_thanh,
              CASE WHEN ${done} THEN 'Đã xong hôm nay'
                   WHEN t.han_hoan_thanh = $1::date THEN 'Đến hạn hôm nay'
                   ELSE 'Quá hạn ' || ($1::date - t.han_hoan_thanh) || ' ngày' END AS tinh_trang,
              ${STATUS_LABEL} AS trang_thai, ${PRIORITY_LABEL} AS do_uu_tien
         FROM tasks t WHERE ${where}
        ORDER BY (${done}), t.han_hoan_thanh, ${PRIORITY_ORDER}, t.tieu_de
        LIMIT $2 OFFSET $3`, [ngay, pageSize, (page - 1) * pageSize]);
    const byStatus = await t.any(
      `SELECT ${STATUS_LABEL} AS trang_thai, count(*)::int AS so_viec FROM tasks t WHERE t.valid_to IS NULL
        GROUP BY 1 ORDER BY so_viec DESC`);
    return {
      tiles: [
        { key: 'qua_han', label: 'Quá hạn', value: k.qua_han, tone: k.qua_han ? 'err' : 'ok' },
        { key: 'den_han', label: 'Đến hạn hôm nay', value: k.den_han, tone: k.den_han ? 'warn' : 'ok' },
        { key: 'dang_lam', label: 'Đang thực hiện', value: k.dang_lam, tone: 'neutral' },
        { key: 'xong', label: 'Đã xong hôm nay', value: k.xong, tone: 'ok' },
      ],
      columns: [
        { field: 'tieu_de', label: 'Công việc', type: 'string', width: 360 },
        { field: 'tinh_trang', label: 'Tình trạng', type: 'string', width: 150 },
        { field: 'han_hoan_thanh', label: 'Hạn hoàn thành', type: 'date', width: 130 },
        { field: 'do_uu_tien', label: 'Ưu tiên', type: 'string', width: 110 },
        { field: 'trang_thai', label: 'Trạng thái', type: 'string', width: 140 },
        { field: 'nguoi_giao', label: 'Người giao', type: 'string', width: 160 },
      ],
      rows,
      total_rows: total,
      charts: [{ kind: 'bar', title: 'Toàn bộ việc theo trạng thái', x_field: 'trang_thai', series: [{ field: 'so_viec', label: 'Số việc' }] }],
      chart_rows: byStatus,
      applied: { ngay },
    };
  },
};

export const REPORTS: Record<string, ReportDef> = Object.fromEntries(
  [vanBanTheoThuMuc, vanBanKetThucTheoPhong, vanBanTheoThang, viecCuaToiHomNay].map((r) => [r.code, r]),
);

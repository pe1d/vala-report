/**
 * Kiểu dữ liệu chung của báo cáo. Mọi báo cáo giờ là báo cáo CẤU HÌNH (report_catalog.definition), quản trị
 * dựng trên cổng — không còn báo cáo viết trong code. Truy vấn do reports/defined.ts ghép từ định nghĩa,
 * chạy bên trong withUserContext trên pool reader ⇒ RLS lọc theo phạm vi.
 */
import type { Scope } from '@vala/core';

export interface Column {
  field: string;
  label: string;
  type: 'string' | 'int' | 'date' | 'money';
  width?: number;
}

/**
 * Kiểu biểu đồ theo việc của số liệu: bar = cột ngang (so sánh hạng mục), column = cột đứng (theo ngày/tháng),
 * line = đường (xu hướng theo thời gian), donut = phần của tổng thể (ít nhóm), heatmap = lịch nhiệt theo ngày.
 */
export type ChartKind = 'bar' | 'column' | 'line' | 'donut' | 'heatmap';

export interface Chart {
  kind: ChartKind;
  title: string;
  x_field: string;
  series: Array<{ field: string; label: string }>;
  /** Khoảng ngày của lịch nhiệt (YYYY-MM-DD). */
  range?: { tu_ngay: string; den_ngay: string };
}

/** Thẻ số liệu. tone chỉ để tô màu, luôn kèm nhãn chữ. */
export interface Tile {
  key: string;
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'err' | 'neutral';
  /** '%' ⇒ tỉ lệ phần trăm (hiện thanh tiến độ); part/whole là tử số/mẫu số. */
  unit?: '%';
  part?: number;
  whole?: number;
  /** Theo tháng: giá trị 12 tháng gần nhất (tháng này ở cuối) và so với tháng trước. */
  trend?: number[];
  delta?: { now: number; before: number; vs: string };
}

export interface ReportInput {
  params: Record<string, unknown>;
  scope: Scope;
  page: number;
  pageSize: number;
  /** Tìm trong bảng (mọi cột đang hiện) — không ảnh hưởng thẻ số liệu và biểu đồ. */
  q?: string;
}

export interface ReportOutput {
  columns: Column[];
  rows: Record<string, unknown>[];
  total_rows: number;
  charts?: Chart[];
  /** Dữ liệu riêng cho biểu đồ khi khác bảng (đủ mọi nhóm, không phân trang). */
  chart_rows?: Record<string, unknown>[];
  /** Thẻ số liệu cho dashboard (view_template = 'tong_hop'). */
  tiles?: Tile[];
  /** Mô tả khoảng dữ liệu thực tế đã áp dụng, để người xem không phải đoán "tháng hiện tại" là tháng nào. */
  applied?: Record<string, unknown>;
}

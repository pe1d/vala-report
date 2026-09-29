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

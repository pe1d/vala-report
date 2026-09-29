import ExcelJS from 'exceljs';
import type { Scope } from '@vala/core';
import type { Freshness } from './freshness.js';
import type { ReportOutput } from './reports/index.js';

const ddmmyyyy = (v: unknown) => {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
};

/** File xuất phải mang dòng "số liệu tính đến…" và độ phủ uỷ quyền, như dashboard. */
export async function toXlsx(title: string, out: ReportOutput, freshness: Freshness, scope: Scope): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vala Reporting';
  const ws = wb.addWorksheet('Báo cáo');
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([freshness.message]);
  if (scope === 'don_vi' && freshness.coverage) ws.addRow([`${freshness.coverage.message} — số liệu có thể chưa đầy đủ`]);
  ws.addRow([]);
  const header = ws.addRow(out.columns.map((c) => c.label));
  header.font = { bold: true };
  out.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(10, Math.round((c.width ?? 120) / 7)); });
  for (const row of out.rows) {
    ws.addRow(out.columns.map((c) => {
      const v = row[c.field];
      if (v === null || v === undefined || v === '') return '–';
      return c.type === 'date' ? ddmmyyyy(v) : v;
    }));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

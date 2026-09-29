import { DASH, fmtDate, fmtInt, type Column } from '../api';
import { Table, Td, Th } from './ui';

function cell(c: Column, v: unknown) {
  if (v === null || v === undefined || v === '') return DASH;   // không để ô rỗng
  if (c.type === 'date') return fmtDate(v);
  if (c.type === 'int' || c.type === 'money') return fmtInt(v);
  return String(v);
}

const isNum = (c: Column) => c.type === 'int' || c.type === 'money';

export function DataTable({ columns, rows }: { columns: Column[]; rows: Record<string, unknown>[] }) {
  return (
    <Table>
      <thead><tr>{columns.map((c) => <Th key={c.field} num={isNum(c)} minWidth={c.width}>{c.label}</Th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
            {columns.map((c) => <Td key={c.field} num={isNum(c)}>{cell(c, r[c.field])}</Td>)}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

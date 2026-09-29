import type { Chart } from '../api';
import { Card } from './ui';

/**
 * Biểu đồ SVG tự vẽ (mục 06): chuỗi thời gian dùng đường, so sánh hạng mục dùng cột ngang,
 * một trục y, tối đa 6 chuỗi, nhãn trục là giá trị thật mà dữ liệu chạm tới.
 * Màu lấy từ class Tailwind (fill-/stroke-) nên tự đổi theo chế độ sáng/tối.
 */
const LABEL = 'fill-slate-500 text-[11px] tabular-nums dark:fill-slate-400';
const AXIS = 'stroke-slate-200 dark:stroke-slate-700';
const MARK_STROKE = 'stroke-blue-700 dark:stroke-blue-400';
const MARK_FILL = 'fill-blue-700 dark:fill-blue-400';

export function ChartView({ chart, rows }: { chart: Chart; rows: Record<string, unknown>[] }) {
  const series = chart.series.slice(0, 6);
  if (!rows.length) return null;
  return (
    <Card className="my-3">
      <figure>
        <figcaption className="mb-2 font-semibold">{chart.title}</figcaption>
        {chart.kind === 'line' ? <Line chart={chart} rows={rows} field={series[0]!.field} /> : <Bars chart={chart} rows={rows} field={series[0]!.field} />}
      </figure>
    </Card>
  );
}

function Line({ chart, rows, field }: { chart: Chart; rows: Record<string, unknown>[]; field: string }) {
  const W = 720, H = 220, L = 40, B = 28, T = 12;
  const vals = rows.map((r) => Number(r[field] ?? 0));
  const max = Math.max(...vals, 0);
  const x = (i: number) => L + (rows.length === 1 ? 0 : (i * (W - L - 12)) / (rows.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (max ? v / max : 0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={chart.title}>
      <line className={AXIS} x1={L} x2={W - 12} y1={y(0)} y2={y(0)} />
      <line className={AXIS} x1={L} x2={W - 12} y1={y(max)} y2={y(max)} strokeDasharray="3 3" />
      <text className={LABEL} x={L - 6} y={y(0) + 4} textAnchor="end">0</text>
      <text className={LABEL} x={L - 6} y={y(max) + 4} textAnchor="end">{max.toLocaleString('vi-VN')}</text>
      <polyline className={MARK_STROKE} fill="none" strokeWidth={2} points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      {vals.map((v, i) => <circle key={i} className={MARK_FILL} cx={x(i)} cy={y(v)} r={3}><title>{`${rows[i]![chart.x_field]}: ${v}`}</title></circle>)}
      {rows.map((r, i) => (i % Math.ceil(rows.length / 8) === 0 || i === rows.length - 1) && (
        <text key={i} className={LABEL} x={x(i)} y={H - 8} textAnchor="middle">{String(r[chart.x_field])}</text>
      ))}
    </svg>
  );
}

/** Thanh ngang: gốc vuông áp sát trục, đầu dữ liệu bo tròn 4px. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w, h / 2);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

function Bars({ chart, rows, field }: { chart: Chart; rows: Record<string, unknown>[]; field: string }) {
  const top = rows.slice(0, 15);
  const max = Math.max(...top.map((r) => Number(r[field] ?? 0)), 1);
  const rowH = 28, L = 190, W = 720;
  return (
    <svg viewBox={`0 0 ${W} ${top.length * rowH + 8}`} width="100%" role="img" aria-label={chart.title}>
      {top.map((r, i) => {
        const v = Number(r[field] ?? 0);
        const w = ((W - L - 60) * v) / max;
        return (
          <g key={i} transform={`translate(0 ${i * rowH + 4})`} className="[&:hover_path]:opacity-80">
            <text className={LABEL} x={L - 8} y={rowH / 2 + 4} textAnchor="end">{String(r[chart.x_field]).slice(0, 28)}</text>
            <title>{`${r[chart.x_field]}: ${v.toLocaleString('vi-VN')}`}</title>
            <rect x={0} y={0} width={W} height={rowH} fill="transparent" />
            <path className={MARK_FILL} d={barPath(L, 5, Math.max(w, 1), rowH - 10)} />
            <text className={LABEL} x={L + w + 6} y={rowH / 2 + 4}>{v.toLocaleString('vi-VN')}</text>
          </g>
        );
      })}
    </svg>
  );
}

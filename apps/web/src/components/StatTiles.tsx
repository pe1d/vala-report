import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { StatTile } from '../api';
import { tooltip } from './Charts';
import { EChart } from './EChart';
import { useCountUp, useViz } from '../viz';
import { locale, messages, useT } from '../i18n';

const M = messages({
  hint: { err: 'Cần xử lý', warn: 'Cần chú ý', ok: 'Ổn', neutral: '' } as Record<StatTile['tone'], string>,
  none: 'Không có',
  delta: (change: string | null, vs: string) => (change === null ? `Bằng ${vs}` : `${change} so với ${vs}`),
  thisMonth: 'Tháng này', monthsAgo: (n: number) => `${n} tháng trước`,
  trendAria: (vals: string) => `Xu hướng 12 tháng: ${vals}`,
}, {
  hint: { err: 'Needs action', warn: 'Needs attention', ok: 'OK', neutral: '' },
  none: 'None',
  delta: (change: string | null, vs: string) => (change === null ? `Same as ${vs}` : `${change} vs ${vs}`),
  thisMonth: 'This month', monthsAgo: (n: number) => `${n} ${n === 1 ? 'month' : 'months'} ago`,
  trendAria: (vals: string) => `12-month trend: ${vals}`,
});

/**
 * Hàng thẻ số liệu (KPI row). Chọn dạng theo việc của con số (skill dataviz):
 * một con số ⇒ giá trị lớn; có xu hướng theo tháng ⇒ kèm sparkline + chênh lệch so với tháng trước;
 * tỉ lệ ⇒ thanh tiến độ. Trạng thái = chấm màu + nhãn chữ, không bao giờ chỉ dùng màu.
 */
const TONE: Record<StatTile['tone'], { dot: string; text: string }> = {
  err: { dot: 'bg-red-600 dark:bg-red-400', text: 'text-red-800 dark:text-red-300' },
  warn: { dot: 'bg-amber-500 dark:bg-amber-400', text: 'text-amber-800 dark:text-amber-300' },
  ok: { dot: 'bg-emerald-600 dark:bg-emerald-400', text: 'text-emerald-800 dark:text-emerald-300' },
  neutral: { dot: 'bg-slate-400 dark:bg-slate-500', text: 'text-slate-600 dark:text-slate-300' },
};
const fmtN = (n: number) => n.toLocaleString(locale());
const COLS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

export function StatTiles({ tiles, className = 'my-3' }: { tiles: StatTile[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${COLS[Math.min(4, Math.max(1, tiles.length))]} ${className}`} role="list">
      {tiles.map((t) => <Tile key={t.key} t={t} />)}
    </div>
  );
}

function Tile({ t }: { t: StatTile }) {
  const m = useT(M);
  const shown = useCountUp(t.value);
  const tone = TONE[t.tone];
  const hint = m.hint[t.tone];
  const pct = t.unit === '%';
  return (
    <div role="listitem" className="flex min-h-[124px] flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">{t.label}</div>
      <div className="mt-1 flex items-end gap-3">
        <div className="text-3xl font-semibold text-slate-900 dark:text-slate-50">{pct ? `${fmtN(Math.round(shown))}%` : fmtN(shown)}</div>
        {t.trend && t.trend.length > 1 && <div className="mb-1 min-w-0 flex-1"><Sparkline values={t.trend} /></div>}
      </div>
      {pct && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950"
          role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.value} aria-label={t.label}>
          <div className="h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out dark:bg-blue-400" style={{ width: `${Math.min(100, shown)}%` }} />
        </div>
      )}
      <div className="mt-auto pt-1 text-xs">
        {t.delta && <Delta {...t.delta} />}
        {pct && t.whole !== undefined && <span className="text-slate-500 dark:text-slate-400">{fmtN(t.part ?? 0)}/{fmtN(t.whole)}</span>}
        {hint && (
          <span className={`flex items-center gap-1.5 font-medium ${tone.text}`}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />{t.tone === 'ok' && t.value === 0 ? m.none : hint}
          </span>
        )}
      </div>
    </div>
  );
}

/** Chênh lệch có dấu so với kỳ trước — màu chữ trung tính (tăng không hẳn tốt hay xấu), mũi tên chỉ hướng. */
function Delta({ now, before, vs }: { now: number; before: number; vs: string }) {
  const t = useT(M);
  const diff = now - before;
  const pct = before ? Math.round((diff / before) * 100) : null;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■';
  return (
    <span className="block text-slate-600 dark:text-slate-300">
      <span aria-hidden>{arrow} </span>
      {t.delta(diff === 0 ? null : `${diff > 0 ? '+' : '−'}${fmtN(Math.abs(diff))}${pct !== null ? ` (${diff > 0 ? '+' : '−'}${Math.abs(pct)}%)` : ''}`, vs)}
    </span>
  );
}

/** Sparkline 12 tháng: màu nhấn nhạt, điểm hiện tại đậm. Không trục, có tooltip. */
function Sparkline({ values }: { values: number[] }) {
  const t = useT(M);
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { left: 2, right: 6, top: 6, bottom: 4 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: values.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: { ...tooltip(v, 'axis'), formatter: (p: Array<{ value: number; dataIndex: number }>) => `${values.length - 1 - p[0]!.dataIndex === 0 ? t.thisMonth : t.monthsAgo(values.length - 1 - p[0]!.dataIndex)}: <b>${fmtN(p[0]!.value)}</b>` },
    series: [{
      type: 'line', data: values.map((x, i) => (i === values.length - 1 ? { value: x, symbolSize: 7, itemStyle: { color: v.series[0] } } : x)),
      showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: v.series[0], opacity: 0.55 },
      areaStyle: { color: v.series[0], opacity: 0.08 }, emphasis: { disabled: true },
    }],
  }), [values, v, t]);
  return <EChart option={option} height={40} label={t.trendAria(values.join(', '))} />;
}

/**
 * Biểu đồ của báo cáo cấu hình (ECharts, SVG). Chọn dạng theo việc của số liệu (skill dataviz):
 * bar = cột ngang (so sánh hạng mục), column = cột đứng (theo ngày/tháng), line = đường (xu hướng),
 * donut = phần của tổng thể (tối đa 3 nhóm + "Khác"), heatmap = lịch nhiệt một màu theo ngày.
 * Một trục y, một chuỗi, màu dữ liệu chỉ cho nét/khối — chữ luôn dùng token chữ.
 */
import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { Chart } from '../api';
import { EChart } from './EChart';
import { Card } from './ui';
import { useViz, type VizTokens } from '../viz';
import { locale, messages, tr, useT } from '../i18n';

type Row = Record<string, unknown>;
const M = messages({
  /** Thứ trong tuần, bắt đầu từ Chủ nhật (Date.getDay). */
  weekday: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  months: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
  unknown: 'Không rõ', other: 'Khác', more: 'Nhiều', less: 'Ít',
  heatmapAria: (title: string, total: number, max: number) => `${title}: tổng ${total}, nhiều nhất ${max} một ngày`,
}, {
  weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  unknown: 'Unknown', other: 'Other', more: 'More', less: 'Less',
  heatmapAria: (title: string, total: number, max: number) => `${title}: total ${total}, at most ${max} in a day`,
});
const fmtN = (n: number) => n.toLocaleString(locale());
/** DD/MM/YYYY ⇒ YYYY-MM-DD (nhãn ngày của báo cáo nhóm theo ngày). */
const isoOf = (s: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : s);
const dayLabel = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return `${tr(M).weekday[d.getDay()]} ${iso.slice(8)}/${iso.slice(5, 7)}`; };
/** Nhãn trục gọn: 09/2026 ⇒ 09/26, 29/09/2026 ⇒ 29/09. */
const shortLabel = (s: string) => (/^\d{2}\/\d{4}$/.test(s) ? `${s.slice(0, 3)}${s.slice(5)}` : /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s.slice(0, 5) : s);

export const tooltip = (v: VizTokens, trigger: 'axis' | 'item') => ({
  trigger, confine: true, backgroundColor: v.surface, borderColor: v.baseline, borderWidth: 1,
  textStyle: { color: v.text, fontFamily: 'inherit', fontSize: 12 }, extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,.12);border-radius:8px;',
  axisPointer: { type: trigger === 'axis' ? 'line' : 'none', lineStyle: { color: v.baseline } },
});
const axisCommon = (v: VizTokens) => ({
  axisLine: { lineStyle: { color: v.baseline } }, axisTick: { show: false },
  axisLabel: { color: v.muted, fontSize: 11, fontFamily: 'inherit' }, splitLine: { lineStyle: { color: v.grid } },
});

/** Biểu đồ trong một thẻ có tiêu đề (trang báo cáo, xem thử). `bare` = chỉ phần vẽ, để khối Tổng quan tự đặt tiêu đề. */
export function ChartView({ chart, rows, bare }: { chart: Chart; rows: Row[]; bare?: boolean }) {
  if (!rows.length) return null;
  const body = <ChartBody chart={chart} rows={rows} />;
  if (bare) return body;
  return (
    <Card className="my-3">
      <figure>
        <figcaption className="mb-2 font-semibold">{chart.title}</figcaption>
        {body}
      </figure>
    </Card>
  );
}

function ChartBody({ chart, rows }: { chart: Chart; rows: Row[] }) {
  const t = useT(M);
  const field = chart.series[0]!.field;
  const name = chart.series[0]!.label;
  const data = rows.map((r) => ({ x: String(r[chart.x_field] ?? t.unknown), y: Number(r[field] ?? 0) }));
  switch (chart.kind) {
    case 'line': return <LineChart data={data} name={name} title={chart.title} />;
    case 'column': return <ColumnChart data={data} name={name} title={chart.title} />;
    case 'donut': return <DonutChart data={data} name={name} title={chart.title} />;
    case 'heatmap': return <DayHeatmap data={data} name={name} title={chart.title} range={chart.range} />;
    default: return <BarChart data={data.slice(0, 15)} name={name} title={chart.title} />;
  }
}

interface P { data: Array<{ x: string; y: number }>; name: string; title: string }
const describe = (title: string, data: P['data']) => `${title}: ${data.slice(0, 40).map((d) => `${d.x} ${d.y}`).join(', ')}`;

function LineChart({ data, name, title }: P) {
  const t = useT(M);
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { left: 36, right: 30, top: 16, bottom: 28 },
    tooltip: { ...tooltip(v, 'axis'), formatter: (p: Array<{ dataIndex: number; value: number }>) => `${data[p[0]!.dataIndex]!.x}<br/>${name}: <b>${fmtN(p[0]!.value)}</b>` },
    xAxis: { type: 'category', boundaryGap: false, data: data.map((d) => shortLabel(d.x)), ...axisCommon(v), splitLine: { show: false } },
    yAxis: { type: 'value', minInterval: 1, ...axisCommon(v), axisLine: { show: false } },
    series: [{
      name, type: 'line', data: data.map((d) => d.y), symbol: 'circle', symbolSize: 8, showSymbol: data.length === 1,
      lineStyle: { width: 2, color: v.series[0] }, itemStyle: { color: v.series[0], borderColor: v.surface, borderWidth: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${v.series[0]}40` }, { offset: 1, color: `${v.series[0]}00` }] } },
      emphasis: { focus: 'series' },
      // Nhãn trực tiếp chỉ ở điểm cuối, không gắn số lên mọi điểm.
      endLabel: { show: true, color: v.text2, fontSize: 11, formatter: (p: { value: number }) => fmtN(p.value) },
    }],
  }), [data, name, v, t]);
  return <EChart option={option} height={240} label={describe(title, data)} />;
}

function ColumnChart({ data, name, title }: P) {
  const t = useT(M);
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => {
    const isDay = data.every((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d.x));
    const label = (x: string) => (isDay ? dayLabel(isoOf(x)) : shortLabel(x));
    return {
      grid: { left: 28, right: 8, top: 16, bottom: 28 },
      tooltip: { ...tooltip(v, 'axis'), axisPointer: { type: 'shadow', shadowStyle: { color: `${v.baseline}33` } },
        formatter: (p: Array<{ dataIndex: number; value: number }>) => `${label(data[p[0]!.dataIndex]!.x)}<br/>${name}: <b>${fmtN(p[0]!.value)}</b>` },
      xAxis: { type: 'category', data: data.map((d) => label(d.x)), ...axisCommon(v), splitLine: { show: false },
        axisLabel: { color: v.muted, fontSize: 10, interval: 'auto', hideOverlap: true, formatter: (s: string) => s.replace(' ', '\n') } },
      yAxis: { type: 'value', minInterval: 1, ...axisCommon(v), axisLine: { show: false } },
      series: [{
        type: 'bar', barMaxWidth: 22, data: data.map((d) => d.y), itemStyle: { color: v.series[0], borderRadius: [4, 4, 0, 0] },
        label: { show: data.length <= 31, position: 'top', color: v.text2, fontSize: 10, formatter: (p: { value: number }) => (p.value ? fmtN(p.value) : '') },
      }],
    };
  }, [data, name, v, t]);
  return <EChart option={option} height={240} label={describe(title, data)} />;
}

function BarChart({ data, name, title }: P) {
  const t = useT(M);
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { left: 8, right: 36, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...tooltip(v, 'item'), formatter: (p: { name: string; value: number }) => `${p.name}<br/>${name}: <b>${fmtN(p.value)}</b>` },
    xAxis: { type: 'value', show: false, minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: data.map((d) => d.x), ...axisCommon(v), axisLine: { show: false },
      axisLabel: { color: v.text2, fontSize: 11, width: 140, overflow: 'truncate', fontFamily: 'inherit' } },
    series: [{
      type: 'bar', data: data.map((d) => d.y), barMaxWidth: 16, barCategoryGap: '35%',
      itemStyle: { color: v.series[0], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: v.text2, fontSize: 11, formatter: (p: { value: number }) => fmtN(p.value) },
      emphasis: { itemStyle: { opacity: 0.85 } },
    }],
  }), [data, name, v, t]);
  return <EChart option={option} height={Math.max(140, data.length * 34)} label={describe(title, data)} />;
}

/** Phần của tổng thể: 3 nhóm lớn nhất giữ màu riêng, phần còn lại gộp "Khác" (xám) — không sinh màu thứ 4. */
function DonutChart({ data, name, title }: P) {
  const t = useT(M);
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => {
    const top = data.slice(0, 3);
    const rest = data.slice(3).reduce((a, d) => a + d.y, 0);
    const slices = [...top.map((d, i) => ({ name: d.x, value: d.y, itemStyle: { color: v.series[i as 0 | 1 | 2] } })),
      ...(rest ? [{ name: t.other, value: rest, itemStyle: { color: v.baseline } }] : [])];
    const total = data.reduce((a, d) => a + d.y, 0);
    return {
      tooltip: { ...tooltip(v, 'item'), formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: <b>${fmtN(p.value)}</b> (${p.percent}%)` },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: v.text2, fontSize: 11 } },
      title: { text: fmtN(total), subtext: name.toLowerCase(), left: 'center', top: '34%', textStyle: { color: v.text, fontSize: 22, fontWeight: 600 }, subtextStyle: { color: v.muted, fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['52%', '74%'], center: ['50%', '42%'], padAngle: 2, avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: v.surface, borderWidth: 2 },
        // Nhãn số trực tiếp: bắt buộc vì màu thứ 3 dưới 3:1 ở chế độ sáng.
        label: { show: true, color: v.text2, fontSize: 11, formatter: (p: { value: number }) => fmtN(p.value) },
        labelLine: { length: 6, length2: 6, lineStyle: { color: v.baseline } },
        data: slices,
      }],
    };
  }, [data, name, v, t]);
  return <EChart option={option} height={260} label={describe(title, data)} />;
}

function DayHeatmap({ data, name, title, range }: P & { range?: Chart['range'] }) {
  const t = useT(M);
  const v = useViz();
  const points = useMemo(() => data.map((d) => [isoOf(d.x), d.y] as [string, number]).filter((p) => p[1] > 0), [data]);
  const option = useMemo<EChartsCoreOption>(() => {
    const iso = points.map((p) => p[0]).sort();
    const today = new Date().toLocaleDateString('sv-SE');
    const tu = range?.tu_ngay ?? iso[0] ?? today;
    const den = range?.den_ngay && range.den_ngay < '2999' ? range.den_ngay : today;
    const max = Math.max(1, ...points.map((p) => p[1]));
    return {
      tooltip: { ...tooltip(v, 'item'), formatter: (p: { value: [string, number] }) => `${dayLabel(p.value[0])}/${p.value[0].slice(0, 4)}<br/>${name}: <b>${fmtN(p.value[1])}</b>` },
      visualMap: {
        min: 0, max, calculable: false, orient: 'horizontal', right: 0, bottom: 0, itemWidth: 10, itemHeight: 80,
        text: [t.more, t.less], textStyle: { color: v.muted, fontSize: 11 }, inRange: { color: v.seq }, outOfRange: { color: v.empty },
      },
      calendar: {
        range: [tu, den], top: 22, left: 34, right: 8, bottom: 36, cellSize: ['auto', 15],
        splitLine: { show: false }, itemStyle: { color: v.empty, borderColor: v.surface, borderWidth: 3 },
        dayLabel: { firstDay: 1, nameMap: t.weekday, color: v.muted, fontSize: 10 },
        monthLabel: { nameMap: t.months, color: v.muted, fontSize: 11 },
        yearLabel: { show: false },
      },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: points, itemStyle: { borderRadius: 3 } }],
    };
  }, [points, name, range, v, t]);
  const total = points.reduce((a, p) => a + p[1], 0);
  return <EChart option={option} height={190} label={t.heatmapAria(title, total, Math.max(0, ...points.map((p) => p[1])))} />;
}

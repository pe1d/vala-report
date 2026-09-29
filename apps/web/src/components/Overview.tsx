/**
 * Phần đầu Tổng quan: thẻ KPI + biểu đồ ECharts, dữ liệu của chính người xem (GET /dashboard/overview).
 * Chọn dạng theo việc của số liệu (skill dataviz): một con số ⇒ thẻ (giá trị + chênh lệch + sparkline);
 * tỉ lệ so với mức tối đa ⇒ thanh tiến độ; theo thời gian ⇒ đường; so sánh hạng mục ⇒ cột ngang;
 * mật độ theo ngày ⇒ lịch nhiệt một màu; phần của tổng thể (3 trạng thái) ⇒ vành khuyên có nhãn số.
 * Một trục y, màu theo thực thể (không theo thứ hạng), chữ luôn dùng token chữ.
 */
import { useMemo, type ReactNode } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart } from './EChart';
import { Badge, Button, Card, Muted, type Tone } from './ui';
import { useCountUp, useViz, type VizTokens } from '../viz';

/** Mỗi hệ thống nguồn có dữ liệu văn bản / công việc (theo cấu hình adapter) là một phần trên Tổng quan. */
export interface DocStats {
  source: SourceInfo; tong: number; thang_nay: number; thang_truoc: number; so_thu_muc: number;
  /** Thẻ theo thư mục — khai trong cấu hình adapter (dashboard.folder_kpis). */
  folder_kpis: Array<{ label: string; value: number; warn: boolean }>;
  by_month: Array<{ thang: string; so: number }>; by_folder: Array<{ thu_muc: string; so: number }>; by_day: Array<{ ngay: string; so: number }>;
}
export interface TaskStats {
  source: SourceInfo; tong: number; qua_han: number; den_han_hom_nay: number; den_han_7: number; dang_lam: number; hoan_thanh: number;
  xong_thang_nay: number; ty_le_hoan_thanh: number | null;
  by_status: Array<{ trang_thai: string; so: number }>; due_next_14: Array<{ ngay: string; so: number }>;
}
export interface OverviewData { today: string; documents: DocStats[]; tasks: TaskStats[] }
export interface SourceInfo { code: string; ten: string; state: string; enabled: boolean }

const STATE_BADGE: Record<string, [Tone, string]> = {
  active: ['ok', 'Đang kết nối'], expired: ['err', 'Phiên hết hạn'], failed: ['err', 'Lỗi đăng nhập'],
  pending: ['warn', 'Chờ đăng nhập'], revoked: ['neutral', 'Chưa kết nối'], chua_cau_hinh: ['neutral', 'Chưa kết nối'],
};
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const fmtN = (n: number) => n.toLocaleString('vi-VN');
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y!.slice(2)}`; };
const dayLabel = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return `${WEEKDAY[d.getDay()]} ${iso.slice(8)}/${iso.slice(5, 7)}`; };

/** Tooltip chung: nền theo chế độ, chữ bằng token chữ. */
const tooltip = (v: VizTokens, trigger: 'axis' | 'item') => ({
  trigger, confine: true, backgroundColor: v.surface, borderColor: v.baseline, borderWidth: 1,
  textStyle: { color: v.text, fontFamily: 'inherit', fontSize: 12 }, extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,.12);border-radius:8px;',
  axisPointer: { type: trigger === 'axis' ? 'line' : 'none', lineStyle: { color: v.baseline } },
});
const axisCommon = (v: VizTokens) => ({
  axisLine: { lineStyle: { color: v.baseline } }, axisTick: { show: false },
  axisLabel: { color: v.muted, fontSize: 11, fontFamily: 'inherit' }, splitLine: { lineStyle: { color: v.grid } },
});

// ---------------------------------------------------------------------------------------------
export function Overview({ data, onConnect, busy }: { data: OverviewData; onConnect: (src: SourceInfo) => void; busy?: string | null }) {
  return (
    <div className="grid gap-6">
      {data.documents.map((d) => <DocSection key={d.source.code} d={d} today={data.today} onConnect={onConnect} busy={busy === d.source.code} />)}
      {data.tasks.map((t) => <TaskSection key={t.source.code} t={t} today={data.today} onConnect={onConnect} busy={busy === t.source.code} />)}
    </div>
  );
}

export function DocSection({ d, today, onConnect, busy, showTitle = true }: { d: DocStats; today: string; onConnect: (s: SourceInfo) => void; busy: boolean; showTitle?: boolean }) {
  return (
    <Section title="Văn bản" source={d.source} hasData={d.tong > 0} onConnect={onConnect} busy={busy} showTitle={showTitle}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Nhận tháng này" value={d.thang_nay} delta={{ now: d.thang_nay, before: d.thang_truoc, vs: 'tháng trước' }}
          trend={d.by_month.map((x) => x.so)} />
        <Kpi label="Tổng văn bản đang có" value={d.tong} hint={`${fmtN(d.so_thu_muc)} thư mục`} />
        {d.folder_kpis.slice(0, 2).map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} status={k.warn ? ['warn', 'Cần xử lý'] : k.value === 0 ? ['ok', 'Không có'] : undefined} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Văn bản nhận theo tháng" sub="12 tháng gần nhất, theo ngày nhận" className="lg:col-span-2">
          <MonthlyLine rows={d.by_month} />
        </ChartCard>
        <ChartCard title="Theo thư mục" sub="Văn bản đang có trong từng thư mục">
          <FolderBars rows={d.by_folder} />
        </ChartCard>
      </div>
      <ChartCard title="Nhịp văn bản đến theo ngày" sub="26 tuần gần nhất — ô càng đậm, càng nhiều văn bản nhận trong ngày">
        <DayHeatmap rows={d.by_day} today={today} />
      </ChartCard>
    </Section>
  );
}

export function TaskSection({ t, today, onConnect, busy, showTitle = true }: { t: TaskStats; today: string; onConnect: (s: SourceInfo) => void; busy: boolean; showTitle?: boolean }) {
  return (
    <Section title="Công việc" source={t.source} hasData={t.tong > 0} onConnect={onConnect} busy={busy} showTitle={showTitle}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Quá hạn" value={t.qua_han} status={t.qua_han ? ['err', 'Cần xử lý ngay'] : ['ok', 'Không có việc quá hạn']} />
        <Kpi label="Đến hạn 7 ngày tới" value={t.den_han_7} hint={t.den_han_hom_nay ? `${fmtN(t.den_han_hom_nay)} việc đến hạn hôm nay` : 'Không có việc đến hạn hôm nay'} />
        <Kpi label="Đang thực hiện" value={t.dang_lam} />
        <Meter label="Tỷ lệ hoàn thành" ratio={t.ty_le_hoan_thanh} detail={`${fmtN(t.hoan_thanh)}/${fmtN(t.tong)} việc · ${fmtN(t.xong_thang_nay)} xong tháng này`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Việc theo trạng thái" sub="Toàn bộ việc hiện có">
          <StatusDonut rows={t.by_status} total={t.tong} />
        </ChartCard>
        <ChartCard title="Việc đến hạn 14 ngày tới" sub="Chưa hoàn thành, theo ngày hạn" className="lg:col-span-2">
          <DueBars rows={t.due_next_14} today={today} />
        </ChartCard>
      </div>
    </Section>
  );
}

function Section({ title, source, hasData, onConnect, busy, showTitle = true, children }: {
  title: string; source: SourceInfo; hasData: boolean; onConnect: (s: SourceInfo) => void; busy?: boolean; showTitle?: boolean; children: ReactNode;
}) {
  const [tone, label] = STATE_BADGE[source.state] ?? ['neutral', source.state];
  const connected = source.state === 'active';
  const needFix = source.state === 'expired' || source.state === 'failed';
  return (
    <section className="grid gap-3" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        {showTitle && <h2 className="text-base font-semibold">{title}</h2>}
        <Muted className="text-sm">{showTitle ? '· ' : ''}{source.ten}</Muted>
        <Badge tone={tone}>{label}</Badge>
        <span className="flex-1" />
        {(!connected || needFix) && source.enabled && (
          <Button variant="primary" disabled={busy} onClick={() => onConnect(source)}>{needFix ? `Kết nối lại ${source.ten}` : `Kết nối ${source.ten}`}</Button>
        )}
      </div>
      {!hasData ? (
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {connected ? 'Đã kết nối — đang chờ lượt lấy dữ liệu đầu tiên.' : 'Kết nối để bắt đầu lấy số liệu tự động.'}
        </p>
      ) : children}
    </section>
  );
}

function ChartCard({ title, sub, className, children }: { title: string; sub?: string; className?: string; children: ReactNode }) {
  return (
    <Card className={className}>
      <figure>
        <figcaption>
          <div className="font-semibold">{title}</div>
          {sub && <Muted className="text-xs">{sub}</Muted>}
        </figcaption>
        <div className="mt-2">{children}</div>
      </figure>
    </Card>
  );
}

// ---- thẻ KPI --------------------------------------------------------------------------------
const STATUS_TEXT: Record<'ok' | 'warn' | 'err', [string, string]> = {
  ok: ['bg-emerald-600 dark:bg-emerald-400', 'text-emerald-800 dark:text-emerald-300'],
  warn: ['bg-amber-500 dark:bg-amber-400', 'text-amber-800 dark:text-amber-300'],
  err: ['bg-red-600 dark:bg-red-400', 'text-red-800 dark:text-red-300'],
};

function Kpi({ label, value, delta, trend, status, hint }: {
  label: string; value: number; delta?: { now: number; before: number; vs: string }; trend?: number[];
  status?: ['ok' | 'warn' | 'err', string]; hint?: string;
}) {
  const shown = useCountUp(value);
  return (
    <div className="flex min-h-[124px] flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 flex items-end gap-3">
        <div className="text-3xl font-semibold text-slate-900 dark:text-slate-50">{fmtN(shown)}</div>
        {trend && trend.length > 1 && <div className="mb-1 min-w-0 flex-1"><Sparkline values={trend} /></div>}
      </div>
      <div className="mt-auto pt-1 text-xs">
        {delta && <Delta {...delta} />}
        {status && (
          <span className={`flex items-center gap-1.5 font-medium ${STATUS_TEXT[status[0]][1]}`}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_TEXT[status[0]][0]}`} />{status[1]}
          </span>
        )}
        {hint && <span className="text-slate-500 dark:text-slate-400">{hint}</span>}
      </div>
    </div>
  );
}

/** Chênh lệch có dấu so với kỳ trước. Số văn bản tăng không tốt cũng không xấu ⇒ màu chữ trung tính, mũi tên chỉ hướng. */
function Delta({ now, before, vs }: { now: number; before: number; vs: string }) {
  const diff = now - before;
  const pct = before ? Math.round((diff / before) * 100) : null;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■';
  return (
    <span className="text-slate-600 dark:text-slate-300">
      <span aria-hidden>{arrow} </span>
      {diff === 0 ? 'Bằng' : `${diff > 0 ? '+' : '−'}${fmtN(Math.abs(diff))}${pct !== null ? ` (${diff > 0 ? '+' : '−'}${Math.abs(pct)}%)` : ''} so với`} {vs}
    </span>
  );
}

/** Sparkline 12 điểm: màu nhấn nhạt, điểm hiện tại đậm. Không trục, có tooltip. */
function Sparkline({ values }: { values: number[] }) {
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { left: 2, right: 6, top: 6, bottom: 4 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: values.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: { ...tooltip(v, 'axis'), formatter: (p: Array<{ value: number; dataIndex: number }>) => `${values.length - 1 - p[0]!.dataIndex === 0 ? 'Tháng này' : `${values.length - 1 - p[0]!.dataIndex} tháng trước`}: <b>${fmtN(p[0]!.value)}</b>` },
    series: [{
      type: 'line', data: values.map((x, i) => (i === values.length - 1 ? { value: x, symbolSize: 7, itemStyle: { color: v.series[0] } } : x)),
      showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: v.series[0], opacity: 0.55 },
      areaStyle: { color: v.series[0], opacity: 0.08 }, emphasis: { disabled: true },
    }],
  }), [values, v]);
  return <EChart option={option} height={40} label={`Xu hướng 12 tháng: ${values.join(', ')}`} />;
}

/** Tỉ lệ so với 100%: thanh tiến độ; rãnh là bước nhạt của cùng màu. Mức thấp ⇒ màu cảnh báo, luôn kèm chữ. */
function Meter({ label, ratio, detail }: { label: string; ratio: number | null; detail: string }) {
  const pct = ratio === null ? null : Math.round(ratio * 100);
  const shown = useCountUp(pct ?? 0);
  const level = pct === null ? null : pct >= 70 ? ['bg-blue-600 dark:bg-blue-400', 'bg-blue-100 dark:bg-blue-950', ''] as const
    : pct >= 40 ? ['bg-amber-500 dark:bg-amber-400', 'bg-amber-100 dark:bg-amber-950', 'Dưới mức 70%'] as const
    : ['bg-red-600 dark:bg-red-400', 'bg-red-100 dark:bg-red-950', 'Thấp — dưới 40%'] as const;
  return (
    <div className="flex min-h-[124px] flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-slate-900 dark:text-slate-50">{pct === null ? '–' : `${shown}%`}</div>
      <div className={`mt-2 h-2 w-full overflow-hidden rounded-full ${level?.[1] ?? 'bg-slate-100 dark:bg-slate-800'}`}
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={label}>
        <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${level?.[0] ?? ''}`} style={{ width: `${shown}%` }} />
      </div>
      <div className="mt-auto pt-1 text-xs text-slate-500 dark:text-slate-400">{level?.[2] ? `${level[2]} · ` : ''}{detail}</div>
    </div>
  );
}

// ---- biểu đồ ----------------------------------------------------------------------------------
function MonthlyLine({ rows }: { rows: Array<{ thang: string; so: number }> }) {
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { left: 36, right: 30, top: 16, bottom: 28 },
    tooltip: { ...tooltip(v, 'axis'), formatter: (p: Array<{ axisValue: string; value: number }>) => `Tháng ${p[0]!.axisValue}<br/>Văn bản nhận: <b>${fmtN(p[0]!.value)}</b>` },
    xAxis: { type: 'category', boundaryGap: false, data: rows.map((r) => monthLabel(r.thang)), ...axisCommon(v), splitLine: { show: false } },
    yAxis: { type: 'value', minInterval: 1, ...axisCommon(v), axisLine: { show: false } },
    series: [{
      name: 'Văn bản nhận', type: 'line', data: rows.map((r) => r.so), symbol: 'circle', symbolSize: 8, showSymbol: false,
      lineStyle: { width: 2, color: v.series[0] }, itemStyle: { color: v.series[0], borderColor: v.surface, borderWidth: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${v.series[0]}40` }, { offset: 1, color: `${v.series[0]}00` }] } },
      emphasis: { focus: 'series' },
      // Nhãn trực tiếp chỉ ở điểm cuối (tháng này), không gắn số lên mọi điểm.
      endLabel: { show: true, color: v.text2, fontSize: 11, formatter: (p: { value: number }) => fmtN(p.value) },
    }],
  }), [rows, v]);
  return <EChart option={option} height={240} label={`Văn bản nhận theo tháng: ${rows.map((r) => `${monthLabel(r.thang)} ${r.so}`).join(', ')}`} />;
}

function FolderBars({ rows }: { rows: Array<{ thu_muc: string; so: number }> }) {
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { left: 8, right: 36, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...tooltip(v, 'item'), formatter: (p: { name: string; value: number }) => `${p.name}<br/><b>${fmtN(p.value)}</b> văn bản` },
    xAxis: { type: 'value', show: false, minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.thu_muc), ...axisCommon(v), axisLine: { show: false },
      axisLabel: { color: v.text2, fontSize: 11, width: 120, overflow: 'truncate', fontFamily: 'inherit' } },
    series: [{
      type: 'bar', data: rows.map((r) => r.so), barMaxWidth: 16, barCategoryGap: '35%',
      itemStyle: { color: v.series[0], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: v.text2, fontSize: 11, formatter: (p: { value: number }) => fmtN(p.value) },
      emphasis: { itemStyle: { opacity: 0.85 } },
    }],
  }), [rows, v]);
  return <EChart option={option} height={Math.max(160, rows.length * 34)} label={`Văn bản theo thư mục: ${rows.map((r) => `${r.thu_muc} ${r.so}`).join(', ')}`} />;
}

function DayHeatmap({ rows, today }: { rows: Array<{ ngay: string; so: number }>; today: string }) {
  const v = useViz();
  const start = useMemo(() => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - 181); return d.toLocaleDateString('sv-SE'); }, [today]);
  const max = Math.max(1, ...rows.map((r) => r.so));
  const option = useMemo<EChartsCoreOption>(() => ({
    tooltip: { ...tooltip(v, 'item'), formatter: (p: { value: [string, number] }) => `${dayLabel(p.value[0])}/${p.value[0].slice(0, 4)}<br/><b>${fmtN(p.value[1])}</b> văn bản nhận` },
    visualMap: {
      min: 0, max, calculable: false, orient: 'horizontal', right: 0, bottom: 0, itemWidth: 10, itemHeight: 80,
      text: ['Nhiều', 'Ít'], textStyle: { color: v.muted, fontSize: 11 }, inRange: { color: v.seq }, outOfRange: { color: v.empty },
    },
    calendar: {
      range: [start, today], top: 22, left: 34, right: 8, bottom: 36, cellSize: ['auto', 15],
      splitLine: { show: false }, itemStyle: { color: v.empty, borderColor: v.surface, borderWidth: 3 },
      dayLabel: { firstDay: 1, nameMap: WEEKDAY, color: v.muted, fontSize: 10 },
      monthLabel: { nameMap: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'], color: v.muted, fontSize: 11 },
      yearLabel: { show: false },
    },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: rows.filter((r) => r.so > 0).map((r) => [r.ngay, r.so]),
      itemStyle: { borderRadius: 3 } }],
  }), [rows, v, start, today, max]);
  const total = rows.reduce((a, r) => a + r.so, 0);
  return <EChart option={option} height={190} label={`${total} văn bản nhận trong 26 tuần, nhiều nhất ${max} văn bản một ngày`} />;
}

function StatusDonut({ rows, total }: { rows: Array<{ trang_thai: string; so: number }>; total: number }) {
  const v = useViz();
  // Màu theo thực thể (trạng thái), cố định thứ tự — không theo thứ hạng.
  const ORDER = ['Chưa bắt đầu', 'Đang thực hiện', 'Hoàn thành'];
  const color = (name: string) => v.series[Math.max(0, ORDER.indexOf(name)) as 0 | 1 | 2];
  const option = useMemo<EChartsCoreOption>(() => ({
    tooltip: { ...tooltip(v, 'item'), formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: <b>${fmtN(p.value)}</b> việc (${p.percent}%)` },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: v.text2, fontSize: 11 } },
    title: { text: fmtN(total), subtext: 'việc', left: 'center', top: '34%', textStyle: { color: v.text, fontSize: 22, fontWeight: 600 }, subtextStyle: { color: v.muted, fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['52%', '74%'], center: ['50%', '42%'], padAngle: 2, avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: v.surface, borderWidth: 2 },
      // Nhãn số trực tiếp: bắt buộc vì màu thứ 3 dưới 3:1 ở chế độ sáng (quy tắc "relief").
      label: { show: true, color: v.text2, fontSize: 11, formatter: (p: { value: number }) => fmtN(p.value) },
      labelLine: { length: 6, length2: 6, lineStyle: { color: v.baseline } },
      data: rows.map((r) => ({ name: r.trang_thai, value: r.so, itemStyle: { color: color(r.trang_thai) } })),
    }],
  }), [rows, v, total]);
  return <EChart option={option} height={240} label={`Việc theo trạng thái: ${rows.map((r) => `${r.trang_thai} ${r.so}`).join(', ')}`} />;
}

function DueBars({ rows, today }: { rows: Array<{ ngay: string; so: number }>; today: string }) {
  const v = useViz();
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { left: 28, right: 8, top: 16, bottom: 28 },
    tooltip: { ...tooltip(v, 'axis'), axisPointer: { type: 'shadow', shadowStyle: { color: `${v.baseline}33` } },
      formatter: (p: Array<{ dataIndex: number; value: number }>) => `${dayLabel(rows[p[0]!.dataIndex]!.ngay)}${rows[p[0]!.dataIndex]!.ngay === today ? ' (hôm nay)' : ''}<br/>Đến hạn: <b>${fmtN(p[0]!.value)}</b> việc` },
    xAxis: { type: 'category', data: rows.map((r) => (r.ngay === today ? 'Hôm nay' : dayLabel(r.ngay))), ...axisCommon(v), splitLine: { show: false },
      axisLabel: { color: v.muted, fontSize: 10, interval: 'auto', hideOverlap: true, formatter: (s: string) => s.replace(' ', '\n') } },
    yAxis: { type: 'value', minInterval: 1, ...axisCommon(v), axisLine: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 22,
      data: rows.map((r) => ({ value: r.so, itemStyle: { color: v.series[0], opacity: r.ngay === today ? 1 : 0.75, borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: 'top', color: v.text2, fontSize: 10, formatter: (p: { value: number }) => (p.value ? fmtN(p.value) : '') },
    }],
  }), [rows, v, today]);
  return <EChart option={option} height={240} label={`Việc đến hạn 14 ngày tới: ${rows.map((r) => `${r.ngay} ${r.so}`).join(', ')}`} />;
}

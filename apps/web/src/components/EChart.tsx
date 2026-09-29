import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import {
  AriaComponent, CalendarComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { prefersReducedMotion } from '../viz';

// Chỉ nạp đúng phần cần dùng để bundle nhỏ.
echarts.use([LineChart, BarChart, PieChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent,
  CalendarComponent, VisualMapComponent, MarkLineComponent, TitleComponent, AriaComponent, SVGRenderer]);

/**
 * Khung ECharts: SVG (nét, đổi màu theo chế độ sáng/tối khi option đổi), tự co giãn theo khung chứa,
 * có hiệu ứng xuất hiện — tắt nếu người dùng chọn giảm chuyển động. `label` là mô tả cho trình đọc màn hình.
 */
export function EChart({ option, height, label }: { option: EChartsCoreOption; height: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'svg' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    chart.current?.setOption({
      animation: !reduce, animationDuration: 900, animationEasing: 'cubicOut', animationDurationUpdate: 500,
      aria: { enabled: true, label: { description: label } },
      ...option,
    }, { notMerge: true });
  }, [option, label]);

  return <div ref={el} role="img" aria-label={label} style={{ height, width: '100%' }} />;
}

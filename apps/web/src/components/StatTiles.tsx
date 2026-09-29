import type { StatTile } from '../api';

/**
 * Hàng thẻ số liệu (KPI row). Trạng thái = chấm màu + nhãn chữ, không bao giờ chỉ dùng màu.
 * Số lớn dùng chữ số tỉ lệ (không tabular-nums) cho dễ đọc ở cỡ lớn.
 */
const TONE: Record<StatTile['tone'], { dot: string; text: string; hint: string }> = {
  err: { dot: 'bg-red-600 dark:bg-red-400', text: 'text-red-800 dark:text-red-300', hint: 'Cần xử lý' },
  warn: { dot: 'bg-amber-500 dark:bg-amber-400', text: 'text-amber-800 dark:text-amber-300', hint: 'Chú ý' },
  ok: { dot: 'bg-emerald-600 dark:bg-emerald-400', text: 'text-emerald-800 dark:text-emerald-300', hint: 'Tốt' },
  neutral: { dot: 'bg-slate-400 dark:bg-slate-500', text: 'text-slate-600 dark:text-slate-300', hint: '' },
};

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="my-3 grid grid-cols-2 gap-3 lg:grid-cols-4" role="list">
      {tiles.map((t) => {
        const tone = TONE[t.tone];
        return (
          <div key={t.key} role="listitem"
            className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-500 dark:text-slate-400">{t.label}</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900 dark:text-slate-50">{t.value.toLocaleString('vi-VN')}</div>
            {tone.hint && (
              <div className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
                <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />{tone.hint}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { CronExpressionParser } from 'cron-parser';

export const TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Preset lịch — thứ duy nhất người dùng chọn ở bản 1 (không nhận cron thô).
 * Cron ở đây phải khớp core.crawl_tasks; test khẳng định điều đó.
 */
export const SCHEDULE_PRESETS = {
  hang_ngay_07: { label: 'Hàng ngày lúc 07:00', cron: '0 7 * * *' },
  hang_tuan_t2_08: { label: 'Thứ Hai hàng tuần lúc 08:00', cron: '0 8 * * 1' },
  hang_thang_ngay1_08: { label: 'Ngày 1 hàng tháng lúc 08:00', cron: '0 8 1 * *' },
  moi_2h_gio_hanh_chinh: { label: 'Mỗi 2 giờ trong giờ hành chính (T2–T6)', cron: '0 8-18/2 * * 1-5' },
} as const;

export type SchedulePreset = keyof typeof SCHEDULE_PRESETS;

export function isPreset(v: unknown): v is SchedulePreset {
  return typeof v === 'string' && v in SCHEDULE_PRESETS;
}

export function nextRuns(preset: SchedulePreset, count = 1, from = new Date()): Date[] {
  const it = CronExpressionParser.parse(SCHEDULE_PRESETS[preset].cron, { currentDate: from, tz: TIMEZONE });
  return Array.from({ length: count }, () => it.next().toDate());
}

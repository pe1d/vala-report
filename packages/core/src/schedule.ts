/**
 * Lịch do người dùng tự đặt — dạng CÓ CẤU TRÚC (không nhận cron thô): hàng ngày, theo thứ, hàng tháng,
 * nhiều lần trong ngày, hoặc một lần. Máy chủ tự tính các lần chạy theo giờ Việt Nam (UTC+7, không đổi giờ).
 *
 * Rào chắn chống quá tải / khoá tài khoản nguồn nằm ngay trong định nghĩa: các giờ trong ngày cách nhau
 * tối thiểu MIN_GAP_MINUTES, lặp lại tối thiểu mỗi giờ, hẹn một lần chỉ trong tương lai gần.
 */
import { z } from 'zod';
import { Problem } from './errors.js';

export const MIN_GAP_MINUTES = 60;
const VN_OFFSET_MS = 7 * 3600_000;
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM');
const DOW = z.number().int().min(1).max(7);          // 1 = Thứ Hai … 7 = Chủ nhật
const Times = z.array(HHMM).min(1, 'Cần ít nhất một giờ chạy').max(6, 'Tối đa 6 giờ mỗi ngày');

export const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hang_ngay'), times: Times }),
  z.object({ kind: z.literal('hang_tuan'), days: z.array(DOW).min(1, 'Chọn ít nhất một ngày trong tuần').max(7), times: Times }),
  z.object({
    kind: z.literal('hang_thang'),
    /** 1..31; -1 = ngày cuối tháng. Tháng không có ngày 29–31 thì bỏ qua ngày đó. */
    days_of_month: z.array(z.number().int().refine((d) => d === -1 || (d >= 1 && d <= 31), 'Ngày trong tháng không hợp lệ'))
      .min(1, 'Chọn ít nhất một ngày trong tháng').max(10, 'Tối đa 10 ngày mỗi tháng'),
    times: Times,
  }),
  z.object({
    kind: z.literal('lap_lai'),
    every_hours: z.number().int().min(1, 'Lặp lại tối thiểu mỗi 1 giờ').max(12),
    from: HHMM, to: HHMM,
    days: z.array(DOW).min(1, 'Chọn ít nhất một ngày trong tuần').max(7),
  }),
  /** Một lần, giờ Việt Nam dạng YYYY-MM-DDTHH:MM. Chạy xong lịch tự tắt. */
  z.object({ kind: z.literal('mot_lan'), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Thời điểm không hợp lệ') }),
]);
export type Schedule = z.infer<typeof ScheduleSchema>;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const uniqSorted = <T>(xs: T[], cmp: (a: T, b: T) => number) => [...new Set(xs)].sort(cmp);

/** Giờ chạy trong một ngày (phút tính từ 0h). */
function dayTimes(s: Exclude<Schedule, { kind: 'mot_lan' }>): number[] {
  if (s.kind !== 'lap_lai') return s.times.map(minutes);
  const out: number[] = [];
  for (let m = minutes(s.from); m <= minutes(s.to); m += s.every_hours * 60) out.push(m);
  return out;
}

/**
 * Kiểm tra + chuẩn hoá (bỏ trùng, sắp xếp). Lỗi ⇒ Problem invalid_params nói rõ bằng tiếng Việt.
 * `now` để kiểm tra lịch một lần phải ở tương lai (≤ 60 ngày).
 */
export function parseSchedule(raw: unknown, now = new Date()): Schedule {
  const p = ScheduleSchema.safeParse(raw);
  if (!p.success) throw new Problem('invalid_params', 'Lịch chưa hợp lệ', p.error.issues[0]!.message);
  const s = p.data;
  const bad = (detail: string) => new Problem('invalid_params', 'Lịch chưa hợp lệ', detail);
  if (s.kind === 'mot_lan') {
    const at = localToUtc(s.at);
    if (at.getTime() <= now.getTime() + 60_000) throw bad('Thời điểm hẹn phải ở tương lai');
    if (at.getTime() > now.getTime() + 60 * 86_400_000) throw bad('Chỉ hẹn trước tối đa 60 ngày');
    return s;
  }
  if ('times' in s) s.times = uniqSorted(s.times, (a, b) => minutes(a) - minutes(b));
  if ('days' in s) s.days = uniqSorted(s.days, (a, b) => a - b);
  if (s.kind === 'hang_thang') s.days_of_month = uniqSorted(s.days_of_month, (a, b) => (a === -1 ? 99 : a) - (b === -1 ? 99 : b));
  if (s.kind === 'lap_lai' && minutes(s.from) >= minutes(s.to)) throw bad('Giờ bắt đầu phải trước giờ kết thúc');
  const ts = dayTimes(s);
  for (let i = 1; i < ts.length; i++) {
    if (ts[i]! - ts[i - 1]! < MIN_GAP_MINUTES) throw bad(`Các giờ chạy phải cách nhau ít nhất ${MIN_GAP_MINUTES} phút (${hhmm(ts[i - 1]!)} và ${hhmm(ts[i]!)})`);
  }
  return s;
}

/** "YYYY-MM-DDTHH:MM" giờ Việt Nam ⇒ Date (UTC). */
export function localToUtc(local: string): Date {
  const [d, t] = local.split('T') as [string, string];
  const [y, mo, da] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, da, 0, minutes(t)) - VN_OFFSET_MS);
}

/** Các lần chạy tới (sau `from`), tối đa `count` lần, tìm trong 400 ngày. */
export function nextScheduleRuns(s: Schedule, count = 1, from = new Date()): Date[] {
  if (s.kind === 'mot_lan') {
    const at = localToUtc(s.at);
    return at > from ? [at] : [];
  }
  const out: Date[] = [];
  const times = dayTimes(s);
  const vnNow = new Date(from.getTime() + VN_OFFSET_MS);
  for (let off = 0; off <= 400 && out.length < count; off++) {
    const day = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate() + off));
    const dow = ((day.getUTCDay() + 6) % 7) + 1;   // 1 = T2 … 7 = CN
    const dom = day.getUTCDate();
    const lastDom = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
    const match = s.kind === 'hang_ngay' ? true
      : s.kind === 'hang_thang' ? s.days_of_month.some((d) => d === dom || (d === -1 && dom === lastDom))
      : s.days.includes(dow);
    if (!match) continue;
    for (const m of times) {
      const at = new Date(day.getTime() + m * 60_000 - VN_OFFSET_MS);
      if (at > from) { out.push(at); if (out.length >= count) break; }
    }
  }
  return out;
}

const DOW_LABEL = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DOW_FULL = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
/** "T2–T6", "T2, T4, T6", "cả tuần". */
function daysLabel(days: number[]): string {
  if (days.length === 7) return 'cả tuần';
  const contiguous = days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  return contiguous ? `${DOW_LABEL[days[0]!]}–${DOW_LABEL[days.at(-1)!]}` : days.map((d) => DOW_LABEL[d]).join(', ');
}
const timesLabel = (ts: string[]) => ts.join(', ');

/** Mô tả lịch bằng tiếng Việt cho người dùng. */
export function describeSchedule(s: Schedule): string {
  switch (s.kind) {
    case 'hang_ngay': return `Hàng ngày lúc ${timesLabel(s.times)}`;
    case 'hang_tuan': return s.days.length === 7 ? `Hàng ngày lúc ${timesLabel(s.times)}`
      : s.days.length === 1 ? `${DOW_FULL[s.days[0]!]} hàng tuần lúc ${timesLabel(s.times)}`
      : `${daysLabel(s.days)} lúc ${timesLabel(s.times)}`;
    case 'hang_thang': {
      const ds = s.days_of_month.map((d) => (d === -1 ? 'cuối tháng' : String(d)));
      return `Ngày ${ds.join(', ')} hàng tháng lúc ${timesLabel(s.times)}`;
    }
    case 'lap_lai': return `Mỗi ${s.every_hours} giờ từ ${s.from} đến ${s.to}, ${daysLabel(s.days)}`;
    case 'mot_lan': return `Một lần lúc ${s.at.slice(11)} ${s.at.slice(8, 10)}/${s.at.slice(5, 7)}/${s.at.slice(0, 4)}`;
  }
}

/** Mẫu chọn nhanh trên form (thay cho 4 preset cố định trước đây — các preset cũ đổi sang đúng các mẫu này). */
export const SCHEDULE_TEMPLATES: Array<{ code: string; schedule: Schedule }> = [
  { code: 'hang_ngay_07', schedule: { kind: 'hang_ngay', times: ['07:00'] } },
  { code: 'ngay_lam_viec_sang_chieu', schedule: { kind: 'hang_tuan', days: [1, 2, 3, 4, 5], times: ['07:30', '13:30'] } },
  { code: 'moi_2h_gio_hanh_chinh', schedule: { kind: 'lap_lai', every_hours: 2, from: '08:00', to: '18:00', days: [1, 2, 3, 4, 5] } },
  { code: 'hang_tuan_t2_08', schedule: { kind: 'hang_tuan', days: [1], times: ['08:00'] } },
  { code: 'hang_thang_ngay1_08', schedule: { kind: 'hang_thang', days_of_month: [1], times: ['08:00'] } },
];

/**
 * Rải giờ chạy để không dồn mọi người vào đúng một phút: lệch cố định 0…4 phút SAU giờ đặt, theo mã lịch
 * (không bao giờ chạy trước giờ người dùng hẹn). Người dùng vẫn thấy giờ đã đặt; chỉ worker dùng độ lệch này.
 */
export const JITTER_SQL = `make_interval(mins => ((ds.id * 37) % 5)::int)`;   // ds = data_schedules
export const jitterMinutes = (scheduleId: number) => (scheduleId * 37) % 5;

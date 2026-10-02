/**
 * Đặt lịch tự chọn — kiểu hẹn giờ: hàng ngày, theo thứ, hàng tháng, nhiều lần trong ngày, hoặc một lần.
 * Người dùng không thấy cron. Máy chủ kiểm tra lịch (giờ cách nhau ≥ 60 phút, hẹn một lần phải ở tương lai…)
 * và trả mô tả + 5 lần chạy tới để xem trước ngay khi chỉnh.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ApiProblem, api, fmtDateTime, targetOf, type DataSource, type Preset, type Schedule, type SchedulePreview } from '../api';
import { ErrorBox } from './States';
import { Button, Input, Muted, Select } from './ui';

type Kind = Schedule['kind'];
const KINDS: Array<[Kind, string]> = [
  ['hang_ngay', 'Hàng ngày'], ['hang_tuan', 'Theo thứ'], ['hang_thang', 'Hàng tháng'], ['lap_lai', 'Nhiều lần trong ngày'], ['mot_lan', 'Một lần'],
];
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WORKDAYS = [1, 2, 3, 4, 5];

/** Giờ Việt Nam hiện tại dạng "YYYY-MM-DD HH:MM". */
const vnNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 16);
const vnAt = (msFromNow: number) => new Date(Date.now() + msFromNow).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 16).replace(' ', 'T');
const tomorrow = () => vnAt(86_400_000).slice(0, 10);
/** Làm tròn lên bội số 5 phút. */
const roundUp5 = (local: string) => {
  const [d, t] = local.split('T') as [string, string];
  const m = Math.ceil((Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))) / 5) * 5;
  if (m >= 24 * 60) return `${d}T23:55`;
  return `${d}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Đổi kiểu lịch, giữ lại giờ / ngày đã chọn nếu dùng được. */
function switchKind(cur: Schedule, kind: Kind): Schedule {
  const times = 'times' in cur ? cur.times : cur.kind === 'lap_lai' ? [cur.from] : ['07:00'];
  const days = 'days' in cur ? cur.days : WORKDAYS;
  switch (kind) {
    case 'hang_ngay': return { kind, times };
    case 'hang_tuan': return { kind, days, times };
    case 'hang_thang': return { kind, days_of_month: [1], times };
    case 'lap_lai': return { kind, every_hours: 2, from: '08:00', to: '18:00', days };
    case 'mot_lan': return { kind, at: `${tomorrow()}T${times[0] ?? '07:00'}` };
  }
}

export const DEFAULT_SCHEDULE: Schedule = { kind: 'hang_tuan', days: WORKDAYS, times: ['07:30'] };

/** Bộ chỉnh lịch (có kiểm soát) + xem trước từ máy chủ. `onValid` báo lịch hiện tại có lưu được không. */
export function ScheduleEditor({ value, onChange, onValid }: { value: Schedule; onChange: (s: Schedule) => void; onValid?: (ok: boolean) => void }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { api.get<Preset[]>('/presets').then(setPresets, () => setPresets([])); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      api.post<SchedulePreview>('/schedules/preview', { schedule: value })
        .then((p) => { setPreview(p); setProblem(null); onValid?.(true); })
        .catch((e) => { setPreview(null); setProblem(e instanceof ApiProblem ? e.detail ?? e.title : 'Không kiểm tra được lịch'); onValid?.(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-4">
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Chọn nhanh:</span>
          {presets.map((p) => (
            <button key={p.code} type="button" onClick={() => onChange(p.schedule)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-300">
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div role="radiogroup" aria-label="Kiểu lịch" className="inline-flex flex-wrap gap-1 self-start rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={value.kind === k} onClick={() => value.kind !== k && onChange(switchKind(value, k))}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${value.kind === k
              ? 'bg-white font-semibold text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>{label}</button>
        ))}
      </div>

      {value.kind === 'hang_tuan' && <Row label="Vào các ngày"><DaysPicker days={value.days} onChange={(days) => onChange({ ...value, days })} /></Row>}
      {value.kind === 'hang_thang' && <Row label="Vào ngày"><MonthDays days={value.days_of_month} onChange={(days_of_month) => onChange({ ...value, days_of_month })} /></Row>}
      {'times' in value && <Row label="Lúc"><TimesEditor times={value.times} onChange={(times) => onChange({ ...value, times } as Schedule)} /></Row>}
      {value.kind === 'lap_lai' && (
        <>
          <Row label="Lặp lại">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>mỗi</span>
              <Select aria-label="Số giờ giữa hai lần" className="!min-w-0 w-20" value={value.every_hours} onChange={(e) => onChange({ ...value, every_hours: Number(e.target.value) })}>
                {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
              <span>giờ, từ</span>
              <Input aria-label="Từ giờ" type="time" step={300} className="!min-w-0 w-32" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
              <span>đến</span>
              <Input aria-label="Đến giờ" type="time" step={300} className="!min-w-0 w-32" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
            </div>
          </Row>
          <Row label="Vào các ngày"><DaysPicker days={value.days} onChange={(days) => onChange({ ...value, days })} /></Row>
        </>
      )}
      {value.kind === 'mot_lan' && (
        <Row label="Vào lúc">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Ngày" type="date" className="!min-w-0 w-40" min={vnNow().slice(0, 10)} value={value.at.slice(0, 10)}
              onChange={(e) => e.target.value && onChange({ kind: 'mot_lan', at: `${e.target.value}T${value.at.slice(11)}` })} />
            <Input aria-label="Giờ" type="time" step={300} className="!min-w-0 w-32" value={value.at.slice(11)}
              onChange={(e) => e.target.value && onChange({ kind: 'mot_lan', at: `${value.at.slice(0, 10)}T${e.target.value}` })} />
            <span className="text-sm text-slate-500 dark:text-slate-400">hoặc</span>
            <Button onClick={() => onChange({ kind: 'mot_lan', at: roundUp5(vnAt(30 * 60_000)) })}>Sau 30 phút</Button>
            <Button onClick={() => onChange({ kind: 'mot_lan', at: `${tomorrow()}T07:00` })}>Sáng mai 07:00</Button>
          </div>
        </Row>
      )}

      <div aria-live="polite" className={`rounded-md border px-3 py-2.5 text-sm ${problem
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}>
        {problem ? <>Chưa lưu được: {problem}</> : preview ? (
          <>
            <div className="font-medium text-slate-900 dark:text-slate-100">{preview.label}</div>
            <div className="mt-1">
              {preview.next_runs.length
                ? <>Sẽ chạy: <span className="tabular-nums">{preview.next_runs.map(fmtDateTime).join(' · ')}</span></>
                : 'Không có lần chạy nào sắp tới.'}
            </div>
          </>
        ) : 'Đang kiểm tra lịch…'}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[110px_1fr] sm:items-center">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <div>{children}</div>
    </div>
  );
}

const toggleCls = (on: boolean) => `h-9 min-w-[2.5rem] rounded-md border px-2 text-sm tabular-nums transition-colors ${on
  ? 'border-blue-600 bg-blue-600 font-semibold text-white dark:border-blue-500 dark:bg-blue-500'
  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`;

function DaysPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const toggle = (d: number) => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DOW.map((label, i) => (
        <button key={label} type="button" aria-pressed={days.includes(i + 1)} onClick={() => toggle(i + 1)} className={toggleCls(days.includes(i + 1))}>{label}</button>
      ))}
      <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>
      <button type="button" className="text-sm text-blue-700 hover:underline dark:text-blue-400" onClick={() => onChange(WORKDAYS)}>Ngày làm việc</button>
      <button type="button" className="text-sm text-blue-700 hover:underline dark:text-blue-400" onClick={() => onChange([1, 2, 3, 4, 5, 6, 7])}>Cả tuần</button>
    </div>
  );
}

function MonthDays({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const toggle = (d: number) => onChange(days.includes(d) ? days.filter((x) => x !== d) : days.length >= 10 ? days : [...days, d]);
  return (
    <div className="grid max-w-md grid-cols-7 gap-1.5">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <button key={d} type="button" aria-pressed={days.includes(d)} aria-label={`Ngày ${d}`} onClick={() => toggle(d)} className={toggleCls(days.includes(d))}>{d}</button>
      ))}
      <button type="button" aria-pressed={days.includes(-1)} onClick={() => toggle(-1)} className={`col-span-4 ${toggleCls(days.includes(-1))}`}>Cuối tháng</button>
      <p className="col-span-7 text-xs text-slate-500 dark:text-slate-400">Tháng không có ngày 29–31 thì bỏ qua ngày đó; muốn luôn chạy cuối tháng hãy chọn “Cuối tháng”.</p>
    </div>
  );
}

function TimesEditor({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const add = () => {
    const last = times.at(-1) ?? '07:00';
    const m = Math.min(23 * 60, Number(last.slice(0, 2)) * 60 + Number(last.slice(3, 5)) + 120);
    onChange([...times, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`]);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {times.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <Input aria-label={`Giờ chạy ${i + 1}`} type="time" step={300} className="!min-w-0 w-32" value={t}
            onChange={(e) => e.target.value && onChange(times.map((x, j) => (j === i ? e.target.value : x)))} />
          {times.length > 1 && (
            <button type="button" aria-label={`Bỏ giờ ${t}`} onClick={() => onChange(times.filter((_, j) => j !== i))}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800">✕</button>
          )}
        </span>
      ))}
      {times.length < 6 && <Button onClick={add}>+ Thêm giờ</Button>}
    </div>
  );
}

/**
 * Đặt / sửa lịch tự cập nhật cho một NGUỒN DỮ LIỆU (dùng ở trang Lịch cập nhật và trang báo cáo). Nói rõ lịch áp dụng
 * cho mọi báo cáo dùng nguồn đó. Lưu ⇒ lịch bật (kể cả lịch một lần đã chạy xong).
 */
export function ScheduleDialog({ source, onClose, onSaved }: { source: DataSource; onClose: () => void; onSaved: (d: DataSource) => void }) {
  const [schedule, setSchedule] = useState<Schedule>(source.schedule?.schedule ?? DEFAULT_SCHEDULE);
  const [valid, setValid] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setErr(null);
    try { onSaved(await api.put<DataSource>('/data-schedules', { ...targetOf(source), schedule })); }
    catch (e) { setErr(e); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="dat-lich"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="mx-auto mt-10 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4">
          <h2 id="dat-lich" className="text-base font-semibold">{source.schedule ? 'Sửa lịch cập nhật' : 'Đặt lịch cập nhật'}: {source.ten}</h2>
          <Muted className="text-sm">
            {source.schedule ? `Đang là: ${source.schedule.schedule_label}. ` : ''}
            Mỗi lần chạy lấy lại dữ liệu {source.source_ten} của bạn và làm mới số liệu cho {source.reports.length
              ? <><b>{source.reports.length} báo cáo</b>: {source.reports.map((r) => r.ten).join(', ')}.</>
              : 'các báo cáo dùng nguồn này.'}
          </Muted>
        </div>
        <ScheduleEditor value={schedule} onChange={setSchedule} onValid={setValid} />
        {err ? <div className="mt-3"><ErrorBox error={err} /></div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={saving || !valid} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu lịch'}</Button>
        </div>
      </div>
    </div>
  );
}

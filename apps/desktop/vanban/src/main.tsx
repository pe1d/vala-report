/**
 * Giao diện Văn bản chung của Vala Desktop (docs/van-ban-chung.md): MỘT giao diện cho mọi phần mềm văn bản — vẽ theo
 * những gì phiên dịch (gói kịch bản, thao tác vb_*) khai báo: menu đủ như hệ thống gốc (mục chưa phiên dịch ⇒ mở đúng
 * trang đó của hệ thống), bộ lọc, trường riêng, thao tác xử lý, form tạo văn bản. Dữ liệu đi qua preload `valaVanBan`
 * (vanban-page.ts). Ngôn ngữ + sáng/tối theo lựa chọn của app.
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { locale, messages, setLang, useLang, useT, type Lang } from '@vala/ui/i18n';
import { setTheme, type ThemeMode } from '@vala/ui/theme';
import { Badge, Banner, Button, Skeleton } from '@vala/ui/ui';
import type { ChiTiet, DanhSach, Dem, Dong, Hop, LoaiTao, MauTao, TepGui, ThaoTac, ThongTin, Truong } from '../../src/vanban-model';
import './index.css';

type Res<T> = { ok: true; result: T } | { ok: false; error: string; code?: string };
interface Bridge {
  state(): Promise<{ lang: Lang; theme: ThemeMode; key: string; label: string }>;
  run<T>(name: string, args: Record<string, unknown>): Promise<Res<T>>;
  goc(on?: boolean, url?: string): Promise<void>;
  onPrefs(cb: (p: { lang: Lang; theme: ThemeMode }) => void): void;
  onGocLoaded(cb: () => void): void;
}
const bridge = (window as unknown as { valaVanBan: Bridge }).valaVanBan;
const applyPrefs = (p: { lang: Lang; theme: ThemeMode }) => { setLang(p.lang, true); setTheme(p.theme, true); document.documentElement.lang = p.lang; };
bridge.onPrefs(applyPrefs);

const M = messages({
  search: 'Tìm theo số ký hiệu, trích yếu', original: 'Trang gốc', originalTitle: 'Mở trang của hệ thống (đăng nhập, việc giao diện này chưa làm được)',
  menu: 'Danh mục', onOriginal: 'Mở trên trang gốc', create: 'Tạo văn bản', refresh: 'Tải lại (R)',
  total: (n: number) => `${n} văn bản`, page: (a: number, b: number) => `Trang ${a}/${b}`, prev: 'Trang trước', next: 'Trang sau',
  empty: 'Mục này chưa có văn bản.', emptySearch: 'Không có văn bản khớp tìm kiếm / bộ lọc.',
  needLogin: (s: string) => `Bạn chưa đăng nhập ${s}. Đăng nhập trên trang gốc, xong quay lại đây.`, openLogin: 'Mở trang gốc để đăng nhập',
  notReady: 'Trang gốc của hệ thống chưa tải xong.', retry: 'Thử lại', failed: 'Hệ thống báo lỗi',
  pick: 'Chọn một văn bản để xem chi tiết.', keys: 'Phím tắt: ↑ ↓ chọn văn bản · / tìm · N tạo văn bản · R tải lại', close: 'Đóng',
  fSo: 'Số ký hiệu', fCoQuan: 'Cơ quan ban hành', fNgay: 'Ngày', fHan: 'Hạn xử lý', fTrangThai: 'Trạng thái', fNguoi: 'Người xử lý',
  fLoai: 'Loại văn bản', fDoKhan: 'Độ khẩn', fNoiNhan: 'Nơi nhận', more: 'Thông tin khác',
  content: 'Nội dung', files: 'Tệp đính kèm', history: 'Quá trình xử lý', save: 'Tải về', open: 'Mở', saved: (p: string) => `Đã lưu ${p}`,
  downloading: 'Đang tải — xem tiến độ ở nút Tải xuống trên cùng (Ctrl+J).',
  preparing: 'Đang lấy tệp từ hệ thống…', opening: 'Đang mở…', saveAs: 'Lưu thành…', previewOpened: 'Đã mở xem trước ở tab mới — bấm Tải về / Lưu thành… trên đầu trang để lưu.',
  fileFailed: 'Không tải được tệp này. Bấm thử lại; vẫn lỗi thì bấm "Trang gốc" để tải trên hệ thống.',
  overdue: (n: number) => `Quá hạn ${n} ngày`, dueToday: 'Hạn hôm nay', dueIn: (n: number) => `Còn ${n} ngày`, unread: 'Chưa đọc',
  cancel: 'Huỷ', confirm: 'Xác nhận', required: (f: string) => `Chưa điền ${f}`, tooBig: (f: string) => `${f}: tệp quá lớn (tối đa 25 MB mỗi lần gửi)`,
  filter: 'Lọc', none: 'Chưa chọn', all: 'Tất cả',
  noActions: 'Văn bản này không có thao tác nào làm được ở đây. Việc khác làm trên trang gốc.',
  drop: 'Kéo tệp vào đây hoặc bấm để chọn', remove: 'Bỏ tệp', creating: 'Đang gửi sang hệ thống…', created: 'Đã tạo văn bản',
}, {
  search: 'Search by number or summary', original: 'Original page', originalTitle: "Open the system's own page (sign in, things this view can't do yet)",
  menu: 'Menu', onOriginal: 'Opens on the original page', create: 'New document', refresh: 'Refresh (R)',
  total: (n: number) => `${n} documents`, page: (a: number, b: number) => `Page ${a} of ${b}`, prev: 'Previous page', next: 'Next page',
  empty: 'No documents here yet.', emptySearch: 'No documents match your search or filters.',
  needLogin: (s: string) => `You're not signed in to ${s}. Sign in on the original page, then come back.`, openLogin: 'Open the original page to sign in',
  notReady: "The system's original page hasn't finished loading.", retry: 'Try again', failed: 'The system reported an error',
  pick: 'Select a document to see its details.', keys: 'Shortcuts: ↑ ↓ select · / search · N new document · R refresh', close: 'Close',
  fSo: 'Number', fCoQuan: 'Issued by', fNgay: 'Date', fHan: 'Due', fTrangThai: 'Status', fNguoi: 'Handled by',
  fLoai: 'Type', fDoKhan: 'Urgency', fNoiNhan: 'Recipients', more: 'Other details',
  content: 'Content', files: 'Attachments', history: 'Processing history', save: 'Download', open: 'Open', saved: (p: string) => `Saved ${p}`,
  downloading: 'Downloading — see progress on the Downloads button at the top (Ctrl+J).',
  preparing: 'Getting the file from the system…', opening: 'Opening…', saveAs: 'Save as…', previewOpened: 'Opened a preview in a new tab — click Download / Save as… at the top to save it.',
  fileFailed: 'Could not download this file. Try again; if it still fails, click "Original page" and download it there.',
  overdue: (n: number) => `${n} days overdue`, dueToday: 'Due today', dueIn: (n: number) => `${n} days left`, unread: 'Unread',
  cancel: 'Cancel', confirm: 'Confirm', required: (f: string) => `${f} is required`, tooBig: (f: string) => `${f}: files too large (25 MB per send)`,
  filter: 'Filter', none: 'Nothing selected', all: 'All',
  noActions: "There's nothing you can do with this document here. Use the original page for other tasks.",
  drop: 'Drop files here or click to choose', remove: 'Remove file', creating: 'Sending to the system…', created: 'Document created',
});
type T = (typeof M)['vi'];

/** Lỗi của phiên dịch ⇒ có mã (het_phien, chua_san_sang…) để hiện đúng hướng dẫn. */
class VbError extends Error { constructor(msg: string, public code?: string) { super(msg); } }
async function call<R>(name: string, args: Record<string, unknown> = {}): Promise<R> {
  const r = await bridge.run<R>(name, args);
  if (!r.ok) throw new VbError(r.error, r.code);
  return r.result;
}

// ---- ngày, hạn xử lý ----
const DAY = 86_400_000;
const parseDay = (s?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
function fmtDate(s: string | undefined, lang: Lang) {
  const d = parseDay(s);
  if (!d) return s ?? '';
  const time = /\d{2}:\d{2}$/.exec(s ?? '')?.[0];
  return d.toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' }) + (time ? ` ${time}` : '');
}
function due(han: string | undefined, t: T): { tone: 'err' | 'warn' | 'neutral'; text: string } | null {
  const d = parseDay(han);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - today.getTime()) / DAY);
  if (n < 0) return { tone: 'err', text: t.overdue(-n) };
  if (n === 0) return { tone: 'warn', text: t.dueToday };
  return { tone: n <= 3 ? 'warn' : 'neutral', text: t.dueIn(n) };
}
const urgent = (s?: string) => !!s && /khẩn|hỏa|hoả|urgent/i.test(s);
const finished = (s?: string) => !!s && /kết thúc|phát hành|đã xử lý|hoàn thành|done|closed/i.test(s);
const typing = (e: KeyboardEvent) => { const el = e.target as HTMLElement; return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable; };

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const I = {
  plus: 'M12 5v14M5 12h14', refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6', ext: 'M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5',
  close: 'M18 6L6 18M6 6l12 12', file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  chev: 'M6 9l6 6 6-6', upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
};

// ---- lỗi theo mã ----
function Problem({ err, system, onRetry, t }: { err: unknown; system: string; onRetry: () => void; t: T }) {
  const e = err instanceof VbError ? err : new VbError(String((err as Error)?.message ?? err));
  if (e.code === 'het_phien') {
    return (
      <Banner tone="warn" role="alert">
        <span>{t.needLogin(system)}</span>
        <Button variant="primary" onClick={() => void bridge.goc(true)}>{t.openLogin}</Button>
      </Banner>
    );
  }
  return (
    <Banner tone="err" role="alert">
      <span>{e.code === 'chua_san_sang' ? t.notReady : `${t.failed}: ${e.message}`}</span>
      <Button onClick={onRetry}>{t.retry}</Button>
    </Banner>
  );
}

// ---- trường form (thao tác xử lý, bộ lọc, tạo văn bản) — vẽ theo khai báo của phiên dịch ----
type Val = string | string[] | TepGui[];
const INPUT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const empty = (f: Truong): Val => (f.loai === 'tep' || (f.loai === 'chon' && f.nhieu) ? [] : '');
/** Giá trị ban đầu của form: giá trị mặc định phiên dịch khai (như form gốc), không có thì rỗng. */
const initial = (f: Truong): Val => (f.mac_dinh === undefined || f.loai === 'tep' ? empty(f) : f.nhieu ? [f.mac_dinh].flat() : Array.isArray(f.mac_dinh) ? f.mac_dinh[0] ?? '' : f.mac_dinh);
const isEmpty = (v: Val | undefined) => (Array.isArray(v) ? !v.length : !v);

const readFile = (f: File) => new Promise<TepGui>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok({ ten: f.name, loai: f.type || 'application/octet-stream', base64: String(r.result).replace(/^data:[^,]*,/, '') });
  r.onerror = () => fail(r.error);
  r.readAsDataURL(f);
});
const kb = (b64: string) => { const n = Math.round(b64.length * 0.75); return n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; };

function FileField({ f, value, onChange, t }: { f: Truong; value: TepGui[]; onChange: (v: TepGui[]) => void; t: T }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = await Promise.all(Array.from(list).map(readFile));
    onChange(f.nhieu ? [...value, ...files] : files.slice(0, 1));
  };
  return (
    <div>
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm ${over
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-slate-800 dark:text-blue-300' : 'border-slate-300 text-slate-500 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400'}`}>
        <Icon d={I.upload} />{t.drop}
      </button>
      <input ref={input} type="file" multiple={!!f.nhieu} hidden onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      {value.length > 0 && (
        <ul className="mt-2 space-y-1">
          {value.map((x, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm dark:bg-slate-800">
              <Icon d={I.file} size={14} /><span className="min-w-0 flex-1 truncate">{x.ten}</span>
              <span className="text-[12px] text-slate-500">{kb(x.base64)}</span>
              <button type="button" aria-label={t.remove} onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-0.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"><Icon d={I.close} size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldInput({ f, value, onChange, t, compact }: { f: Truong; value: Val; onChange: (v: Val) => void; t: T; compact?: boolean }) {
  const [q, setQ] = useState('');
  if (f.loai === 'tep') return <FileField f={f} value={value as TepGui[]} onChange={onChange} t={t} />;
  if (f.loai === 'doan') return <textarea className={`${INPUT} min-h-[96px]`} placeholder={f.goi_y} value={value as string} onChange={(e) => onChange(e.target.value)} />;
  if (f.loai === 'ngay') return <input type="date" aria-label={f.ten} className={INPUT} value={value as string} onChange={(e) => onChange(e.target.value)} />;
  if (f.loai === 'chon' && (!f.nhieu || compact)) {
    return (
      <select className={INPUT} aria-label={f.ten} value={Array.isArray(value) ? (value[0] as string | undefined) ?? '' : value} onChange={(e) => onChange(compact && f.nhieu ? (e.target.value ? [e.target.value] : []) : e.target.value)}>
        <option value="">{compact ? `${f.ten}: ${t.all}` : t.none}</option>
        {f.lua_chon?.map((o) => <option key={o.ma} value={o.ma}>{o.ten}</option>)}
      </select>
    );
  }
  if (f.loai === 'chon') {
    const sel = new Set(value as string[]);
    const list = (f.lua_chon ?? []).filter((o) => !q || o.ten.toLowerCase().includes(q.toLowerCase()));
    return (
      <div className="rounded-lg border border-slate-300 dark:border-slate-700">
        {(f.lua_chon?.length ?? 0) > 8 && (
          <input className="w-full rounded-t-lg border-b border-slate-200 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-slate-700" placeholder={t.filter} value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        <div className="max-h-52 overflow-y-auto p-1">
          {list.map((o) => (
            <label key={o.ma} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <input type="checkbox" checked={sel.has(o.ma)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(o.ma); else n.delete(o.ma); onChange([...n]); }} />
              <span>{o.ten}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  return <input className={INPUT} aria-label={f.ten} placeholder={compact ? f.ten : f.goi_y} value={value as string} onChange={(e) => onChange(e.target.value)} />;
}

/** Form theo `truong`: kiểm bắt buộc + dung lượng tệp trước khi gửi. */
function useForm(truong: Truong[]) {
  const [v, setV] = useState<Record<string, Val>>(() => Object.fromEntries(truong.map((f) => [f.ma, initial(f)])));
  const check = (t: T): string => {
    const miss = truong.find((f) => f.bat_buoc && isEmpty(v[f.ma]));
    if (miss) return t.required(miss.ten);
    const bytes = truong.filter((f) => f.loai === 'tep').reduce((n, f) => n + (v[f.ma] as TepGui[]).reduce((m, x) => m + x.base64.length, 0), 0);
    if (bytes > 34_000_000) return t.tooBig(truong.find((f) => f.loai === 'tep')!.ten);
    return '';
  };
  const fields = (t: T) => truong.map((f) => (
    <div key={f.ma}>
      <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">{f.ten}{f.bat_buoc && <span className="text-red-600"> *</span>}</div>
      <FieldInput f={f} value={v[f.ma]!} onChange={(x) => setV((o) => ({ ...o, [f.ma]: x }))} t={t} />
    </div>
  ));
  return { v, check, fields };
}

function ActionDialog({ id, tt, onDone, onClose, t }: { id: string; tt: ThaoTac; onDone: (msg: string) => void; onClose: () => void; t: T }) {
  const form = useForm(tt.truong);
  const [step, setStep] = useState<'form' | 'confirm' | 'busy'>('form');
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(); }, []);
  const send = async () => {
    setStep('busy'); setErr('');
    try { const r = await call<{ thong_bao?: string }>('vb_thuc_hien', { id, thao_tac: tt.ma, ...form.v }); onDone(r.thong_bao || tt.ten); } catch (e) { setErr((e as Error).message); setStep('form'); }
  };
  const next = () => { const m = form.check(t); if (m) { setErr(m); return; } if (tt.xac_nhan && step === 'form') setStep('confirm'); else void send(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={tt.ten}
      onKeyDown={(e) => { if (e.key === 'Escape' && step !== 'busy') onClose(); }}>
      <div ref={box} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{tt.ten}</h2>
        {step === 'confirm' ? <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{tt.xac_nhan}</p> : <div className="mt-4 space-y-3">{form.fields(t)}</div>}
        {err && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={step === 'confirm' ? () => setStep('form') : onClose} disabled={step === 'busy'}>{t.cancel}</Button>
          <Button variant="primary" onClick={next} disabled={step === 'busy'}>{step === 'confirm' ? t.confirm : tt.ten}</Button>
        </div>
      </div>
    </div>
  );
}

// ---- tạo văn bản (form do phiên dịch khai: vb_mau_tao ⇒ vb_tao) ----
function Compose({ loai, system, onClose, onCreated, t }: { loai: LoaiTao; system: string; onClose: () => void; onCreated: (id: string | undefined, msg: string) => void; t: T }) {
  const [mau, setMau] = useState<MauTao | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const load = useCallback(() => { setErr(null); setMau(null); call<MauTao>('vb_mau_tao', { loai: loai.ma }).then(setMau, setErr); }, [loai.ma]);
  useEffect(load, [load]);
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={loai.ten}>
      <div className="flex items-center gap-2 px-6 pb-2 pt-4">
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-slate-900 dark:text-white">{mau?.ten || loai.ten}</h2>
        <button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon d={I.close} size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {err ? <Problem err={err} system={system} onRetry={load} t={t} /> : !mau ? <div className="space-y-3 pt-2">{[70, 90, 60].map((w) => <Skeleton key={w} width={`${w}%`} />)}</div>
          : <ComposeForm loai={loai.ma} mau={mau} onClose={onClose} onCreated={onCreated} t={t} />}
      </div>
    </section>
  );
}
function ComposeForm({ loai, mau, onClose, onCreated, t }: { loai: string; mau: MauTao; onClose: () => void; onCreated: (id: string | undefined, msg: string) => void; t: T }) {
  const form = useForm(mau.truong);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    const m = form.check(t);
    if (m) { setErr(m); return; }
    setBusy(true); setErr('');
    try { const r = await call<{ id?: string; thong_bao?: string }>('vb_tao', { loai, ...form.v }); onCreated(r.id, r.thong_bao || t.created); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <div className="space-y-4 pt-2">{form.fields(t)}</div>
      {err && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{err}</p>}
      <div className="mt-6 flex items-center justify-end gap-2">
        {busy && <span className="mr-auto text-sm text-slate-500">{t.creating}</span>}
        <Button onClick={onClose} disabled={busy}>{t.cancel}</Button>
        <Button variant="primary" onClick={() => void send()} disabled={busy}>{t.create}</Button>
      </div>
    </>
  );
}

// ---- chi tiết ----
function Meta({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[12px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{children}</div>
    </div>
  );
}

function Detail({ id, system, onClose, onChanged, flash, t, lang }: { id: string; system: string; onClose: () => void; onChanged: () => void; flash: string; t: T; lang: Lang }) {
  const [ct, setCt] = useState<ChiTiet | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [act, setAct] = useState<ThaoTac | null>(null);
  const [note, setNote] = useState(flash);
  const load = useCallback(() => { setErr(null); setCt(null); call<ChiTiet>('vb_chi_tiet', { id }).then(setCt, setErr); }, [id]);
  useEffect(() => { setNote(flash); load(); }, [load, flash]);
  /** Trạng thái tải của từng tệp, hiện ngay dòng tệp đó: đang lấy (vòng xoay) / đã bắt đầu tải / đã lưu / lỗi. */
  const [fileSt, setFileSt] = useState<Record<string, { kind: 'busy' | 'ok' | 'err'; text: string; detail?: string }>>({});
  /** cach: xem (PDF / ảnh — xem ngay trong app), mo (mở bằng ứng dụng của máy), tai (thư mục Tải về), luu_thanh (hỏi nơi lưu). */
  const file = async (tep: string, cach: 'xem' | 'mo' | 'tai' | 'luu_thanh') => {
    if (fileSt[tep]?.kind === 'busy') return;
    setFileSt((m) => ({ ...m, [tep]: { kind: 'busy', text: cach === 'xem' || cach === 'mo' ? t.opening : t.preparing } }));
    const r = await bridge.run<never>('vb_tep', { id, tep, cach, mo: cach === 'mo' }) as { ok: boolean; error?: string; saved?: string; dang_tai?: boolean; dang_xem?: boolean };
    // Bấm Huỷ ở hộp chọn nơi lưu (lỗi rỗng) ⇒ không báo gì.
    if (!r.ok && !r.error) { setFileSt((m) => { const n = { ...m }; delete n[tep]; return n; }); return; }
    setFileSt((m) => ({ ...m, [tep]: r.ok
      ? { kind: 'ok', text: r.dang_xem ? t.previewOpened : r.dang_tai ? t.downloading : r.saved ? t.saved(r.saved) : '' }
      : { kind: 'err', text: t.fileFailed, detail: r.error } }));
  };
  /** PDF / ảnh ⇒ "Mở" xem ngay trong app; loại khác ⇒ mở bằng ứng dụng của máy (Word, Excel…). */
  const viewable = (ten: string) => /\.(pdf|png|jpe?g|gif|webp|bmp)$/i.test(ten.trim());
  const h = ct && !finished(ct.trang_thai) ? due(ct.han_xu_ly, t) : null;
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={ct?.trich_yeu}>
      <div className="flex items-center justify-end px-4 pt-3">
        <button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon d={I.close} size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {err ? <Problem err={err} system={system} onRetry={load} t={t} /> : !ct ? <div className="space-y-3 pt-2">{[80, 95, 60, 70].map((w) => <Skeleton key={w} width={`${w}%`} />)}</div> : (
          <>
            {/* Đầu công văn: cơ quan ban hành + số ký hiệu; trích yếu là tiêu đề. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">{ct.co_quan || system}</div>
              {ct.so_ky_hieu && <div className="text-[13px] text-slate-600 dark:text-slate-400">{t.fSo}: <span className="font-semibold text-slate-900 dark:text-white">{ct.so_ky_hieu}</span></div>}
            </div>
            <h1 className="mt-4 text-[19px] font-semibold leading-snug text-slate-900 dark:text-white">
              {urgent(ct.do_khan) && <span className="mr-2 rounded bg-red-600 px-1.5 py-0.5 align-middle text-[12px] font-semibold text-white">{ct.do_khan}</span>}
              {ct.trich_yeu}
            </h1>
            {h && <div className="mt-2"><Badge tone={h.tone}>{h.text}</Badge></div>}
            {note && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{note}</p>}

            {ct.thao_tac.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {ct.thao_tac.map((a, i) => <Button key={a.ma} variant={i === 0 ? 'primary' : 'default'} onClick={() => setAct(a)}>{a.ten}</Button>)}
              </div>
            ) : <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">{t.noActions}</p>}

            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3">
              {ct.ngay && <Meta label={t.fNgay}>{fmtDate(ct.ngay, lang)}</Meta>}
              {ct.han_xu_ly && <Meta label={t.fHan}>{fmtDate(ct.han_xu_ly, lang)}</Meta>}
              {ct.trang_thai && <Meta label={t.fTrangThai}>{ct.trang_thai}</Meta>}
              {ct.loai && <Meta label={t.fLoai}>{ct.loai}</Meta>}
              {ct.do_khan && <Meta label={t.fDoKhan}>{ct.do_khan}</Meta>}
              {ct.nguoi_xu_ly && <Meta label={t.fNguoi}>{ct.nguoi_xu_ly}</Meta>}
              {ct.noi_nhan && <Meta label={t.fNoiNhan} wide>{ct.noi_nhan}</Meta>}
            </div>

            {ct.noi_dung && (
              <>
                <h2 className="mt-7 text-sm font-semibold text-slate-900 dark:text-white">{t.content}</h2>
                <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">{ct.noi_dung}</p>
              </>
            )}

            {ct.tep.length > 0 && (
              <>
                <h2 className="mt-7 text-sm font-semibold text-slate-900 dark:text-white">{t.files}</h2>
                <ul className="mt-2 space-y-1">
                  {ct.tep.map((f, i) => {
                    const st = f.id ? fileSt[f.id] : undefined;
                    const busy = st?.kind === 'busy';
                    return (
                      <li key={f.id ?? i} className={`rounded-lg border px-3 py-2 text-sm ${st?.kind === 'err' ? 'border-red-200 dark:border-red-900' : 'border-slate-200 dark:border-slate-800'}`}>
                        <div className="flex items-center gap-3">
                          <span className="shrink-0 text-slate-500"><Icon d={I.file} /></span>
                          <span className="min-w-0 flex-1 truncate">{f.ten}</span>
                          {f.kich_thuoc && <span className="text-[12px] text-slate-500">{f.kich_thuoc}</span>}
                          {f.id && <>
                            <button type="button" disabled={busy} onClick={() => void file(f.id!, viewable(f.ten) ? 'xem' : 'mo')} className="text-[13px] font-medium text-blue-700 hover:underline disabled:opacity-40 dark:text-blue-400">{t.open}</button>
                            <button type="button" disabled={busy} onClick={() => void file(f.id!, 'tai')} className="text-[13px] font-medium text-blue-700 hover:underline disabled:opacity-40 dark:text-blue-400">{t.save}</button>
                            <button type="button" disabled={busy} onClick={() => void file(f.id!, 'luu_thanh')} className="text-[13px] font-medium text-slate-600 hover:underline disabled:opacity-40 dark:text-slate-400">{t.saveAs}</button>
                          </>}
                        </div>
                        {st?.text && (
                          <div role="status" title={st.detail} className={`mt-1.5 flex items-center gap-2 pl-8 text-[12px] ${st.kind === 'err' ? 'text-red-700 dark:text-red-400' : st.kind === 'busy' ? 'text-slate-500 dark:text-slate-400' : 'text-blue-700 dark:text-blue-300'}`}>
                            {busy && <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
                            {st.kind === 'ok' && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current" aria-hidden="true" />}
                            <span>{st.text}{st.kind === 'err' && st.detail ? <span className="ml-1 text-slate-500 dark:text-slate-400">({st.detail})</span> : null}</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {ct.them.length > 0 && (
              <>
                <h2 className="mt-7 text-sm font-semibold text-slate-900 dark:text-white">{t.more}</h2>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3">{ct.them.map((x, i) => <Meta key={i} label={x.ten} wide={x.gia_tri.length > 40}>{x.gia_tri}</Meta>)}</div>
              </>
            )}

            {ct.qua_trinh.length > 0 && (
              <>
                <h2 className="mt-7 text-sm font-semibold text-slate-900 dark:text-white">{t.history}</h2>
                <ol className="mt-3 border-l border-slate-200 pl-4 dark:border-slate-800">
                  {ct.qua_trinh.map((q, i) => (
                    <li key={i} className="relative pb-4 last:pb-0">
                      <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400 dark:border-slate-950" />
                      <div className="text-[12px] text-slate-500 dark:text-slate-400">{[fmtDate(q.luc, lang), q.nguoi].filter(Boolean).join(', ')}</div>
                      <div className="text-sm text-slate-800 dark:text-slate-200">{q.viec}</div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>
      {act && ct && <ActionDialog id={ct.id} tt={act} t={t} onClose={() => setAct(null)} onDone={(msg) => { setAct(null); setNote(msg); load(); onChanged(); }} />}
    </section>
  );
}

// ---- danh sách ----
function Row({ d, active, onOpen, t, lang }: { d: Dong; active: boolean; onOpen: () => void; t: T; lang: Lang }) {
  const h = finished(d.trang_thai) ? null : due(d.han_xu_ly, t);
  return (
    <li>
      <button type="button" data-row={d.id} onClick={onOpen} aria-current={active || undefined}
        className={`flex w-full gap-3 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active
          ? 'bg-blue-50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
        <span aria-label={d.da_doc === false ? t.unread : undefined} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.da_doc === false ? 'bg-blue-600 dark:bg-blue-400' : 'bg-transparent'}`} />
        <span className="min-w-0 flex-1">
          <span className={`line-clamp-2 text-[14px] leading-snug ${d.da_doc === false ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-100'}`}>
            {urgent(d.do_khan) && <span className="mr-1.5 rounded bg-red-600 px-1 py-px text-[11px] font-semibold text-white">{d.do_khan}</span>}
            {d.trich_yeu}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            {d.so_ky_hieu && <span className="font-medium text-slate-700 dark:text-slate-300">{d.so_ky_hieu}</span>}
            {d.co_quan && <span className="truncate">{d.co_quan}</span>}
            {d.loai && <span>{d.loai}</span>}
            {d.ngay && <span>{fmtDate(d.ngay, lang)}</span>}
            {d.nguoi_xu_ly && <span className="truncate">{d.nguoi_xu_ly}</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {h && <Badge tone={h.tone}>{h.text}</Badge>}
          {d.trang_thai && <span className="text-[12px] text-slate-500 dark:text-slate-400">{d.trang_thai}</span>}
        </span>
      </button>
    </li>
  );
}

// ---- menu bên trái ----
function Nav({ info, dem, hop, onPick, onCreate, t }: { info: ThongTin; dem: Dem; hop: string; onPick: (h: Hop) => void; onCreate: (l: LoaiTao) => void; t: T }) {
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState(false);
  return (
    <nav aria-label={t.menu} className="flex w-[248px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="px-4 pb-3 pt-4">
        <div className="truncate text-[16px] font-semibold text-slate-900 dark:text-white">{info.he_thong}</div>
        {info.nguoi_dung && <div className="truncate text-[12px] text-slate-500 dark:text-slate-400">{info.nguoi_dung}</div>}
        {info.tao.length > 0 && (
          <div className="relative mt-3">
            <Button variant="primary" className="w-full justify-center" onClick={() => (info.tao.length === 1 ? onCreate(info.tao[0]!) : setPick((x) => !x))}>
              <Icon d={I.plus} />{t.create}{info.tao.length > 1 && <Icon d={I.chev} size={14} />}
            </Button>
            {pick && <div aria-hidden className="fixed inset-0 z-10" onClick={() => setPick(false)} />}
            {pick && (
              <ul className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {info.tao.map((l) => (
                  <li key={l.ma}>
                    <button type="button" onClick={() => { setPick(false); onCreate(l); }} title={l.goc ? t.onOriginal : undefined}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                      <span className="min-w-0 flex-1 truncate">{l.ten}</span>{l.goc && <span className="shrink-0 text-slate-400"><Icon d={I.ext} size={13} /></span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {info.menu.map((n, gi) => {
          const key = `${gi}:${n.ten}`;
          const closed = shut.has(key);
          return (
            <div key={key} className="mt-1">
              {n.ten && !(n.muc.length === 1 && n.muc[0]!.ten === n.ten) && (
                <button type="button" aria-expanded={!closed} onClick={() => setShut((s) => { const x = new Set(s); if (closed) x.delete(key); else x.add(key); return x; })}
                  className="flex w-full items-center gap-1 rounded-md px-2 pb-1 pt-2 text-left text-[12px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                  <span className={`transition-transform ${closed ? '-rotate-90' : ''}`}><Icon d={I.chev} size={12} /></span>{n.ten}
                </button>
              )}
              {!closed && n.muc.map((m) => {
                const c = dem[m.ma];
                const sel = m.ma === hop && !m.goc;
                return (
                  <button key={m.ma} type="button" onClick={() => onPick(m)} aria-current={sel || undefined} title={m.goc ? t.onOriginal : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${sel
                      ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    <span className="min-w-0 flex-1 truncate">{m.ten}</span>
                    {m.goc ? <span className="shrink-0 text-slate-400"><Icon d={I.ext} size={13} /></span>
                      : c && c.tong > 0 && <span className={`shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${c.qua_han ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{c.chua_doc || c.tong}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ---- trang ----
type Pane = { kind: 'detail'; id: string; flash: string } | { kind: 'create'; loai: LoaiTao } | null;

function App({ system }: { system: string }) {
  const t = useT(M);
  const lang = useLang();
  const [info, setInfo] = useState<ThongTin | null>(null);
  const [dem, setDem] = useState<Dem>({});
  const [hop, setHop] = useState('');
  const [q, setQ] = useState('');
  const [tim, setTim] = useState('');
  const [loc, setLoc] = useState<Record<string, Val>>({});
  const [trang, setTrang] = useState(1);
  const [ds, setDs] = useState<DanhSach | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [pane, setPane] = useState<Pane>(null);
  const seq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const muc = useMemo(() => info?.menu.flatMap((n) => n.muc) ?? [], [info]);
  const cur = muc.find((m) => m.ma === hop);
  const loadDem = useCallback(() => { call<Dem>('vb_dem').then(setDem, () => { /* phiên dịch không đếm ⇒ bỏ qua */ }); }, []);
  const loadInfo = useCallback(() => {
    setErr(null);
    call<ThongTin>('vb_thong_tin').then((i) => {
      setInfo(i);
      setHop((h) => h || i.menu.flatMap((n) => n.muc).find((m) => !m.goc)?.ma || '');
      loadDem();
    }, setErr);
  }, [loadDem]);
  const loadList = useCallback(() => {
    if (!hop) return;
    const n = ++seq.current;
    setErr(null); setDs(null);
    const l = Object.fromEntries(Object.entries(loc).filter(([, v]) => !isEmpty(v)));
    call<DanhSach>('vb_danh_sach', { hop, trang, so_dong: 20, tim, loc: l }).then((r) => { if (n === seq.current) setDs(r); }, (e) => { if (n === seq.current) setErr(e); });
  }, [hop, trang, tim, loc]);
  // Tải lại: cả menu (hệ thống có thể vừa đổi / vừa đăng nhập xong) lẫn danh sách, số đếm.
  const refresh = useCallback(() => { loadInfo(); loadList(); }, [loadInfo, loadList]);
  useEffect(loadInfo, [loadInfo]);
  useEffect(loadList, [loadList]);
  // Trang gốc vừa tải lại (vd vừa đăng nhập, vừa làm gì đó trên trang gốc) ⇒ đọc lại menu, danh sách, số đếm.
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => bridge.onGocLoaded(() => refreshRef.current()), []);

  /** Loại văn bản có form phiên dịch ⇒ form Vala; chưa phiên dịch (`goc`) ⇒ mở form tạo của hệ thống. */
  const create = (l: LoaiTao) => { if (l.goc) void bridge.goc(true, l.goc); else setPane({ kind: 'create', loai: l }); };
  const pickHop = (m: Hop) => {
    if (m.goc) { void bridge.goc(true, m.goc); return; }
    setHop(m.ma); setTrang(1); setLoc({}); setPane(null);
  };

  // Phím tắt: ↑ ↓ chọn văn bản, / tìm, N tạo văn bản, R tải lại, Esc đóng khung bên phải.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role=dialog]')) return;
      if (e.key === 'Escape' && pane) { setPane(null); return; }
      if (typing(e)) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if ((e.key === 'n' || e.key === 'N') && info?.tao[0]) { e.preventDefault(); create(info.tao[0]); return; }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); refresh(); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && ds?.dong.length) {
        e.preventDefault();
        const i = pane?.kind === 'detail' ? ds.dong.findIndex((d) => d.id === pane.id) : -1;
        const next = ds.dong[Math.min(ds.dong.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]!;
        setPane({ kind: 'detail', id: next.id, flash: '' });
        document.querySelector(`[data-row="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [ds, pane, info, refresh]);

  const name = info?.he_thong || system;
  if (!info) {
    return (
      <div className="flex h-screen items-start justify-center bg-white p-8 dark:bg-slate-950">
        <div className="w-full max-w-xl">{err ? <Problem err={err} system={name} onRetry={loadInfo} t={t} /> : <div className="space-y-4">{[60, 90, 75].map((w) => <Skeleton key={w} width={`${w}%`} />)}</div>}</div>
      </div>
    );
  }
  return (
    <div className="flex h-screen bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <Nav info={info} dem={dem} hop={hop} onPick={pickHop} onCreate={create} t={t} />
      <div className="flex min-w-0 flex-1">
        <main className={`min-h-0 min-w-0 flex-1 flex-col ${pane ? 'hidden lg:flex' : 'flex'}`}>
          <header className="flex items-center gap-2 px-4 pb-2 pt-4">
            <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-slate-900 dark:text-white">{cur?.ten}</h1>
            <form role="search" className="relative w-72 min-w-[9rem] shrink" onSubmit={(e) => { e.preventDefault(); setTrang(1); setTim(q.trim()); }}>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon d={I.search} size={15} /></span>
              <input ref={searchRef} type="search" value={q} placeholder={t.search} aria-label={t.search}
                onChange={(e) => { setQ(e.target.value); if (!e.target.value) { setTim(''); setTrang(1); } }}
                className="w-full rounded-full border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900" />
            </form>
            <button type="button" onClick={refresh} title={t.refresh} aria-label={t.refresh} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon d={I.refresh} /></button>
            <Button className="shrink-0" onClick={() => void bridge.goc(true)} title={t.originalTitle}>{t.original}</Button>
          </header>
          {cur?.loc && cur.loc.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {cur.loc.map((f) => (
                <div key={f.ma} className="w-44">
                  <FieldInput f={f} compact value={loc[f.ma] ?? empty(f)} onChange={(v) => { setTrang(1); setLoc((o) => ({ ...o, [f.ma]: v })); }} t={t} />
                </div>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
            {err ? <div className="p-2"><Problem err={err} system={name} onRetry={refresh} t={t} /></div>
              : !ds ? <div className="space-y-4 p-3">{[90, 75, 85, 60, 80].map((w, i) => <Skeleton key={i} width={`${w}%`} />)}</div>
              : ds.dong.length === 0 ? <p className="px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400">{tim || Object.values(loc).some((v) => !isEmpty(v)) ? t.emptySearch : t.empty}</p>
              : <ul className="space-y-0.5">{ds.dong.map((d) => <Row key={d.id} d={d} active={pane?.kind === 'detail' && d.id === pane.id} onOpen={() => setPane({ kind: 'detail', id: d.id, flash: '' })} t={t} lang={lang} />)}</ul>}
          </div>
          {ds && ds.dong.length > 0 && (
            <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[13px] text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span>{t.total(ds.tong)}</span>
              <span className="flex items-center gap-2">
                <Button disabled={trang <= 1} onClick={() => setTrang((p) => p - 1)} aria-label={t.prev}>‹</Button>
                <span>{t.page(trang, ds.so_trang)}</span>
                <Button disabled={trang >= ds.so_trang} onClick={() => setTrang((p) => p + 1)} aria-label={t.next}>›</Button>
              </span>
            </footer>
          )}
        </main>
        <aside className={`min-h-0 border-slate-200 dark:border-slate-800 ${pane ? 'flex w-full flex-col lg:w-[48%] lg:max-w-[680px] lg:border-l' : 'hidden xl:flex xl:w-[40%] xl:max-w-[560px] xl:flex-col xl:items-center xl:justify-center xl:border-l'}`}>
          {pane?.kind === 'detail' ? <Detail key={pane.id} id={pane.id} flash={pane.flash} system={name} t={t} lang={lang} onClose={() => setPane(null)} onChanged={refresh} />
            : pane?.kind === 'create' ? <Compose key={pane.loai.ma} loai={pane.loai} system={name} t={t} onClose={() => setPane(null)}
                onCreated={(id, msg) => { refresh(); setPane(id ? { kind: 'detail', id, flash: msg } : null); }} />
            : (
              <div className="px-8 text-center">
                <p className="text-sm text-slate-400 dark:text-slate-500">{t.pick}</p>
                <p className="mt-2 text-[12px] text-slate-400 dark:text-slate-500">{t.keys}</p>
              </div>
            )}
        </aside>
      </div>
    </div>
  );
}

void bridge.state().then((s) => {
  applyPrefs(s);
  createRoot(document.getElementById('root')!).render(<StrictMode><App system={s.label} /></StrictMode>);
});

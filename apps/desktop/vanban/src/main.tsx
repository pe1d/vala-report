/**
 * Giao diện Văn bản chung của Vala Desktop (docs/van-ban-chung.md): MỘT giao diện cho mọi phần mềm văn bản — dữ liệu và
 * thao tác lấy qua phiên dịch vb_* (gói kịch bản) chạy trong trang gốc của ứng dụng (preload `valaVanBan`, vanban-page.ts).
 * Thiếu gì / chưa đăng nhập ⇒ nút Trang gốc. Ngôn ngữ + sáng/tối theo lựa chọn của app.
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { locale, messages, setLang, useLang, useT, type Lang } from '@vala/ui/i18n';
import { setTheme, type ThemeMode } from '@vala/ui/theme';
import { Badge, Banner, Button, Input, Skeleton, Tabs } from '@vala/ui/ui';
import type { ChiTiet, DanhSach, Dong, ThaoTac, ThongTin, Truong } from '../../src/vanban-model';
import './index.css';

type Res<T> = { ok: true; result: T } | { ok: false; error: string; code?: string };
interface Bridge {
  state(): Promise<{ lang: Lang; theme: ThemeMode; key: string; label: string }>;
  run<T>(name: string, args: Record<string, unknown>): Promise<Res<T>>;
  goc(on?: boolean): Promise<void>;
  onPrefs(cb: (p: { lang: Lang; theme: ThemeMode }) => void): void;
  onGocLoaded(cb: () => void): void;
}
const bridge = (window as unknown as { valaVanBan: Bridge }).valaVanBan;
const applyPrefs = (p: { lang: Lang; theme: ThemeMode }) => { setLang(p.lang, true); setTheme(p.theme, true); document.documentElement.lang = p.lang; };
bridge.onPrefs(applyPrefs);

const M = messages({
  search: 'Tìm theo số ký hiệu, trích yếu', original: 'Trang gốc', originalTitle: 'Mở trang của hệ thống (đăng nhập, việc giao diện này chưa làm được)',
  boxes: 'Hộp văn bản', total: (n: number) => `${n} văn bản`, page: (a: number, b: number) => `Trang ${a}/${b}`, prev: 'Trang trước', next: 'Trang sau',
  empty: 'Hộp này chưa có văn bản.', emptySearch: 'Không có văn bản khớp từ khoá.',
  needLogin: (s: string) => `Bạn chưa đăng nhập ${s}. Đăng nhập trên trang gốc, xong quay lại đây.`, openLogin: 'Mở trang gốc để đăng nhập',
  notReady: 'Trang gốc của hệ thống chưa tải xong.', retry: 'Thử lại', failed: 'Hệ thống báo lỗi',
  pick: 'Chọn một văn bản để xem chi tiết.', close: 'Đóng',
  fSo: 'Số ký hiệu', fCoQuan: 'Cơ quan ban hành', fNgay: 'Ngày', fHan: 'Hạn xử lý', fTrangThai: 'Trạng thái', fNguoi: 'Người xử lý',
  fLoai: 'Loại văn bản', fDoKhan: 'Độ khẩn', fNoiNhan: 'Nơi nhận',
  content: 'Nội dung', files: 'Tệp đính kèm', history: 'Quá trình xử lý', save: 'Tải về', saved: (p: string) => `Đã lưu ${p}`,
  overdue: (n: number) => `Quá hạn ${n} ngày`, dueToday: 'Hạn hôm nay', dueIn: (n: number) => `Còn ${n} ngày`,
  cancel: 'Huỷ', confirm: 'Xác nhận', required: (f: string) => `Chưa điền ${f}`, filter: 'Lọc', none: 'Chưa chọn',
  noActions: 'Văn bản này không có thao tác nào làm được ở đây. Việc khác làm trên trang gốc.',
}, {
  search: 'Search by number or summary', original: 'Original page', originalTitle: "Open the system's own page (sign in, things this view can't do yet)",
  boxes: 'Folders', total: (n: number) => `${n} documents`, page: (a: number, b: number) => `Page ${a} of ${b}`, prev: 'Previous page', next: 'Next page',
  empty: 'This folder has no documents.', emptySearch: 'No documents match your search.',
  needLogin: (s: string) => `You're not signed in to ${s}. Sign in on the original page, then come back.`, openLogin: 'Open the original page to sign in',
  notReady: "The system's original page hasn't finished loading.", retry: 'Try again', failed: 'The system reported an error',
  pick: 'Select a document to see its details.', close: 'Close',
  fSo: 'Number', fCoQuan: 'Issued by', fNgay: 'Date', fHan: 'Due', fTrangThai: 'Status', fNguoi: 'Handled by',
  fLoai: 'Type', fDoKhan: 'Urgency', fNoiNhan: 'Recipients',
  content: 'Content', files: 'Attachments', history: 'Processing history', save: 'Download', saved: (p: string) => `Saved ${p}`,
  overdue: (n: number) => `${n} days overdue`, dueToday: 'Due today', dueIn: (n: number) => `${n} days left`,
  cancel: 'Cancel', confirm: 'Confirm', required: (f: string) => `${f} is required`, filter: 'Filter', none: 'Nothing selected',
  noActions: "There's nothing you can do with this document here. Use the original page for other tasks.",
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
/** Hạn xử lý ⇒ nhãn "còn / quá n ngày" (bỏ qua nếu không có hạn hoặc văn bản đã xong). */
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

// ---- hiển thị lỗi theo mã ----
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

// ---- danh sách ----
function Row({ d, active, onOpen, t, lang }: { d: Dong; active: boolean; onOpen: () => void; t: T; lang: Lang }) {
  const h = finished(d.trang_thai) ? null : due(d.han_xu_ly, t);
  return (
    <li>
      <button type="button" onClick={onOpen} aria-current={active || undefined}
        className={`group flex w-full gap-3 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active
          ? 'bg-blue-50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.da_doc === false ? 'bg-blue-600 dark:bg-blue-400' : 'bg-transparent'}`} />
        <span className="min-w-0 flex-1">
          <span className={`line-clamp-2 text-[14px] leading-snug ${d.da_doc === false ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-100'}`}>
            {urgent(d.do_khan) && <span className="mr-1.5 rounded bg-red-600 px-1 py-px text-[11px] font-semibold text-white">{d.do_khan}</span>}
            {d.trich_yeu}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            {d.so_ky_hieu && <span className="font-medium text-slate-700 dark:text-slate-300">{d.so_ky_hieu}</span>}
            {d.co_quan && <span className="truncate">{d.co_quan}</span>}
            {d.ngay && <span>{fmtDate(d.ngay, lang)}</span>}
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

// ---- form thao tác (vẽ theo `truong` của phiên dịch) ----
function FieldInput({ f, value, onChange, t }: { f: Truong; value: string | string[]; onChange: (v: string | string[]) => void; t: T }) {
  const [q, setQ] = useState('');
  const base = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
  if (f.loai === 'doan') return <textarea className={`${base} min-h-[88px]`} value={value as string} onChange={(e) => onChange(e.target.value)} />;
  if (f.loai === 'ngay') return <input type="date" className={base} value={value as string} onChange={(e) => onChange(e.target.value)} />;
  if (f.loai === 'chon' && !f.nhieu) {
    return (
      <select className={base} value={value as string} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.none}</option>
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
        <div className="max-h-48 overflow-y-auto p-1">
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
  return <input className={base} value={value as string} onChange={(e) => onChange(e.target.value)} />;
}

function ActionDialog({ id, tt, onDone, onClose, t }: { id: string; tt: ThaoTac; onDone: (msg: string) => void; onClose: () => void; t: T }) {
  const [v, setV] = useState<Record<string, string | string[]>>(() => Object.fromEntries(tt.truong.map((f) => [f.ma, f.nhieu ? [] : ''])));
  const [step, setStep] = useState<'form' | 'confirm' | 'busy'>('form');
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(); }, []);
  const missing = tt.truong.find((f) => f.bat_buoc && (Array.isArray(v[f.ma]) ? !(v[f.ma] as string[]).length : !v[f.ma]));
  const send = async () => {
    setStep('busy'); setErr('');
    try { const r = await call<{ thong_bao?: string }>('vb_thuc_hien', { id, thao_tac: tt.ma, ...v }); onDone(r.thong_bao || tt.ten); } catch (e) { setErr((e as Error).message); setStep('form'); }
  };
  const next = () => { if (missing) { setErr(t.required(missing.ten)); return; } if (tt.xac_nhan && step === 'form') setStep('confirm'); else void send(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={tt.ten}
      onKeyDown={(e) => { if (e.key === 'Escape' && step !== 'busy') onClose(); }}>
      <div ref={box} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{tt.ten}</h2>
        {step === 'confirm' ? <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{tt.xac_nhan}</p> : (
          <div className="mt-4 space-y-3">
            {tt.truong.map((f) => (
              <div key={f.ma}>
                <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">{f.ten}{f.bat_buoc && <span className="text-red-600"> *</span>}</div>
                <FieldInput f={f} value={v[f.ma]!} onChange={(x) => setV((o) => ({ ...o, [f.ma]: x }))} t={t} />
              </div>
            ))}
          </div>
        )}
        {err && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={step === 'confirm' ? () => setStep('form') : onClose} disabled={step === 'busy'}>{t.cancel}</Button>
          <Button variant="primary" onClick={next} disabled={step === 'busy'}>{step === 'confirm' ? t.confirm : tt.ten}</Button>
        </div>
      </div>
    </div>
  );
}

// ---- chi tiết ----
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100">{children}</div>
    </div>
  );
}

function Detail({ id, system, onClose, onChanged, t, lang }: { id: string; system: string; onClose: () => void; onChanged: () => void; t: T; lang: Lang }) {
  const [ct, setCt] = useState<ChiTiet | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [act, setAct] = useState<ThaoTac | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => { setErr(null); setCt(null); call<ChiTiet>('vb_chi_tiet', { id }).then(setCt, setErr); }, [id]);
  useEffect(() => { setNote(''); load(); }, [load]);
  const save = async (tep: string) => {
    const r = await bridge.run<never>('vb_tep', { id, tep }) as { ok: boolean; error?: string; saved?: string };
    setNote(r.ok ? t.saved(r.saved ?? '') : r.error ? `${t.failed}: ${r.error}` : '');
  };
  const h = ct && !finished(ct.trang_thai) ? due(ct.han_xu_ly, t) : null;
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={ct?.trich_yeu}>
      <div className="flex items-center justify-end px-4 pt-3">
        <button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {err ? <Problem err={err} system={system} onRetry={load} t={t} /> : !ct ? <div className="space-y-3 pt-2">{[80, 95, 60, 70].map((w) => <Skeleton key={w} width={`${w}%`} />)}</div> : (
          <>
            {/* Đầu công văn: số ký hiệu + cơ quan ban hành, trích yếu là tiêu đề. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">{ct.co_quan || system}</div>
              {ct.so_ky_hieu && <div className="text-[13px] text-slate-600 dark:text-slate-400">{t.fSo}: <span className="font-semibold text-slate-900 dark:text-white">{ct.so_ky_hieu}</span></div>}
            </div>
            <h1 className="mt-4 text-[19px] font-semibold leading-snug text-slate-900 dark:text-white">
              {urgent(ct.do_khan) && <span className="mr-2 rounded bg-red-600 px-1.5 py-0.5 align-middle text-[12px] font-semibold text-white">{ct.do_khan}</span>}
              {ct.trich_yeu}
            </h1>
            {h && <div className="mt-2"><Badge tone={h.tone}>{h.text}</Badge></div>}

            {ct.thao_tac.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {ct.thao_tac.map((a, i) => <Button key={a.ma} variant={i === 0 ? 'primary' : 'default'} onClick={() => setAct(a)}>{a.ten}</Button>)}
              </div>
            ) : <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">{t.noActions}</p>}
            {note && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{note}</p>}

            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3">
              {ct.ngay && <Meta label={t.fNgay}>{fmtDate(ct.ngay, lang)}</Meta>}
              {ct.han_xu_ly && <Meta label={t.fHan}>{fmtDate(ct.han_xu_ly, lang)}</Meta>}
              {ct.trang_thai && <Meta label={t.fTrangThai}>{ct.trang_thai}</Meta>}
              {ct.loai && <Meta label={t.fLoai}>{ct.loai}</Meta>}
              {ct.do_khan && <Meta label={t.fDoKhan}>{ct.do_khan}</Meta>}
              {ct.nguoi_xu_ly && <Meta label={t.fNguoi}>{ct.nguoi_xu_ly}</Meta>}
              {ct.noi_nhan && <div className="col-span-2"><Meta label={t.fNoiNhan}>{ct.noi_nhan}</Meta></div>}
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
                  {ct.tep.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      <span className="min-w-0 flex-1 truncate">{f.ten}</span>
                      {f.kich_thuoc && <span className="text-[12px] text-slate-500">{f.kich_thuoc}</span>}
                      <button type="button" onClick={() => void save(f.id)} className="text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-400">{t.save}</button>
                    </li>
                  ))}
                </ul>
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

// ---- trang ----
function App({ system }: { system: string }) {
  const t = useT(M);
  const lang = useLang();
  const [info, setInfo] = useState<ThongTin | null>(null);
  const [hop, setHop] = useState('');
  const [q, setQ] = useState('');
  const [tim, setTim] = useState('');
  const [trang, setTrang] = useState(1);
  const [ds, setDs] = useState<DanhSach | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);

  const loadInfo = useCallback(() => {
    setErr(null);
    call<ThongTin>('vb_thong_tin').then((i) => { setInfo(i); setHop((h) => h || i.hop[0]?.ma || ''); }, setErr);
  }, []);
  const loadList = useCallback(() => {
    if (!hop) return;
    const n = ++seq.current;
    setErr(null); setDs(null);
    call<DanhSach>('vb_danh_sach', { hop, trang, so_dong: 20, tim }).then((r) => { if (n === seq.current) setDs(r); }, (e) => { if (n === seq.current) setErr(e); });
  }, [hop, trang, tim]);
  useEffect(loadInfo, [loadInfo]);
  useEffect(loadList, [loadList]);
  // Trang gốc vừa tải lại (vd vừa đăng nhập) ⇒ đang báo lỗi thì thử lại.
  const errRef = useRef(err); errRef.current = err;
  useEffect(() => bridge.onGocLoaded(() => { if (errRef.current) { if (info) loadList(); else loadInfo(); } }), [info, loadInfo, loadList]);

  const name = info?.he_thong || system;
  const tabs = useMemo(() => (info?.hop ?? []).map((h) => ({ id: h.ma, label: h.ten })), [info]);
  return (
    <div className="flex h-screen flex-col bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex flex-wrap items-center gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold text-slate-900 dark:text-white">{name}</div>
          {info?.nguoi_dung && <div className="truncate text-[12px] text-slate-500 dark:text-slate-400">{info.nguoi_dung}</div>}
        </div>
        <form className="ml-auto flex w-full max-w-sm items-center gap-2 sm:w-auto" role="search" onSubmit={(e) => { e.preventDefault(); setTrang(1); setTim(q.trim()); }}>
          <Input type="search" value={q} placeholder={t.search} aria-label={t.search} onChange={(e) => { setQ(e.target.value); if (!e.target.value) { setTim(''); setTrang(1); } }} className="!rounded-full sm:w-80" />
        </form>
        <Button onClick={() => void bridge.goc(true)} title={t.originalTitle}>{t.original}</Button>
      </header>
      {tabs.length > 1 && <div className="px-5"><Tabs items={tabs} value={hop} onChange={(h) => { setHop(h); setTrang(1); setOpen(null); }} label={t.boxes} /></div>}

      <div className="flex min-h-0 flex-1">
        <main className={`min-h-0 flex-1 flex-col ${open ? 'hidden lg:flex' : 'flex'}`}>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {err ? <div className="p-2"><Problem err={err} system={name} onRetry={info ? loadList : loadInfo} t={t} /></div>
              : !ds ? <div className="space-y-4 p-3">{[90, 75, 85, 60, 80].map((w, i) => <Skeleton key={i} width={`${w}%`} />)}</div>
              : ds.dong.length === 0 ? <p className="px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400">{tim ? t.emptySearch : t.empty}</p>
              : <ul className="space-y-0.5">{ds.dong.map((d) => <Row key={d.id} d={d} active={d.id === open} onOpen={() => setOpen(d.id)} t={t} lang={lang} />)}</ul>}
          </div>
          {ds && ds.dong.length > 0 && (
            <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-2 text-[13px] text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span>{t.total(ds.tong)}</span>
              <span className="flex items-center gap-2">
                <Button disabled={trang <= 1} onClick={() => setTrang((p) => p - 1)} aria-label={t.prev}>‹</Button>
                <span>{t.page(trang, ds.so_trang)}</span>
                <Button disabled={trang >= ds.so_trang} onClick={() => setTrang((p) => p + 1)} aria-label={t.next}>›</Button>
              </span>
            </footer>
          )}
        </main>
        <aside className={`min-h-0 border-slate-200 dark:border-slate-800 ${open ? 'flex w-full flex-col lg:w-[46%] lg:max-w-[640px] lg:border-l' : 'hidden xl:flex xl:w-[40%] xl:max-w-[560px] xl:flex-col xl:items-center xl:justify-center xl:border-l'}`}>
          {open ? <Detail id={open} system={name} t={t} lang={lang} onClose={() => setOpen(null)} onChanged={loadList} />
            : <p className="px-8 text-center text-sm text-slate-400 dark:text-slate-500">{t.pick}</p>}
        </aside>
      </div>
    </div>
  );
}

void bridge.state().then((s) => {
  applyPrefs(s);
  createRoot(document.getElementById('root')!).render(<StrictMode><App system={s.label} /></StrictMode>);
});

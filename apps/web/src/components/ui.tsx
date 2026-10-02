/**
 * Bộ component cơ sở — Tailwind, luôn có biến thể dark:. Hệ thiết kế (mục 06):
 * một màu nhấn (blue) cho hành động chính; màu trạng thái tách riêng và luôn đi kèm chữ.
 */
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { useTheme, type ThemeMode } from '../theme';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Variant = 'default' | 'primary' | 'danger';
const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3.5 py-1.5 font-medium transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const BTN: Record<Variant, string> = {
  default: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  primary: 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950 dark:hover:bg-blue-300',
  danger: 'border-slate-300 bg-white text-red-700 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950',
};

export interface MenuItem { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
/**
 * Menu "…" gộp các hành động ít dùng. Hộp chọn vẽ nổi ra ngoài (portal, position fixed) ⇒ không bị khung cuộn của bảng
 * cắt mất, không mờ theo dòng đang tắt; mở lên trên khi phía dưới không đủ chỗ. Bấm ra ngoài / Esc / cuộn trang để đóng.
 */
export function Menu({ items, label = 'Thêm thao tác', disabled }: { items: MenuItem[]; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const b = btn.current?.getBoundingClientRect();
    const h = box.current?.offsetHeight ?? 0;
    const w = box.current?.offsetWidth ?? 160;
    if (!b) return;
    const top = b.bottom + 4 + h > window.innerHeight - 8 && b.top - 4 - h > 8 ? b.top - 4 - h : b.bottom + 4;
    setPos({ left: Math.max(8, Math.min(b.right - w, window.innerWidth - 8 - w)), top });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [open]);
  if (!items.length) return null;
  return (
    <>
      <Button ref={btn} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((v) => !v)}>…</Button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} aria-hidden />
          <div ref={box} role="menu" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            className="fixed z-[81] min-w-40 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {items.map((it) => (
              <button key={it.label} role="menuitem" type="button" disabled={it.disabled}
                className={cx('block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800',
                  it.danger ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-100')}
                onClick={() => { setOpen(false); it.onClick(); }}>
                {it.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/**
 * Nút "?" mở hộp hướng dẫn ngắn ngay cạnh ô cần giải thích. Bấm để mở/đóng, bấm ra ngoài hoặc Esc để đóng.
 * Hộp vẽ nổi ra ngoài (portal, position fixed) để không bị khung cuộn của hộp thoại cắt; tự mở lên trên khi
 * phía dưới không đủ chỗ, và luôn nằm trong màn hình.
 */
export function HelpTip({ title, children, label = 'Hướng dẫn' }: { title?: string; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    const h = box.current?.offsetHeight ?? 0;
    const w = box.current?.offsetWidth ?? 384;
    if (!b) return;
    const below = b.bottom + 6;
    const top = below + h > window.innerHeight - 8 && b.top - 6 - h > 8 ? b.top - 6 - h : Math.min(below, Math.max(8, window.innerHeight - 8 - h));
    setPos({ left: Math.max(8, Math.min(b.left, window.innerWidth - 8 - w)), top });
  }, []);
  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place]);
  return (
    <span className="inline-flex align-middle">
      <button ref={btn} type="button" aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen((v) => !v)}
        className={cx('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold leading-none transition-colors',
          open ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
            : 'border-slate-400 text-slate-500 hover:border-blue-600 hover:text-blue-700 dark:border-slate-500 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-blue-300')}>
        ?
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden />
          <div ref={box} role="dialog" aria-label={title ?? label} style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            className="fixed z-[91] max-h-[70vh] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-left text-sm font-normal text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {title && <div className="mb-1.5 font-semibold text-slate-900 dark:text-slate-100">{title}</div>}
            {children}
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(
  function Button({ variant = 'default', className, ...p }, ref) {
    return <button ref={ref} type="button" {...p} className={cx(BTN_BASE, BTN[variant], className)} />;
  });

export function LinkButton({ variant = 'default', className, ...p }: LinkProps & { variant?: Variant }) {
  return <Link {...p} className={cx(BTN_BASE, BTN[variant], 'no-underline', className)} />;
}

export function TextLink({ className, ...p }: LinkProps) {
  return <Link {...p} className={cx('text-blue-700 underline-offset-2 hover:underline dark:text-blue-400', className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900', className)}>{children}</div>;
}

export type Tone = 'ok' | 'warn' | 'err' | 'neutral' | 'info';
const BADGE: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  err: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
};

/** Trạng thái = chấm màu + chữ, không bao giờ chỉ có màu. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', BADGE[tone])}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500', warn: 'bg-amber-500', err: 'bg-red-500', neutral: 'bg-slate-400', info: 'bg-blue-500',
};

export interface TabItem {
  id: string; label: string;
  /** Chấm trạng thái cạnh nhãn; `dotLabel` là chữ cho trình đọc màn hình (màu không đứng một mình). */
  dot?: Tone; dotLabel?: string;
  count?: { n: number; tone?: Tone; label?: string };
}
/** Thanh tab ngang (cuộn ngang khi hẹp). Mũi tên trái/phải, Home/End để chuyển tab. */
export function Tabs({ items, value, onChange, label }: { items: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  const move = (i: number) => {
    const t = items[(i + items.length) % items.length]!;
    onChange(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {items.map((t, i) => {
        const sel = t.id === value;
        return (
          <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={sel} aria-controls={`panel-${t.id}`} tabIndex={sel ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
              else if (e.key === 'Home') { e.preventDefault(); move(0); }
              else if (e.key === 'End') { e.preventDefault(); move(items.length - 1); }
            }}
            className={cx('-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600',
              sel ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100')}>
            {t.dot && <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', DOT[t.dot])} />}
            {t.label}
            {t.dot && t.dotLabel && <span className="sr-only">({t.dotLabel})</span>}
            {t.count && t.count.n > 0 && (
              <span className={cx('rounded-full px-1.5 py-px text-xs font-semibold tabular-nums', BADGE[t.count.tone ?? 'neutral'])}>
                {t.count.n}{t.count.label && <span className="sr-only"> {t.count.label}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const BANNER: Record<Tone, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
  warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  err: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200',
  neutral: 'border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
  info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200',
};

export function Banner({ tone, children, role }: { tone: Tone; children: ReactNode; role?: string }) {
  return <div role={role} className={cx('my-3 flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2.5', BANNER[tone])}>{children}</div>;
}

const CONTROL =
  'min-w-[160px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 ' +
  'focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/30';

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(CONTROL, p.className)} />;
}

export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(CONTROL, p.className)} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
      {label}
      {children}
    </label>
  );
}

export const Muted = ({ children, className }: { children: ReactNode; className?: string }) =>
  <p className={cx('text-slate-500 dark:text-slate-400', className)}>{children}</p>;

export function PageTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="mb-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </header>
  );
}

// ---- bảng ----
/** `fixed`: cột theo <colgroup> thay vì theo nội dung — để nhiều bảng xếp chồng (theo nhóm) thẳng cột với nhau. */
export function Table({ children, fixed }: { children: ReactNode; fixed?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className={cx('w-full border-collapse', fixed && 'min-w-[860px] table-fixed')}>{children}</table>
    </div>
  );
}

export function Th({ children, num, minWidth }: { children?: ReactNode; num?: boolean; minWidth?: number }) {
  return (
    <th style={{ minWidth }} className={cx(
      'sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400',
      num ? 'text-right' : 'text-left')}>{children}</th>
  );
}

/** Số dùng tabular-nums để cột thẳng hàng (mục 06). */
export function Td({ children, num, title }: { children?: ReactNode; num?: boolean; title?: string }) {
  return (
    <td title={title} className={cx('border-b border-slate-100 px-3 py-2 align-top last:border-r-0 dark:border-slate-800',
      num && 'text-right tabular-nums')}>{children}</td>
  );
}

export function Skeleton({ width }: { width: string }) {
  return <div className="my-2 h-3.5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" style={{ width }} />;
}

// ---- nút chuyển sáng/tối ----
const MODES: Array<[ThemeMode, string, string]> = [
  ['light', 'Sáng', 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66 5.66 1.41 1.41M4.93 4.93l1.41 1.41m11.32 0 1.41-1.41M4.93 19.07l1.41-1.41M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'],
  ['dark', 'Tối', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z'],
  ['system', 'Theo hệ thống', 'M3 5h18v11H3zM8 21h8m-4-5v5'],
];

export function ThemeToggle() {
  const [mode, setMode] = useTheme();
  return (
    <div role="radiogroup" aria-label="Chế độ giao diện"
      className="inline-flex self-start rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
      {MODES.map(([m, label, path]) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} title={label} onClick={() => setMode(m)}
          className={cx('inline-flex h-7 w-8 items-center justify-center rounded transition-colors',
            mode === m
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={path} />
          </svg>
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ---- hộp kết quả (vd "Đã kết nối thành công") ----
/** Biểu tượng + chữ, không chỉ dựa vào màu. */
export function ResultDialog({ ok, title, children, onClose, action }: {
  ok: boolean; title: string; children: ReactNode; onClose: () => void; action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="kq-title">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className={cx('mx-auto flex h-12 w-12 items-center justify-center rounded-full',
          ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300')}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={ok ? 'M5 12.5 10 17l9-10' : 'M12 8v5m0 3.5v.5M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'} />
          </svg>
        </div>
        <h2 id="kq-title" className="mt-3 text-base font-semibold">{title}</h2>
        <p className="mt-1 text-slate-600 dark:text-slate-400">{children}</p>
        <div className="mt-5 flex justify-center gap-2">
          {action && <Button variant="primary" onClick={action.onClick}>{action.label}</Button>}
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>
  );
}

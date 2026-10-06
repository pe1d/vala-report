/** Component cơ sở của tiện ích — cùng hệ thiết kế với cổng (apps/web/src/components/ui.tsx), có dark:. */
import { useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { LANGS, getLang, messages, setLang, subscribeLang, type Lang } from './i18n';
import { useTheme, type ThemeMode } from './theme';

/** Ngôn ngữ hiện tại, tự vẽ lại khi người dùng đổi (ở trang này hay trang khác của tiện ích). */
export const useLang = (): Lang => useSyncExternalStore(subscribeLang, getLang);
/** Chữ theo ngôn ngữ hiện tại, tự đổi khi người dùng chuyển ngôn ngữ. */
export function useT<T>(m: Record<Lang, T>): T {
  return m[useLang()];
}

const M = messages({
  light: 'Sáng', dark: 'Tối', system: 'Theo hệ thống', themeGroup: 'Chế độ giao diện', langGroup: 'Ngôn ngữ', close: 'Đóng',
}, {
  light: 'Light', dark: 'Dark', system: 'System', themeGroup: 'Theme', langGroup: 'Language', close: 'Close',
});

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Variant = 'default' | 'primary' | 'danger';
const BTN: Record<Variant, string> = {
  default: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  primary: 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950 dark:hover:bg-blue-300',
  danger: 'border-slate-300 bg-white text-red-700 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950',
};

export function Button({ variant = 'default', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type="button" {...p} className={cx(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 font-medium transition-colors',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
      'disabled:cursor-not-allowed disabled:opacity-50', BTN[variant], className)} />
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx('w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100', p.className)} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

export type Tone = 'ok' | 'warn' | 'err' | 'neutral' | 'info';
const BADGE: Record<Tone, [string, string]> = {
  ok: ['bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', 'bg-emerald-600 dark:bg-emerald-400'],
  warn: ['bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300', 'bg-amber-600 dark:bg-amber-400'],
  err: ['bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300', 'bg-red-600 dark:bg-red-400'],
  neutral: ['bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', 'bg-slate-500 dark:bg-slate-400'],
  info: ['bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300', 'bg-blue-600 dark:bg-blue-400'],
};

/** Trạng thái luôn có chữ — màu chỉ là tín hiệu phụ. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', BADGE[tone][0])}>
      <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', BADGE[tone][1])} />{children}
    </span>
  );
}

export function Banner({ tone, children }: { tone: 'ok' | 'err' | 'info'; children: ReactNode }) {
  const c = { ok: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    err: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
    info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200' }[tone];
  return <div role="status" className={cx('rounded-md border px-3 py-2', c)}>{children}</div>;
}

export const Muted = ({ children, className }: { children: ReactNode; className?: string }) =>
  <p className={cx('text-slate-500 dark:text-slate-400', className)}>{children}</p>;

const MODES: Array<[ThemeMode, 'light' | 'dark' | 'system', string]> = [
  ['light', 'light', 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66 5.66 1.41 1.41M4.93 4.93l1.41 1.41m11.32 0 1.41-1.41M4.93 19.07l1.41-1.41M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'],
  ['dark', 'dark', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z'],
  ['system', 'system', 'M3 5h18v11H3zM8 21h8m-4-5v5'],
];

export function ThemeToggle() {
  const [mode, setMode] = useTheme();
  const t = useT(M);
  return (
    <div role="radiogroup" aria-label={t.themeGroup}
      className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
      {MODES.map(([m, key, path]) => { const label = t[key]; return (
        <button key={m} type="button" role="radio" aria-checked={mode === m} title={label} onClick={() => setMode(m)}
          className={cx('inline-flex h-7 w-8 items-center justify-center rounded transition-colors',
            mode === m ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={path} />
          </svg>
          <span className="sr-only">{label}</span>
        </button>
      ); })}
    </div>
  );
}

/** Chọn ngôn ngữ VI | EN — lưu ở chrome.storage.local, mọi trang của tiện ích và service worker đổi theo. */
export function LangToggle() {
  const lang = useLang();
  const t = useT(M);
  return (
    <div role="radiogroup" aria-label={t.langGroup}
      className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
      {LANGS.map(([l, short, name]) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} title={name} lang={l} onClick={() => void setLang(l)}
          className={cx('inline-flex h-7 min-w-8 items-center justify-center rounded px-1.5 text-xs font-semibold transition-colors',
            lang === l ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100')}>
          {short}
        </button>
      ))}
    </div>
  );
}

/** Hộp thông báo kết quả (kết nối thành công / lỗi). Có biểu tượng + chữ, không chỉ dựa vào màu. */
export function SuccessDialog({ ok, title, children, onClose, action }: {
  ok: boolean; title: string; children: ReactNode; onClose: () => void; action?: { label: string; onClick: () => void };
}) {
  const t = useT(M);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true" aria-labelledby="kq-title">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className={cx('mx-auto flex h-12 w-12 items-center justify-center rounded-full',
          ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300')}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={ok ? 'M5 12.5 10 17l9-10' : 'M12 8v5m0 3.5v.5M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'} />
          </svg>
        </div>
        <h2 id="kq-title" className="mt-3 text-base font-semibold">{title}</h2>
        <p className="mt-1 text-slate-600 dark:text-slate-400">{children}</p>
        <div className="mt-4 flex justify-center gap-2">
          {action && <Button variant="primary" onClick={action.onClick}>{action.label}</Button>}
          <Button onClick={onClose}>{t.close}</Button>
        </div>
      </div>
    </div>
  );
}

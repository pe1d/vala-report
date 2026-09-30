/**
 * Đổi mật khẩu cổng: bắt buộc khi đăng nhập bằng mật khẩu tạm (quản trị cấp/đặt lại), hoặc tự đổi từ menu người dùng.
 * Quy tắc mật khẩu kiểm ở máy chủ (≥ 8 ký tự, có chữ và số); ở đây chỉ nhắc trước cho người dùng.
 */
import { useState, type FormEvent } from 'react';
import { ApiProblem, api } from '../api';
import { Banner, Button, Field, Input, ThemeToggle } from './ui';

export function ChangePasswordForm({ onDone, onCancel, submitLabel = 'Đổi mật khẩu', temporary = false }: {
  onDone: () => void; onCancel?: () => void; submitLabel?: string; temporary?: boolean;
}) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const weak = next && (next.length < 8 || !/[A-Za-zÀ-ỹ]/.test(next) || !/\d/.test(next));
  const mismatch = again && next !== again;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: next });
      onDone();
    } catch (x) {
      setErr(x instanceof ApiProblem ? (x.type === 'invalid_credentials' ? 'Mật khẩu hiện tại không đúng' : x.detail ?? x.title) : 'Không đổi được mật khẩu');
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      {err && <Banner tone="err" role="alert">{err}</Banner>}
      <Field label={temporary ? 'Mật khẩu tạm (quản trị gửi cho bạn)' : 'Mật khẩu hiện tại'}>
        <Input className="w-full !min-w-0" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" autoFocus required />
      </Field>
      <Field label="Mật khẩu mới — ít nhất 8 ký tự, có cả chữ và số">
        <Input className="w-full !min-w-0" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field label="Nhập lại mật khẩu mới">
        <Input className="w-full !min-w-0" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
      </Field>
      {(weak || mismatch) && (
        <p className="text-sm text-amber-800 dark:text-amber-300">{weak ? 'Mật khẩu mới cần ít nhất 8 ký tự, có cả chữ và số.' : 'Hai lần nhập mật khẩu mới chưa khớp.'}</p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>Huỷ</Button>}
        <Button type="submit" variant="primary" disabled={busy || !cur || !next || !!weak || next !== again || next === cur}>{busy ? 'Đang lưu…' : submitLabel}</Button>
      </div>
    </form>
  );
}

/** Màn hình chặn: đăng nhập bằng mật khẩu tạm ⇒ phải đổi mật khẩu trước khi vào ứng dụng. */
export function ForcedPasswordChange({ name, onDone, onLogout }: { name: string; onDone: () => void; onLogout: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vala Reporting</h1>
        <ThemeToggle />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Đặt mật khẩu của bạn</h2>
        <p className="mb-5 mt-1 text-sm text-slate-500 dark:text-slate-400">
          Chào {name}. Bạn đang dùng mật khẩu tạm do quản trị cấp — đặt mật khẩu riêng để tiếp tục.
        </p>
        <ChangePasswordForm onDone={onDone} submitLabel="Lưu và tiếp tục" temporary />
      </div>
      <button type="button" onClick={onLogout} className="mt-4 text-sm text-slate-500 underline-offset-2 hover:underline dark:text-slate-400">Đăng xuất</button>
    </div>
  );
}

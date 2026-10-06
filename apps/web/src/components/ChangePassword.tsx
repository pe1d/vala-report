/**
 * Đổi mật khẩu cổng: bắt buộc khi đăng nhập bằng mật khẩu tạm (quản trị cấp/đặt lại), hoặc tự đổi từ menu người dùng.
 * Quy tắc mật khẩu kiểm ở máy chủ (≥ 8 ký tự, có chữ và số); ở đây chỉ nhắc trước cho người dùng.
 */
import { useState, type FormEvent } from 'react';
import { ApiProblem, api } from '../api';
import { Banner, Button, Field, Input, LangToggle, ThemeToggle } from './ui';
import { messages, useT } from '../i18n';

const M = messages({
  changePassword: 'Đổi mật khẩu', wrongCurrent: 'Mật khẩu hiện tại không đúng', failed: 'Không đổi được mật khẩu',
  tempPassword: 'Mật khẩu tạm (quản trị gửi cho bạn)', currentPassword: 'Mật khẩu hiện tại',
  newPassword: 'Mật khẩu mới — ít nhất 8 ký tự, có cả chữ và số', repeatPassword: 'Nhập lại mật khẩu mới',
  weak: 'Mật khẩu mới cần ít nhất 8 ký tự, có cả chữ và số.', mismatch: 'Hai lần nhập mật khẩu mới chưa khớp.',
  cancel: 'Huỷ', saving: 'Đang lưu…',
  setYourPassword: 'Đặt mật khẩu của bạn',
  hello: (name: string) => `Chào ${name}. Bạn đang dùng mật khẩu tạm do quản trị cấp — đặt mật khẩu riêng để tiếp tục.`,
  saveContinue: 'Lưu và tiếp tục', signOut: 'Đăng xuất',
}, {
  changePassword: 'Change password', wrongCurrent: 'Current password is incorrect', failed: "Couldn't change the password",
  tempPassword: 'Temporary password (sent by your administrator)', currentPassword: 'Current password',
  newPassword: 'New password: at least 8 characters, with both letters and numbers', repeatPassword: 'Confirm new password',
  weak: 'The new password needs at least 8 characters, with both letters and numbers.', mismatch: "The new passwords don't match.",
  cancel: 'Cancel', saving: 'Saving…',
  setYourPassword: 'Set your password',
  hello: (name: string) => `Hi ${name}. You're using a temporary password issued by an administrator. Set your own password to continue.`,
  saveContinue: 'Save and continue', signOut: 'Sign out',
});

export function ChangePasswordForm({ onDone, onCancel, submitLabel, temporary = false }: {
  onDone: () => void; onCancel?: () => void; submitLabel?: string; temporary?: boolean;
}) {
  const t = useT(M);
  submitLabel ??= t.changePassword;
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
      setErr(x instanceof ApiProblem ? (x.type === 'invalid_credentials' ? t.wrongCurrent : x.detail ?? x.title) : t.failed);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      {err && <Banner tone="err" role="alert">{err}</Banner>}
      <Field label={temporary ? t.tempPassword : t.currentPassword}>
        <Input className="w-full !min-w-0" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" autoFocus required />
      </Field>
      <Field label={t.newPassword}>
        <Input className="w-full !min-w-0" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field label={t.repeatPassword}>
        <Input className="w-full !min-w-0" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
      </Field>
      {(weak || mismatch) && (
        <p className="text-sm text-amber-800 dark:text-amber-300">{weak ? t.weak : t.mismatch}</p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>{t.cancel}</Button>}
        <Button type="submit" variant="primary" disabled={busy || !cur || !next || !!weak || next !== again || next === cur}>{busy ? t.saving : submitLabel}</Button>
      </div>
    </form>
  );
}

/** Màn hình chặn: đăng nhập bằng mật khẩu tạm ⇒ phải đổi mật khẩu trước khi vào ứng dụng. */
export function ForcedPasswordChange({ name, onDone, onLogout }: { name: string; onDone: () => void; onLogout: () => void }) {
  const t = useT(M);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vala Reporting</h1>
        <div className="flex shrink-0 items-center gap-2"><LangToggle /><ThemeToggle /></div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">{t.setYourPassword}</h2>
        <p className="mb-5 mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t.hello(name)}
        </p>
        <ChangePasswordForm onDone={onDone} submitLabel={t.saveContinue} temporary />
      </div>
      <button type="button" onClick={onLogout} className="mt-4 text-sm text-slate-500 underline-offset-2 hover:underline dark:text-slate-400">{t.signOut}</button>
    </div>
  );
}

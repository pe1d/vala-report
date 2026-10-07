/**
 * Script hộp nhập mật khẩu hệ thống nguồn (chạy trong cửa sổ, không có Node). Không import gì: build ra script thường.
 * Chữ hiển thị do tiến trình chính gửi; mật khẩu gửi thẳng về tiến trình chính để mã hoá, không giữ lại trong trang.
 */
interface CredDialogState { t: Record<string, string>; lang: 'vi' | 'en'; username: string }
interface ValaCredApi {
  state(): Promise<CredDialogState>;
  save(username: string, password: string): Promise<{ ok: boolean; message?: string }>;
  cancel(): Promise<void>;
}

(() => {
  const api = (window as unknown as { valaCred: ValaCredApi }).valaCred;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);
  applyTheme();

  void api.state().then((s) => {
    document.documentElement.lang = s.lang;
    document.title = s.t.title;
    $('title').textContent = s.t.title;
    $('hint').textContent = s.t.hint;
    $('l-user').textContent = s.t.user;
    $('l-pass').textContent = s.t.pass;
    $('cancel').textContent = s.t.cancel;
    $('save').textContent = s.t.save;
    const user = $<HTMLInputElement>('user');
    user.value = s.username;
    (s.username ? $<HTMLInputElement>('pass') : user).focus();
  });
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = $<HTMLInputElement>('pass');
    const r = await api.save($<HTMLInputElement>('user').value.trim(), pass.value);
    pass.value = '';
    if (!r.ok) $('err').textContent = r.message ?? '';
  });
  $('cancel').addEventListener('click', () => void api.cancel());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') void api.cancel(); });
})();

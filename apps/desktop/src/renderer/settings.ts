/**
 * Script trang Cài đặt (chạy trong cửa sổ, không có Node). Không import gì: build ra script thường.
 * Chữ hiển thị do tiến trình chính gửi sang theo ngôn ngữ đang chọn. Dựng DOM bằng textContent, không dùng innerHTML.
 */
interface SettingsState {
  t: Record<string, string>;
  lang: 'vi' | 'en';
  serverUrl: string;
  user: { ho_ten: string; email: string } | null;
  /** Bản dev ⇒ hiện mục tự đặt trang chính. */
  dev: boolean;
  homeUrl: string;
  devHomeUrl: string | null;
  /** Mật khẩu hệ thống nguồn lưu trong máy (T08). */
  creds: { available: boolean; sources: Array<{ code: string; ten: string; username: string | null; auto: boolean }> };
}
interface ValaSettingsApi {
  state(): Promise<SettingsState>;
  setLang(lang: string): Promise<SettingsState>;
  setTheme(theme: string): Promise<SettingsState>;
  saveHome(url: string | null): Promise<{ ok: boolean; message?: string; state?: SettingsState }>;
  signIn(): Promise<void>;
  onChanged(cb: () => void): void;
  logout(): Promise<SettingsState>;
  openPortal(): Promise<void>;
  credSave(code: string, username: string, password: string): Promise<{ ok: boolean; message: string; state: SettingsState }>;
  credDelete(code: string): Promise<SettingsState>;
  credAuto(code: string, auto: boolean): Promise<SettingsState>;
}

(() => {
  const vala = (window as unknown as { vala: ValaSettingsApi }).vala;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  let st: SettingsState;

  // ---- sáng / tối: lựa chọn chung của ứng dụng (prefs.ts), áp qua prefers-color-scheme ----
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => media.matches;
  const applyTheme = () => {
    document.documentElement.classList.toggle('dark', isDark());
    const b = $('theme');
    if (st) { b.textContent = isDark() ? '☀' : '☾'; b.title = isDark() ? st.t.lightMode : st.t.darkMode; b.setAttribute('aria-label', b.title); }
  };
  $('theme').addEventListener('click', () => void vala.setTheme(isDark() ? 'light' : 'dark'));
  media.addEventListener('change', applyTheme);

  const note = (id: string, text: string, tone: 'ok' | 'err' | '') => {
    const el = $(id);
    el.textContent = text;
    el.className = `mt-2 text-sm ${tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'err' ? 'text-red-700 dark:text-red-400' : ''}`;
  };

  function render(next: SettingsState) {
    st = next;
    const t = st.t;
    document.documentElement.lang = st.lang;
    document.title = t.title;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-t]'))) el.textContent = t[el.dataset.t!] ?? '';
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lang]'))) b.setAttribute('aria-pressed', String(b.dataset.lang === st.lang));
    $('home-section').hidden = !st.dev;
    if (st.dev && document.activeElement !== $('home')) ($('home') as HTMLInputElement).value = st.devHomeUrl ?? st.homeUrl;
    $('home-reset').hidden = !st.devHomeUrl;
    const signedIn = !!st.user;
    $('signed-in').hidden = !signedIn;
    $('signed-out').hidden = signedIn;
    if (st.user) {
      $('user-name').textContent = `${st.user.ho_ten} (${st.user.email})`;
      $('user-server').textContent = st.serverUrl;
    }
    renderCreds();
    applyTheme();
  }

  /** Danh sách mật khẩu đã lưu + form lưu / đổi. Dựng DOM bằng textContent. */
  function renderCreds() {
    const t = st.t;
    $('cred-section').hidden = !st.user || !st.creds.sources.length;
    $('cred-unavailable').hidden = st.creds.available;
    ($('cred-form') as HTMLFormElement).hidden = !st.creds.available;
    const list = $('cred-list');
    list.replaceChildren();
    for (const s of st.creds.sources) {
      const li = document.createElement('li');
      li.className = 'flex flex-wrap items-center gap-2 py-2';
      const name = document.createElement('span');
      name.className = 'flex-1 min-w-0';
      const b = document.createElement('div'); b.className = 'font-medium'; b.textContent = s.ten;
      const u = document.createElement('div'); u.className = 'text-slate-500 dark:text-slate-400 break-all'; u.textContent = s.username ?? t.credNone;
      name.append(b, u);
      li.append(name);
      if (s.username) {
        const lab = document.createElement('label');
        lab.className = 'flex items-center gap-1';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = s.auto;
        cb.addEventListener('change', async () => render(await vala.credAuto(s.code, cb.checked)));
        lab.append(cb, document.createTextNode(t.credAuto));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'rounded-md border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950';
        del.textContent = t.credDelete;
        del.addEventListener('click', async () => render(await vala.credDelete(s.code)));
        li.append(lab, del);
      }
      list.append(li);
    }
    const sel = $('cred-source') as HTMLSelectElement;
    const keep = sel.value;
    sel.replaceChildren(...st.creds.sources.map((s) => { const o = document.createElement('option'); o.value = s.code; o.textContent = s.ten; return o; }));
    if (keep) sel.value = keep;
    ($('cred-user') as HTMLInputElement).placeholder = t.credUser;
    ($('cred-pass') as HTMLInputElement).placeholder = t.credPass;
  }

  $('cred-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('cred-user') as HTMLInputElement;
    const pass = $('cred-pass') as HTMLInputElement;
    const r = await vala.credSave(($('cred-source') as HTMLSelectElement).value, user.value.trim(), pass.value);
    pass.value = '';
    if (r.ok) user.value = '';
    render(r.state);
    note('cred-note', r.message, r.ok ? 'ok' : 'err');
  });

  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lang]'))) {
    b.addEventListener('click', async () => {
      // Thông báo cũ đang ở ngôn ngữ trước ⇒ xoá thay vì để lẫn hai thứ tiếng.
      note('home-note', '', '');
      render(await vala.setLang(b.dataset.lang!));
    });
  }

  const saveHome = async (url: string | null) => {
    const r = await vala.saveHome(url);
    if (r.state) render(r.state);
    note('home-note', r.message ?? '', r.ok ? 'ok' : 'err');
  };
  $('home-form').addEventListener('submit', (e) => { e.preventDefault(); void saveHome(($('home') as HTMLInputElement).value); });
  $('home-reset').addEventListener('click', () => void saveHome(null));

  $('sign-in').addEventListener('click', () => void vala.signIn());
  // Đăng nhập ở tab Báo cáo / đăng xuất trong lúc cửa sổ đang mở ⇒ vẽ lại.
  vala.onChanged(() => void vala.state().then(render));
  $('logout').addEventListener('click', async () => render(await vala.logout()));
  $('open-portal').addEventListener('click', () => void vala.openPortal());

  void vala.state().then(render);
  applyTheme();
})();

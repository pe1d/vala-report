/**
 * Script trang Cài đặt (chạy trong cửa sổ, không có Node). Không import gì: build ra script thường.
 * Chữ hiển thị do tiến trình chính gửi sang theo ngôn ngữ đang chọn. Dựng DOM bằng textContent, không dùng innerHTML.
 */
interface SettingsState {
  t: Record<string, string>;
  lang: 'vi' | 'en';
  homeUrl: string;
  serverUrl: string;
  user: { ho_ten: string; email: string } | null;
}
interface ValaSettingsApi {
  state(): Promise<SettingsState>;
  setLang(lang: string): Promise<SettingsState>;
  saveHome(url: string): Promise<{ ok: boolean; message: string; state?: SettingsState }>;
  login(server: string, username: string, password: string): Promise<{ ok: boolean; message?: string; state?: SettingsState }>;
  logout(): Promise<SettingsState>;
  openPortal(): Promise<void>;
}

(() => {
  const vala = (window as unknown as { vala: ValaSettingsApi }).vala;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  let st: SettingsState;

  // ---- sáng / tối: lưu lựa chọn, mặc định theo hệ điều hành ----
  const THEME_KEY = 'vala.theme';
  const storedTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } };
  const isDark = () => {
    const s = storedTheme();
    return s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const applyTheme = () => {
    document.documentElement.classList.toggle('dark', isDark());
    const b = $('theme');
    if (st) { b.textContent = isDark() ? '☀' : '☾'; b.title = isDark() ? st.t.lightMode : st.t.darkMode; b.setAttribute('aria-label', b.title); }
  };
  $('theme').addEventListener('click', () => {
    try { localStorage.setItem(THEME_KEY, isDark() ? 'light' : 'dark'); } catch { /* bỏ qua */ }
    applyTheme();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

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
    ($('home') as HTMLInputElement).value = st.homeUrl;
    const signedIn = !!st.user;
    $('signed-in').hidden = !signedIn;
    $('login-form').hidden = signedIn;
    if (st.user) {
      $('user-name').textContent = `${st.user.ho_ten} (${st.user.email})`;
      $('user-server').textContent = st.serverUrl;
    } else if (!($('server') as HTMLInputElement).value) {
      ($('server') as HTMLInputElement).value = st.serverUrl;
    }
    applyTheme();
  }

  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lang]'))) {
    b.addEventListener('click', async () => {
      // Thông báo cũ đang ở ngôn ngữ trước ⇒ xoá thay vì để lẫn hai thứ tiếng.
      note('home-note', '', '');
      note('login-note', '', '');
      render(await vala.setLang(b.dataset.lang!));
    });
  }

  $('home-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await vala.saveHome(($('home') as HTMLInputElement).value);
    if (r.state) render(r.state);
    note('home-note', r.message, r.ok ? 'ok' : 'err');
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = st.t.loggingIn;
    note('login-note', '', '');
    try {
      const r = await vala.login(($('server') as HTMLInputElement).value, ($('username') as HTMLInputElement).value, ($('password') as HTMLInputElement).value);
      ($('password') as HTMLInputElement).value = '';
      if (r.state) render(r.state);
      if (!r.ok) note('login-note', r.message ?? '', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = st.t.login;
    }
  });

  $('logout').addEventListener('click', async () => render(await vala.logout()));
  $('open-portal').addEventListener('click', () => void vala.openPortal());

  void vala.state().then(render);
  applyTheme();
})();

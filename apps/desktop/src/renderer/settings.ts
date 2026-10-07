/**
 * Script tab Cài đặt (chạy trong trang, không có Node). Không import gì: build ra script thường.
 * Chữ hiển thị do tiến trình chính gửi theo ngôn ngữ đang chọn. Dựng DOM bằng textContent, không dùng innerHTML.
 * Mục đang xem nằm trên #hash (vd #khoi-dong) để menu của ứng dụng mở thẳng tới mục đó.
 */
interface SettingsState {
  t: Record<string, string>;
  lang: 'vi' | 'en';
  theme: 'light' | 'dark' | 'system';
  dev: boolean;
  version: string;
  serverUrl: string;
  user: { ho_ten: string; email: string } | null;
  homeUrl: string;
  devHomeUrl: string | null;
  autostart: { enabled: boolean; supported: boolean };
  update: { pending: string | null; canUpdate: boolean };
}
interface ValaSettingsApi {
  state(): Promise<SettingsState>;
  setLang(lang: string): Promise<SettingsState>;
  setTheme(theme: string): Promise<SettingsState>;
  setAutostart(on: boolean): Promise<SettingsState>;
  saveHome(url: string | null): Promise<{ ok: boolean; message?: string; state?: SettingsState }>;
  signIn(): Promise<void>;
  logout(): Promise<SettingsState>;
  openPortal(): Promise<void>;
  checkUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onChanged(cb: () => void): void;
  onSection(cb: (s: string) => void): void;
}

(() => {
  const vala = (window as unknown as { vala: ValaSettingsApi }).vala;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  const all = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
  let st: SettingsState | null = null;

  // Sáng / tối: lựa chọn chung của ứng dụng (prefs.ts), áp qua prefers-color-scheme.
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);
  applyTheme();

  // ---- chuyển mục ----
  const SECTIONS = ['tai-khoan', 'mat-khau', 'giao-dien', 'khoi-dong', 'gioi-thieu', 'trang-chinh'];
  function go(section: string) {
    const s = SECTIONS.includes(section) && (section !== 'trang-chinh' || st?.dev) ? section : 'tai-khoan';
    for (const p of all('[data-panel]')) p.hidden = p.dataset.panel !== s;
    for (const b of all('[data-section]')) {
      if (b.dataset.section === s) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (location.hash.slice(1) !== s) history.replaceState(null, '', `#${s}`);
  }
  for (const b of all('[data-section]')) b.addEventListener('click', () => go(b.dataset.section!));
  vala.onSection(go);

  // ---- vẽ ----
  function render(next: SettingsState) {
    st = next;
    const t = next.t;
    document.documentElement.lang = next.lang;
    document.title = t.title;
    for (const e of all('[data-t]')) e.textContent = t[e.dataset.t!] ?? '';
    $('nav-home').hidden = !next.dev;

    $('signed-in').hidden = !next.user;
    $('signed-out').hidden = !!next.user;
    if (next.user) {
      $('user-name').textContent = `${next.user.ho_ten} (${next.user.email})`;
      $('user-server').textContent = next.serverUrl;
    }

    for (const b of all('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === next.lang));
    for (const b of all('[data-theme]')) b.setAttribute('aria-pressed', String(b.dataset.theme === next.theme));

    const auto = $<HTMLInputElement>('autostart');
    auto.checked = next.autostart.enabled;
    auto.disabled = !next.autostart.supported;
    $('autostart-dev').hidden = next.autostart.supported;

    $('version').textContent = next.version;
    $('update-hint').textContent = next.update.canUpdate ? t.updateHint : t.noUpdate;
    $<HTMLButtonElement>('check-update').disabled = !next.update.canUpdate;
    const install = $<HTMLButtonElement>('install-update');
    install.hidden = !next.update.pending;
    install.textContent = next.update.pending ? `${t.installUpdate} ${next.update.pending}` : '';

    $<HTMLInputElement>('home').value = next.devHomeUrl ?? next.homeUrl;
    applyTheme();
  }

  // ---- thao tác ----
  for (const b of all('[data-lang]')) b.addEventListener('click', async () => render(await vala.setLang(b.dataset.lang!)));
  for (const b of all('[data-theme]')) b.addEventListener('click', async () => render(await vala.setTheme(b.dataset.theme!)));
  $<HTMLInputElement>('autostart').addEventListener('change', async (e) => render(await vala.setAutostart((e.target as HTMLInputElement).checked)));
  $('sign-in').addEventListener('click', () => void vala.signIn());
  $('logout').addEventListener('click', async () => render(await vala.logout()));
  $('open-portal').addEventListener('click', () => void vala.openPortal());
  $('check-update').addEventListener('click', () => void vala.checkUpdate());
  $('install-update').addEventListener('click', () => void vala.installUpdate());

  const homeNote = (text: string, ok: boolean) => {
    const n = $('home-note');
    n.textContent = text;
    n.className = `mt-2 text-sm ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`;
  };
  const saveHome = async (url: string | null) => {
    const r = await vala.saveHome(url);
    if (r.state) render(r.state);
    homeNote(r.message ?? '', r.ok);
  };
  $('home-form').addEventListener('submit', (e) => { e.preventDefault(); void saveHome($<HTMLInputElement>('home').value); });
  $('home-reset').addEventListener('click', () => void saveHome(null));

  vala.onChanged(() => void vala.state().then(render));
  void vala.state().then((s) => { render(s); go(location.hash.slice(1)); });
})();

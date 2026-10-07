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
  whatsNew: { current: string[] | null; pending: string[] | null };
  passwords: { available: boolean; sources: PwRow[]; sites: PwRow[]; never: { code: string; ten: string }[] };
}
interface PwRow { code: string; ten: string; username: string | null; auto: boolean; savedAt: string | null }
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
  pwAuto(code: string, on: boolean): Promise<SettingsState>;
  pwEdit(code: string): Promise<void>;
  pwDelete(code: string): Promise<SettingsState>;
  pwAllow(code: string): Promise<SettingsState>;
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

  // ---- mật khẩu ----
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const button = (label: string, cls: string, onClick: () => void, disabled = false) => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };

  function pwRow(r: PwRow, s: SettingsState): HTMLLIElement {
    const t = s.t;
    const li = el('li', 'flex flex-wrap items-center gap-x-4 gap-y-2 py-3');
    const info = el('div', 'min-w-0 flex-1');
    info.append(el('div', 'break-all text-sm font-medium', r.ten));
    const when = r.savedAt ? ` · ${t.pwSavedAt} ${new Date(r.savedAt).toLocaleString(s.lang === 'vi' ? 'vi-VN' : 'en-GB')}` : '';
    info.append(el('div', 'muted break-all', r.username ? `${r.username}${when}` : t.pwNotSaved));
    li.append(info);
    if (r.username) {
      const label = el('label', 'flex items-center gap-2 text-sm');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = r.auto;
      box.addEventListener('change', async () => render(await vala.pwAuto(r.code, box.checked)));
      label.append(box, el('span', '', t.pwAuto));
      li.append(label);
    }
    const acts = el('div', 'flex gap-2');
    acts.append(button(r.username ? t.pwChange : t.pwSave, 'btn-sm', () => void vala.pwEdit(r.code), !s.passwords.available));
    if (r.username) {
      acts.append(button(t.pwDelete, 'btn-sm text-red-700 dark:text-red-400', async () => {
        if (confirm(`${t.pwConfirmDelete} ${r.ten} (${r.username})?`)) render(await vala.pwDelete(r.code));
      }));
    }
    li.append(acts);
    return li;
  }

  function renderPasswords(s: SettingsState) {
    const p = s.passwords;
    $('pw-unavailable').hidden = p.available;
    $('pw-sources').replaceChildren(...p.sources.map((r) => pwRow(r, s)));
    $('pw-sources-empty').hidden = !!s.user || p.sources.length > 0;
    $('pw-sites').replaceChildren(...p.sites.map((r) => pwRow(r, s)));
    $('pw-sites-empty').hidden = p.sites.length > 0;
    $('pw-never-card').hidden = !p.never.length;
    $('pw-never').replaceChildren(...p.never.map((n) => {
      const li = el('li', 'flex items-center gap-4 py-3');
      li.append(el('div', 'min-w-0 flex-1 break-all text-sm', n.ten), button(s.t.pwAllow, 'btn-sm', async () => render(await vala.pwAllow(n.code))));
      return li;
    }));
  }

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
    const list = (id: string, items: string[] | null) => {
      $(id).replaceChildren(...(items ?? []).map((x) => el('li', '', x)));
      return !!items?.length;
    };
    $('whats-new-pending').hidden = !(next.update.pending && list('whats-new-pending-list', next.whatsNew.pending));
    $('whats-new-pending-title').textContent = `${t.whatsNewPending} ${next.update.pending ?? ''}`;
    $('whats-new-current').hidden = !list('whats-new-current-list', next.whatsNew.current);

    renderPasswords(next);

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

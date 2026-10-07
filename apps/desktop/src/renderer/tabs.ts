/**
 * Script thanh tab (chạy trong trang, không có Node). Không import gì: build ra script thường.
 * Chỉ có thanh tab (không ô địa chỉ, không nút điều hướng — đây là ứng dụng, không phải trình duyệt).
 * Trạng thái (danh sách tab, tab đang chọn, chữ theo ngôn ngữ) do tiến trình chính gửi sang qua 'tabs:state'.
 * Dựng DOM bằng textContent, không dùng innerHTML (tiêu đề tab là chữ của trang web bất kỳ).
 * Mỗi tab giữ nguyên phần tử giữa các lần vẽ, chỉ cập nhật chỗ đổi — dựng lại toàn bộ làm favicon tải lại, thanh tab giật.
 * Không có biểu tượng "đang tải": trang như vala.bkav.com tải ngầm liên tục, tab sẽ xoay mãi.
 */
interface TabView {
  key: string;
  pinned: boolean;
  label: string;
  title: string;
  favicon: string | null;
  status: 'ok' | 'warn' | 'off' | null;
}
interface TabsState {
  lang: 'vi' | 'en';
  t: Record<string, string> & { status: Record<'ok' | 'warn' | 'off', string> };
  active: string | null;
  tabs: TabView[];
  /** Bản chạy từ mã nguồn ("Vala Desktop (dev)") ⇒ hiện nhãn DEV. */
  dev: boolean;
  /** Người đang đăng nhập (null ⇒ nút "Đăng nhập"). */
  profile: { name: string; email: string; initials: string } | null;
  /** Bản mới đã tải xong, chờ cài. */
  update: { label: string; title: string } | null;
}
interface ValaTabsApi {
  ready(): Promise<void>;
  activate(key: string): Promise<void>;
  close(key: string): Promise<void>;
  menu(x: number, y: number): Promise<void>;
  setLang(lang: string): Promise<void>;
  setTheme(theme: string): Promise<void>;
  resized(): void;
  installUpdate(): Promise<void>;
  profile(x: number, y: number): Promise<void>;
  signIn(): Promise<void>;
  onState(cb: (s: TabsState) => void): void;
}

(() => {
  const api = (window as unknown as { valaTabs: ValaTabsApi }).valaTabs;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  let st: TabsState | null = null;

  // ---- sáng / tối: lựa chọn chung của ứng dụng (prefs.ts) — tiến trình chính đặt nativeTheme nên prefers-color-scheme
  // của trang này (và của cổng, Cài đặt…) luôn đúng lựa chọn đó ----
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => media.matches;
  // Bản cũ lưu lựa chọn trong localStorage của trang này ⇒ chuyển một lần sang cấu hình chung.
  try {
    const old = localStorage.getItem('vala.theme');
    if (old) { localStorage.removeItem('vala.theme'); void api.setTheme(old); }
  } catch { /* bỏ qua */ }
  const applyTheme = () => {
    document.documentElement.classList.toggle('dark', isDark());
    const b = $('theme');
    b.textContent = isDark() ? '☀' : '☾';
    if (st) { b.title = isDark() ? st.t.lightMode : st.t.darkMode; b.setAttribute('aria-label', b.title); }
  };
  $('theme').addEventListener('click', () => void api.setTheme(isDark() ? 'light' : 'dark'));
  media.addEventListener('change', applyTheme);

  const DOT: Record<'ok' | 'warn' | 'off', string> = {
    ok: 'bg-emerald-500', warn: 'bg-amber-500', off: 'bg-slate-400 dark:bg-slate-500',
  };

  /** Phần tử của một tab: tạo một lần, cập nhật tại chỗ. Ô biểu tượng cố định 16px (favicon hoặc chữ cái đầu). */
  interface TabNode { el: HTMLElement; icon: HTMLImageElement; letter: HTMLElement; label: HTMLElement; dot: HTMLElement; close: HTMLButtonElement | null }
  const nodes = new Map<string, TabNode>();
  const separator = document.createElement('span');
  separator.className = 'mx-1 mb-2 h-4 w-px shrink-0 bg-slate-400 dark:bg-slate-700';

  const setIf = (el: HTMLElement, attr: string, v: string) => { if (el.getAttribute(attr) !== v) el.setAttribute(attr, v); };
  /** Ẩn/hiện bằng style — thuộc tính `hidden` thua class Tailwind có display (vd `flex`) nên không ẩn được. */
  const display = (el: HTMLElement, on: boolean) => { const v = on ? '' : 'none'; if (el.style.display !== v) el.style.display = v; };

  function createNode(tab: TabView): TabNode {
    const el = document.createElement('div');
    el.setAttribute('role', 'tab');
    el.addEventListener('mousedown', (e) => { if (e.button === 0) void api.activate(tab.key); });
    // Bấm chuột giữa ⇒ đóng tab (tab đóng được).
    el.addEventListener('auxclick', (e) => { if (e.button === 1 && !tab.pinned) void api.close(tab.key); });
    const box = document.createElement('span');
    box.className = 'flex h-4 w-4 shrink-0 items-center justify-center';
    // Chưa có favicon dùng được ⇒ chữ cái đầu của tên tab trong ô màu (không để ô trống).
    const letter = document.createElement('span');
    letter.className = 'flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-[10px] font-semibold leading-none text-white dark:bg-blue-500';
    const icon = document.createElement('img');
    icon.alt = '';
    icon.className = 'h-4 w-4';
    display(icon, false);
    const showIcon = (ok: boolean) => { display(icon, ok); display(letter, !ok); };
    icon.addEventListener('error', () => showIcon(false));
    // Ảnh 1×1 (favicon rỗng/trong suốt) coi như không có.
    icon.addEventListener('load', () => showIcon(icon.naturalWidth > 1 && icon.naturalHeight > 1));
    box.append(letter, icon);
    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1 truncate';
    const dot = document.createElement('span');
    display(dot, false);
    el.append(box, label, dot);
    let close: HTMLButtonElement | null = null;
    if (!tab.pinned) {
      close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.className = 'flex h-5 w-5 shrink-0 items-center justify-center rounded text-base leading-none text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700';
      close.addEventListener('mousedown', (e) => e.stopPropagation());
      close.addEventListener('click', () => void api.close(tab.key));
      el.append(close);
    }
    return { el, icon, letter, label, dot, close };
  }


  function updateNode(n: TabNode, tab: TabView, isActive: boolean, s: TabsState) {
    setIf(n.el, 'aria-selected', String(isActive));
    setIf(n.el, 'title', tab.status ? `${tab.title} — ${s.t.status[tab.status]}` : tab.title);
    setIf(n.el, 'class', [
      'group flex h-[32px] shrink-0 cursor-default items-center gap-2 rounded-t-lg px-3 text-[13px]',
      tab.pinned ? 'max-w-[180px]' : 'w-[200px] min-w-[90px] shrink',
      isActive
        ? 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100'
        : 'text-slate-600 hover:bg-slate-300/70 dark:text-slate-400 dark:hover:bg-slate-800/70',
    ].join(' '));
    // Chỉ đổi ảnh khi địa chỉ favicon đổi — gán lại cùng địa chỉ cũng làm ảnh nháy.
    const fav = tab.favicon ?? '';
    if ((n.icon.dataset.src ?? '') !== fav) {
      n.icon.dataset.src = fav;
      display(n.icon, false);
      display(n.letter, true);
      if (fav) n.icon.src = fav; else n.icon.removeAttribute('src');
    }
    const initial = (tab.label.trim()[0] ?? '•').toUpperCase();
    if (n.letter.textContent !== initial) n.letter.textContent = initial;
    if (n.label.textContent !== tab.label) n.label.textContent = tab.label;
    display(n.dot, !!tab.status);
    if (tab.status) {
      setIf(n.dot, 'class', `h-2 w-2 shrink-0 rounded-full ${DOT[tab.status]}`);
      setIf(n.dot, 'aria-label', s.t.status[tab.status]);
    }
    if (n.close) { setIf(n.close, 'title', s.t.close); setIf(n.close, 'aria-label', s.t.close); }
  }

  let lastActive: string | null = null;

  function render(s: TabsState) {
    st = s;
    document.documentElement.lang = s.lang;
    const list = $('tabs');
    const keys = new Set(s.tabs.map((t) => t.key));
    for (const [k] of nodes) if (!keys.has(k)) nodes.delete(k);
    const wanted: HTMLElement[] = [];
    s.tabs.forEach((tab, i) => {
      let n = nodes.get(tab.key);
      if (!n) { n = createNode(tab); nodes.set(tab.key, n); }
      updateNode(n, tab, tab.key === s.active, s);
      wanted.push(n.el);
      // Vạch ngăn giữa nhóm tab cố định và tab đóng được.
      const next = s.tabs[i + 1];
      if (tab.pinned && next && !next.pinned) wanted.push(separator);
    });
    // Chỉ sắp lại khi thứ tự đổi (thêm/bớt tab) — giữ nguyên phần tử nên không nháy.
    const current = Array.from(list.children);
    if (current.length !== wanted.length || current.some((c, i) => c !== wanted[i])) list.replaceChildren(...wanted);
    if (s.active !== lastActive) {
      lastActive = s.active;
      list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    display($('dev'), s.dev);
    display($('sign-in'), !s.profile);
    display($('profile'), !!s.profile);
    setIf($('sign-in'), 'title', s.t.signInTitle);
    if ($('sign-in').textContent !== s.t.signIn) $('sign-in').textContent = s.t.signIn;
    if (s.profile) {
      if ($('avatar').textContent !== s.profile.initials) $('avatar').textContent = s.profile.initials;
      if ($('profile-name').textContent !== s.profile.name) $('profile-name').textContent = s.profile.name;
      setIf($('profile'), 'title', `${s.profile.name} — ${s.profile.email}`);
      setIf($('profile'), 'aria-label', `${s.t.account}: ${s.profile.name}`);
    }
    const up = $('update');
    display(up, !!s.update);
    if (s.update) { if (up.textContent !== s.update.label) up.textContent = s.update.label; up.title = s.update.title; }

    $('menu').title = s.t.menu;
    $('menu').setAttribute('aria-label', s.t.menu);
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lang]'))) b.setAttribute('aria-pressed', String(b.dataset.lang === s.lang));
    applyTheme();
  }

  $('menu').addEventListener('click', () => {
    const r = $('menu').getBoundingClientRect();
    void api.menu(r.left, r.bottom);
  });
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lang]'))) {
    b.addEventListener('click', () => void api.setLang(b.dataset.lang!));
  }

  // Ẩn bằng JS: CSP của trang chặn thuộc tính style viết trong HTML.
  display($('update'), false);
  display($('dev'), false);
  display($('sign-in'), false);
  display($('profile'), false);
  $('sign-in').addEventListener('click', () => void api.signIn());
  $('profile').addEventListener('click', () => {
    const r = $('profile').getBoundingClientRect();
    void api.profile(r.left, r.bottom);
  });
  $('update').addEventListener('click', () => void api.installUpdate());
  api.onState(render);
  // Trang thanh tab phủ cả cửa sổ: khung nhìn đổi cỡ = cửa sổ đổi cỡ ⇒ báo tiến trình chính canh lại nội dung tab.
  window.addEventListener('resize', () => api.resized());
  applyTheme();
  void api.ready();
})();

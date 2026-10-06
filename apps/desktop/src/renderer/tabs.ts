/**
 * Script thanh tab (chạy trong trang, không có Node). Không import gì: build ra script thường.
 * Chỉ có thanh tab (không ô địa chỉ, không nút điều hướng — đây là ứng dụng, không phải trình duyệt).
 * Trạng thái (danh sách tab, tab đang chọn, chữ theo ngôn ngữ) do tiến trình chính gửi sang qua 'tabs:state'.
 * Dựng DOM bằng textContent, không dùng innerHTML (tiêu đề tab là chữ của trang web bất kỳ).
 */
interface TabView {
  key: string;
  pinned: boolean;
  label: string;
  title: string;
  loading: boolean;
  favicon: string | null;
  status: 'ok' | 'warn' | 'off' | null;
}
interface TabsState {
  lang: 'vi' | 'en';
  t: Record<string, string> & { status: Record<'ok' | 'warn' | 'off', string> };
  active: string | null;
  tabs: TabView[];
}
interface ValaTabsApi {
  ready(): Promise<void>;
  activate(key: string): Promise<void>;
  close(key: string): Promise<void>;
  menu(x: number, y: number): Promise<void>;
  setLang(lang: string): Promise<void>;
  onState(cb: (s: TabsState) => void): void;
}

(() => {
  const api = (window as unknown as { valaTabs: ValaTabsApi }).valaTabs;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  let st: TabsState | null = null;

  // ---- sáng / tối: dùng chung lựa chọn với trang Cài đặt (cùng localStorage), mặc định theo hệ điều hành ----
  const THEME_KEY = 'vala.theme';
  const stored = () => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } };
  const isDark = () => { const s = stored(); return s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; };
  const applyTheme = () => {
    document.documentElement.classList.toggle('dark', isDark());
    const b = $('theme');
    b.textContent = isDark() ? '☀' : '☾';
    if (st) { b.title = isDark() ? st.t.lightMode : st.t.darkMode; b.setAttribute('aria-label', b.title); }
  };
  $('theme').addEventListener('click', () => { try { localStorage.setItem(THEME_KEY, isDark() ? 'light' : 'dark'); } catch { /* bỏ qua */ } applyTheme(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) applyTheme(); });

  const DOT: Record<'ok' | 'warn' | 'off', string> = {
    ok: 'bg-emerald-500', warn: 'bg-amber-500', off: 'bg-slate-400 dark:bg-slate-500',
  };

  function tabEl(tab: TabView, isActive: boolean, s: TabsState): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(isActive));
    el.title = tab.status ? `${tab.title} — ${s.t.status[tab.status]}` : tab.title;
    el.className = [
      'group flex h-[32px] shrink-0 cursor-default items-center gap-2 rounded-t-lg px-3 text-[13px]',
      tab.pinned ? 'max-w-[180px]' : 'w-[200px] min-w-[90px] shrink',
      isActive
        ? 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100'
        : 'text-slate-600 hover:bg-slate-300/70 dark:text-slate-400 dark:hover:bg-slate-800/70',
    ].join(' ');
    el.addEventListener('mousedown', (e) => { if (e.button === 0) void api.activate(tab.key); });
    // Bấm chuột giữa ⇒ đóng tab (như Edge).
    el.addEventListener('auxclick', (e) => { if (e.button === 1 && !tab.pinned) void api.close(tab.key); });

    if (tab.loading) {
      const spin = document.createElement('span');
      spin.className = 'h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400';
      el.append(spin);
    } else if (tab.favicon) {
      const img = document.createElement('img');
      img.src = tab.favicon;
      img.alt = '';
      img.className = 'h-4 w-4 shrink-0';
      img.addEventListener('error', () => img.remove());
      el.append(img);
    }
    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1 truncate';
    label.textContent = tab.label;
    el.append(label);
    if (tab.status) {
      const dot = document.createElement('span');
      dot.className = `h-2 w-2 shrink-0 rounded-full ${DOT[tab.status]}`;
      dot.setAttribute('aria-label', s.t.status[tab.status]);
      el.append(dot);
    }
    if (!tab.pinned) {
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.title = s.t.close;
      x.setAttribute('aria-label', s.t.close);
      x.className = 'flex h-5 w-5 shrink-0 items-center justify-center rounded text-base leading-none text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700';
      x.addEventListener('mousedown', (e) => e.stopPropagation());
      x.addEventListener('click', () => void api.close(tab.key));
      el.append(x);
    }
    return el;
  }

  function render(s: TabsState) {
    st = s;
    document.documentElement.lang = s.lang;
    const list = $('tabs');
    list.replaceChildren(...s.tabs.flatMap((tab, i) => {
      const el = tabEl(tab, tab.key === s.active, s);
      // Vạch ngăn giữa nhóm tab ghim và tab thường.
      const next = s.tabs[i + 1];
      if (tab.pinned && next && !next.pinned) {
        const sep = document.createElement('span');
        sep.className = 'mx-1 mb-2 h-4 w-px shrink-0 bg-slate-400 dark:bg-slate-700';
        return [el, sep];
      }
      return [el];
    }));
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

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

  api.onState(render);
  applyTheme();
  void api.ready();
})();

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

  /** Phần tử của một tab: tạo một lần, cập nhật tại chỗ. Ô biểu tượng cố định 16px (favicon hoặc chữ cái đầu). */
  interface TabNode { el: HTMLElement; icon: HTMLImageElement; letter: HTMLElement; label: HTMLElement; dot: HTMLElement; close: HTMLButtonElement | null }
  const nodes = new Map<string, TabNode>();
  const separator = document.createElement('span');
  separator.className = 'mx-1 mb-2 h-4 w-px shrink-0 bg-slate-400 dark:bg-slate-700';

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
    icon.hidden = true;
    const showIcon = (ok: boolean) => { icon.hidden = !ok; letter.hidden = ok; };
    icon.addEventListener('error', () => showIcon(false));
    // Ảnh 1×1 (favicon rỗng/trong suốt) coi như không có.
    icon.addEventListener('load', () => showIcon(icon.naturalWidth > 1 && icon.naturalHeight > 1));
    box.append(letter, icon);
    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1 truncate';
    const dot = document.createElement('span');
    dot.hidden = true;
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

  const setIf = (el: HTMLElement, attr: string, v: string) => { if (el.getAttribute(attr) !== v) el.setAttribute(attr, v); };

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
      n.icon.hidden = true;
      n.letter.hidden = false;
      if (fav) n.icon.src = fav; else n.icon.removeAttribute('src');
    }
    const initial = (tab.label.trim()[0] ?? '•').toUpperCase();
    if (n.letter.textContent !== initial) n.letter.textContent = initial;
    if (n.label.textContent !== tab.label) n.label.textContent = tab.label;
    n.dot.hidden = !tab.status;
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

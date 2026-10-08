/**
 * Script header + thanh ứng dụng dọc (chạy trong trang, không có Node). Không import gì: build ra script thường.
 * Header: thu gọn, logo, ◀ ▶ ⟳, ô tìm kiếm (Ctrl+K — mở trên lớp khung nổi), ─ □ ✕.
 * Thanh dọc: ✦ Trợ lý AI · ỨNG DỤNG (ghim) · ĐANG MỞ · hồ sơ + ⊞ ở cuối. Thu gọn ⇒ chỉ biểu tượng (tên ở tooltip).
 * Dựng DOM bằng textContent, không dùng innerHTML (tiêu đề tab là chữ của trang web bất kỳ).
 */
interface TabView {
  key: string;
  label: string;
  title: string;
  favicon: string | null;
  status: 'ok' | 'warn' | 'off' | null;
  /** Đang ghi thao tác trên tab này (recorder.ts) ⇒ chấm đỏ. */
  recording: boolean;
  /** Đã nạp trang (ứng dụng ghim chưa mở thì chữ nhạt hơn). */
  opened: boolean;
  closable: boolean;
  glyph: 'chat' | 'settings' | 'recording' | null;
}
interface TabsState {
  lang: 'vi' | 'en';
  t: Record<string, string> & { status: Record<'ok' | 'warn' | 'off', string> };
  active: string | null;
  collapsed: boolean;
  chat: TabView;
  apps: TabView[];
  open: TabView[];
  nav: { back: boolean; forward: boolean; reload: boolean };
  /** Cửa sổ đang phóng to (nút □ thành "Thu về"). */
  maximized: boolean;
  /** Chưa đăng nhập ⇒ chỉ màn hình đăng nhập: ẩn thanh ứng dụng, ô tìm kiếm, nút điều hướng. */
  signedIn: boolean;
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
  nav(cmd: 'back' | 'forward' | 'reload'): Promise<void>;
  collapse(): Promise<void>;
  overlay(kind: 'profile' | 'apps' | 'search', r: { x: number; y: number; w: number; h: number }): Promise<void>;
  win(cmd: 'minimize' | 'maximize' | 'close'): Promise<void>;
  onOpenSearch(cb: () => void): void;
  resized(): void;
  installUpdate(): Promise<void>;
  signIn(): Promise<void>;
  tabMenu(key: string, x: number, y: number): Promise<void>;
  onState(cb: (s: TabsState) => void): void;
}

(() => {
  const api = (window as unknown as { valaTabs: ValaTabsApi }).valaTabs;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

  // Sáng / tối: lựa chọn chung của ứng dụng (prefs.ts) — tiến trình chính đặt nativeTheme nên prefers-color-scheme đúng.
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);

  const DOT: Record<'ok' | 'warn' | 'off', string> = {
    ok: 'bg-emerald-500', warn: 'bg-amber-500', off: 'bg-slate-400 dark:bg-slate-500',
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const PATHS: Record<'chat' | 'settings' | 'recording' | 'close', string[]> = {
    chat: ['M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z', 'M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z'],
    settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    recording: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    close: ['M18 6L6 18', 'M6 6l12 12'],
  };
  /** Biểu tượng vẽ sẵn của mục cố định. */
  function glyph(kind: keyof typeof PATHS): SVGSVGElement {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'],
      ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['class', kind === 'close' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]']]) svg.setAttribute(k!, v!);
    for (const d of PATHS[kind]) { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); svg.append(p); }
    return svg;
  }

  const setIf = (el: Element, attr: string, v: string) => { if (el.getAttribute(attr) !== v) el.setAttribute(attr, v); };
  /** Ẩn/hiện bằng style — thuộc tính `hidden` thua class Tailwind có display (vd `flex`) nên không ẩn được. */
  const display = (el: Element, on: boolean) => { const s = (el as HTMLElement).style; const v = on ? '' : 'none'; if (s.display !== v) s.display = v; };
  const setText = (el: Element, text: string) => { if (el.textContent !== text) el.textContent = text; };

  /** Phần tử của một mục: tạo một lần, cập nhật tại chỗ (ảnh favicon không nháy). */
  interface ItemNode { el: HTMLElement; icon: HTMLImageElement; letter: HTMLElement; glyphBox: HTMLElement; label: HTMLElement; dot: HTMLElement; close: HTMLElement; glyphKind: string | null }
  const nodes = new Map<string, ItemNode>();

  function createNode(key: string): ItemNode {
    const el = document.createElement('div');
    el.setAttribute('role', 'tab');
    el.className = 'side-item group';
    el.addEventListener('mousedown', (e) => { if (e.button === 0 && !(e.target as Element).closest('[data-close]')) void api.activate(key); });
    // Bấm chuột giữa ⇒ đóng (mục đóng được).
    el.addEventListener('auxclick', (e) => { if (e.button === 1 && nodes.get(key)?.close.dataset.closable === '1') void api.close(key); });
    // Chuột phải ⇒ menu của mục (mật khẩu, ghi thao tác — tiến trình chính quyết định mục nào có menu).
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); void api.tabMenu(key, e.clientX, e.clientY); });
    const box = document.createElement('span');
    box.className = 'flex h-5 w-5 shrink-0 items-center justify-center';
    // Chưa có favicon dùng được ⇒ chữ cái đầu của tên trong ô màu (không để ô trống).
    const letter = document.createElement('span');
    letter.className = 'flex h-5 w-5 items-center justify-center rounded-md bg-blue-600 text-[11px] font-semibold leading-none text-white dark:bg-blue-500';
    const icon = document.createElement('img');
    icon.alt = '';
    icon.className = 'h-[18px] w-[18px]';
    display(icon, false);
    const glyphBox = document.createElement('span');
    glyphBox.className = 'flex h-5 w-5 items-center justify-center text-slate-600 dark:text-slate-300';
    display(glyphBox, false);
    const showIcon = (ok: boolean) => { display(icon, ok); display(letter, !ok); };
    icon.addEventListener('error', () => showIcon(false));
    // Ảnh 1×1 (favicon rỗng/trong suốt) coi như không có.
    icon.addEventListener('load', () => showIcon(icon.naturalWidth > 1 && icon.naturalHeight > 1));
    box.append(letter, icon, glyphBox);
    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1 truncate';
    const dot = document.createElement('span');
    display(dot, false);
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.close = '1';
    close.className = 'flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 opacity-0 hover:bg-slate-300 group-hover:opacity-100 dark:hover:bg-slate-700';
    close.append(glyph('close'));
    close.addEventListener('click', (e) => { e.stopPropagation(); void api.close(key); });
    el.append(box, label, dot, close);
    return { el, icon, letter, glyphBox, label, dot, close, glyphKind: null };
  }

  function updateNode(n: ItemNode, tab: TabView, isActive: boolean, s: TabsState) {
    setIf(n.el, 'aria-selected', String(isActive));
    const base = tab.status ? `${tab.title || tab.label} — ${s.t.status[tab.status]}` : (tab.title || tab.label);
    setIf(n.el, 'title', tab.recording ? `${base} — ${s.t.recording}` : base);
    n.el.classList.toggle('opacity-70', !tab.opened && !isActive);
    if (tab.glyph) {
      if (n.glyphKind !== tab.glyph) { n.glyphBox.replaceChildren(glyph(tab.glyph)); n.glyphKind = tab.glyph; }
      display(n.glyphBox, true); display(n.icon, false); display(n.letter, false);
    } else {
      display(n.glyphBox, false);
      // Chỉ đổi ảnh khi địa chỉ favicon đổi — gán lại cùng địa chỉ cũng làm ảnh nháy.
      const fav = tab.favicon ?? '';
      if ((n.icon.dataset.src ?? '') !== fav) {
        n.icon.dataset.src = fav;
        display(n.icon, false);
        display(n.letter, true);
        if (fav) n.icon.src = fav; else n.icon.removeAttribute('src');
      }
      setText(n.letter, (tab.label.trim()[0] ?? '•').toUpperCase());
    }
    setText(n.label, tab.label);
    display(n.label, !s.collapsed);
    display(n.dot, (!!tab.status || tab.recording) && !s.collapsed);
    if (tab.recording) {
      setIf(n.dot, 'class', 'h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500');
      setIf(n.dot, 'aria-label', s.t.recording);
    } else if (tab.status) {
      setIf(n.dot, 'class', `h-2 w-2 shrink-0 rounded-full ${DOT[tab.status]}`);
      setIf(n.dot, 'aria-label', s.t.status[tab.status]);
    }
    n.close.dataset.closable = tab.closable ? '1' : '0';
    display(n.close, tab.closable && !s.collapsed);
    setIf(n.close, 'title', s.t.close);
    setIf(n.close, 'aria-label', s.t.close);
    // Thu gọn: biểu tượng căn giữa.
    n.el.classList.toggle('justify-center', s.collapsed);
    n.el.classList.toggle('px-0', s.collapsed);
  }

  /** Vẽ một nhóm mục vào khung `box`; chỉ sắp lại khi thứ tự đổi (giữ phần tử ⇒ không nháy). */
  function renderList(box: HTMLElement, list: TabView[], s: TabsState) {
    const wanted = list.map((tab) => {
      let n = nodes.get(tab.key);
      if (!n) { n = createNode(tab.key); nodes.set(tab.key, n); }
      updateNode(n, tab, tab.key === s.active, s);
      return n.el;
    });
    const current = Array.from(box.children);
    if (current.length !== wanted.length || current.some((c, i) => c !== wanted[i])) box.replaceChildren(...wanted);
  }

  /** Tên nhóm; thu gọn ⇒ vạch ngăn mảnh. */
  function sectionTitle(el: HTMLElement, text: string, collapsed: boolean, show: boolean) {
    setText(el, collapsed ? '' : text);
    el.className = collapsed ? 'mx-2 my-2 border-t border-slate-300 dark:border-slate-700' : 'side-sec';
    display(el, show);
  }

  let lastActive: string | null = null;

  function render(s: TabsState) {
    document.documentElement.lang = s.lang;
    const keys = new Set([s.chat.key, ...s.apps.map((t) => t.key), ...s.open.map((t) => t.key)]);
    for (const [k] of nodes) if (!keys.has(k)) nodes.delete(k);

    // Độ rộng + bố cục theo trạng thái thu gọn (khớp SIDEBAR_W / SIDEBAR_MIN_W của browser.ts).
    const c = s.collapsed;
    $('bar').classList.toggle('w-[248px]', !c);
    $('bar').classList.toggle('w-[56px]', c);
    $('me').classList.toggle('flex-col', c);
    display($('profile-text'), !c);
    display($('profile-chev'), !c);

    renderList($('chat-slot'), [s.chat], s);
    sectionTitle($('apps-title'), s.t.appsSection, c, s.apps.length > 0);
    sectionTitle($('open-title'), s.t.openSection, c, s.open.length > 0);
    renderList($('apps'), s.apps, s);
    renderList($('open'), s.open, s);
    if (s.active !== lastActive) {
      lastActive = s.active;
      document.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
    }

    // Nút điều hướng: áp cho trang web đang xem; mờ khi đang ở trang cục bộ (Trợ lý AI, Cài đặt…).
    for (const [id, on, tip] of [['back', s.nav.back, s.t.back], ['forward', s.nav.forward, s.t.forward], ['reload', s.nav.reload, s.t.reload]] as const) {
      const b = $<HTMLButtonElement>(id);
      b.disabled = !on;
      setIf(b, 'title', tip);
      setIf(b, 'aria-label', tip);
    }
    // Chưa đăng nhập: chỉ còn logo + nút cửa sổ trên header, không có thanh ứng dụng.
    for (const id of ['bar', 'collapse', 'back', 'forward', 'reload', 'nav-sep']) display($(id), s.signedIn);
    // Ô tìm kiếm giữ chỗ (cột giữa của lưới header) để nút cửa sổ vẫn ở mép phải.
    $('search').style.visibility = s.signedIn ? '' : 'hidden';
    $('card').classList.toggle('ml-2', !s.signedIn);
    // Header: ô tìm kiếm, nút cửa sổ, nhãn DEV.
    setText($('search-text'), s.t.search);
    setIf($('search'), 'title', `${s.t.search} (Ctrl+K)`);
    setIf($('search'), 'aria-label', s.t.search);
    display($('dev-badge'), s.dev);
    display($('win-max-icon'), !s.maximized);
    display($('win-restore-icon'), s.maximized);
    for (const [id, tip] of [['win-min', s.t.minimize], ['win-max', s.maximized ? s.t.restore : s.t.maximize], ['win-close', s.t.closeWindow]] as const) {
      setIf($(id), 'title', tip);
      setIf($(id), 'aria-label', tip);
    }
    const col = $('collapse');
    setIf(col, 'title', c ? s.t.expand : s.t.collapse);
    setIf(col, 'aria-label', c ? s.t.expand : s.t.collapse);

    // Hồ sơ cuối thanh: chữ cái đầu + tên + email (+ DEV); chưa đăng nhập ⇒ nút "Đăng nhập".
    display($('sign-in'), !s.profile && !c);
    display($('profile'), !!s.profile || c);
    setIf($('sign-in'), 'title', s.t.signInTitle);
    setText($('sign-in'), s.t.signIn);
    const name = s.profile?.name ?? s.t.signIn;
    setText($('avatar'), s.profile?.initials ?? '?');
    setText($('profile-name'), name);
    setText($('profile-sub'), [s.profile?.email ?? '', s.dev ? 'DEV' : ''].filter(Boolean).join(' · '));
    setIf($('profile'), 'title', s.profile ? `${s.profile.name} — ${s.profile.email}` : s.t.signIn);
    setIf($('profile'), 'aria-label', `${s.t.account}: ${name}`);
    setIf($('apps-grid'), 'title', s.t.allApps);
    setIf($('apps-grid'), 'aria-label', s.t.allApps);
    // Bản dev: viền cam quanh ảnh đại diện (thấy được cả khi thu gọn).
    $('avatar').classList.toggle('ring-2', s.dev);
    $('avatar').classList.toggle('ring-orange-500', s.dev);

    const up = $('update');
    display(up, !!s.update);
    if (s.update) {
      setText(up, c ? '↑' : s.update.label);
      up.title = `${s.update.label} — ${s.update.title}`;
    }
    applyTheme();
  }

  const rect = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  $('back').addEventListener('click', () => void api.nav('back'));
  $('forward').addEventListener('click', () => void api.nav('forward'));
  $('reload').addEventListener('click', () => void api.nav('reload'));
  $('collapse').addEventListener('click', () => void api.collapse());
  const openSearch = () => void api.overlay('search', rect($('search')));
  $('search').addEventListener('click', openSearch);
  api.onOpenSearch(openSearch);
  $('win-min').addEventListener('click', () => void api.win('minimize'));
  $('win-max').addEventListener('click', () => void api.win('maximize'));
  $('win-close').addEventListener('click', () => void api.win('close'));
  // Bấm đúp vào header (chỗ trống) ⇒ phóng to / thu về. Vùng kéo do hệ điều hành xử lý nên thường không tới đây; giữ cho
  // trường hợp trình quản lý cửa sổ chuyển sự kiện vào trang.
  $('header').addEventListener('dblclick', (e) => { if (!(e.target as Element).closest('button')) void api.win('maximize'); });
  // Thu gọn mà chưa đăng nhập: bấm ô ảnh đại diện ⇒ đăng nhập.
  $('profile').addEventListener('click', () => void api.overlay('profile', rect($('profile'))));
  $('apps-grid').addEventListener('click', () => void api.overlay('apps', rect($('apps-grid'))));
  $('sign-in').addEventListener('click', () => void api.signIn());
  $('update').addEventListener('click', () => void api.installUpdate());

  // Ẩn bằng JS: CSP của trang chặn thuộc tính style viết trong HTML.
  display($('update'), false);
  display($('sign-in'), false);
  display($('dev-badge'), false);
  display($('win-restore-icon'), false);
  api.onState(render);
  // Trang thanh dọc phủ cả cửa sổ: khung nhìn đổi cỡ = cửa sổ đổi cỡ ⇒ báo tiến trình chính canh lại trang web.
  window.addEventListener('resize', () => api.resized());
  applyTheme();
  void api.ready();
})();

/**
 * Script header + thanh ứng dụng dọc (chạy trong trang, không có Node). Không import gì: build ra script thường.
 * Header: thu gọn, logo, ◀ ▶ ⟳, ô tìm kiếm (Ctrl+K — mở trên lớp khung nổi), ─ □ ✕.
 * Thanh dọc: ✦ Trợ lý AI · ỨNG DỤNG (ghim) · ĐANG MỞ · hồ sơ + ⊞ ở cuối. Thu gọn ⇒ chỉ biểu tượng (tên ở tooltip); rê
 * chuột vào thanh thu gọn ⇒ "xem nhanh" (như Edge): cùng trang này ở chế độ #peek (chỉ thanh dọc, luôn mở rộng) hiện trên
 * một view riêng ĐÈ lên trang web; tiến trình chính ẩn khi chuột rời vùng thanh (browser.ts showPeek).
 * Kéo thả một mục (giữ chuột trái, kéo quá 4px) ⇒ đổi thứ tự trong nhóm của nó (Ứng dụng / Đang mở) — sortable().
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
  /** Không kéo đổi chỗ được (ứng dụng mặc định của đơn vị — luôn đứng đầu nhóm Ứng dụng). */
  fixed?: boolean;
}
interface TabsState {
  lang: 'vi' | 'en';
  t: Record<string, string> & { status: Record<'ok' | 'warn' | 'off', string> };
  active: string | null;
  collapsed: boolean;
  chat: TabView;
  apps: TabView[];
  open: TabView[];
  /** Số ứng dụng chưa ghim ⇒ nút "Thêm" cuối nhóm Ứng dụng (mở nhanh, như Lark). */
  more: number;
  nav: { back: boolean; forward: boolean; reload: boolean };
  /** Nút Tải xuống: có lịch sử ⇒ hiện; đang tải ⇒ phần trăm (null nếu chưa biết tổng). */
  downloads: { has: boolean; dang_tai: number; phan_tram: number | null };
  /** Tab đang xem là ứng dụng văn bản ⇒ đang ở giao diện Vala hay trang gốc. */
  vanban: 'vala' | 'goc' | null;
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
  reorder(group: 'apps' | 'open', keys: string[]): Promise<void>;
  nav(cmd: 'back' | 'forward' | 'reload'): Promise<void>;
  vanban(mode: 'vala' | 'goc'): Promise<void>;
  collapse(): Promise<void>;
  peek(on: boolean): Promise<void>;
  onPeekSlide(cb: (open: boolean) => void): void;
  overlay(kind: 'profile' | 'search' | 'more' | 'downloads', r: { x: number; y: number; w: number; h: number }): Promise<void>;
  onOpenDownloads(cb: () => void): void;
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
  /** Bản "xem nhanh" của thanh dọc (view riêng đè lên trang web). */
  const PEEK = location.hash === '#peek';

  // Sáng / tối: lựa chọn chung của ứng dụng (prefs.ts) — tiến trình chính đặt nativeTheme nên prefers-color-scheme đúng.
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);

  const DOT: Record<'ok' | 'warn' | 'off', string> = {
    ok: 'bg-emerald-500', warn: 'bg-amber-500', off: 'bg-slate-400 dark:bg-slate-500',
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const PATHS: Record<'chat' | 'settings' | 'recording' | 'close' | 'more', string[]> = {
    more: ['M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
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
    el.dataset.key = key;
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
    n.el.dataset.fixed = tab.fixed ? '1' : '0';
    n.close.dataset.closable = tab.closable ? '1' : '0';
    display(n.close, tab.closable && !s.collapsed);
    setIf(n.close, 'title', s.t.close);
    setIf(n.close, 'aria-label', s.t.close);
  }

  /** Nút "Thêm" (⋯) cuối nhóm Ứng dụng: khung Tất cả ứng dụng (ghim + chưa ghim, trạng thái đăng nhập) bên phải thanh. */
  const moreEl = document.createElement('button');
  moreEl.type = 'button';
  moreEl.className = 'side-item text-slate-500 dark:text-slate-400';
  const moreIcon = document.createElement('span');
  moreIcon.className = 'flex h-5 w-5 shrink-0 items-center justify-center';
  moreIcon.append(glyph('more'));
  const moreLabel = document.createElement('span');
  moreLabel.className = 'min-w-0 flex-1 truncate';
  moreEl.append(moreIcon, moreLabel);
  moreEl.addEventListener('click', () => void api.overlay('more', rect(moreEl)));

  /** Vẽ một nhóm mục vào khung `box`; chỉ sắp lại khi thứ tự đổi (giữ phần tử ⇒ không nháy). */
  function renderList(box: HTMLElement, list: TabView[], s: TabsState, extra?: HTMLElement) {
    const wanted = list.map((tab) => {
      let n = nodes.get(tab.key);
      if (!n) { n = createNode(tab.key); nodes.set(tab.key, n); }
      updateNode(n, tab, tab.key === s.active, s);
      return n.el;
    });
    if (extra) wanted.push(extra);
    const current = Array.from(box.children);
    if (!dragging && (current.length !== wanted.length || current.some((c, i) => c !== wanted[i]))) box.replaceChildren(...wanted);
  }

  /**
   * Tên nhóm; thu gọn ⇒ vạch ngăn mảnh trong ô CAO BẰNG tên nhóm — các mục bên dưới không đổi chỗ giữa thu gọn / mở rộng
   * (xem nhanh đè lên đúng chỗ, như Edge).
   */
  function sectionTitle(el: HTMLElement, text: string, collapsed: boolean, show: boolean) {
    el.className = 'side-sec';
    if (collapsed) {
      if (!el.querySelector('[data-rule]')) {
        const rule = document.createElement('span');
        rule.dataset.rule = '1';
        rule.className = 'flex h-4 items-center';
        const line = document.createElement('span');
        line.className = 'h-px w-full bg-slate-300 dark:bg-slate-700';
        rule.append(line);
        el.replaceChildren(rule);
      }
    } else setText(el, text);
    display(el, show);
  }

  /** Đang kéo một mục ⇒ không bật xem nhanh, không vẽ lại thứ tự giữa chừng. */
  let dragging = false;

  /**
   * Kéo thả đổi thứ tự trong một nhóm (như thanh tab dọc của Edge): mục đang kéo đi theo chuột (chỉ trong phạm vi nhóm),
   * các mục khác trượt nhường chỗ; thả ⇒ sắp DOM ngay rồi báo tiến trình chính lưu. Mục `fixed` đứng yên ở đầu nhóm,
   * không kéo được và không thả lên trên nó được. Esc / chuột rời trang (xem nhanh bị ẩn) ⇒ huỷ. KHÔNG huỷ khi trang mất
   * focus: nhấn chuột là chọn tab, tiến trình chính chuyển focus sang trang web của tab (showTab) ⇒ thanh dọc bị blur
   * ngay đầu lần kéo; sự kiện chuột vẫn tới thanh dọc theo vị trí con trỏ.
   */
  function sortable(box: HTMLElement, group: 'apps' | 'open') {
    box.addEventListener('pointerdown', (e) => {
      const target = e.target as Element;
      const item = target.closest<HTMLElement>('[data-key]');
      if (e.button !== 0 || !item || item.parentElement !== box || item.dataset.fixed === '1' || target.closest('[data-close]')) return;
      const items = Array.from(box.children).filter((c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.key);
      const from = items.indexOf(item);
      const min = items.filter((it) => it.dataset.fixed === '1').length;
      if (items.length - min < 2) return;
      const step = items[1]!.getBoundingClientRect().top - items[0]!.getBoundingClientRect().top;
      const startY = e.clientY;
      let started = false;
      let to = from;

      /** Mục đang kéo "nhấc lên": nền đặc (đè cả nền hover), viền, bóng đổ. */
      const LIFTED = ['relative', 'z-10', 'shadow-lg', 'ring-1', 'ring-slate-300', '!bg-white', 'dark:ring-slate-600', 'dark:!bg-slate-800'];
      const shift = (it: HTMLElement, y: number) => { it.style.transform = y ? `translateY(${y}px)` : ''; };
      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', esc, true);
        if (!started) return;
        dragging = false;
        document.body.classList.remove('cursor-grabbing');
        // Bỏ hiệu ứng trước khi trả vị trí ⇒ các mục không trượt ngược lại rồi mới nhảy sang chỗ mới.
        for (const it of items) { it.style.transition = ''; shift(it, 0); }
        item.classList.remove(...LIFTED);
        item.style.cursor = '';
        if (!commit || to === from) return;
        const order = [...items];
        order.splice(to, 0, order.splice(from, 1)[0]!);
        const extra = Array.from(box.children).filter((c) => !items.includes(c as HTMLElement));
        box.replaceChildren(...order, ...extra);
        void api.reorder(group, order.map((it) => it.dataset.key!));
      };
      const move = (ev: PointerEvent) => {
        // Nhả chuột mà không nhận được pointerup (vd bản xem nhanh bị gỡ giữa chừng) ⇒ huỷ.
        if (!(ev.buttons & 1)) { finish(false); return; }
        const dy = ev.clientY - startY;
        if (!started) {
          if (Math.abs(dy) < 5) return;
          started = dragging = true;
          document.body.classList.add('cursor-grabbing');
          item.classList.add(...LIFTED);
          item.style.cursor = 'grabbing';
          for (const it of items) if (it !== item) it.style.transition = 'transform 150ms cubic-bezier(0.215, 0.61, 0.355, 1)';
        }
        const y = Math.min(Math.max(dy, (min - from) * step), (items.length - 1 - from) * step);
        shift(item, y);
        to = Math.min(Math.max(from + Math.round(y / step), min), items.length - 1);
        items.forEach((it, i) => {
          if (it !== item) shift(it, from < to && i > from && i <= to ? -step : to < from && i >= to && i < from ? step : 0);
        });
      };
      const up = () => finish(true);
      const cancel = () => finish(false);
      const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', esc, true);
    });
  }
  sortable($('apps'), 'apps');
  sortable($('open'), 'open');

  let lastActive: string | null = null;

  let collapsedNow = false;

  function render(state: TabsState) {
    // Bản xem nhanh luôn vẽ thanh mở rộng.
    const s = PEEK ? { ...state, collapsed: false } : state;
    collapsedNow = state.collapsed;
    document.documentElement.lang = s.lang;
    const keys = new Set([s.chat.key, ...s.apps.map((t) => t.key), ...s.open.map((t) => t.key)]);
    for (const [k] of nodes) if (!keys.has(k)) nodes.delete(k);

    // Độ rộng + bố cục theo trạng thái thu gọn (khớp SIDEBAR_W / SIDEBAR_MIN_W của browser.ts).
    const c = s.collapsed;
    $('bar').classList.toggle('w-[248px]', !c);
    $('bar').classList.toggle('w-[52px]', c);
    // Thu gọn: ảnh đại diện vẫn ở hàng cuối (đúng chỗ như lúc mở rộng), nút ⊞ lên trên nó.
    $('me').classList.toggle('flex-col-reverse', c);
    $('me').classList.toggle('items-start', c);
    // Xếp cột thì flex-1 (cơ sở 0) đè chiều cao h-12 của nút hồ sơ ⇒ ảnh đại diện lệch so với lúc mở rộng.
    $('profile').classList.toggle('flex-1', !c);
    display($('profile-text'), !c);
    display($('profile-chev'), !c);

    renderList($('chat-slot'), [s.chat], s);
    sectionTitle($('apps-title'), s.t.appsSection, c, s.apps.length > 0 || s.more > 0);
    sectionTitle($('open-title'), s.t.openSection, c, s.open.length > 0);
    setText(moreLabel, s.t.more);
    display(moreLabel, !c);
    setIf(moreEl, 'title', `${s.t.moreTitle} (${s.more})`);
    setIf(moreEl, 'aria-label', `${s.t.moreTitle} (${s.more})`);
    renderList($('apps'), s.apps, s, s.more > 0 ? moreEl : undefined);
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
    // Nút Tải xuống: hiện khi có lịch sử; đang tải ⇒ phần trăm (chưa biết tổng ⇒ số tệp đang tải).
    display($('dl'), s.signedIn && (s.downloads.has || s.downloads.dang_tai > 0));
    setIf($('dl'), 'title', s.t.downloads);
    setIf($('dl'), 'aria-label', s.t.downloads);
    setText($('dl-pct'), s.downloads.dang_tai ? (s.downloads.phan_tram !== null ? `${s.downloads.phan_tram}%` : `${s.downloads.dang_tai}…`) : '');
    // Ứng dụng văn bản: nút chuyển Giao diện Vala / Trang gốc.
    display($('vb-toggle'), s.signedIn && !!s.vanban);
    setIf($('vb-toggle'), 'title', s.t.vbTitle);
    for (const [id, mode, label] of [['vb-vala', 'vala', s.t.vbVala], ['vb-goc', 'goc', s.t.vbGoc]] as const) {
      const b = $(id);
      setText(b, label);
      const on = s.vanban === mode;
      setIf(b, 'aria-pressed', String(on));
      setIf(b, 'class', `rounded-full px-2.5 py-0.5 ${on ? 'bg-white font-medium text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`);
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
  $('vb-vala').addEventListener('click', () => void api.vanban('vala'));
  // Khung Tải xuống neo dưới nút (nút đang ẩn ⇒ dưới nút cửa sổ ─).
  const openDownloads = () => void api.overlay('downloads', rect($('dl').style.display === 'none' ? $('win-min') : $('dl')));
  $('dl').addEventListener('click', openDownloads);
  api.onOpenDownloads(openDownloads);
  $('vb-goc').addEventListener('click', () => void api.vanban('goc'));
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
  $('sign-in').addEventListener('click', () => void api.signIn());
  $('update').addEventListener('click', () => void api.installUpdate());

  // Ẩn bằng JS: CSP của trang chặn thuộc tính style viết trong HTML.
  display($('update'), false);
  display($('sign-in'), false);
  display($('dev-badge'), false);
  display($('win-restore-icon'), false);
  display($('vb-toggle'), false);
  display($('dl'), false);
  api.onState(render);
  if (PEEK) {
    // Chỉ thanh dọc trên nền trong suốt; thanh có nền, viền, bóng đổ (đè lên trang web bên phải).
    display($('header'), false);
    display($('card'), false);
    document.body.style.background = 'transparent';
    $('bar').classList.add('rounded-r-xl', 'border-r', 'border-slate-200', 'bg-slate-100', 'shadow-2xl', 'dark:border-slate-700', 'dark:bg-slate-900');
    // Trượt ra từ đúng mép thanh thu gọn (52px) tới đủ rộng (kể cả bóng đổ) và ngược lại — cắt bằng clip-path, chạy trên GPU.
    const bar = $('bar');
    const CLOSED = 'inset(0 calc(100% - 52px) 0 0)';
    const OPEN = 'inset(0 -24px 0 0)';
    bar.style.clipPath = CLOSED;
    bar.style.transition = 'clip-path 200ms cubic-bezier(0.215, 0.61, 0.355, 1)';
    api.onPeekSlide((open) => {
      if (open) {
        // Bắt đầu từ trạng thái thu gọn (view vừa gắn lại có thể còn khung hình cũ) rồi mới trượt ra.
        bar.style.transition = 'none';
        bar.style.clipPath = CLOSED;
        void bar.offsetWidth;
        bar.style.transition = 'clip-path 200ms cubic-bezier(0.215, 0.61, 0.355, 1)';
      }
      requestAnimationFrame(() => { bar.style.clipPath = open ? OPEN : CLOSED; });
    });
  } else {
    // Trang thanh dọc phủ cả cửa sổ: khung nhìn đổi cỡ = cửa sổ đổi cỡ ⇒ báo tiến trình chính canh lại trang web.
    window.addEventListener('resize', () => api.resized());
    // Thu gọn / mở rộng: thanh trượt cùng nhịp với khung trang (browser.ts animateSidebar, 200ms, ease-out).
    $('bar').style.transition = 'width 200ms cubic-bezier(0.215, 0.61, 0.355, 1)';
    // Thanh đang thu gọn: dừng chuột trên thanh một nhịp ⇒ xem nhanh (lướt qua thì không bật).
    let hover: number | undefined;
    $('bar').addEventListener('mouseenter', () => {
      if (!collapsedNow) return;
      hover = window.setTimeout(() => { if (!dragging) void api.peek(true); }, 250);
    });
    $('bar').addEventListener('mouseleave', () => window.clearTimeout(hover));
  }
  applyTheme();
  void api.ready();
})();

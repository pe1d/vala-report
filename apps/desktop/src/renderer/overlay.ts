/**
 * Script lớp khung nổi (chạy trong trang, không có Node). Không import gì: build ra script thường — tên kiểu đặt riêng
 * (Overlay…) để không trùng script renderer khác. Menu hồ sơ (như Claude: email, Cài đặt, ngôn ngữ, giao diện, mật khẩu,
 * đồng bộ, cập nhật, đăng xuất, thoát), khung ⊞ Tất cả ứng dụng (mở / ghim) hoặc ô tìm kiếm của header (Ctrl+K — đè đúng
 * chỗ ô tìm kiếm, kết quả xổ xuống). Dựng DOM bằng textContent (tiêu đề trang đã xem là chữ của trang web bất kỳ).
 */
interface OverlayApp { key: string; label: string; favicon: string | null; pinned: boolean; status: 'ok' | 'warn' | 'off' | null }
interface OverlayState {
  kind: 'profile' | 'apps' | 'search';
  anchor: { x: number; y: number; w: number; h: number };
  collapsed: boolean;
  lang: 'vi' | 'en';
  theme: 'light' | 'dark' | 'system';
  dev: boolean;
  t: Record<string, string>;
  profile: { name: string; email: string; initials: string } | null;
  portalPassword: boolean;
  apps: OverlayApp[];
}
type OverlayItem = { kind: 'app' | 'action' | 'chat' | 'page'; title: string; sub: string; ref: Record<string, string> };
interface OverlaySection { kind: 'recent' | 'chats' | 'apps' | 'actions' | 'history'; items: OverlayItem[] }
interface ValaOverlayApi {
  state(): Promise<OverlayState>;
  close(): Promise<void>;
  command(cmd: string): Promise<void>;
  prefs(p: { lang?: string; theme?: string }): Promise<OverlayState>;
  openApp(key: string): Promise<void>;
  pin(key: string, on: boolean): Promise<OverlayState>;
  search(q: string): Promise<OverlaySection[]>;
  pick(item: OverlayItem): Promise<void>;
  clearHistory(): Promise<OverlaySection[]>;
  onOpen(cb: () => void): void;
}

(() => {
  const api = (window as unknown as { valaOverlay: ValaOverlayApi }).valaOverlay;
  const panel = document.getElementById('panel') as HTMLElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const ICONS: Record<string, string[]> = {
    settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    language: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
    appearance: ['M12 21a9 9 0 1 0 0-18z'],
    passwords: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14v10H5z'],
    changePassword: ['M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
    sync: ['M21 12a9 9 0 0 1-15.5 6.2', 'M3 12A9 9 0 0 1 18.5 5.8', 'M21 3v6h-6', 'M3 21v-6h6'],
    update: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
    signOut: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
    signIn: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
    quit: ['M18 6L6 18', 'M6 6l12 12'],
    pin: ['M12 17v5', 'M9 3h6l-1 6 3 3v2H7v-2l3-3z'],
    search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-3.5-3.5'],
    page: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
    action: ['M13 2L4 14h7l-1 8 9-12h-7z'],
    chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'],
    app: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  };
  function icon(name: string, cls = 'h-4 w-4'): SVGSVGElement {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'],
      ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['class', cls]]) svg.setAttribute(k!, v!);
    for (const d of ICONS[name] ?? []) { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); svg.append(p); }
    return svg;
  }

  const ROW = 'flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700';
  function item(name: string, label: string, onClick: () => void, hint = ''): HTMLButtonElement {
    const b = el('button', ROW);
    b.type = 'button';
    b.append(icon(name, 'h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400'), el('span', 'min-w-0 flex-1 truncate', label));
    if (hint) b.append(el('span', 'text-xs text-slate-400', hint));
    b.addEventListener('click', onClick);
    return b;
  }
  const sep = () => el('div', 'my-1 border-t border-slate-200 dark:border-slate-700');
  /** Dải chọn (ngôn ngữ / giao diện) ngay trong menu — bấm là đổi, không cần menu con. */
  function choice(name: string, label: string, options: [string, string][], current: string, pick: (v: string) => void): HTMLElement {
    const row = el('div', 'flex items-center gap-3 px-2.5 py-1.5');
    row.append(icon(name, 'h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400'), el('span', 'min-w-0 flex-1 truncate', label));
    const seg = el('div', 'flex overflow-hidden rounded-md border border-slate-200 text-xs dark:border-slate-600');
    for (const [v, text] of options) {
      const b = el('button', `px-2 py-0.5 ${v === current ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`, text);
      b.type = 'button';
      b.addEventListener('click', () => pick(v));
      seg.append(b);
    }
    row.append(seg);
    return row;
  }

  function profileMenu(s: OverlayState): HTMLElement[] {
    const t = s.t;
    const out: HTMLElement[] = [];
    out.push(el('div', 'truncate px-2.5 pb-1.5 pt-1 text-xs text-slate-500 dark:text-slate-400', s.profile ? s.profile.email : t.signIn));
    out.push(item('settings', t.settings, () => void api.command('settings'), 'Ctrl+,'));
    out.push(choice('language', t.language, [['vi', 'Tiếng Việt'], ['en', 'English']], s.lang, (v) => void api.prefs({ lang: v }).then(render)));
    out.push(choice('appearance', t.appearance, [['light', t.light], ['dark', t.dark], ['system', t.system]], s.theme, (v) => void api.prefs({ theme: v }).then(render)));
    out.push(sep());
    out.push(item('passwords', t.passwords, () => void api.command('passwords')));
    if (s.portalPassword) out.push(item('changePassword', t.changePassword, () => void api.command('change-password')));
    if (s.profile) out.push(item('sync', t.sync, () => void api.command('sync')));
    out.push(sep());
    if (t.installUpdate) out.push(item('update', t.installUpdate, () => void api.command('install-update')));
    else out.push(item('update', t.checkUpdate, () => void api.command('check-update'), t.version));
    out.push(sep());
    out.push(s.profile ? item('signOut', t.signOut, () => void api.command('sign-out')) : item('signIn', t.signIn, () => void api.command('sign-in')));
    out.push(item('quit', t.quit, () => void api.command('quit')));
    return out;
  }

  const DOT: Record<string, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', off: 'bg-slate-400' };
  function appsPanel(s: OverlayState): HTMLElement[] {
    const t = s.t;
    const out: HTMLElement[] = [el('div', 'px-2.5 pb-0.5 pt-1 text-sm font-semibold', t.allApps), el('div', 'px-2.5 pb-2 text-xs text-slate-500 dark:text-slate-400', t.allAppsHint)];
    if (s.apps.length <= 2 && !s.profile) out.push(el('div', 'px-2.5 pb-2 text-xs text-amber-700 dark:text-amber-400', t.noApps));
    const grid = el('div', 'grid grid-cols-2 gap-1');
    for (const a of s.apps) {
      const card = el('div', 'group relative flex items-center gap-2 rounded-lg border border-transparent px-2 py-2 hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-700');
      const open = el('button', 'flex min-w-0 flex-1 items-center gap-2 text-left');
      open.type = 'button';
      const box = el('span', 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[11px] font-semibold text-white dark:bg-blue-500', (a.label.trim()[0] ?? '•').toUpperCase());
      if (a.favicon) {
        const img = el('img', 'h-5 w-5');
        img.alt = '';
        img.addEventListener('load', () => { if (img.naturalWidth > 1) { box.className = 'flex h-6 w-6 shrink-0 items-center justify-center'; box.replaceChildren(img); } });
        img.src = a.favicon;
      }
      open.append(box, el('span', 'min-w-0 flex-1 truncate', a.label));
      if (a.status) open.append(el('span', `h-2 w-2 shrink-0 rounded-full ${DOT[a.status]}`));
      open.addEventListener('click', () => void api.openApp(a.key));
      const pin = el('button', `flex h-6 w-6 shrink-0 items-center justify-center rounded ${a.pinned ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 opacity-0 group-hover:opacity-100'} hover:bg-slate-200 dark:hover:bg-slate-600`);
      pin.type = 'button';
      pin.title = a.pinned ? t.unpin : t.pin;
      pin.setAttribute('aria-label', pin.title);
      pin.setAttribute('aria-pressed', String(a.pinned));
      pin.append(icon('pin', 'h-3.5 w-3.5'));
      pin.addEventListener('click', () => void api.pin(a.key, !a.pinned).then(render));
      card.append(open, pin);
      grid.append(card);
    }
    out.push(grid);
    return out;
  }

  // ---- ô tìm kiếm (Ctrl+K) ----
  const SECTION: Record<OverlaySection['kind'], string> = { recent: 'secRecent', chats: 'secChats', apps: 'secApps', actions: 'secActions', history: 'secHistory' };
  let searchSeq = 0;
  let hi = 0;
  let picks: OverlayItem[] = [];

  function searchPanel(s: OverlayState) {
    const t = s.t;
    const box = el('div', 'flex h-9 items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-700');
    box.append(icon('search', 'h-4 w-4 shrink-0 text-slate-400'));
    const input = el('input', 'h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400');
    input.placeholder = t.searchPlaceholder;
    input.spellcheck = false;
    box.append(input, el('kbd', 'shrink-0 rounded-md border border-slate-200 px-1.5 text-[11px] text-slate-400 dark:border-slate-600', 'Esc'));
    const list = el('div', 'max-h-[min(62vh,520px)] overflow-y-auto p-1.5');
    const foot = el('div', 'flex items-center gap-2 border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-400 dark:border-slate-700');
    foot.append(el('span', 'flex-1 truncate', t.searchHint));
    const clear = el('button', 'rounded-md px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200', t.clearHistory);
    clear.type = 'button';
    foot.append(clear);

    const draw = (sections: OverlaySection[], q: string) => {
      picks = sections.flatMap((x) => x.items);
      hi = Math.min(hi, Math.max(0, picks.length - 1));
      const nodes: HTMLElement[] = [];
      if (!sections.length) nodes.push(el('p', 'px-3 py-6 text-center text-slate-500 dark:text-slate-400', q.trim() ? t.noResults : t.searchEmpty));
      let i = 0;
      for (const sec of sections) {
        // Ô trống: "Hội thoại gần đây"; có chữ: "Hội thoại".
        nodes.push(el('div', 'px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400', sec.kind === 'chats' && q.trim() ? t.secChatsFound : t[SECTION[sec.kind]]));
        for (const it of sec.items) {
          const idx = i++;
          const b = el('button', `flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left ${idx === hi ? 'bg-slate-100 dark:bg-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700/60'}`);
          b.type = 'button';
          b.dataset.idx = String(idx);
          const ic = el('span', 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300');
          ic.append(icon(it.kind, 'h-4 w-4'));
          const txt = el('span', 'min-w-0 flex-1');
          txt.append(el('span', 'block truncate', it.title));
          if (it.sub) txt.append(el('span', 'block truncate text-[11px] text-slate-500 dark:text-slate-400', it.sub));
          b.append(ic, txt);
          b.addEventListener('mousemove', () => { if (hi !== idx) { hi = idx; mark(); } });
          b.addEventListener('click', () => void api.pick(it));
          nodes.push(b);
        }
      }
      list.replaceChildren(...nodes);
    };
    const mark = () => {
      for (const b of Array.from(list.querySelectorAll<HTMLElement>('[data-idx]'))) {
        const on = Number(b.dataset.idx) === hi;
        b.classList.toggle('bg-slate-100', on); b.classList.toggle('dark:bg-slate-700', on);
        if (on) b.scrollIntoView({ block: 'nearest' });
      }
    };
    const run = () => {
      const seq = ++searchSeq;
      const q = input.value;
      void api.search(q).then((r) => { if (seq === searchSeq) { hi = 0; draw(r, q); } });
    };
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (picks.length) { hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + picks.length) % picks.length; mark(); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = picks[hi];
        if (it) void api.pick(it);
      }
    });
    clear.addEventListener('click', () => void api.clearHistory().then((r) => { hi = 0; draw(r, input.value); input.focus(); }));
    run();
    return { nodes: [box, list, foot], input };
  }

  function render(s: OverlayState) {
    document.documentElement.lang = s.lang;
    applyTheme();
    if (s.kind === 'search') {
      // Đè đúng ô tìm kiếm của header, rộng hơn một chút (tối thiểu 560px), kết quả xổ xuống.
      const { nodes, input } = searchPanel(s);
      panel.replaceChildren(...nodes);
      const w = Math.min(window.innerWidth - 16, Math.max(s.anchor.w + 40, 560));
      panel.style.width = `${w}px`;
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, s.anchor.x + s.anchor.w / 2 - w / 2))}px`;
      panel.style.top = `${Math.max(4, s.anchor.y - 2)}px`;
      panel.style.bottom = '';
      panel.classList.remove('p-1.5', 'overflow-y-auto');
      panel.classList.add('overflow-hidden');
      input.focus();
      return;
    }
    panel.classList.add('p-1.5', 'overflow-y-auto');
    panel.classList.remove('overflow-hidden');
    panel.replaceChildren(...(s.kind === 'profile' ? profileMenu(s) : appsPanel(s)));
    panel.style.width = s.kind === 'profile' ? '320px' : '360px';
    // Neo: thanh mở rộng ⇒ ngay trên nút (căn trái thanh); thu gọn ⇒ bên phải thanh, đáy ngang nút.
    const left = s.collapsed ? s.anchor.x + s.anchor.w + 8 : Math.max(8, s.anchor.x - 4);
    panel.style.left = `${left}px`;
    panel.style.top = '';
    panel.style.bottom = `${Math.max(8, window.innerHeight - (s.collapsed ? s.anchor.y + s.anchor.h : s.anchor.y - 6))}px`;
  }

  const load = () => void api.state().then(render);
  document.getElementById('backdrop')!.addEventListener('mousedown', () => void api.close());
  api.onOpen(load);
  load();
})();

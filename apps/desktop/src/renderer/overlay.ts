/**
 * Script lớp khung nổi (chạy trong trang, không có Node). Không import gì: build ra script thường — tên kiểu đặt riêng
 * (Overlay…) để không trùng script renderer khác. Menu hồ sơ (như Claude: email, Cài đặt, ngôn ngữ, giao diện, mật khẩu,
 * đồng bộ, cập nhật, đăng xuất, thoát), khung ⊞ Tất cả ứng dụng (mở / ghim) hoặc ô tìm kiếm của header (Ctrl+K — đè đúng
 * chỗ ô tìm kiếm, kết quả xổ xuống). Dựng DOM bằng textContent (tiêu đề trang đã xem là chữ của trang web bất kỳ).
 */
type LoginTone = 'ok' | 'warn' | 'off' | 'none';
interface OverlayApp { key: string; label: string; favicon: string | null; pinned: boolean; status: 'ok' | 'warn' | 'off' | null; login: { tone: LoginTone; text: string } }
interface OverlayState {
  kind: 'profile' | 'search' | 'password' | 'more' | 'context' | 'downloads' | 'download-ask';
  anchor: { x: number; y: number; w: number; h: number };
  collapsed: boolean;
  lang: 'vi' | 'en';
  theme: 'light' | 'dark' | 'system';
  dev: boolean;
  /** Quản trị đơn vị / hệ thống ⇒ mục "Quản trị" (trang quản trị trong app). */
  isAdmin: boolean;
  t: Record<string, string>;
  profile: { name: string; email: string; initials: string } | null;
  /** Có mật khẩu Vala ⇒ form đổi mật khẩu; chỉ SSO ⇒ trang đổi mật khẩu của SSO (nếu đơn vị khai); null ⇒ không có mục. */
  account: { has_password: boolean; sso_password_url: string | null } | null;
  apps: OverlayApp[];
  /** Menu chuột phải của một mục thanh dọc (kind 'context'). */
  context: { title: string; items: Array<{ id: string; label: string; enabled: boolean; checked?: boolean; sep?: boolean; icon?: string; hint?: string }> } | null;
  /** Khung Tải xuống (downloads.ts): lịch sử mới nhất trước. */
  downloads: { list: OverlayDownload[]; dang_tai: number; phan_tram: number | null } | null;
  ask: OverlayAsk | null;
}
interface OverlayAsk { id: string; ten: string; nguon: string; tong: number; da_tai: number; xong: boolean; xem_duoc: boolean; con: number }
interface OverlayDownload { id: string; ten: string; duong_dan: string; tong: number; da_tai: number; trang_thai: 'dang_tai' | 'tam_dung' | 'cho_chon' | 'xong' | 'huy' | 'loi'; luc: number; nguon: string; mat?: boolean }
type OverlayItem = { kind: 'app' | 'action' | 'chat'; title: string; sub: string; ref: Record<string, string> };
interface OverlaySection { kind: 'recent' | 'chats' | 'apps' | 'actions'; items: OverlayItem[] }
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
  contextRun(id: string): Promise<void>;
  changePassword(current: string, next: string): Promise<{ ok: boolean; type?: string; title?: string; detail?: string }>;
  download(id: string, act: string): Promise<OverlayState>;
  downloadSaveAs(id: string): Promise<void>;
  downloadChoose(id: string, choice: 'mo' | 'tai' | 'luu_thanh' | 'huy', khongHoi: boolean): Promise<OverlayState>;
  downloadAsk(id: string): Promise<void>;
  onOpen(cb: () => void): void;
  onRefresh(cb: () => void): void;
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
    open: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
    check: ['M5 12l5 5 9-10'],
    admin: ['M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z', 'M9 12l2 2 4-4'],
    search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-3.5-3.5'],
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
    if (s.isAdmin) out.push(item('admin', t.admin, () => void api.command('admin')));
    out.push(choice('language', t.language, [['vi', 'Tiếng Việt'], ['en', 'English']], s.lang, (v) => void api.prefs({ lang: v }).then(render)));
    out.push(choice('appearance', t.appearance, [['light', t.light], ['dark', t.dark], ['system', t.system]], s.theme, (v) => void api.prefs({ theme: v }).then(render)));
    out.push(sep());
    out.push(item('passwords', t.passwords, () => void api.command('passwords')));
    if (s.account?.has_password) out.push(item('changePassword', t.changePassword, () => void api.command('change-password')));
    else if (s.account?.sso_password_url) out.push(item('changePassword', t.changeSsoPassword, () => void api.command('change-password')));
    if (s.profile) out.push(item('sync', t.sync, () => void api.command('sync')));
    out.push(sep());
    if (t.installUpdate) out.push(item('update', t.installUpdate, () => void api.command('install-update')));
    else out.push(item('update', t.checkUpdate, () => void api.command('check-update'), t.version));
    out.push(sep());
    out.push(s.profile ? item('signOut', t.signOut, () => void api.command('sign-out')) : item('signIn', t.signIn, () => void api.command('sign-in')));
    out.push(item('quit', t.quit, () => void api.command('quit')));
    return out;
  }


  /** Biểu tượng ứng dụng: favicon dùng được, không thì chữ cái đầu trong ô màu. */
  /**
   * Nút "Thêm" cuối nhóm Ứng dụng: khung TẤT CẢ ỨNG DỤNG, rộng (người dùng 09/10/2026 — bỏ nút ⊞ cạnh tài khoản): nhóm Đã
   * ghim / Chưa ghim, mỗi ứng dụng một thẻ có trạng thái đăng nhập (browser.ts appLogin), lọc nhanh "chưa đăng nhập".
   */
  const TONE_DOT: Record<LoginTone, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', off: 'bg-slate-400', none: 'bg-slate-300 dark:bg-slate-600' };
  const TONE_TEXT: Record<LoginTone, string> = {
    ok: 'text-emerald-700 dark:text-emerald-400', warn: 'text-amber-700 dark:text-amber-400',
    off: 'text-slate-500 dark:text-slate-400', none: 'text-slate-400 dark:text-slate-500',
  };
  const notSignedIn = (a: OverlayApp) => a.login.tone === 'warn' || a.login.tone === 'off';
  /** Đang lọc "chỉ chưa đăng nhập" (mỗi lần mở khung bắt đầu lại từ "tất cả"). */
  let onlyNot = false;

  function appCard(a: OverlayApp, s: OverlayState): HTMLElement {
    const t = s.t;
    const card = el('div', 'group flex items-center gap-2 rounded-xl border border-slate-200 py-2 pl-3 pr-1.5 hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:hover:border-blue-500/60 dark:hover:bg-slate-700/60');
    const open = el('button', 'flex min-w-0 flex-1 items-center gap-3 text-left');
    open.type = 'button';
    const box = el('span', 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white dark:bg-blue-500', (a.label.trim()[0] ?? '•').toUpperCase());
    if (a.favicon) {
      const img = el('img', 'h-6 w-6');
      img.alt = '';
      img.addEventListener('load', () => { if (img.naturalWidth > 1) { box.className = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700'; box.replaceChildren(img); } });
      img.src = a.favicon;
    }
    const text = el('span', 'min-w-0 flex-1');
    text.append(el('span', 'block truncate text-[13px] font-medium', a.label));
    const st = el('span', `mt-0.5 flex items-center gap-1.5 text-[11px] ${TONE_TEXT[a.login.tone]}`);
    st.append(el('span', `h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[a.login.tone]}`), el('span', 'truncate', a.login.text));
    text.append(st);
    open.append(box, text);
    open.title = `${a.label} — ${a.login.text}`;
    open.addEventListener('click', () => void api.openApp(a.key));
    const pin = el('button', `flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${a.pinned ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100'} hover:bg-slate-200 dark:hover:bg-slate-600`);
    pin.type = 'button';
    pin.title = a.pinned ? t.unpin : t.pin;
    pin.setAttribute('aria-label', `${pin.title}: ${a.label}`);
    pin.setAttribute('aria-pressed', String(a.pinned));
    pin.append(icon('pin', 'h-4 w-4'));
    pin.addEventListener('click', () => void api.pin(a.key, !a.pinned).then(render));
    card.append(open, pin);
    return card;
  }

  function morePanel(s: OverlayState): HTMLElement[] {
    const t = s.t;
    const head = el('div', 'flex items-start gap-3 px-3 pb-1 pt-2');
    const titles = el('div', 'min-w-0 flex-1');
    titles.append(el('div', 'text-base font-semibold', t.moreTitle), el('div', 'mt-0.5 text-xs text-slate-500 dark:text-slate-400', t.moreHint));
    head.append(titles);
    const nNot = s.apps.filter(notSignedIn).length;
    if (!nNot) onlyNot = false;
    if (nNot) {
      const f = el('button', `shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${onlyNot
        ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300'
        : 'border-slate-200 text-amber-700 hover:bg-amber-50 dark:border-slate-600 dark:text-amber-400 dark:hover:bg-slate-700'}`,
        onlyNot ? t.showAll : `${nNot} ${t.notSignedIn}`);
      f.type = 'button';
      f.title = onlyNot ? t.showAll : t.onlyNotSignedIn;
      f.setAttribute('aria-pressed', String(onlyNot));
      f.addEventListener('click', () => { onlyNot = !onlyNot; load(); });
      head.append(f);
    }
    const out: HTMLElement[] = [head];
    if (!s.apps.length) { out.push(el('div', 'px-3 pb-3 pt-2 text-sm text-amber-700 dark:text-amber-400', t.noApps)); return out; }
    const list = onlyNot ? s.apps.filter(notSignedIn) : s.apps;
    for (const [title, items] of [[t.groupPinned, list.filter((a) => a.pinned)], [t.groupOther, list.filter((a) => !a.pinned)]] as const) {
      if (!items.length) continue;
      out.push(el('div', 'px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500', `${title} · ${items.length}`));
      const grid = el('div', 'grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-1.5 px-1.5');
      for (const a of items) grid.append(appCard(a, s));
      out.push(grid);
    }
    out.push(el('div', 'h-1.5'));
    return out;
  }

  /**
   * HỘP TẢI XUỐNG: mỗi lần tải ⇒ chọn Mở (PDF / ảnh xem ngay trong app; loại khác mở bằng ứng dụng của máy) · Tải về
   * (thư mục Tải về) · Lưu thành… (chọn nơi lưu) · Huỷ. Tệp đang tải ngầm (thanh tiến độ). Enter = Tải về.
   */
  let askNoAsk = false;
  function askPanel(s: OverlayState): { nodes: HTMLElement[]; primary: HTMLButtonElement | null } {
    const t = s.t;
    const a = s.ask;
    if (!a) return { nodes: [], primary: null };
    const out: HTMLElement[] = [el('div', 'px-1 pb-3 text-base font-semibold', t.askTitle)];
    const fileRow = el('div', 'flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900');
    fileRow.append(el('span', 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold uppercase text-white dark:bg-blue-500', (/\.([a-z0-9]{1,4})$/i.exec(a.ten)?.[1] ?? 'tệp').toUpperCase()));
    const info = el('div', 'min-w-0 flex-1');
    const name = el('div', 'truncate text-[14px] font-medium', a.ten);
    name.title = a.ten;
    info.append(name, el('div', 'mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400', [a.tong > 0 ? size(a.tong) : '', a.nguon ? `${t.askFrom} ${a.nguon}` : ''].filter(Boolean).join(' · ')));
    const pct = a.tong > 0 ? Math.min(100, Math.round((a.da_tai / a.tong) * 100)) : null;
    const status = el('div', `mt-2 flex items-center gap-2 text-[12px] ${a.xong ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`);
    if (!a.xong) {
      const bar = el('div', 'h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700');
      const fill = el('div', `h-full rounded-full ${pct === null ? 'w-1/3 animate-pulse bg-blue-400' : 'bg-blue-600 dark:bg-blue-400'}`);
      if (pct !== null) fill.style.width = `${pct}%`;
      bar.append(fill);
      status.append(bar, el('span', 'shrink-0 tabular-nums', pct === null ? t.askBusy : `${t.askBusy} ${pct}%`));
    } else status.append(el('span', '', `✓ ${t.askReady}`));
    info.append(status);
    fileRow.append(info);
    out.push(fileRow);

    const choose = (c: 'mo' | 'tai' | 'luu_thanh' | 'huy') => void api.downloadChoose(a.id, c, askNoAsk).then(render);
    const opt = (label: string, hint: string, c: 'mo' | 'tai' | 'luu_thanh', primary = false) => {
      const b = el('button', `flex min-w-0 flex-1 flex-col items-start rounded-xl border px-3 py-2.5 text-left ${primary
        ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400'
        : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/60 dark:border-slate-700 dark:hover:border-blue-500/60 dark:hover:bg-slate-700/60'}`);
      b.type = 'button';
      b.append(el('span', 'text-[13px] font-semibold', label), el('span', `mt-0.5 text-[11px] ${primary ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`, hint));
      b.addEventListener('click', () => choose(c));
      return b;
    };
    const row = el('div', 'mt-3 flex gap-2');
    const save = opt(t.askSave, t.askSaveHint, 'tai', true);
    row.append(opt(t.askOpen, a.xem_duoc ? t.askOpenView : t.askOpenApp, 'mo'), opt(t.askSaveAs, t.askSaveAsHint, 'luu_thanh'), save);
    out.push(row);

    const foot = el('div', 'mt-3 flex items-center gap-3');
    const lab = el('label', 'flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300');
    const cb = el('input', 'h-3.5 w-3.5 shrink-0');
    cb.type = 'checkbox';
    cb.checked = askNoAsk;
    cb.addEventListener('change', () => { askNoAsk = cb.checked; });
    lab.append(cb, el('span', 'truncate', t.askNoAsk));
    const cancel = el('button', 'shrink-0 rounded-lg px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700', t.askCancel);
    cancel.type = 'button';
    cancel.addEventListener('click', () => choose('huy'));
    foot.append(lab, cancel);
    out.push(foot);
    if (a.con > 0) out.push(el('div', 'mt-2 text-[11px] text-slate-400', `+${a.con} ${t.askMore}`));
    return { nodes: out, primary: save };
  }

  /** Khung Tải xuống: mỗi tệp một dòng (tên, tiến độ / trạng thái, dung lượng, nguồn, giờ) + Mở / Mở thư mục / Huỷ / Xoá. */
  const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  function downloadsPanel(s: OverlayState): HTMLElement[] {
    const t = s.t;
    const d = s.downloads;
    const head = el('div', 'flex items-center gap-2 px-2.5 pb-1 pt-1');
    head.append(el('div', 'flex-1 text-sm font-semibold', t.dlTitle));
    if (d?.list.some((x) => x.trang_thai !== 'dang_tai' && x.trang_thai !== 'tam_dung')) {
      const clear = el('button', 'text-xs text-slate-500 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-100', t.dlClear);
      clear.type = 'button';
      clear.addEventListener('click', () => void api.download('', 'clear').then(render));
      head.append(clear);
    }
    const out: HTMLElement[] = [head];
    if (!d?.list.length) { out.push(el('div', 'px-2.5 py-3 text-xs text-slate-500 dark:text-slate-400', t.dlEmpty)); return out; }
    const fmt = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`; };
    for (const x of d.list) {
      const co = x.trang_thai === 'xong' && !x.mat;
      const row = el('div', 'group rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-700');
      const top = el('div', 'flex items-center gap-2');
      const name = el('button', `min-w-0 flex-1 truncate text-left text-[13px] font-medium${x.mat ? ' text-slate-400 line-through dark:text-slate-500' : ''}`, x.ten);
      name.type = 'button';
      name.title = x.duong_dan;
      if (co) name.addEventListener('click', () => void api.download(x.id, 'open'));
      top.append(name);
      const act = (label: string, a: string) => {
        const b = el('button', 'shrink-0 rounded px-1.5 py-0.5 text-[12px] text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-600', label);
        b.type = 'button';
        b.addEventListener('click', () => void api.download(x.id, a).then(render));
        return b;
      };
      if (co) {
        const saveAs = el('button', 'shrink-0 rounded px-1.5 py-0.5 text-[12px] text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-600', t.dlSaveAs);
        saveAs.type = 'button';
        saveAs.title = t.dlSaveAsTitle;
        saveAs.addEventListener('click', () => void api.downloadSaveAs(x.id));
        top.append(act(t.dlOpen, 'open'), act(t.dlFolder, 'folder'), saveAs);
      }
      if (x.trang_thai === 'cho_chon') {
        const choose = el('button', 'shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-600', t.dlChoose);
        choose.type = 'button';
        choose.addEventListener('click', () => void api.downloadAsk(x.id));
        top.append(choose);
      }
      if (x.trang_thai === 'dang_tai' || x.trang_thai === 'tam_dung') top.append(act(t.dlCancel, 'cancel'));
      else {
        const rm = el('button', 'flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 opacity-0 hover:bg-slate-200 group-hover:opacity-100 dark:hover:bg-slate-600');
        rm.type = 'button';
        rm.title = t.dlRemove;
        rm.setAttribute('aria-label', `${t.dlRemove}: ${x.ten}`);
        rm.textContent = '✕';
        rm.addEventListener('click', () => void api.download(x.id, 'remove').then(render));
        top.append(rm);
      }
      row.append(top);
      if (x.trang_thai === 'dang_tai' || x.trang_thai === 'tam_dung') {
        const bar = el('div', 'mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600');
        const fill = el('div', `h-full rounded-full ${x.tong > 0 ? 'bg-blue-600 dark:bg-blue-400' : 'w-1/3 animate-pulse bg-blue-400'}`);
        if (x.tong > 0) fill.style.width = `${Math.min(100, Math.round((x.da_tai / x.tong) * 100))}%`;
        bar.append(fill);
        row.append(bar);
      }
      const st = x.trang_thai === 'dang_tai' ? `${size(x.da_tai)}${x.tong > 0 ? ` / ${size(x.tong)}` : ''}`
        : x.trang_thai === 'tam_dung' ? t.dlPaused : x.trang_thai === 'cho_chon' ? t.dlWaiting : x.trang_thai === 'xong' ? (x.mat ? t.dlGone : `${t.dlDone} · ${size(x.tong || x.da_tai)}`)
        : x.trang_thai === 'huy' ? t.dlCancelled : t.dlFailed;
      row.append(el('div', `mt-1 truncate text-[11px] ${x.trang_thai === 'loi' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`,
        [st, x.nguon, fmt(x.luc)].filter(Boolean).join(' · ')));
      out.push(row);
    }
    out.push(el('div', 'px-2.5 pb-1 pt-2 text-[11px] text-slate-400 dark:text-slate-500', t.dlHint));
    return out;
  }

  /** Menu chuột phải của một mục thanh dọc — cùng kiểu menu hồ sơ. */
  function contextPanel(s: OverlayState): HTMLElement[] {
    const c = s.context;
    if (!c) return [];
    const out: HTMLElement[] = [];
    if (c.title) out.push(el('div', 'truncate px-2.5 pb-1 pt-1 text-xs text-slate-500 dark:text-slate-400', c.title));
    for (const it of c.items) {
      if (it.sep) { out.push(sep()); continue; }
      if (!it.enabled) { out.push(el('div', 'truncate px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400', it.label)); continue; }
      const b = item(it.checked !== undefined ? (it.checked ? 'check' : '') : it.icon ?? '', it.label, () => void api.contextRun(it.id), it.hint ?? '');
      out.push(b);
    }
    return out;
  }
  // ---- ô tìm kiếm (Ctrl+K) ----
  const SECTION: Record<OverlaySection['kind'], string> = { recent: 'secRecent', chats: 'secChats', apps: 'secApps', actions: 'secActions' };
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

  /** Đổi mật khẩu Vala (giữa cửa sổ): quy tắc mật khẩu kiểm ở máy chủ, ở đây chỉ nhắc trước như trang web. */
  function passwordPanel(s: OverlayState): { nodes: HTMLElement[]; first: HTMLInputElement } {
    const t = s.t;
    const form = el('form', 'grid gap-3 p-3');
    form.noValidate = true;
    const field = (label: string, ac: AutoFill) => {
      const wrap = el('label', 'grid gap-1');
      const input = el('input', 'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900');
      input.type = 'password';
      input.autocomplete = ac;
      input.maxLength = 400;
      wrap.append(el('span', 'text-xs text-slate-600 dark:text-slate-300', label), input);
      form.append(wrap);
      return input;
    };
    const err = el('div', 'hidden rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300');
    err.setAttribute('role', 'alert');
    form.append(el('div', 'text-sm font-semibold', t.changePassword), err);
    const cur = field(t.currentPassword, 'current-password');
    const next = field(t.newPassword, 'new-password');
    const again = field(t.confirmPassword, 'new-password');
    const hint = el('p', 'hidden text-xs text-amber-800 dark:text-amber-300');
    const actions = el('div', 'flex justify-end gap-2 pt-1');
    const cancel = el('button', 'rounded-lg px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700', t.cancel);
    cancel.type = 'button';
    cancel.addEventListener('click', () => void api.close());
    const save = el('button', 'rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600', t.passwordSave);
    save.type = 'submit';
    actions.append(cancel, save);
    form.append(hint, actions);
    let busy = false;
    const check = () => {
      const weak = !!next.value && (next.value.length < 8 || !/[A-Za-zÀ-ỹ]/.test(next.value) || !/\d/.test(next.value));
      const mismatch = !!again.value && next.value !== again.value;
      hint.textContent = weak ? t.passwordWeak : mismatch ? t.passwordMismatch : '';
      hint.classList.toggle('hidden', !hint.textContent);
      save.disabled = busy || !cur.value || !next.value || weak || next.value !== again.value || next.value === cur.value;
    };
    for (const i of [cur, next, again]) i.addEventListener('input', check);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      check();
      if (save.disabled) return;
      busy = true; save.disabled = true; save.textContent = t.passwordSaving; err.classList.add('hidden');
      void api.changePassword(cur.value, next.value).then((r) => {
        if (r.ok) {
          const done = el('button', 'rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 dark:bg-blue-500', t.done);
          done.type = 'button';
          done.addEventListener('click', () => void api.close());
          const row = el('div', 'flex justify-end');
          row.append(done);
          form.replaceChildren(el('div', 'text-sm font-semibold', t.changePassword), el('p', 'text-[13px] text-slate-600 dark:text-slate-300', t.passwordChanged), row);
          done.focus();
          return;
        }
        err.textContent = r.type === 'invalid_credentials' ? t.passwordWrong : r.detail || r.title || t.passwordFailed;
        err.classList.remove('hidden');
        busy = false; save.textContent = t.passwordSave; check();
      }, () => {
        err.textContent = t.passwordFailed;
        err.classList.remove('hidden');
        busy = false; save.textContent = t.passwordSave; check();
      });
    });
    check();
    return { nodes: [form], first: cur };
  }

  const backdrop = document.getElementById('backdrop')!;
  function render(s: OverlayState) {
    document.documentElement.lang = s.lang;
    applyTheme();
    panel.style.maxHeight = '';   // chỉ khung Tải xuống đặt chiều cao tối đa riêng
    // Khung đổi mật khẩu là hộp thoại: nền mờ, bấm ra ngoài KHÔNG đóng (tránh mất chữ đang gõ) — Esc / Huỷ để đóng.
    const modal = s.kind === 'password' || s.kind === 'download-ask';
    backdrop.className = modal ? 'fixed inset-0 bg-black/30' : 'fixed inset-0';
    backdrop.dataset.modal = String(modal);
    if (s.kind === 'download-ask') {
      // Hộp Tải xuống: giữa màn hình, che mờ phía sau; Enter = Tải về.
      const { nodes, primary } = askPanel(s);
      panel.replaceChildren(...nodes);
      const w = Math.min(window.innerWidth - 16, 520);
      panel.style.width = `${w}px`;
      panel.style.left = `${Math.max(8, Math.round(window.innerWidth / 2 - w / 2))}px`;
      panel.style.top = `${Math.max(8, Math.round(window.innerHeight / 4))}px`;
      panel.style.bottom = '';
      panel.classList.remove('p-1.5', 'overflow-hidden');
      panel.classList.add('overflow-y-auto', 'p-4');
      primary?.focus();
      return;
    }
    panel.classList.remove('p-4');
    if (s.kind === 'password') {
      const { nodes, first } = passwordPanel(s);
      panel.replaceChildren(...nodes);
      const w = Math.min(window.innerWidth - 16, 380);
      panel.style.width = `${w}px`;
      panel.style.left = `${Math.max(8, Math.round(window.innerWidth / 2 - w / 2))}px`;
      panel.style.top = `${Math.max(8, Math.round(window.innerHeight / 5))}px`;
      panel.style.bottom = '';
      panel.classList.remove('p-1.5', 'overflow-hidden');
      panel.classList.add('overflow-y-auto');
      first.focus();
      return;
    }
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
    if (s.kind === 'downloads') {
      // Ngay dưới nút Tải xuống, mép phải thẳng mép phải nút; cao tối đa gần hết cửa sổ (cuộn).
      panel.replaceChildren(...downloadsPanel(s));
      const w = Math.min(window.innerWidth - 16, 440);
      panel.style.width = `${w}px`;
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, s.anchor.x + s.anchor.w - w))}px`;
      panel.style.top = `${s.anchor.y + s.anchor.h + 6}px`;
      panel.style.bottom = '';
      panel.style.maxHeight = `${Math.max(160, window.innerHeight - s.anchor.y - s.anchor.h - 20)}px`;
      return;
    }
    if (s.kind === 'more') {
      // Tất cả ứng dụng: khung rộng bên phải thanh bên — rộng tối đa 720px, cao gần hết cửa sổ (cuộn), canh không tràn mép.
      panel.replaceChildren(...morePanel(s));
      const left = Math.min(s.anchor.x + s.anchor.w + 12, window.innerWidth - 320);
      const w = Math.max(300, Math.min(720, window.innerWidth - left - 12));
      panel.style.width = `${w}px`;
      panel.style.left = `${Math.max(8, left)}px`;
      panel.style.bottom = '';
      panel.style.maxHeight = `${window.innerHeight - 24}px`;
      panel.style.top = '12px';
      const h = panel.offsetHeight;
      // Đặt ngang nút "Thêm" nếu đủ chỗ, không thì đẩy lên cho vừa cửa sổ.
      panel.style.top = `${Math.max(12, Math.min(s.anchor.y - 8, window.innerHeight - 12 - h))}px`;
      return;
    }
    if (s.kind === 'context') {
      // Menu chuột phải: tại con trỏ. Lật / dời cho khỏi tràn mép cửa sổ.
      panel.replaceChildren(...contextPanel(s));
      const w = 248;
      panel.style.width = `${w}px`;
      panel.style.bottom = '';
      const x = s.anchor.x;
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x))}px`;
      panel.style.top = `${s.anchor.y}px`;
      const h = panel.offsetHeight;
      if (s.anchor.y + h > window.innerHeight - 8) {
        panel.style.top = `${Math.max(8, s.anchor.y - h)}px`;
      }
      return;
    }
    panel.replaceChildren(...profileMenu(s));
    panel.style.width = '320px';
    // Neo: thanh mở rộng ⇒ ngay trên nút (căn trái thanh); thu gọn ⇒ bên phải thanh, đáy ngang nút.
    const left = s.collapsed ? s.anchor.x + s.anchor.w + 8 : Math.max(8, s.anchor.x - 4);
    panel.style.left = `${left}px`;
    panel.style.top = '';
    panel.style.bottom = `${Math.max(8, window.innerHeight - (s.collapsed ? s.anchor.y + s.anchor.h : s.anchor.y - 6))}px`;
  }

  const load = () => void api.state().then(render);
  backdrop.addEventListener('mousedown', () => { if (backdrop.dataset.modal !== 'true') void api.close(); });
  api.onOpen(() => { onlyNot = false; askNoAsk = false; load(); });
  api.onRefresh(load);
  load();
})();

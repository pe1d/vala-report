/**
 * Script trang Trợ lý AI (chạy trong trang, không có Node). Không import gì: build ra script thường — tên kiểu đặt riêng
 * (Chat…) để không trùng script renderer khác. Dựng DOM bằng textContent (kết quả thao tác là dữ liệu của hệ thống ngoài).
 *
 * Gõ "/" ⇒ bảng chọn hệ thống ⇒ thao tác ⇒ phiếu tham số ⇒ Chạy (tiến trình chính chạy ngầm trong tab của hệ thống, trả
 * kết quả đã dựng sẵn cách hiển thị: bảng / thông tin – giá trị / danh sách / chữ). Câu hỏi tự do ⇒ trả lời cố định.
 */
type ChatView =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'fields'; fields: { key: string; view: ChatView }[] };
interface ChatSystem { code: string; ten: string; status: 'ok' | 'warn' | 'off' }
interface ChatAction { name: string; pkg: string | null; mo_ta: string; params: Record<string, string> | null }
interface ChatState { lang: 'vi' | 'en'; t: Record<string, string>; greeting: string; systems: ChatSystem[] }
interface ValaChatApi {
  state(): Promise<ChatState>;
  actions(code: string): Promise<{ ok: boolean; actions?: ChatAction[]; error?: string }>;
  run(code: string, name: string, form: Record<string, string>): Promise<{ ok: boolean; view?: ChatView; error?: string; code?: string }>;
  onChanged(cb: () => void): void;
}

(() => {
  const api = (window as unknown as { valaChat: ValaChatApi }).valaChat;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);
  applyTheme();

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const display = (e: HTMLElement, on: boolean) => { e.style.display = on ? '' : 'none'; };

  let st: ChatState | null = null;
  const T = (k: string) => st?.t[k] ?? '';
  let started = false;

  // ---- bố cục: chưa có tin nhắn ⇒ ô nhập giữa trang; có ⇒ dính đáy ----
  const input = $<HTMLTextAreaElement>('input');
  function layout() {
    display($('empty'), !started);
    display($('thread'), started);
    display($('dock'), started);
    display($('new-chat'), started);
    ($(started ? 'dock-slot' : 'empty-slot')).append($('composer'));
  }
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 208)}px`; };

  function render() {
    if (!st) return;
    document.documentElement.lang = st.lang;
    document.title = T('title');
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('[data-t]'))) e.textContent = T(e.dataset.t!);
    input.placeholder = T('placeholder');
    $('send').title = T('send');
    $('greeting').textContent = st.greeting;
    // Gợi ý: mỗi hệ thống đang kết nối một nút mở thẳng danh sách thao tác của nó.
    const chips = st.systems.filter((x) => x.status === 'ok').slice(0, 6).map((x) => {
      const b = el('button', 'rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900', `/ ${x.ten}`);
      b.type = 'button';
      b.addEventListener('click', () => { openPicker(); void pickSystem(x); });
      return b;
    });
    $('chips').replaceChildren(...chips);
  }

  // ---- tin nhắn ----
  function addUser(text: string, chip?: string) {
    const row = el('div', 'flex justify-end');
    const bubble = el('div', 'max-w-[80%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-4 py-2.5 text-[15px] dark:bg-slate-800');
    if (chip) bubble.append(el('div', 'mb-1 font-mono text-xs text-orange-700 dark:text-orange-400', chip));
    if (text) bubble.append(document.createTextNode(text));
    row.append(bubble);
    $('thread').append(row);
    scrollEnd();
  }
  /** Tin của trợ lý: trả phần thân để điền dần (đang chạy ⇒ kết quả). */
  function addAssistant(): HTMLElement {
    const row = el('div', 'flex gap-3');
    const mark = el('div', 'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400', '✦');
    const body = el('div', 'min-w-0 flex-1 text-[15px] leading-relaxed');
    row.append(mark, body);
    $('thread').append(row);
    scrollEnd();
    return body;
  }
  const scrollEnd = () => { const s = $('scroll'); s.scrollTop = s.scrollHeight; };

  function viewNode(v: ChatView): HTMLElement {
    if (v.kind === 'empty') return el('p', 'text-slate-500', T('empty'));
    if (v.kind === 'text') return el('p', 'whitespace-pre-wrap break-words', v.text || T('empty'));
    if (v.kind === 'list') { const ul = el('ul', 'list-disc space-y-0.5 pl-5'); for (const i of v.items) ul.append(el('li', '', i)); return ul; }
    if (v.kind === 'table') {
      const wrap = el('div', 'mt-1');
      const box = el('div', 'max-h-[60vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800');
      const table = el('table', 'min-w-full border-collapse text-sm');
      const head = el('tr', 'sticky top-0 bg-slate-50 dark:bg-slate-900');
      for (const c of v.columns) head.append(el('th', 'whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-medium dark:border-slate-800', c));
      table.append(head);
      for (const r of v.rows) {
        const tr = el('tr', 'border-b border-slate-100 last:border-0 dark:border-slate-800/70');
        for (const c of r) tr.append(el('td', 'max-w-[28rem] px-3 py-1.5 align-top', c));
        table.append(tr);
      }
      box.append(table);
      wrap.append(box, el('div', 'mt-1 text-xs text-slate-500', `${v.rows.length} ${T('rows')}`));
      return wrap;
    }
    const dl = el('dl', 'space-y-2');
    for (const f of v.fields) {
      const row = el('div', f.view.kind === 'table' ? '' : 'grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4');
      row.append(el('dt', 'font-medium text-slate-500 dark:text-slate-400', f.key));
      const dd = el('dd', 'min-w-0 break-words');
      dd.append(viewNode(f.view));
      row.append(dd);
      dl.append(row);
    }
    return dl;
  }

  // ---- gửi ----
  function newChat() {
    started = false;
    $('thread').replaceChildren();
    closePicker();
    layout();
    input.focus();
  }
  function send() {
    const text = input.value.trim();
    if (!text) return;
    if (text.startsWith('/')) { openPicker(); return; }
    input.value = '';
    grow();
    started = true;
    layout();
    addUser(text);
    addAssistant().append(el('p', 'text-slate-600 dark:text-slate-300', T('notConnected')));
  }

  // ---- bảng chọn "/": hệ thống ⇒ thao tác ⇒ phiếu tham số ----
  type Step = { kind: 'systems' } | { kind: 'actions'; sys: ChatSystem; list: ChatAction[] | null; error?: string } | { kind: 'form'; sys: ChatSystem; action: ChatAction };
  let step: Step | null = null;
  let hi = 0;
  const picker = $('picker');
  const query = () => (input.value.startsWith('/') ? input.value.slice(1) : '').trim().toLowerCase();

  function openPicker() {
    if (!input.value.startsWith('/')) input.value = '/';
    step = { kind: 'systems' };
    hi = 0;
    drawPicker();
    input.focus();
  }
  function closePicker() {
    step = null;
    display(picker, false);
  }
  async function pickSystem(sys: ChatSystem) {
    step = { kind: 'actions', sys, list: null };
    input.value = '/';
    hi = 0;
    drawPicker();
    const r = await api.actions(sys.code);
    if (step?.kind !== 'actions' || step.sys !== sys) return;
    step = { kind: 'actions', sys, list: r.ok ? r.actions ?? [] : [], error: r.ok ? undefined : r.error };
    drawPicker();
  }

  function option(title: string, sub: string, active: boolean, onPick: () => void, dot?: string): HTMLElement {
    const b = el('button', `flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left ${active ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`);
    b.type = 'button';
    if (dot) b.append(el('span', `mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`));
    const txt = el('span', 'min-w-0 flex-1');
    txt.append(el('span', 'block truncate font-medium', title));
    if (sub) txt.append(el('span', 'block truncate text-xs text-slate-500 dark:text-slate-400', sub));
    b.append(txt);
    b.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(); });
    return b;
  }
  const head = (text: string, back?: () => void) => {
    const h = el('div', 'flex items-center gap-2 px-2.5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500');
    if (back) { const b = el('button', 'rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-800', '←'); b.type = 'button'; b.title = T('back'); b.addEventListener('mousedown', (e) => { e.preventDefault(); back(); }); h.append(b); }
    h.append(el('span', '', text));
    return h;
  };
  const DOT: Record<string, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', off: 'bg-slate-400' };
  /** Các mục đang hiện (để Enter / mũi tên chọn). */
  let current: (() => void)[] = [];

  function drawPicker() {
    if (!step || !st) return closePicker();
    display(picker, true);
    const nodes: HTMLElement[] = [];
    current = [];
    const q = query();
    if (step.kind === 'systems') {
      nodes.push(head(T('pickSystem')));
      const list = st.systems.filter((x) => !q || x.ten.toLowerCase().includes(q) || x.code.includes(q));
      if (!st.systems.length) nodes.push(el('p', 'px-2.5 py-2 text-slate-500', T('noSystems')));
      else if (!list.length) nodes.push(el('p', 'px-2.5 py-2 text-slate-500', T('noMatch')));
      list.forEach((x, i) => { const go = () => void pickSystem(x); current.push(go); nodes.push(option(x.ten, x.code, i === hi, go, DOT[x.status])); });
    } else if (step.kind === 'actions') {
      const s = step;
      nodes.push(head(`${s.sys.ten} · ${T('pickAction')}`, () => { step = { kind: 'systems' }; hi = 0; drawPicker(); }));
      if (!s.list) nodes.push(el('p', 'px-2.5 py-2 text-slate-500', T('loadingActions')));
      else if (s.error) nodes.push(el('p', 'px-2.5 py-2 text-red-600 dark:text-red-400', s.error));
      else if (!s.list.length) nodes.push(el('p', 'px-2.5 py-2 text-slate-500', T('noActions')));
      else {
        const list = s.list.filter((a) => !q || a.name.includes(q) || a.mo_ta.toLowerCase().includes(q));
        if (!list.length) nodes.push(el('p', 'px-2.5 py-2 text-slate-500', T('noMatch')));
        list.forEach((a, i) => {
          const go = () => { step = { kind: 'form', sys: s.sys, action: a }; input.value = '/'; drawPicker(); };
          current.push(go);
          nodes.push(option(a.mo_ta || a.name, a.name, i === hi, go));
        });
      }
    } else {
      const s = step;
      nodes.push(head(`${s.sys.ten} · ${s.action.name}`, () => void pickSystem(s.sys)));
      const form = el('form', 'space-y-2 px-2.5 pb-1.5 pt-1');
      if (s.action.mo_ta) form.append(el('p', 'text-slate-600 dark:text-slate-300', s.action.mo_ta));
      const params = Object.entries(s.action.params ?? {});
      if (!params.length) form.append(el('p', 'text-xs text-slate-500', T('noParams')));
      for (const [k, desc] of params) {
        const lab = el('label', 'block');
        lab.append(el('span', 'block font-mono text-xs text-slate-500', k));
        const f = el('input', 'input mt-0.5 w-full');
        f.name = k;
        f.placeholder = String(desc ?? '');
        f.autocomplete = 'off';
        lab.append(f);
        form.append(lab);
      }
      const row = el('div', 'flex justify-end gap-2 pt-1');
      const cancel = el('button', 'btn', T('cancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => { closePicker(); input.value = ''; });
      const run = el('button', 'btn-primary', T('run'));
      run.type = 'submit';
      row.append(cancel, run);
      form.append(row);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const values: Record<string, string> = {};
        for (const f of Array.from(form.querySelectorAll('input'))) values[f.name] = f.value;
        void runAction(s.sys, s.action, values);
      });
      nodes.push(form);
      picker.replaceChildren(...nodes);
      (form.querySelector('input') as HTMLInputElement | null)?.focus();
      return;
    }
    picker.replaceChildren(...nodes);
  }

  async function runAction(sys: ChatSystem, action: ChatAction, values: Record<string, string>) {
    closePicker();
    input.value = '';
    grow();
    started = true;
    layout();
    const args = Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`).join('\n');
    addUser(args, `/${sys.ten} › ${action.name}`);
    const body = addAssistant();
    const wait = el('p', 'animate-pulse text-slate-500', T('running'));
    body.append(wait);
    const r = await api.run(sys.code, action.name, values);
    wait.remove();
    if (r.ok && r.view) body.append(viewNode(r.view));
    else {
      const err = el('div', 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300');
      err.append(el('div', 'font-medium', T('failed')), el('div', '', r.error ?? ''));
      body.append(err);
    }
    scrollEnd();
    input.focus();
  }

  // ---- bàn phím ----
  input.addEventListener('input', () => {
    grow();
    if (input.value.startsWith('/')) { if (!step) openPicker(); else { hi = 0; drawPicker(); } }
    else if (step && step.kind !== 'form') closePicker();
  });
  input.addEventListener('keydown', (e) => {
    if (step && step.kind !== 'form') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, Math.min(current.length - 1, hi + (e.key === 'ArrowDown' ? 1 : -1))); drawPicker(); return; }
      if (e.key === 'Enter') { e.preventDefault(); current[hi]?.(); return; }
      if (e.key === 'Escape') { e.preventDefault(); closePicker(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  picker.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePicker(); input.focus(); } });
  $('send').addEventListener('click', send);
  $('slash').addEventListener('click', () => { input.value = '/'; openPicker(); });
  $('new-chat').addEventListener('click', newChat);

  display(picker, false);
  layout();
  const load = () => void api.state().then((s) => { st = s; render(); });
  api.onChanged(load);
  load();
  input.focus();
})();

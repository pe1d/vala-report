/**
 * Script tab Bản ghi thao tác (chạy trong trang, không có Node). Không import gì: build ra script thường — tên kiểu đặt
 * riêng (Rec…) để không trùng các script renderer khác. Dựng DOM bằng textContent, không dùng innerHTML (giá trị trường
 * là dữ liệu của trang web bất kỳ).
 */
interface RecFieldView { name: string; value: string; masked?: 'mat_khau' | 'trang_thai' }
interface RecStepView {
  id: number; kind: 'trang' | 'form' | 'xhr'; method: string; url: string; frame: 'chinh' | 'khung_con'; label: string;
  fields: RecFieldView[]; files: { name: string; filename: string; type: string; size: number | null }[];
  bodyUnreadable?: boolean; async?: boolean; status?: number; location?: string;
  page?: { hidden: string[]; submits: string[] }; panels?: string[];
}
interface RecView { host: string; title: string; startedAt: string; stoppedAt?: string; truncated: boolean; stopReason?: string; steps: RecStepView[] }
interface RecPageState { lang: 'vi' | 'en'; t: Record<string, string>; recording: RecView | null; draft: string }
interface ValaRecApi {
  state(): Promise<RecPageState>;
  save(): Promise<boolean>;
  copy(kind: 'json' | 'draft'): Promise<boolean>;
  onChanged(cb: () => void): void;
}

(() => {
  const api = (window as unknown as { valaRec: ValaRecApi }).valaRec;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);
  applyTheme();

  let st: RecPageState | null = null;
  let selected: number | null = null;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const METHOD: Record<string, string> = {
    GET: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    POST: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  };

  function stepItem(s: RecStepView, t: Record<string, string>): HTMLLIElement {
    const li = el('li');
    const b = el('button', `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${s.id === selected ? 'bg-blue-50 dark:bg-blue-950' : ''}`);
    b.type = 'button';
    b.append(el('span', 'w-6 shrink-0 text-right text-xs text-slate-500', String(s.id)));
    b.append(el('span', `shrink-0 rounded px-1.5 text-[11px] font-semibold ${METHOD[s.method] ?? METHOD.GET}`, s.method));
    b.append(el('span', `min-w-0 flex-1 truncate ${s.kind === 'trang' ? 'text-slate-600 dark:text-slate-400' : 'font-medium'}`, s.label));
    if (s.status) b.append(el('span', `shrink-0 text-xs ${s.status >= 400 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`, String(s.status)));
    b.title = s.frame === 'khung_con' ? `${s.label} — ${t.frame}` : s.label;
    b.addEventListener('click', () => { selected = s.id; render(); });
    li.append(b);
    return li;
  }

  function row(label: string, value: string, mono = false) {
    const d = el('div', 'mb-2');
    d.append(el('div', 'text-xs font-semibold uppercase tracking-wide text-slate-500', label));
    d.append(el('div', `break-all ${mono ? 'font-mono text-xs' : ''}`, value));
    return d;
  }

  function detail(s: RecStepView, t: Record<string, string>): HTMLElement[] {
    const out: HTMLElement[] = [el('h2', 'mb-3 text-base font-semibold', `${s.id}. ${s.label}`)];
    out.push(row(t.url, `${s.method} ${s.url}`, true));
    if (s.frame === 'khung_con') out.push(el('p', 'muted mb-2', t.frame));
    if (s.async) out.push(el('p', 'muted mb-2', t.async));
    if (s.bodyUnreadable) out.push(el('p', 'mb-2 text-amber-700 dark:text-amber-400', t.unreadable));
    if (s.kind !== 'trang') {
      out.push(el('div', 'mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500', t.fields));
      if (!s.fields.length) out.push(el('p', 'muted', t.noFields));
      else {
        const table = el('table', 'mt-1 w-full border-collapse font-mono text-xs');
        for (const f of s.fields) {
          const tr = el('tr', 'border-b border-slate-200 align-top dark:border-slate-800');
          tr.append(el('td', 'py-1 pr-3 text-slate-600 dark:text-slate-400', f.name));
          const v = el('td', `py-1 break-all ${f.masked ? 'italic text-slate-500' : ''}`, f.value);
          if (f.masked) v.append(el('span', 'ml-2 rounded bg-slate-200 px-1 not-italic dark:bg-slate-800', t[`masked_${f.masked}`] ?? ''));
          tr.append(v);
          table.append(tr);
        }
        out.push(table);
      }
      if (s.files.length) out.push(row(t.files, s.files.map((f) => `${f.name}: ${f.filename} (${f.type || '?'}, ${f.size ?? '?'} byte)`).join('\n'), true));
    }
    out.push(el('div', 'mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500', t.response));
    if (s.status) out.push(row(t.status, String(s.status)));
    if (s.location) out.push(row(t.location, s.location, true));
    if (s.panels?.length) out.push(row(t.panels, s.panels.join(', '), true));
    if (s.page?.hidden.length) out.push(row(t.hidden, s.page.hidden.join(', '), true));
    if (s.page?.submits.length) out.push(row(t.submits, s.page.submits.join(', '), true));
    return out;
  }

  function render() {
    if (!st) return;
    const { t, recording: r } = st;
    document.documentElement.lang = st.lang;
    document.title = t.title;
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('[data-t]'))) e.textContent = t[e.dataset.t!] ?? '';
    $('empty').hidden = !!r;
    $('body').hidden = !r;
    $('draft-box').hidden = !st.draft;
    $<HTMLButtonElement>('save').disabled = !r;
    $<HTMLButtonElement>('copy-json').disabled = !r;
    const badge = $('rec-state');
    badge.hidden = !r;
    if (!r) { $('rec-meta').textContent = ''; $('warn').hidden = true; return; }
    const on = !r.stoppedAt;
    badge.textContent = on ? t.recording : t.stopped;
    badge.className = `rounded-full px-2 py-0.5 text-xs font-medium ${on ? 'animate-pulse bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`;
    const at = new Date(r.startedAt).toLocaleString(st.lang === 'vi' ? 'vi-VN' : 'en-GB');
    $('rec-meta').textContent = `${r.host} · ${at} · ${r.steps.length} ${t.steps}`;
    const warn = r.truncated ? t.truncated
      : r.stopReason && r.stopReason !== 'du_buoc' ? `${t.stopReason}: ${t[`reasons_${r.stopReason}`] ?? t.reasons_khac}` : '';
    $('warn').textContent = warn;
    $('warn').hidden = !warn;
    if (selected === null || !r.steps.some((s) => s.id === selected)) selected = r.steps.find((s) => s.kind !== 'trang')?.id ?? r.steps[0]?.id ?? null;
    $('steps').replaceChildren(...r.steps.map((s) => stepItem(s, t)));
    const cur = r.steps.find((s) => s.id === selected);
    $('detail').replaceChildren(...(cur ? detail(cur, t) : []));
    $('draft').textContent = st.draft;
  }

  const note = (text: string) => {
    $('note').textContent = text;
    setTimeout(() => { if ($('note').textContent === text) $('note').textContent = ''; }, 2000);
  };
  $('save').addEventListener('click', async () => { if (await api.save()) note(st?.t.saved ?? ''); });
  $('copy-json').addEventListener('click', async () => { if (await api.copy('json')) note(st?.t.copied ?? ''); });
  $('copy-draft').addEventListener('click', async () => { if (await api.copy('draft')) note(st?.t.copied ?? ''); });

  const load = () => void api.state().then((s) => { st = s; render(); });
  api.onChanged(load);
  load();
})();

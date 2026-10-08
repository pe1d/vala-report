/**
 * Script màn hình đăng nhập (chạy trong trang, không có Node). Không import gì: build ra script thường — tên kiểu đặt riêng
 * (Login…) để không trùng script renderer khác. Bước 1 tên@đơn vị ⇒ bước 2 mật khẩu / SSO ⇒ (đổi mật khẩu tạm).
 */
interface LoginTargetView { login: string; tenant: { ma: string; ten: string }; account: string; methods: Array<'password' | 'sso'>; fill: string }
interface LoginStateView { lang: 'vi' | 'en'; t: Record<string, string>; last: LoginTargetView | null; server: string; changing: boolean }
type LoginResult = { ok: true; target?: LoginTargetView; changePassword?: boolean; finishing?: boolean } | { ok: false; type?: string; title: string; detail?: string };
interface ValaLoginApi {
  state(): Promise<LoginStateView>;
  lookup(login: string): Promise<LoginResult>;
  forget(): Promise<void>;
  password(password: string): Promise<LoginResult>;
  changePassword(next: string): Promise<LoginResult>;
  sso(slot: { x: number; y: number; w: number; h: number }): Promise<void>;
  ssoSlot(slot: { x: number; y: number; w: number; h: number }): Promise<void>;
  ssoCancel(): Promise<void>;
  onSsoResult(cb: (r: LoginResult) => void): void;
  onChanged(cb: () => void): void;
}

(() => {
  const api = (window as unknown as { valaLogin: ValaLoginApi }).valaLogin;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches);
  media.addEventListener('change', applyTheme);
  applyTheme();
  const show = (el: HTMLElement, on: boolean) => { el.style.display = on ? '' : 'none'; };

  let st: LoginStateView | null = null;
  const T = (k: string) => st?.t[k] ?? '';
  type Step = 'step1' | 'step2' | 'change' | 'sso' | 'finishing';
  let step: Step = 'step1';
  let target: LoginTargetView | null = null;
  let busy = false;

  function error(msg: string | null, detail?: string) {
    const e = $('error');
    e.replaceChildren();
    if (msg) {
      const b = document.createElement('b');
      b.textContent = msg;
      e.append(b);
      if (detail) e.append(document.createTextNode(` — ${detail}`));
    }
    show(e, !!msg);
  }
  const problem = (r: LoginResult) => {
    if (r.ok) return;
    if (r.type === 'invalid_credentials') error(T('badCredentials'));
    else error(r.title, r.detail);
  };

  function render() {
    if (!st) return;
    document.documentElement.lang = st.lang;
    document.title = T('title');
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('[data-t]'))) e.textContent = T(e.dataset.t!);
    $<HTMLInputElement>('login').placeholder = T('accountPh');
    $('next').textContent = busy && step === 'step1' ? T('checking') : T('next');
    $('sign-in').textContent = busy && step === 'step2' ? T('signingIn') : T('signIn');
    $('save').textContent = busy && step === 'change' ? T('saving') : T('save');
    $('sso-back').textContent = `← ${T('back')}`;
    $('server').textContent = st.server ? `${T('server')}: ${st.server}` : '';
    for (const id of ['next', 'sign-in', 'save', 'sso']) ($(id) as HTMLButtonElement).disabled = busy;

    show($('card'), step !== 'sso');
    show($('sso-step'), step === 'sso');
    show($('step1'), step === 'step1');
    show($('step2'), step === 'step2');
    show($('step-change'), step === 'change');
    show($('finishing'), step === 'finishing');
    if (target) {
      $('avatar').textContent = (target.account[0] ?? '?').toUpperCase();
      $('who').textContent = target.login;
      $('org').textContent = target.tenant.ten;
      $('sso-title').textContent = `${T('ssoTitle')} · ${target.tenant.ten}`;
      const pw = target.methods.includes('password');
      const sso = target.methods.includes('sso');
      show($('pw-form'), pw);
      show($('sso'), sso);
      show($('sso-only'), sso && !pw);
      show($('no-method'), !pw && !sso);
      $('sso').textContent = pw ? T('orSso') : T('sso');
      $('sso').className = pw ? 'btn w-full rounded-xl py-2.5' : 'btn-primary w-full rounded-xl py-2.5';
    }
  }

  function go(s: Step) {
    step = s;
    render();
    if (s === 'step1') $<HTMLInputElement>('login').focus();
    if (s === 'step2' && target?.methods.includes('password')) $<HTMLInputElement>('password').focus();
    if (s === 'change') $<HTMLInputElement>('new-password').focus();
    if (s === 'sso') requestAnimationFrame(() => void api.sso(slot()));
  }
  const slot = () => { const r = $('sso-slot').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

  async function run(fn: () => Promise<LoginResult>, after: (r: Extract<LoginResult, { ok: true }>) => void) {
    if (busy) return;
    busy = true; error(null); render();
    const r = await fn().catch((e: Error) => ({ ok: false as const, title: e.message }));
    busy = false;
    if (r.ok) after(r); else { problem(r); render(); }
  }

  $('step1').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $<HTMLInputElement>('login').value.trim();
    if (!v) return;
    void run(() => api.lookup(v), (r) => {
      target = r.target ?? null;
      // Đơn vị chỉ đăng nhập qua SSO ⇒ mở luôn trang SSO của đơn vị.
      if (target && !target.methods.includes('password') && target.methods.includes('sso')) go('sso'); else go('step2');
    });
  });
  $('change').addEventListener('click', () => { void api.forget(); target = null; $<HTMLInputElement>('password').value = ''; error(null); go('step1'); });
  $('pw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = $<HTMLInputElement>('password').value;
    if (!p) return;
    void run(() => api.password(p), (r) => {
      $<HTMLInputElement>('password').value = '';
      if (r.changePassword) go('change'); else go('finishing');
    });
  });
  $('step-change').addEventListener('submit', (e) => {
    e.preventDefault();
    const a = $<HTMLInputElement>('new-password').value;
    const b = $<HTMLInputElement>('confirm-password').value;
    if (!a) return;
    if (a !== b) { error(T('mismatch')); return; }
    void run(() => api.changePassword(a), () => go('finishing'));
  });
  $('sso').addEventListener('click', () => { error(null); go('sso'); });
  $('sso-back').addEventListener('click', () => { void api.ssoCancel(); go('step2'); });
  api.onSsoResult((r) => {
    if (r.ok) { if (r.finishing) go('finishing'); return; }
    go('step2');
    problem(r);
  });
  // Khung SSO đổi cỡ theo cửa sổ ⇒ báo tiến trình chính đặt lại view SSO.
  new ResizeObserver(() => { if (step === 'sso') void api.ssoSlot(slot()); }).observe($('sso-slot'));

  show($('error'), false);
  const load = () => void api.state().then((s) => {
    const first = !st;
    st = s;
    if (first) {
      target = s.last;
      if (target) $<HTMLInputElement>('login').value = target.login;
      go(target ? 'step2' : 'step1');
    } else render();
  });
  api.onChanged(load);
  load();
})();

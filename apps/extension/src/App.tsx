import type React from 'react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ApiError, allDomainCookies, api, applicableCookies, cookieGroupsOf, deviceName, missingGroups, getCachedSources, getSettings, getStatuses, normalizeServer, originPattern, setSettings, sourcePermissions,
  type ConnectEvent, type Message, type Settings, type Source, type SyncStatus,
} from './shared';
import { Badge, Banner, Button, Field, Input, Muted, SuccessDialog, ThemeToggle, cx, type Tone } from './ui';

const send = (m: Message) => chrome.runtime.sendMessage(m) as Promise<{ ok?: boolean; error?: string; status?: string; message?: string }>;
const fmt = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false })
  : '–';

/** Trạng thái hiển thị của một nguồn: ghép trạng thái kết nối trên máy chủ với lần đồng bộ gần nhất. */
function sourceState(src: Source, st: SyncStatus | undefined): [Tone, string] {
  if (src.managed) return ['ok', 'Hệ thống tự đăng nhập'];
  switch (st?.result) {
    case 'no_permission': return ['warn', 'Chưa cho phép'];
    case 'not_logged_in': return ['warn', 'Chưa đăng nhập'];
    case 'rejected': return ['err', 'Phiên hết hạn'];
    case 'error': return ['err', 'Lỗi gửi'];
  }
  if (src.state === 'active') return ['ok', 'Đang lấy dữ liệu'];
  if (src.state === 'expired') return ['err', 'Phiên hết hạn'];
  return ['neutral', 'Chưa gửi'];
}

function useExtState() {
  const [settings, set] = useState<Settings | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SyncStatus>>({});
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    const s = await getSettings();
    const srcs = await getCachedSources();
    const g: Record<string, boolean> = {};
    for (const x of srcs) g[x.code] = await chrome.permissions.contains({ origins: sourcePermissions(x) });
    set(s); setSources(s.token ? srcs : []); setStatuses(await getStatuses()); setGranted(g);
  }, []);
  useEffect(() => {
    void load();
    const onChange = () => void load();
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [load]);
  return { settings, sources, statuses, granted, reload: load };
}

function Header({ compact }: { compact?: boolean }) {
  return (
    <header className="flex items-center gap-2.5">
      <img src="icons/vala-48.png" alt="" className={compact ? 'h-6 w-6' : 'h-8 w-8'} />
      <div className="flex-1">
        <div className={cx('font-bold', !compact && 'text-lg')}>Vala Reporting</div>
        {!compact && <Muted className="text-xs">Tiện ích gửi phiên hệ thống nguồn</Muted>}
      </div>
      <ThemeToggle />
    </header>
  );
}

/** Tên cookie đang có trên tên miền nguồn — KHÔNG có giá trị. Để đối chiếu cookies_required của adapter. */
interface CookieInfo { name: string; domain: string; path: string; httpOnly: boolean; session: boolean; partitioned: boolean; applies: boolean }
/** Cookie do JS đặt (non-HttpOnly) đọc từ document.cookie trên một tab đang mở của nguồn — chrome.cookies bỏ sót. */
async function pageCookieNames(src: Source): Promise<Set<string>> {
  try {
    for (const tab of await chrome.tabs.query({ url: originPattern(src.origin) })) {
      if (tab.id === undefined) continue;
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.cookie });
      const raw = (res?.result ?? '') as string;
      if (raw) return new Set(raw.split(';').map((s) => s.slice(0, s.indexOf('=')).trim()).filter(Boolean));
    }
  } catch { /* không có tab nguồn mở hoặc chưa cấp quyền inject */ }
  return new Set();
}

async function diagnose(src: Source): Promise<CookieInfo[]> {
  const applies = new Set((await applicableCookies(src)).map((c) => `${c.name}|${c.domain}|${c.path}`));
  const seen = new Set<string>();
  // allDomainCookies gộp cả cookie phân vùng (CHIPS) theo top-level site — nếu không, cookie phân vùng sẽ vắng mặt.
  const infos: CookieInfo[] = (await allDomainCookies(src)).flatMap((c) => {
    const k = `${c.name}|${c.domain}|${c.path}`;
    if (seen.has(k)) return [];
    seen.add(k);
    return [{ name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, session: c.session,
      partitioned: !!(c as { partitionKey?: unknown }).partitionKey, applies: applies.has(k) }];
  });
  // Bổ sung cookie JS đặt (companyId/meId…) chỉ thấy qua document.cookie của trang nguồn.
  const have = new Set(infos.map((c) => c.name));
  for (const name of await pageCookieNames(src))
    if (!have.has(name)) infos.push({ name, domain: '(JS đặt · document.cookie)', path: '/', httpOnly: false, session: true, partitioned: false, applies: true });
  return infos.sort((a, b) => a.name.localeCompare(b.name));
}

type Discover = { ok: true; required: string[]; probes: number } | { ok: false; detail: string; probes: number };

/** Nút "Dò cookie phiên": gửi TẠM mọi cookie của tên miền nguồn để máy chủ tìm bộ cookie cần. Không lưu. */
function DiscoverButton({ src }: { src: Source }) {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Discover | { error: string } | null>(null);
  const run = async () => {
    if (!confirm(`Gửi tạm TẤT CẢ cookie của ${src.cookie_domain ?? new URL(src.origin).host} lên máy chủ Vala để dò xem ${src.ten} cần cookie nào?\n\nMáy chủ chỉ mở thử trang ${src.ten} bằng các cookie này rồi bỏ đi — không lưu, không ghi log giá trị.`)) return;
    setBusy(true); setR(null);
    try {
      const cookies: Record<string, string> = {};
      for (const c of await applicableCookies(src)) if (!(c.name in cookies)) cookies[c.name] = c.value;
      setR(await api<Discover>('POST', `/ext/sources/${src.code}/discover`, { cookies }));
    } catch (e) {
      setR({ error: e instanceof ApiError ? (e.detail ? `${e.message}: ${e.detail}` : e.message) : 'Dò lỗi' });
    } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-1.5">
      <Button className="justify-self-start" disabled={busy} onClick={() => void run()}>{busy ? 'Đang dò… (có thể mất 10–20 giây)' : 'Dò cookie phiên'}</Button>
      {r && 'error' in r && <div className="text-red-700 dark:text-red-400">{r.error}</div>}
      {r && 'ok' in r && r.ok && <div>Máy chủ dùng được phiên với: <strong>{r.required.join(', ')}</strong> ({r.probes} lần thử). Gửi danh sách tên này cho quản trị để sửa adapter.</div>}
      {r && 'ok' in r && !r.ok && <div>Kể cả gửi đủ mọi cookie, máy chủ vẫn không dùng được phiên: <strong>{r.detail}</strong></div>}
    </div>
  );
}

function Diagnosis({ src, items }: { src: Source; items: CookieInfo[] }) {
  const names = new Set(items.filter((c) => c.applies).map((c) => c.name));
  const missing = missingGroups(src, names);
  const text = items.map((c) => [c.name, c.domain, c.path, c.httpOnly && 'HttpOnly', c.session && 'phiên', c.partitioned && 'phân vùng', !c.applies && '(không gửi cho trang này)']
    .filter(Boolean).join('\t')).join('\n');
  return (
    <div className="mt-2 grid gap-1.5 rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-950">
      <div>Vala cần: {cookieGroupsOf(src).map((g) => {
        const ok = g.some((n) => names.has(n));
        return (
          <code key={g.join('|')} className={cx('mr-1 inline-block rounded px-1', ok ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-red-100 dark:bg-red-950')}>
            {g.map((n) => (names.has(n) ? <strong key={n}>{n}</strong> : <span key={n}>{n}</span>)).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' hoặc ', x] : [x]), [])}{ok ? ' ✓' : ' ✗'}
          </code>
        );
      })}</div>
      {missing.length > 0 && <div>Thiếu {missing.length} cookie. Hãy chắc là bạn đang đăng nhập {src.ten} (mở trang vẫn vào thẳng, không hỏi mật khẩu). Đã đăng nhập mà vẫn thiếu thì tên cookie trong adapter chưa đúng — gửi danh sách dưới đây cho quản trị.</div>}
      <div>Trình duyệt đang có {items.length} cookie (chỉ tên, không có giá trị):</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 p-1.5 font-mono dark:border-slate-800">{text || '(không có)'}</pre>
      <Button className="justify-self-start" onClick={() => void navigator.clipboard.writeText(text)}>Sao chép danh sách tên</Button>
      <DiscoverButton src={src} />
    </div>
  );
}

function SourceRow({ src, st, granted, onGrant, canDiagnose, highlight }: { src: Source; st?: SyncStatus; granted: boolean; onGrant?: () => void; canDiagnose?: boolean; highlight?: boolean }) {
  const [tone, label] = sourceState(src, st);
  const [diag, setDiag] = useState<CookieInfo[] | null>(null);
  const needLogin = st?.result === 'not_logged_in' || st?.result === 'rejected' || (!st && src.state === 'expired');
  return (
    <li className={cx('rounded-md border bg-white p-3 dark:bg-slate-900', highlight ? 'border-blue-600 ring-2 ring-blue-600/20 dark:border-blue-400' : 'border-slate-200 dark:border-slate-800')}>
      <div className="flex items-center gap-2">
        <span className="flex-1 font-semibold">{src.ten}</span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <Muted className="mt-0.5 text-xs">{new URL(src.origin).host}{src.last_push_at && src.state === 'active' ? ` · gửi lần cuối ${fmt(src.last_push_at)}` : ''}</Muted>
      {st && st.result !== 'sent' && st.result !== 'unchanged' && st.result !== 'managed' && <p className="mt-1 text-xs">{st.message}</p>}
      {(needLogin || (!granted && onGrant) || (canDiagnose && granted)) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!granted && onGrant && <Button variant="primary" onClick={onGrant}>Cho phép</Button>}
          {granted && needLogin && <Button onClick={() => void send({ type: 'connect', code: src.code }).then(() => { if (location.pathname.endsWith('popup.html')) window.close(); })}>Mở {src.ten} để đăng nhập</Button>}
          {canDiagnose && granted && <Button onClick={() => void (diag ? setDiag(null) : diagnose(src).then(setDiag))}>{diag ? 'Ẩn chẩn đoán' : 'Chẩn đoán cookie'}</Button>}
        </div>
      )}
      {diag && <Diagnosis src={src} items={diag} />}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Popup: xem nhanh trạng thái, gửi lại, mở hệ thống nguồn để đăng nhập.
// ---------------------------------------------------------------------------------------------
export function Popup() {
  const { settings, sources, statuses, granted } = useExtState();
  const [busy, setBusy] = useState(false);
  const syncNow = async () => { setBusy(true); try { await send({ type: 'sync', force: true }); } finally { setBusy(false); } };
  // Mở popup ⇒ đồng bộ nhẹ (không ép gửi lại) để trạng thái mới nhất.
  useEffect(() => { if (settings?.token) void send({ type: 'sync' }); }, [settings?.token]);

  if (!settings) return null;
  return (
    <div className="grid w-[360px] gap-3 p-3">
      <Header compact />
      {!settings.token ? (
        <div className="grid gap-2">
          <Muted>Đăng nhập tiện ích bằng tài khoản Vala để hệ thống nhận phiên các hệ thống nguồn từ trình duyệt này.</Muted>
          <Button variant="primary" onClick={() => void chrome.runtime.openOptionsPage()}>Đăng nhập</Button>
        </div>
      ) : (
        <>
          <Muted className="text-xs">Đăng nhập Vala: <span className="font-medium text-slate-800 dark:text-slate-200">{settings.user?.ho_ten}</span></Muted>
          <ul className="grid gap-2">
            {sources.map((s) => <SourceRow key={s.code} src={s} st={statuses[s.code]} granted={granted[s.code] ?? false}
              onGrant={() => void chrome.runtime.openOptionsPage()} />)}
            {!sources.length && <Muted>Đang tải danh sách hệ thống…</Muted>}
          </ul>
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void syncNow()}>{busy ? 'Đang gửi…' : 'Gửi lại ngay'}</Button>
            <Button onClick={() => void chrome.runtime.openOptionsPage()}>Cài đặt</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Trang cài đặt (mở trong tab): đăng nhập, cấp quyền đọc phiên từng tên miền, đăng xuất.
// Hộp thoại xin quyền của Chrome cần mở từ một cú bấm trong tab — không làm trong popup.
// ---------------------------------------------------------------------------------------------
export function Options() {
  const { settings, sources, statuses, granted, reload } = useExtState();
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings && !server) setServer(settings.serverUrl); }, [settings, server]);
  useEffect(() => { if (settings?.token) void send({ type: 'refresh-sources' }); }, [settings?.token]);

  // Kết nối xong (tiện ích đưa người dùng quay về đây) ⇒ hộp "thành công".
  const [done, setDone] = useState<ConnectEvent | null>(null);
  useEffect(() => {
    const on = (m: ConnectEvent) => { if (m?.type === 'connected' || m?.type === 'connect-failed') { setDone(m); void reload(); } };
    chrome.runtime.onMessage.addListener(on);
    return () => chrome.runtime.onMessage.removeListener(on);
  }, [reload]);
  // Mở từ background: #da-ket-noi=egov | #loi=egov | #cho-phep=egov
  const [askGrant, setAskGrant] = useState<string | null>(null);
  useEffect(() => {
    const m = /^#(da-ket-noi|loi|cho-phep)=([a-z0-9_]+)$/.exec(location.hash);
    if (!m || !sources.length) return;
    const src = sources.find((x) => x.code === m[2]);
    if (!src) return;
    history.replaceState(null, '', location.pathname);
    if (m[1] === 'da-ket-noi') setDone({ type: 'connected', code: src.code, ten: src.ten });
    else if (m[1] === 'loi') setDone({ type: 'connect-failed', code: src.code, ten: src.ten, message: statuses[src.code]?.message ?? 'Kết nối không thành công' });
    else { setAskGrant(src.code); setNote({ tone: 'info', text: `Bấm "Cho phép" ở dòng ${src.ten} để tiện ích đọc được phiên đăng nhập.` }); }
  }, [sources, statuses]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    const origin = normalizeServer(server);
    if (!origin) { setNote({ tone: 'err', text: 'Địa chỉ máy chủ phải là https://… (http chỉ cho localhost).' }); return; }
    setBusy(true); setNote(null);
    try {
      // Xin quyền gọi máy chủ Vala TRƯỚC mọi await khác (Chrome yêu cầu còn trong cú bấm).
      if (!(await chrome.permissions.request({ origins: [originPattern(origin)] }))) {
        setNote({ tone: 'err', text: `Cần cho phép tiện ích kết nối ${new URL(origin).host}.` }); return;
      }
      await setSettings({ serverUrl: origin, token: null, user: null });
      const r = await api<{ token: string; user: Settings['user'] }>('POST', '/ext/login',
        { username, password, device_name: deviceName() }, { serverUrl: origin, token: null, user: null });
      await setSettings({ token: r.token, user: r.user });
      setPassword('');
      await send({ type: 'sync' });
      await reload();
      setNote({ tone: 'ok', text: 'Đã đăng nhập tiện ích. Từ giờ mỗi khi bạn đăng nhập các hệ thống bên dưới trên trình duyệt này, tiện ích tự gửi phiên cho Vala.' });
    } catch (err) {
      setNote({ tone: 'err', text: err instanceof ApiError ? (err.detail ? `${err.message}. ${err.detail}` : err.message) : 'Đăng nhập lỗi' });
    } finally { setBusy(false); }
  };

  const missing = sources.filter((s) => !s.managed && !granted[s.code]);
  const grant = async (list: Source[]) => {
    const origins = [...new Set(list.flatMap(sourcePermissions))];
    const ok = await chrome.permissions.request({ origins });
    if (!ok) { setNote({ tone: 'err', text: 'Chưa cho phép — tiện ích sẽ không đọc được phiên các hệ thống đó.' }); return; }
    setNote({ tone: 'ok', text: 'Đã cho phép. Từ giờ mỗi khi bạn đăng nhập các hệ thống này, tiện ích tự gửi phiên cho Vala.' });
    // Cho phép xong ⇒ kết nối luôn: có phiên sẵn thì gửi, chưa đăng nhập thì mở trang đăng nhập rồi quay lại đây.
    for (const s of list) await send({ type: 'connect', code: s.code });
    setAskGrant(null);
    await reload();
  };

  const logout = async () => {
    try { await api('POST', '/ext/logout'); } catch { /* token đã hết hạn cũng coi như xong */ }
    await setSettings({ token: null, user: null });
    await chrome.storage.local.remove(['sources', 'statuses', ...sources.map((s) => `sent:${s.code}`)]);
    setNote({ tone: 'info', text: 'Đã đăng xuất tiện ích. Phiên đã gửi trước đó vẫn ở Vala cho tới khi bạn gỡ tại cổng.' });
    await reload();
  };

  if (!settings) return null;
  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 py-8">
      <Header />
      {done && (
        <SuccessDialog ok={done.type === 'connected'} onClose={() => setDone(null)}
          title={done.type === 'connected' ? `Đã kết nối ${done.ten}` : `Chưa kết nối được ${done.ten}`}
          action={done.type === 'connected' && settings.serverUrl
            ? { label: 'Về Vala Reporting', onClick: () => void chrome.tabs.create({ url: `${settings.serverUrl}/uy-quyen` }).then(() => setDone(null)) } : undefined}>
          {done.type === 'connected'
            ? <>Vala đã nhận phiên đăng nhập và sẽ lấy dữ liệu thay bạn theo lịch.
                <span className="mt-2 block text-sm">Mẹo: khi trình duyệt hỏi, bấm <strong>“Lưu mật khẩu”</strong>. Lần sau phiên hết hạn, tiện ích sẽ báo — bấm vào thông báo là trình duyệt tự điền, bạn chỉ cần bấm Đăng nhập.</span></>
            : done.message}
        </SuccessDialog>
      )}
      {note && <Banner tone={note.tone}>{note.text}</Banner>}

      {!settings.token ? (
        <form onSubmit={(e) => void login(e)} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold">Đăng nhập tài khoản Vala</h2>
          <Field label="Máy chủ Vala" hint="Địa chỉ cổng báo cáo của đơn vị, ví dụ https://vala.bkav.com">
            <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://…" required />
          </Field>
          <Field label="Tên đăng nhập"><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
          <Field label="Mật khẩu"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <Button type="submit" variant="primary" disabled={busy} className="justify-self-start">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
        </form>
      ) : (
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold">{settings.user?.ho_ten}</div>
              <Muted className="text-xs">{settings.user?.email} · {new URL(settings.serverUrl).host}</Muted>
            </div>
            <Button variant="danger" onClick={() => void logout()}>Đăng xuất</Button>
          </div>
        </section>
      )}

      {settings.token && (
        <section className="grid gap-3">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-base font-semibold">Hệ thống nguồn</h2>
            {missing.length > 0 && <Button variant="primary" onClick={() => void grant(missing)}>Cho phép đọc phiên ({missing.length})</Button>}
          </div>
          <ul className="grid gap-2">
            {sources.map((s) => <SourceRow key={s.code} src={s} st={statuses[s.code]} granted={granted[s.code] ?? false} onGrant={() => void grant([s])} canDiagnose highlight={askGrant === s.code} />)}
          </ul>
        </section>
      )}

      <section className="grid gap-1.5 text-slate-600 dark:text-slate-400">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tiện ích làm gì</h2>
        <p>Bạn đăng nhập các hệ thống nguồn (danh sách ở trên, do quản trị cấu hình) như mọi ngày. Tiện ích đọc <strong>đúng các cookie phiên</strong> Vala cần và gửi về máy chủ Vala, để hệ thống lấy dữ liệu thay bạn theo lịch — không phải dán cookie, không lưu mật khẩu.</p>
        <p>Tiện ích chỉ đọc tên miền bạn đã bấm cho phép. Cookie được lưu trong kho bí mật của Vala; tiện ích không giữ lại giá trị cookie. Gỡ tại cổng Vala (Tài khoản nguồn) để xoá phiên đã gửi.</p>
      </section>
    </div>
  );
}

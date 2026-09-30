/**
 * Service worker: theo dõi cookie phiên của các hệ thống nguồn và gửi về Vala khi chúng đổi
 * (người dùng vừa đăng nhập, phiên được gia hạn). Ngoài ra đồng bộ định kỳ 15 phút một lần.
 *
 * Luồng "kết nối": cổng Vala (qua bridge.js) hoặc trang của tiện ích xin kết nối một nguồn ⇒ có phiên sẵn
 * thì gửi luôn; chưa có thì mở trang đăng nhập nguồn. Gửi được phiên ⇒ thông báo "đã kết nối", đóng tab
 * đăng nhập đã mở, đưa người dùng quay về đúng trang đã bấm.
 */
import {
  ApiError, api, applicableCookies, getCachedSources, getSettings, getStatuses, missingGroups, originPattern, sourcePermissions,
  type ConnectEvent, type Message, type Source, type SyncStatus,
} from './shared';

const DEBOUNCE_MS = 3000;
const PENDING_TTL_MS = 15 * 60_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Một lượt kết nối đang chờ người dùng đăng nhập (storage.session: mất khi đóng trình duyệt). */
interface Pending { loginTabId?: number; returnTabId?: number; at: number; /** Mở từ thông báo "hết phiên": không kéo người dùng đi đâu, chỉ báo kết quả. */ quiet?: boolean }

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function setStatus(code: string, st: Omit<SyncStatus, 'at'>): Promise<SyncStatus['result']> {
  const all = await getStatuses();
  all[code] = { ...st, at: new Date().toISOString() };
  await chrome.storage.local.set({ statuses: all });
  return st.result;
}

/** Lấy danh sách nguồn từ máy chủ và cache lại (service worker có thể bị tắt bất cứ lúc nào). */
async function refreshSources(): Promise<Source[]> {
  const s = await getSettings();
  if (!s.token) return [];
  const sources = await api<Source[]>('GET', '/ext/sources', undefined, s);
  await chrome.storage.local.set({ sources });
  return sources;
}

/**
 * Đọc cookie do JS đặt (non-HttpOnly) mà chrome.cookies bỏ sót — bằng cách đọc document.cookie ngay trên
 * một tab đang mở của nguồn (vd companyId/meId của eTask). Chỉ lấy đúng các tên còn thiếu. Không có tab
 * nguồn nào mở thì trả rỗng (sẽ bắt được ở lần đồng bộ sau, khi tab nguồn còn mở).
 */
async function readPageCookies(src: Source, names: string[]): Promise<Record<string, string>> {
  if (!names.length) return {};
  const tabs = await chrome.tabs.query({ url: originPattern(src.origin) });
  console.log(`[vala] ${src.code}: cần đọc từ trang ${names.join(',')}; tìm thấy ${tabs.length} tab ${originPattern(src.origin)}`);
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (wanted: string[]): string[] => {
          const out: string[] = [];
          for (const part of document.cookie.split(';')) {
            const i = part.indexOf('=');
            if (i < 0) continue;
            const name = part.slice(0, i).trim();
            if (wanted.includes(name)) out.push(`${name}=${part.slice(i + 1)}`);   // giá trị nguyên (đúng dạng gửi lên máy chủ)
          }
          return out;
        },
        args: [names],
      });
      const pairs = (res?.result ?? []) as string[];
      console.log(`[vala] ${src.code}: tab ${tab.id} đọc được ${pairs.length} cookie JS: ${pairs.map((p) => p.slice(0, p.indexOf('='))).join(',') || '(không có)'}`);
      if (pairs.length) return Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
    } catch (e) { console.log(`[vala] ${src.code}: tab ${tab.id} INJECT LỖI: ${String(e)}`); }
  }
  return {};
}

/** Thời hạn (giây epoch) của các cookie phiên đọc được qua chrome.cookies — chỉ thời hạn, không bao giờ kèm giá trị. */
const cookieExpiry = new Map<string, Record<string, number>>();

/** Đọc đúng các cookie phiên của một nguồn. null nếu chưa có quyền đọc các tên miền cần. */
async function readCookies(src: Source): Promise<Record<string, string> | null> {
  if (!(await chrome.permissions.contains({ origins: sourcePermissions(src) }))) return null;
  const out: Record<string, string> = {};
  const exp: Record<string, number> = {};
  for (const c of await applicableCookies(src)) {
    if (src.cookie_names.includes(c.name) && !(c.name in out)) {
      out[c.name] = c.value;
      if (!c.session && c.expirationDate) exp[c.name] = Math.floor(c.expirationDate);
    }
  }
  cookieExpiry.set(src.code, exp);
  console.log(`[vala] ${src.code}: cần ${src.cookie_names.join(',')}; chrome.cookies lấy được ${Object.keys(out).join(',') || '(không có)'}`);
  // Cookie do JS đặt (non-HttpOnly) như companyId/meId của eTask không lộ qua chrome.cookies — đọc bù từ trang.
  Object.assign(out, await readPageCookies(src, src.cookie_names.filter((n) => !(n in out))));
  console.log(`[vala] ${src.code}: TỔNG lấy được ${Object.keys(out).join(',') || '(không có)'}`);
  return out;
}

async function syncSource(src: Source, force = false): Promise<SyncStatus['result']> {
  const result = await pushSource(src, force);
  if (result === 'sent' || result === 'unchanged') await finishPending(src, true);
  await checkExpiry(src, result);
  return result;
}

async function pushSource(src: Source, force: boolean): Promise<SyncStatus['result']> {
  if (src.managed) return setStatus(src.code, { result: 'managed', message: 'Hệ thống tự đăng nhập bằng tài khoản đã cấp, không cần tiện ích' });
  const cookies = await readCookies(src);
  if (!cookies) return setStatus(src.code, { result: 'no_permission', message: `Chưa cho phép đọc phiên ${src.cookie_domain ?? new URL(src.origin).host}` });
  // Thiếu cookie định danh (chỉ đọc được khi đang mở trang nguồn) thì vẫn gửi — máy chủ dùng lại giá trị lần trước.
  const stable = new Set(src.stable_cookies ?? []);
  const missing = missingGroups(src, cookies).filter((g) => !g.split('|').every((n) => stable.has(n)));
  if (missing.length) return setStatus(src.code, { result: 'not_logged_in', message: `Chưa đăng nhập ${src.ten} trên trình duyệt này (thiếu ${missing.join(', ')})` });

  // Chỉ lưu hash — không bao giờ lưu giá trị cookie. Cùng phiên đã gửi (hoặc đã bị từ chối) thì thôi.
  const hash = await sha256(src.cookie_names.filter((n) => n in cookies).map((n) => `${n}=${cookies[n]}`).join(';'));
  const key = `sent:${src.code}`;
  const prev = (await chrome.storage.local.get(key))[key] as { hash: string; ok: boolean } | undefined;
  if (!force && prev?.hash === hash && (!prev.ok || src.state === 'active')) {
    return setStatus(src.code, prev.ok
      ? { result: 'unchanged', message: 'Phiên không đổi, máy chủ đang dùng phiên này' }
      : { result: 'rejected', message: 'Phiên trên trình duyệt đã hết hạn — đăng nhập lại' });
  }
  try {
    const r = await api<{ status: string; message?: string }>('PUT', `/ext/sources/${src.code}/session`,
      { cookies, expires: cookieExpiry.get(src.code) ?? {} });
    await chrome.storage.local.set({ [key]: { hash, ok: true } });
    if (r.status !== 'active') return setStatus(src.code, { result: 'managed', message: r.message ?? 'Máy chủ không cần phiên này' });
    // Lần đầu kết nối / nối lại sau khi hết hạn ⇒ báo cho người dùng biết đã xong. Vừa đăng nhập ở tab
    // do tiện ích mở ⇒ kèm lời nhắc lưu mật khẩu (trình duyệt không cho tiện ích tự lưu).
    const pend = (await chrome.storage.session.get(pendingKey(src.code)))[pendingKey(src.code)] as Pending | undefined;
    if (src.state !== 'active') {
      const again = src.state === 'expired' || src.state === 'failed';
      const hint = pend?.loginTabId !== undefined ? await passwordHint(src.code) : '';
      notify(again ? `Đã kết nối lại ${src.ten}` : `Đã kết nối ${src.ten}`,
        `Vala đã nhận phiên đăng nhập, dữ liệu sẽ được lấy tiếp theo lịch.${hint}`);
    }
    src.state = 'active';
    // Cập nhật cả bản cache (không đợi lần làm mới 15 phút) để cookie đổi tiếp theo không báo "đã kết nối" lặp lại.
    const cached = await getCachedSources();
    const c = cached.find((x) => x.code === src.code);
    if (c && c.state !== 'active') { c.state = 'active'; await chrome.storage.local.set({ sources: cached }); }
    return setStatus(src.code, { result: 'sent', message: 'Đã gửi phiên cho Vala' });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, 'internal', 'Lỗi không xác định');
    if (err.type === 'session_expired') {
      await chrome.storage.local.set({ [key]: { hash, ok: false } });
      await finishPending(src, false, `Vala không dùng được phiên ${src.ten} này (máy chủ báo đã hết hạn)`);
      return setStatus(src.code, { result: 'rejected', message: `Vala không dùng được phiên ${src.ten} này${err.detail ? ` — ${err.detail}` : ''}` });
    }
    return setStatus(src.code, { result: 'error', message: err.detail ? `${err.message}: ${err.detail}` : err.message });
  }
}

function notify(title: string, message: string, opts: { id?: string; sticky?: boolean } = {}) {
  const o: chrome.notifications.NotificationOptions<true> = {
    type: 'basic', iconUrl: 'icons/vala-128.png', title, message, priority: opts.sticky ? 2 : 1, requireInteraction: !!opts.sticky };
  if (opts.id) chrome.notifications.create(opts.id, o);
  else chrome.notifications.create(o);
}

/** Lời nhắc lưu mật khẩu — tối đa 2 lần cho mỗi hệ thống (không biết được người dùng đã lưu hay chưa). */
async function passwordHint(code: string): Promise<string> {
  const key = `pwhint:${code}`;
  const n = ((await chrome.storage.local.get(key))[key] as number | undefined) ?? 0;
  if (n >= 2) return '';
  await chrome.storage.local.set({ [key]: n + 1 });
  return ' Mẹo: khi trình duyệt hỏi, bấm "Lưu mật khẩu" — lần sau đăng nhập lại chỉ cần một cú bấm.';
}

// ---------------------------------------------------------------------------------------------
// Báo hết phiên: nguồn đang kết nối bằng tiện ích mà phiên phía máy chủ đã chết và trình duyệt không có
// phiên mới để gửi ⇒ một thông báo (bấm để đăng nhập lại). Mỗi đợt báo một lần, nhắc lại sau 24 giờ.
// ---------------------------------------------------------------------------------------------
const EXPIRY_REMIND_MS = 24 * 3600_000;
const expiryKey = (code: string) => `expired-notice:${code}`;
const reloginId = (code: string) => `relogin:${code}`;

async function checkExpiry(src: Source, result: SyncStatus['result']) {
  const key = expiryKey(src.code);
  if (result === 'sent' || result === 'unchanged' || result === 'managed') {
    await chrome.storage.local.remove(key);
    chrome.notifications.clear(reloginId(src.code));
    return;
  }
  if (src.auth_method !== 'extension') return;                      // chưa từng kết nối bằng tiện ích ⇒ không làm phiền
  const dead = src.state === 'expired' || src.state === 'failed' || result === 'rejected';
  if (!dead) return;                                                 // máy chủ vẫn còn phiên dùng được
  if ((await chrome.storage.session.get(pendingKey(src.code)))[pendingKey(src.code)]) return;   // đang đăng nhập lại
  const last = (await chrome.storage.local.get(key))[key] as number | undefined;
  if (last && Date.now() - last < EXPIRY_REMIND_MS) return;
  await chrome.storage.local.set({ [key]: Date.now() });
  notify(`Phiên ${src.ten} đã hết hạn`, 'Vala không lấy được dữ liệu mới. Bấm vào đây để đăng nhập lại — xong tiện ích tự gửi phiên.',
    { id: reloginId(src.code), sticky: true });
}

// ---------------------------------------------------------------------------------------------
// Luồng kết nối
// ---------------------------------------------------------------------------------------------
const pendingKey = (code: string) => `pending:${code}`;

async function startConnect(code: string, returnTabId?: number, quiet = false): Promise<{ status: string; message?: string }> {
  let sources: Source[];
  try { sources = await refreshSources(); } catch { sources = await getCachedSources(); }
  const src = sources.find((s) => s.code === code);
  if (!src) return { status: 'unknown_source', message: 'Tiện ích chưa đăng nhập hoặc không có hệ thống này' };
  await chrome.storage.session.set({ [pendingKey(code)]: { returnTabId, at: Date.now(), quiet } satisfies Pending });

  const r = await syncSource(src, true);
  if (r === 'sent' || r === 'unchanged') return { status: 'connected' };
  if (r === 'managed') { await chrome.storage.session.remove(pendingKey(code)); return { status: 'managed' }; }
  if (r === 'no_permission') {
    // Hộp thoại xin quyền phải mở từ một cú bấm trong trang của tiện ích.
    await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#cho-phep=${code}`) });
    return { status: 'need_permission', message: `Bấm "Cho phép" trong trang tiện ích vừa mở để tiện ích đọc được phiên ${src.ten}` };
  }
  // Chưa đăng nhập / phiên hỏng ⇒ mở trang đăng nhập nguồn; cookie đổi sẽ kích hoạt gửi (onChanged).
  const tab = await chrome.tabs.create({ url: src.login_url, active: true });
  await chrome.storage.session.set({ [pendingKey(code)]: { loginTabId: tab.id, returnTabId, at: Date.now(), quiet } satisfies Pending });
  return { status: 'login_opened', message: `Đăng nhập ${src.ten} trong tab vừa mở — xong tiện ích tự đưa bạn quay lại` };
}

/** Kết thúc lượt kết nối đang chờ: đóng tab đăng nhập đã mở, quay về trang đã bấm, báo kết quả. */
async function finishPending(src: Source, ok: boolean, message?: string) {
  const key = pendingKey(src.code);
  const p = (await chrome.storage.session.get(key))[key] as Pending | undefined;
  if (!p) return;
  await chrome.storage.session.remove(key);
  if (Date.now() - p.at > PENDING_TTL_MS) return;
  const ev: ConnectEvent = ok ? { type: 'connected', code: src.code, ten: src.ten }
    : { type: 'connect-failed', code: src.code, ten: src.ten, message: message ?? 'Kết nối không thành công' };
  if (!ok) notify(`Chưa kết nối được ${src.ten}`, ev.type === 'connect-failed' ? ev.message : '');
  // Đăng nhập lại từ thông báo: người dùng ở lại trang nguồn đang dùng; kết quả đã báo bằng thông báo.
  if (p.quiet) return;

  const back = p.returnTabId !== undefined ? await chrome.tabs.get(p.returnTabId).catch(() => null) : null;
  if (back?.id !== undefined) {
    await chrome.tabs.update(back.id, { active: true });
    if (back.windowId !== undefined) await chrome.windows.update(back.windowId, { focused: true });
    await chrome.tabs.sendMessage(back.id, ev).catch(() => {});   // cổng (bridge.js) hoặc trang tiện ích
  } else {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#${ok ? 'da-ket-noi' : 'loi'}=${src.code}`) });
  }
  if (ok && p.loginTabId !== undefined && p.loginTabId !== p.returnTabId) await chrome.tabs.remove(p.loginTabId).catch(() => {});
  // Trang tiện ích đang mở (popup/cài đặt) cũng nghe để hiện thông báo.
  chrome.runtime.sendMessage(ev).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// Cầu nối với cổng Vala: chỉ tiêm vào đúng origin máy chủ đã cấu hình, khi đã có quyền.
// ---------------------------------------------------------------------------------------------
async function registerBridge() {
  await chrome.scripting.unregisterContentScripts({ ids: ['vala-bridge'] }).catch(() => {});
  const s = await getSettings();
  if (!s.token || !s.serverUrl) return;
  const pattern = originPattern(s.serverUrl);
  if (!(await chrome.permissions.contains({ origins: [pattern] }))) return;
  await chrome.scripting.registerContentScripts([{ id: 'vala-bridge', matches: [pattern], js: ['bridge.js'], runAt: 'document_idle' }]);
  // Tab cổng đang mở sẵn: tiêm luôn, khỏi phải tải lại trang.
  for (const t of await chrome.tabs.query({ url: pattern })) {
    if (t.id !== undefined) await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['bridge.js'] }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------
async function syncAll(force = false): Promise<void> {
  let sources: Source[];
  try { sources = await refreshSources(); } catch { sources = await getCachedSources(); }
  for (const src of sources) await syncSource(src, force);
  await updateBadge();
}

/** Biểu tượng: "!" khi có nguồn cần người dùng làm gì (đăng nhập lại, cho phép), "?" khi chưa đăng nhập tiện ích. */
async function updateBadge() {
  const s = await getSettings();
  if (!s.token) {
    await chrome.action.setBadgeText({ text: '?' });
    await chrome.action.setBadgeBackgroundColor({ color: '#64748b' });
    return;
  }
  const st = await getStatuses();
  const needs = Object.values(st).some((x) => x.result === 'not_logged_in' || x.result === 'rejected' || x.result === 'no_permission' || x.result === 'error');
  await chrome.action.setBadgeText({ text: needs ? '!' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
}

// Cookie phiên đổi ⇒ gửi lại (debounce: một lần đăng nhập đổi nhiều cookie liền nhau).
chrome.cookies.onChanged.addListener(async ({ cookie, removed }) => {
  if (removed) return;
  const sources = await getCachedSources();
  for (const src of sources) {
    if (!src.cookie_names.includes(cookie.name)) continue;
    const host = new URL(src.origin).hostname;
    const d = cookie.domain.replace(/^\./, '');
    if (host !== d && !host.endsWith(`.${d}`)) continue;
    clearTimeout(timers.get(src.code));
    timers.set(src.code, setTimeout(() => { timers.delete(src.code); void syncSource(src).then(updateBadge); }, DEBOUNCE_MS));
  }
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'sync') void syncAll(); });

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create('sync', { periodInMinutes: 15 });
  void registerBridge();
  void syncAll();
});
chrome.runtime.onStartup.addListener(() => { void registerBridge(); void syncAll(); });

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ('token' in ch || 'serverUrl' in ch)) void registerBridge();
});

chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  const run = async (): Promise<unknown> => {
    switch (msg.type) {
      case 'sync': await syncAll(msg.force); return { ok: true };
      case 'refresh-sources': await refreshSources(); return { ok: true };
      case 'connect': return startConnect(msg.code, sender.tab?.id);
      case 'bridge-hello': {
        const s = await getSettings();
        return { installed: true, version: chrome.runtime.getManifest().version, logged_in: !!s.token, email: s.user?.email ?? null };
      }
      default: return undefined;
    }
  };
  run().then(reply, (e: Error) => reply({ ok: false, error: e.message }));
  return true;   // trả lời bất đồng bộ
});

chrome.permissions.onAdded.addListener(() => { void registerBridge(); void syncAll(); });

// Bấm thông báo "phiên hết hạn" ⇒ mở trang đăng nhập nguồn (trình duyệt tự điền nếu đã lưu mật khẩu).
chrome.notifications.onClicked.addListener((id) => {
  const m = /^relogin:(.+)$/.exec(id);
  if (!m) return;
  chrome.notifications.clear(id);
  void startConnect(m[1]!, undefined, true);
});

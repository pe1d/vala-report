/**
 * Tự điền / tự đăng nhập hệ thống nguồn bằng mật khẩu lưu trong máy (credentials.ts) — T08.
 *
 *   - Chỉ trên đúng các host của hệ thống đó: trang chính, trang đăng nhập (login_url) và host đăng nhập máy chủ khai
 *     (login_hosts, vd iam.bkav.com). Trang khác không bao giờ nhận mật khẩu.
 *   - Trang có form đăng nhập (ô mật khẩu đang hiện) ⇒ gói kịch bản của hệ thống có thao tác `dang_nhap` thì gọi nó
 *     ({ username, password }), không thì tự tìm ô tên đăng nhập + mật khẩu, điền rồi bấm đăng nhập.
 *   - Đăng nhập tự động lỗi (form đăng nhập lại hiện trong 90 giây) ⇒ dừng tự đăng nhập hệ thống đó cho tới khi người dùng
 *     lưu mật khẩu mới — không thử lại liên tục (tránh khoá tài khoản nguồn). Thêm chặn cứng: tối đa 3 lần / giờ / nguồn.
 *   - Người dùng tự đăng nhập ⇒ hỏi "Lưu mật khẩu?" (như trình duyệt); preload chỉ gửi khi host là host đăng nhập của nguồn.
 *   - Phiên hết hạn ⇒ windows.ts gọi tryAutoRelogin: mở nền trang đăng nhập, phần trên tự điền, cookie mới tự gửi lên Vala.
 */
import { BrowserWindow, dialog, ipcMain, Notification, type IpcMainInvokeEvent, type WebContents, type WebFrameMain } from 'electron';
import { ICON } from './channel';
import { backgroundSourceTab } from './browser';
import { neverSave, sameAsSaved, saveCredential, savedCredential, secureStorageAvailable, setNeverSave, useCredential } from './credentials';
import { messages } from './i18n';
import { runAction } from './scripts';
import { getSettings } from './settings';
import { cachedSources, type SourceFull } from './sync';

const M = messages({
  saveTitle: (ten: string) => `Lưu mật khẩu ${ten}?`,
  saveMessage: (ten: string, user: string) => `Lưu mật khẩu ${ten} của tài khoản ${user} để Vala Desktop tự đăng nhập lại khi phiên hết hạn?`,
  saveDetail: 'Mật khẩu được mã hoá bằng kho mật khẩu của hệ điều hành trên máy này, chỉ dùng để đăng nhập đúng hệ thống đó trong Vala Desktop, không gửi lên máy chủ Vala. Xoá được trong Cài đặt.',
  save: 'Lưu', later: 'Lúc khác', never: 'Không bao giờ cho hệ thống này',
  failedTitle: (ten: string) => `Không tự đăng nhập được ${ten}`,
  failedBody: 'Mật khẩu đã lưu có thể đã đổi. Đăng nhập tay một lần — Vala Desktop sẽ hỏi lưu mật khẩu mới.',
}, {
  saveTitle: (ten: string) => `Save ${ten} password?`,
  saveMessage: (ten: string, user: string) => `Save the ${ten} password for ${user} so Vala Desktop can sign in again when the session expires?`,
  saveDetail: 'The password is encrypted with your operating system’s password store on this computer, used only to sign in to that system inside Vala Desktop, and never sent to the Vala server. You can delete it in Settings.',
  save: 'Save', later: 'Not now', never: 'Never for this system',
  failedTitle: (ten: string) => `Could not sign in to ${ten} automatically`,
  failedBody: 'The saved password may have changed. Sign in manually once — Vala Desktop will offer to save the new password.',
});
const T = () => M[getSettings().lang];

const RETRY_WINDOW_MS = 90_000;
/** Lần tự đăng nhập gần nhất của mỗi nguồn; lỗi ⇒ tạm dừng tự đăng nhập nguồn đó trong phiên app. */
const lastAttempt = new Map<string, number>();
const failed = new Set<string>();

/** Host được phép điền mật khẩu của một nguồn. */
export function loginHostsOf(src: SourceFull): string[] {
  const hosts = new Set<string>();
  for (const u of [src.origin, src.login_url]) { try { hosts.add(new URL(u).host); } catch { /* bỏ qua */ } }
  for (const h of src.login_hosts ?? []) hosts.add(h);
  return [...hosts];
}

/** Nguồn có host đăng nhập này (đã đăng nhập Vala Desktop mới có danh sách nguồn). */
export function sourceForUrl(url: string): SourceFull | null {
  let host: string;
  try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return null; host = u.host; } catch { return null; }
  if (!getSettings().deviceToken) return null;
  return cachedSources().find((s) => loginHostsOf(s).includes(host)) ?? null;
}

/** Mã chạy trong trang: có form đăng nhập (ô mật khẩu đang hiện) không. */
const HAS_LOGIN = `(() => { const v = (e) => !!e && e.getClientRects().length > 0 && !e.disabled && !e.readOnly;
  return [...document.querySelectorAll('input[type=password]')].some(v); })()`;

/** Mã chạy trong trang: điền tên đăng nhập + mật khẩu (setter gốc + sự kiện, React/Vue nhận) rồi bấm đăng nhập. */
const fillScript = (username: string, password: string) => `(() => {
  const v = (e) => !!e && e.getClientRects().length > 0 && !e.disabled && !e.readOnly;
  const pw = [...document.querySelectorAll('input[type=password]')].find(v);
  if (!pw) return 'no-form';
  const scope = pw.form || document;
  const inputs = [...scope.querySelectorAll('input')].filter(v);
  const user = inputs.slice(0, inputs.indexOf(pw)).reverse().find((i) => /^(text|email|tel|)$/i.test(i.getAttribute('type') || ''));
  const set = (el, val) => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  if (user) set(user, ${JSON.stringify(username)});
  set(pw, ${JSON.stringify(password)});
  const btns = [...scope.querySelectorAll('button, input[type=submit], input[type=button]')].filter(v);
  const btn = btns.find((b) => (b.getAttribute('type') || 'submit').toLowerCase() === 'submit') || btns[0];
  if (btn) btn.click(); else if (pw.form) (pw.form.requestSubmit ? pw.form.requestSubmit() : pw.form.submit());
  return 'submitted';
})()`;

/** Trang có form đăng nhập không: 'yes' / 'no' (chắc chắn) / 'unknown' (trang đang chuyển, không chạy được mã kiểm). */
async function hasLoginForm(frame: WebFrameMain): Promise<'yes' | 'no' | 'unknown'> {
  // Trang đăng nhập dựng bằng JS có thể hiện form chậm một chút.
  for (let i = 0; i < 6; i++) {
    try { if (await frame.executeJavaScript(HAS_LOGIN)) return 'yes'; } catch { return 'unknown'; }
    await new Promise((r) => setTimeout(r, 500));
  }
  return 'no';
}

/** Chặn cứng (phòng khoá tài khoản nguồn): tối đa MAX_PER_HOUR lần tự đăng nhập mỗi giờ cho mỗi nguồn, dù lý do gì. */
const MAX_PER_HOUR = 3;
const attempts = new Map<string, number[]>();
function allowAttempt(code: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(code) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= MAX_PER_HOUR) return false;
  attempts.set(code, [...recent, now]);
  return true;
}

/** Nguồn đang có một lượt kiểm / tự đăng nhập chạy (dom-ready có thể đến hai lần cho cùng trang). */
const inFlight = new Set<string>();

async function maybeFill(wc: WebContents, frame: WebFrameMain | null | undefined) {
  if (!frame) return;
  const src = sourceForUrl(frame.url);
  if (!src || failed.has(src.code) || inFlight.has(src.code)) return;
  const saved = savedCredential(src.code);
  if (!saved?.auto) return;
  inFlight.add(src.code);
  try {
    const form = await hasLoginForm(frame);
    if (form === 'unknown') return;
    if (form === 'no') {
      // Trang của nguồn chắc chắn không còn form đăng nhập ⇒ lần tự đăng nhập trước (nếu có) đã thành công.
      lastAttempt.delete(src.code);
      return;
    }
    // Vừa tự đăng nhập mà form lại hiện ⇒ mật khẩu sai / đổi: dừng, báo người dùng một lần.
    const last = lastAttempt.get(src.code);
    if ((last && Date.now() - last < RETRY_WINDOW_MS) || !allowAttempt(src.code)) {
      failed.add(src.code);
      if (Notification.isSupported()) new Notification({ title: T().failedTitle(src.ten), body: T().failedBody, icon: ICON }).show();
      return;
    }
    const cred = await useCredential(src.code);
    if (!cred) return;
    lastAttempt.set(src.code, Date.now());
    const pkg = await frame.executeJavaScript(`!!(window.__vala && window.__vala.has('dang_nhap'))`).catch(() => false);
    if (pkg) { await runAction(wc, 'dang_nhap', cred); return; }
    await frame.executeJavaScript(fillScript(cred.username, cred.password)).catch(() => { /* trang vừa chuyển */ });
  } finally {
    inFlight.delete(src.code);
  }
}

/** Gắn vào một tab: mỗi khung tải xong DOM ⇒ nếu là trang đăng nhập của nguồn có mật khẩu đã lưu thì tự đăng nhập. */
export function attachAutofill(wc: WebContents) {
  wc.on('dom-ready', () => void maybeFill(wc, wc.mainFrame));
  wc.on('frame-created', (_e, { frame }) => {
    if (!frame || frame === wc.mainFrame || !frame.parent) return;
    frame.on('dom-ready', () => void maybeFill(wc, frame));
  });
}

// ---- tự đăng nhập lại khi phiên hết hạn ----
const RELOGIN_GAP_MS = 30 * 60_000;
const reloginAt = new Map<string, number>();

/** Thử đăng nhập lại nền bằng mật khẩu đã lưu. Trả true nếu đã bắt đầu (cookie mới tự gửi lên Vala qua watchCookies). */
export function tryAutoRelogin(src: SourceFull): boolean {
  if (failed.has(src.code) || !savedCredential(src.code)?.auto) return false;
  if (Date.now() - (reloginAt.get(src.code) ?? 0) < RELOGIN_GAP_MS) return false;
  reloginAt.set(src.code, Date.now());
  const wc = backgroundSourceTab(src);
  void wc.loadURL(src.login_url);
  return true;
}

/** Người dùng vừa lưu mật khẩu mới ⇒ cho tự đăng nhập lại. */
const clearFailure = (code: string) => { failed.delete(code); lastAttempt.delete(code); attempts.delete(code); };

// ---- người dùng tự đăng nhập ⇒ hỏi lưu mật khẩu ----
const asking = new Set<string>();

async function offerSave(e: IpcMainInvokeEvent, username: unknown, password: unknown) {
  if (typeof username !== 'string' || typeof password !== 'string' || !password || password.length > 500 || username.length > 200) return;
  const src = e.senderFrame ? sourceForUrl(e.senderFrame.url) : null;
  if (!src || !secureStorageAvailable() || neverSave(src.code) || asking.has(src.code)) return;
  const user = username.trim();
  // Trùng mật khẩu đã lưu (gồm cả cú bấm do chính phần tự điền) ⇒ không hỏi, KHÔNG xoá trạng thái lỗi / bộ đếm — nếu
  // xoá, mật khẩu sai sẽ bị thử lại liên tục (khoá tài khoản nguồn).
  if (!user || sameAsSaved(src.code, user, password)) return;
  asking.add(src.code);
  try {
    const t = T();
    const win = BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getAllWindows()[0];
    const opts = { type: 'question' as const, buttons: [t.save, t.later, t.never], defaultId: 0, cancelId: 1, noLink: true,
      title: t.saveTitle(src.ten), message: t.saveMessage(src.ten, user), detail: t.saveDetail };
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (r.response === 0 && saveCredential(src.code, user, password)) clearFailure(src.code);
    if (r.response === 2) setNeverSave(src.code, true);
  } finally { asking.delete(src.code); }
}

export function registerAutofill() {
  // Preload hỏi: trang này có phải trang đăng nhập của một nguồn không (chỉ khi đó mới theo dõi form đăng nhập).
  ipcMain.handle('vala:login-host', (e) => !!(e.senderFrame && sourceForUrl(e.senderFrame.url)) && secureStorageAvailable());
  ipcMain.handle('vala:login-captured', (e, a: { username?: unknown; password?: unknown }) => offerSave(e, a?.username, a?.password));
}

/** Cài đặt: người dùng tự nhập / sửa mật khẩu ⇒ bỏ trạng thái lỗi. */
export const onCredentialSaved = clearFailure;

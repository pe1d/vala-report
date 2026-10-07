/**
 * Đồng bộ phiên các hệ thống nguồn lên Vala — port từ service worker của tiện ích (apps/extension/src/background.ts):
 * đọc cookie phiên, chỉ gửi khi đổi (so SHA-256, không giữ giá trị), máy chủ probe rồi mới lưu vault.
 */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { api, ApiError } from './api';
import { missingGroups, readCookies, type Source } from './cookies';
import { messages } from './i18n';
import { getSettings } from './settings';

export interface SourceFull extends Source {
  state: 'active' | 'pending' | 'expired' | 'failed' | 'revoked' | 'chua_cau_hinh';
  auth_method: 'password' | 'cookie' | 'sso' | 'extension' | null;
  /** Kết nối đang dùng mật khẩu/SSO còn tốt: máy chủ tự lo, không gửi phiên. */
  managed: boolean;
  /** Người dùng đã đồng ý cho Vala dùng tài khoản này. */
  consented?: boolean;
  last_error: string | null;
  /** Host trang đăng nhập (vd iam.bkav.com) — chỉ tự điền mật khẩu đã lưu trên các host này (autofill.ts). Máy chủ cũ không gửi. */
  login_hosts?: string[];
}

export type SyncResult = 'sent' | 'unchanged' | 'not_logged_in' | 'need_consent' | 'managed' | 'rejected' | 'error';
export interface SyncStatus { at: string; result: SyncResult; message: string }

const M = messages({
  managed: 'Hệ thống tự đăng nhập bằng tài khoản đã cấp, không cần gửi phiên',
  needConsent: (ten: string) => `Chưa xác nhận đồng ý cho Vala dùng tài khoản ${ten} — xác nhận ở trang Tài khoản nguồn trên cổng`,
  notLoggedIn: (ten: string, missing: string) => `Chưa đăng nhập ${ten} trong Vala Desktop (thiếu ${missing})`,
  unchanged: 'Phiên không đổi, máy chủ đang dùng phiên này',
  appExpired: 'Phiên trong Vala Desktop đã hết hạn — đăng nhập lại',
  serverNotNeeded: 'Máy chủ không cần phiên này',
  sent: 'Đã gửi phiên cho Vala',
  unknownError: 'Lỗi không xác định',
  rejected: (ten: string, detail: string) => `Vala không dùng được phiên ${ten} này${detail ? ` — ${detail}` : ''}`,
}, {
  managed: 'Signed in automatically with the provided account; no session needs to be sent',
  needConsent: (ten: string) => `You have not yet agreed to let Vala use your ${ten} account — confirm on the Source accounts page of the portal`,
  notLoggedIn: (ten: string, missing: string) => `Not signed in to ${ten} in Vala Desktop (missing ${missing})`,
  unchanged: 'Session unchanged; the server is using this session',
  appExpired: 'The session in Vala Desktop has expired — sign in again',
  serverNotNeeded: 'The server does not need this session',
  sent: 'Session sent to Vala',
  unknownError: 'Unknown error',
  rejected: (ten: string, detail: string) => `Vala cannot use this ${ten} session${detail ? ` — ${detail}` : ''}`,
});

let sources: SourceFull[] = [];
const statuses = new Map<string, SyncStatus>();
/** Hash phiên đã gửi gần nhất của mỗi nguồn, và máy chủ có nhận không. Chỉ trong bộ nhớ. */
const sent = new Map<string, { hash: string; ok: boolean }>();

/**
 * 'status' (code, SyncStatus) — trạng thái một nguồn vừa đổi (tray vẽ lại).
 * 'connected' (src, again) — nguồn vừa chuyển sang kết nối được (thông báo cho người dùng).
 */
export const events = new EventEmitter();

export const cachedSources = (): SourceFull[] => sources;
export const statusOf = (code: string): SyncStatus | undefined => statuses.get(code);

export async function refreshSources(): Promise<SourceFull[]> {
  sources = getSettings().deviceToken ? await api<SourceFull[]>('GET', '/ext/sources') : [];
  return sources;
}

function setStatus(code: string, result: SyncResult, message: string): SyncResult {
  const st: SyncStatus = { at: new Date().toISOString(), result, message };
  statuses.set(code, st);
  events.emit('status', code, st);
  return result;
}

/** Máy chủ cho gửi phiên mỗi nguồn 1 lần / 5 giây ⇒ bị chặn (429) thì đợi chừng này rồi gửi lại. */
const RATE_RETRY_MS = 6000;

/**
 * `retried`: đã gửi lại một lần sau khi bị chặn vì gửi quá dày. Chuyện này xảy ra mỗi lần mở app: companyId của eTask là cookie
 * phiên (JS của trang đặt, tắt app là mất) ⇒ lượt đồng bộ đầu gửi thiếu nó (máy chủ tự điền), vài giây sau tab eTask tải xong
 * ghi lại companyId ⇒ phiên "đổi" ⇒ gửi lần hai trong vòng 5 giây. Cũng gặp khi tiện ích trình duyệt vừa gửi phiên cùng
 * nguồn. Không phải lỗi của phiên ⇒ không báo lỗi, chỉ gửi lại.
 */
export async function syncSource(src: SourceFull, force = false, retried = false): Promise<SyncResult> {
  const t = M[getSettings().lang];
  if (src.managed) return setStatus(src.code, 'managed', t.managed);
  // Kết nối LẦN ĐẦU cần người dùng xác nhận đồng ý trên cổng. Kết nối đang có vẫn gửi bình thường.
  if (src.consented === false && (src.state === 'chua_cau_hinh' || src.state === 'revoked')) {
    return setStatus(src.code, 'need_consent', t.needConsent(src.ten));
  }
  const { cookies, expires } = await readCookies(src);
  // Thiếu cookie định danh (chỉ có khi đang mở trang nguồn) thì vẫn gửi — máy chủ dùng lại giá trị lần trước.
  const stable = new Set(src.stable_cookies ?? []);
  const missing = missingGroups(src, cookies).filter((g) => !g.split('|').every((n) => stable.has(n)));
  if (missing.length) return setStatus(src.code, 'not_logged_in', t.notLoggedIn(src.ten, missing.join(', ')));

  const hash = createHash('sha256')
    .update(src.cookie_names.filter((n) => n in cookies).map((n) => `${n}=${cookies[n]}`).join(';'))
    .digest('hex');
  const prev = sent.get(src.code);
  if (!force && prev?.hash === hash && (!prev.ok || src.state === 'active')) {
    return prev.ok ? setStatus(src.code, 'unchanged', t.unchanged) : setStatus(src.code, 'rejected', t.appExpired);
  }
  try {
    const r = await api<{ status: string; message?: string }>('PUT', `/ext/sources/${src.code}/session`, { cookies, expires });
    sent.set(src.code, { hash, ok: true });
    if (r.status !== 'active') return setStatus(src.code, 'managed', r.message ?? t.serverNotNeeded);
    if (src.state !== 'active') {
      events.emit('connected', src, src.state === 'expired' || src.state === 'failed');
      src.state = 'active';
    }
    return setStatus(src.code, 'sent', t.sent);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, 'internal', t.unknownError);
    if (err.type === 'rate_limited' && !retried) {
      await new Promise((r) => setTimeout(r, RATE_RETRY_MS));
      return syncSource(src, force, true);
    }
    if (err.type === 'session_expired') {
      sent.set(src.code, { hash, ok: false });
      return setStatus(src.code, 'rejected', t.rejected(src.ten, err.detail ?? ''));
    }
    return setStatus(src.code, 'error', err.detail ? `${err.message}: ${err.detail}` : err.message);
  }
}

export async function syncAll(force = false): Promise<void> {
  try { await refreshSources(); } catch { /* mất mạng: dùng danh sách đã có */ }
  for (const src of sources) await syncSource(src, force);
}

/** Đăng xuất / bị thu hồi: quên mọi trạng thái của tài khoản cũ. */
export function resetSync(): void {
  sources = [];
  statuses.clear();
  sent.clear();
  events.emit('status');
}

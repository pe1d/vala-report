import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiProblem, fmtDateTime, type Connection, type ExtensionDevice } from '../api';
import { useAsync } from '../hooks';
import { startGrant } from '../reauth';
import { ConnectionEditor } from '../components/ConnectionEditor';
import { ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Menu, Muted, PageTitle, ResultDialog, type MenuItem } from '../components/ui';
import { useValaExtension, type ExtensionEvent } from '../extension';
import { useMe } from '../App';
import { METHOD_LABEL, STATE } from './AdminConnections';
import { useBranding } from '../branding';
import { ConsentBox } from '../components/Consent';
import { messages, useT } from '../i18n';
import { BASE } from '../base';

const M = messages({
  grantErrors: (sso: string): Record<string, string> => ({
    sai_tai_khoan: `Bạn đã đăng nhập ${sso} bằng một tài khoản khác với tài khoản đang dùng cổng báo cáo.`,
    khong_lay_duoc_phien: `Đã đăng nhập ${sso} nhưng không lấy được phiên từ hệ thống nguồn. Vui lòng thử lại sau ít phút.`,
    sso_tu_choi: `Bạn đã không đồng ý trên ${sso}.`,
  }),
  loginOpened: 'Đăng nhập trong tab vừa mở — xong Vala Desktop tự gửi phiên và đưa bạn quay lại đây.',
  needPermission: 'Làm theo hướng dẫn trong tab vừa mở của Vala Desktop.',
  managed: 'Kết nối này đang dùng tài khoản/mật khẩu, hệ thống tự đăng nhập — không cần đăng nhập trong Vala Desktop.',
  unknownSource: 'Vala Desktop chưa có hệ thống này (danh sách cập nhật vài phút một lần). Thử lại sau ít phút.',
  testOk: (src: string) => `Kết nối ${src} hoạt động tốt.`, testFailed: 'Kết nối lỗi',
  syncing: (src: string, viaSpider: boolean) =>
    `Đang lấy dữ liệu ${src} ngay (${viaSpider ? 'qua spider' : 'qua worker'}). Số liệu cập nhật sau ít phút — mở Tổng quan hoặc Báo cáo để xem.`,
  rateLimited: 'Vừa lấy gần đây — mỗi hệ thống chỉ đồng bộ ngay được một lần trong 10 phút.',
  syncFailed: 'Đồng bộ lỗi',
  confirmRemove: (src: string) => `Gỡ tài khoản ${src}? Hệ thống xoá phiên và mật khẩu đã lưu ngay, các lịch lấy dữ liệu từ ${src} dừng lại. Dữ liệu đã lấy về vẫn được giữ.`,
  removed: (src: string) => `Đã gỡ tài khoản ${src}.`,
  title: 'Tài khoản nguồn',
  subtitle: 'Cấp tài khoản của bạn trên từng hệ thống để hệ thống lấy dữ liệu thay bạn theo lịch. Mật khẩu và cookie được lưu trong kho bí mật, không ai xem lại được — kể cả quản trị.',
  grantOk: (sso: string) => `Đã uỷ quyền qua ${sso}.`, grantFailed: 'Uỷ quyền không thành công.',
  notInDesktop: 'Kết nối hệ thống nguồn dễ nhất bằng Vala Desktop: đăng nhập hệ thống như mọi ngày, ứng dụng tự gửi phiên cho Vala — không dán cookie, không đưa mật khẩu.', getDesktop: 'Tải Vala Desktop',
  extOtherUser: (other: string, me: string) => `Vala Desktop đang đăng nhập bằng tài khoản khác (${other}). Đăng xuất Vala Desktop và đăng nhập bằng ${me} để kết nối cho bạn.`,
  connected: (src: string) => `Đã kết nối ${src}`, connectFailed: (src: string) => `Chưa kết nối được ${src}`,
  viewReports: 'Xem báo cáo',
  connectedBody: (src: string) => `Vala đã nhận phiên đăng nhập ${src}. Hệ thống sẽ lấy dữ liệu thay bạn theo lịch — bạn không phải dán cookie hay đăng nhập lại.`,
  method: 'Cách lấy', account: 'Tài khoản', lastSuccess: 'Lấy được lần cuối', sessionUntil: 'Phiên dùng tới',
  notGranted: (src: string) => `Chưa cấp tài khoản. Báo cáo dùng dữ liệu ${src} sẽ chưa có số liệu.`,
  failedHint: 'Hệ thống đã dừng tự đăng nhập để tránh khoá tài khoản của bạn. Hãy cập nhật mật khẩu.',
  cookieExpired: 'Cookie đã hết hạn — dán cookie mới.',
  extExpired: (src: string) => `Phiên đã hết hạn — mở ${src} trong Vala Desktop và đăng nhập, ứng dụng tự gửi phiên mới.`,
  resendViaExt: 'Gửi lại phiên từ Vala Desktop', test: 'Thử kết nối', grantVia: (sso: string) => `Uỷ quyền qua ${sso}`,
  remove: 'Gỡ tài khoản', consentFirst: 'Xác nhận đồng ý ở trên trước',
  update: 'Cập nhật', grant: 'Cấp tài khoản', fetching: 'Đang lấy…', syncNow: 'Đồng bộ ngay',
  loginViaExt: 'Đăng nhập trong Vala Desktop',
  confirmRevoke: (dev: string) => `Ngắt "${dev}"? Máy đó phải đăng nhập Vala Desktop lại mới gửi phiên được. Phiên đã gửi vẫn dùng tới khi hết hạn hoặc bạn gỡ tài khoản.`,
  extTitle: 'Vala Desktop đã đăng nhập',
  extIntro: 'Các máy đang đăng nhập Vala Desktop bằng tài khoản này. Vala Desktop giữ phiên các hệ thống nguồn và tự gửi cho Vala '
    + '— chỉ đúng các cookie phiên cần thiết, không gửi mật khẩu. Ngắt một máy ⇒ máy đó phải đăng nhập lại.',
  noDevices: 'Chưa có máy nào đăng nhập Vala Desktop.',
  deviceInfo: (created: string, used: string) => `Kết nối ${created} · dùng lần cuối ${used}`,
  revoking: 'Đang ngắt…', revoke: 'Ngắt kết nối',
}, {
  grantErrors: (sso: string): Record<string, string> => ({
    sai_tai_khoan: `You signed in to ${sso} with a different account from the one you use on the reporting portal.`,
    khong_lay_duoc_phien: `You signed in to ${sso}, but no session could be obtained from the source system. Please try again in a few minutes.`,
    sso_tu_choi: `You did not give consent on ${sso}.`,
  }),
  loginOpened: 'Sign in on the tab that just opened — Vala Desktop sends the session and brings you back here when done.',
  needPermission: 'Follow the instructions in the tab Vala Desktop just opened.',
  managed: 'This connection uses a username/password and the system signs in automatically — no need to sign in in Vala Desktop.',
  unknownSource: "Vala Desktop doesn't have this system yet (the list updates every few minutes). Try again in a few minutes.",
  testOk: (src: string) => `The ${src} connection is working.`, testFailed: 'Connection failed',
  syncing: (src: string, viaSpider: boolean) =>
    `Fetching ${src} data now (${viaSpider ? 'via spider' : 'via worker'}). Data will update in a few minutes — open Overview or Reports to see it.`,
  rateLimited: 'Fetched recently — each system can be synced on demand once every 10 minutes.',
  syncFailed: 'Sync failed',
  confirmRemove: (src: string) => `Remove your ${src} account? The saved session and password are deleted immediately, and schedules fetching data from ${src} will stop. Data already fetched is kept.`,
  removed: (src: string) => `Removed your ${src} account.`,
  title: 'Source accounts',
  subtitle: 'Provide your account for each system so Vala can fetch data for you on schedule. Passwords and cookies are kept in the secrets vault and can’t be viewed by anyone — including administrators.',
  grantOk: (sso: string) => `Authorized via ${sso}.`, grantFailed: 'Authorization failed.',
  notInDesktop: 'The easiest way to connect source systems is Vala Desktop: sign in to your systems as usual and the app sends the session to Vala — no cookies to paste, no passwords to share.', getDesktop: 'Download Vala Desktop',
  extOtherUser: (other: string, me: string) => `Vala Desktop is signed in with a different account (${other}). Sign out of Vala Desktop and sign in as ${me} to connect for yourself.`,
  connected: (src: string) => `Connected to ${src}`, connectFailed: (src: string) => `Couldn’t connect to ${src}`,
  viewReports: 'View reports',
  connectedBody: (src: string) => `Vala has received your ${src} sign-in session. It will fetch data for you on schedule — no need to paste cookies or sign in again.`,
  method: 'Method', account: 'Account', lastSuccess: 'Last fetched', sessionUntil: 'Session valid until',
  notGranted: (src: string) => `No account provided. Reports using ${src} data won’t have any data yet.`,
  failedHint: 'Automatic sign-in has been paused to avoid locking your account. Please update your password.',
  cookieExpired: 'The cookie has expired — paste a new one.',
  extExpired: (src: string) => `Session expired — open ${src} in Vala Desktop and sign in; the app sends the new session automatically.`,
  resendViaExt: 'Resend session from Vala Desktop', test: 'Test connection', grantVia: (sso: string) => `Authorize via ${sso}`,
  remove: 'Remove account', consentFirst: 'Confirm your consent above first',
  update: 'Update', grant: 'Add account', fetching: 'Fetching…', syncNow: 'Sync now',
  loginViaExt: 'Sign in in Vala Desktop',
  confirmRevoke: (dev: string) => `Disconnect "${dev}"? That computer must sign in to Vala Desktop again to send sessions. Sessions already sent remain valid until they expire or you remove the account.`,
  extTitle: 'Signed-in Vala Desktop',
  extIntro: 'Computers signed in to Vala Desktop with this account. Vala Desktop keeps your source-system sessions and sends them to Vala '
    + '— only the session cookies that are needed, never your password. Disconnect a computer ⇒ it must sign in again.',
  noDevices: 'No computers signed in to Vala Desktop yet.',
  deviceInfo: (created: string, used: string) => `Connected ${created} · last used ${used}`,
  revoking: 'Disconnecting…', revoke: 'Disconnect',
});

/**
 * Màn hình 2 — Tài khoản nguồn. Người dùng tự cấp tài khoản (cookie/phiên hoặc tài khoản/mật khẩu)
 * cho từng hệ thống, để hệ thống crawl thay theo lịch mà không bắt họ đăng nhập mỗi lần.
 * Người dùng luôn thấy: hệ thống nào đang được lấy thay mình, lần cuối lúc nào, và gỡ được bằng một nút.
 */
export function MyConnectionsPage() {
  const t = useT(M);
  const ssoName = useBranding().ten_sso;
  const conns = useAsync(() => api.get<Connection[]>('/me/connections'), []);
  const cfg = useAsync(() => api.get<{ login_methods: Array<'password' | 'sso'> }>('/auth/config'), []);
  const ssoOn = cfg.data?.login_methods.includes('sso') ?? false;
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<Connection | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; ten: string; message?: string } | null>(null);
  const me = useMe();
  const navigate = useNavigate();

  // Trong Vala Desktop: bấm "Đăng nhập trong Vala Desktop" ⇒ ứng dụng mở hệ thống nguồn, lấy phiên, đưa người dùng về đây
  // (cầu nối window.postMessage — cùng giao thức tiện ích trình duyệt cũ, nay chỉ Vala Desktop trả lời).
  const onExtEvent = useCallback((e: ExtensionEvent) => {
    if (e.type === 'connected') { setNote(null); setResult({ ok: true, ten: e.ten }); conns.reload(); return; }
    if (e.type === 'connect-failed') { setNote(null); setResult({ ok: false, ten: e.ten, message: e.message }); conns.reload(); return; }
    const msg: Record<string, [('ok' | 'err' | 'info'), string]> = {
      login_opened: ['info', e.message ?? t.loginOpened],
      need_permission: ['info', e.message ?? t.needPermission],
      managed: ['info', t.managed],
      unknown_source: ['err', t.unknownSource],
    };
    const m = msg[e.status];
    if (m) setNote({ tone: m[0], text: m[1] });
  }, [conns, t]);
  const ext = useValaExtension(onExtEvent);
  // Chỉ Vala Desktop (tiện ích trình duyệt đã ngừng 08/10/2026).
  const inDesktop = !!ext.info?.desktop;
  const extReady = inDesktop && !!ext.info?.logged_in;
  const extOtherUser = extReady && ext.info?.email && ext.info.email.toLowerCase() !== me.email.toLowerCase();

  // Đến từ Tổng quan (?ket-noi=egov): đợi biết có đang trong Vala Desktop không (tối đa ~1,5 giây) rồi kết nối ngay.
  const want = params.get('ket-noi');
  const handled = useRef(false);
  const [waited, setWaited] = useState(false);
  useEffect(() => { const id = setTimeout(() => setWaited(true), 1500); return () => clearTimeout(id); }, []);
  useEffect(() => {
    if (!want || handled.current || !conns.data) return;
    const c = conns.data.find((x) => x.source_system === want);
    if (!c || !c.consented_at) return;
    const viaExt = extReady && !extOtherUser && (c.connection_methods ?? ['extension']).includes('extension');
    if (!viaExt && !waited) return;
    handled.current = true;
    if (viaExt) ext.connect(want);
    else setEditing(c);
  }, [want, conns.data, extReady, extOtherUser, waited, ext]);

  const test = async (c: Connection) => {
    setBusy(c.source_system); setNote(null);
    try {
      const r = await api.post<{ ok: boolean; message?: string }>(`/me/connections/${c.source_system}/test`);
      setNote(r.ok ? { tone: 'ok', text: t.testOk(c.source_ten) } : { tone: 'err', text: r.message ?? t.testFailed });
      conns.reload();
    } finally { setBusy(null); }
  };
  // "Đồng bộ ngay": lấy dữ liệu tức thì cho riêng người này, không cần đặt lịch. Giới hạn 10 phút/lần mỗi hệ thống.
  const syncNow = async (c: Connection) => {
    setBusy(c.source_system); setNote(null);
    try {
      const r = await api.post<{ executor: string; queued: number }>(`/me/sources/${c.source_system}/run-now`);
      setNote({ tone: 'ok', text: t.syncing(c.source_ten, r.executor === 'crawlab') });
      conns.reload();
    } catch (e) {
      if (e instanceof ApiProblem && e.type === 'rate_limited') setNote({ tone: 'info', text: e.detail ?? t.rateLimited });
      else if (e instanceof ApiProblem) setNote({ tone: 'err', text: e.detail ?? e.title });
      else setNote({ tone: 'err', text: t.syncFailed });
    } finally { setBusy(null); }
  };
  const remove = async (c: Connection) => {
    if (!confirm(t.confirmRemove(c.source_ten))) return;
    setBusy(c.source_system);
    try { await api.del(`/me/connections/${c.source_system}`); setNote({ tone: 'ok', text: t.removed(c.source_ten) }); conns.reload(); }
    finally { setBusy(null); }
  };

  return (
    <>
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {params.get('ket_qua') === 'ok' && <Banner tone="ok">{t.grantOk(ssoName)}</Banner>}
      {params.get('ket_qua') === 'loi' && <Banner tone="err">{t.grantErrors(ssoName)[params.get('ly_do') ?? ''] ?? t.grantFailed}</Banner>}
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      {waited && !inDesktop && (
        <Banner tone="info">
          <span className="flex-1">{t.notInDesktop}</span>
          <a href={`${BASE}/desktop`} className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">{t.getDesktop}</a>
        </Banner>
      )}
      {extOtherUser && <Banner tone="warn">{t.extOtherUser(ext.info!.email!, me.email)}</Banner>}
      {result && (
        <ResultDialog ok={result.ok} onClose={() => setResult(null)}
          title={result.ok ? t.connected(result.ten) : t.connectFailed(result.ten)}
          action={result.ok ? { label: t.viewReports, onClick: () => navigate('/bao-cao') } : undefined}>
          {result.ok
            ? t.connectedBody(result.ten)
            : result.message}
        </ResultDialog>
      )}
      {conns.loading && <Loading />}
      {conns.error ? <ErrorBox error={conns.error} onRetry={conns.reload} /> : null}

      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
        {conns.data?.map((c) => {
          const [tone, label] = STATE[c.state];
          const configured = c.state !== 'chua_cau_hinh' && c.state !== 'revoked';
          return (
            <Card key={c.source_system}>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">{c.source_ten}</h2>
                <span className="flex-1" />
                <Badge tone={tone}>{label}</Badge>
              </div>
              {configured ? (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">{t.method}</dt><dd>{c.auth_method ? METHOD_LABEL[c.auth_method] : '–'}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">{t.account}</dt><dd>{c.source_username ?? '–'}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">{t.lastSuccess}</dt><dd className="tabular-nums">{fmtDateTime(c.last_success_at)}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">{t.sessionUntil}</dt><dd className="tabular-nums">{fmtDateTime(c.session_expires_at)}</dd>
                </dl>
              ) : (
                <Muted className="mt-3">{t.notGranted(c.source_ten)}</Muted>
              )}
              {!c.consented_at && <ConsentBox source={c.source_system} sourceTen={c.source_ten} connected={configured} onDone={conns.reload} />}
              {c.last_error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{c.last_error}</p>}
              {c.state === 'failed' && <Muted className="mt-1">{t.failedHint}</Muted>}
              {c.state === 'expired' && c.auth_method === 'cookie' && <Muted className="mt-1">{t.cookieExpired}</Muted>}
              {c.state === 'expired' && c.auth_method === 'extension' && <Muted className="mt-1">{t.extExpired(c.source_ten)}</Muted>}
              {(() => {
                // Kết nối MỚI cần xác nhận đồng ý trước; kết nối đang có vẫn chạy bình thường (chỉ nhắc xác nhận).
                const agreed = !!c.consented_at;
                const canExt = extReady && !extOtherUser && (c.connection_methods ?? ['extension']).includes('extension');
                const extActive = canExt && configured && c.state === 'active';   // gửi lại phiên: ít dùng (Vala Desktop tự lo) → menu
                const extReconnect = canExt && (!configured || c.state === 'expired');   // cần kết nối lại → nút nổi bật
                // Hành động ít dùng gộp vào menu "…".
                const more: MenuItem[] = [
                  ...(extActive ? [{ label: t.resendViaExt, onClick: () => { setNote(null); ext.connect(c.source_system); }, disabled: busy !== null }] : []),
                  ...(configured ? [{ label: t.test, onClick: () => void test(c), disabled: busy !== null }] : []),
                  ...(ssoOn && !configured ? [{ label: t.grantVia(ssoName), onClick: () => void startGrant(c.source_system), disabled: busy !== null || !agreed }] : []),
                  ...(configured ? [{ label: t.remove, onClick: () => void remove(c), danger: true, disabled: busy !== null }] : []),
                ];
                return (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button variant={configured ? 'default' : 'primary'} disabled={busy !== null || (!configured && !agreed)}
                      title={!configured && !agreed ? t.consentFirst : undefined} onClick={() => { setEditing(c); setNote(null); }}>
                      {configured ? t.update : t.grant}
                    </Button>
                    {configured && c.state === 'active' && <Button variant="primary" disabled={busy !== null} onClick={() => void syncNow(c)}>{busy === c.source_system ? t.fetching : t.syncNow}</Button>}
                    {extReconnect && (
                      <Button variant="primary" disabled={busy !== null || !agreed} title={agreed ? undefined : t.consentFirst}
                        onClick={() => { setNote(null); ext.connect(c.source_system); }}>
                        {t.loginViaExt}
                      </Button>
                    )}
                    <Menu disabled={busy !== null} items={more} />
                  </div>
                );
              })()}
            </Card>
          );
        })}
      </div>

      <ExtensionDevices />

      {editing && (
        <ConnectionEditor conn={editing} self onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNote({ tone: 'ok', text: msg }); conns.reload(); }} />
      )}
    </>
  );
}

/**
 * Các máy đang đăng nhập Vala Desktop: ứng dụng giữ phiên hệ thống nguồn và tự gửi về đây — không phải dán cookie. Mỗi máy
 * có token riêng, ngắt được ngay tại đây.
 */
function ExtensionDevices() {
  const t = useT(M);
  const devs = useAsync(() => api.get<ExtensionDevice[]>('/me/extension-devices'), []);
  const [busy, setBusy] = useState<number | null>(null);
  const revoke = async (d: ExtensionDevice) => {
    if (!confirm(t.confirmRevoke(d.ten))) return;
    setBusy(d.id);
    try { await api.del(`/me/extension-devices/${d.id}`); devs.reload(); } finally { setBusy(null); }
  };
  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold">{t.extTitle}</h2>
      <Muted className="mt-1">
        {t.extIntro}
      </Muted>
      {devs.error ? <ErrorBox error={devs.error} onRetry={devs.reload} /> : null}
      {devs.data && !devs.data.length && <Muted className="mt-3">{t.noDevices}</Muted>}
      {!!devs.data?.length && (
        <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
          {devs.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="flex-1">
                <div className="font-medium">{d.ten}</div>
                <Muted className="text-xs">{t.deviceInfo(fmtDateTime(d.created_at), fmtDateTime(d.last_used_at))}</Muted>
              </div>
              <Button variant="danger" disabled={busy !== null} onClick={() => void revoke(d)}>{busy === d.id ? t.revoking : t.revoke}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

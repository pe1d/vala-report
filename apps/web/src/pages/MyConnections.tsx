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

const GRANT_ERRORS: Record<string, string> = {
  sai_tai_khoan: 'Bạn đã đăng nhập Bkav SSO bằng một tài khoản khác với tài khoản đang dùng cổng báo cáo.',
  khong_lay_duoc_phien: 'Đã đăng nhập Bkav SSO nhưng không lấy được phiên từ hệ thống nguồn. Vui lòng thử lại sau ít phút.',
  sso_tu_choi: 'Bạn đã không đồng ý trên Bkav SSO.',
};

/**
 * Màn hình 2 — Tài khoản nguồn. Người dùng tự cấp tài khoản (cookie/phiên hoặc tài khoản/mật khẩu)
 * cho từng hệ thống, để hệ thống crawl thay theo lịch mà không bắt họ đăng nhập mỗi lần.
 * Người dùng luôn thấy: hệ thống nào đang được lấy thay mình, lần cuối lúc nào, và gỡ được bằng một nút.
 */
export function MyConnectionsPage() {
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

  // Tiện ích trình duyệt: bấm "Đăng nhập qua tiện ích" ⇒ tiện ích mở trang nguồn, lấy phiên, đưa người dùng về đây.
  const onExtEvent = useCallback((e: ExtensionEvent) => {
    if (e.type === 'connected') { setNote(null); setResult({ ok: true, ten: e.ten }); conns.reload(); return; }
    if (e.type === 'connect-failed') { setNote(null); setResult({ ok: false, ten: e.ten, message: e.message }); conns.reload(); return; }
    const msg: Record<string, [('ok' | 'err' | 'info'), string]> = {
      login_opened: ['info', e.message ?? 'Đăng nhập trong tab vừa mở — xong tiện ích tự đưa bạn quay lại đây.'],
      need_permission: ['info', e.message ?? 'Bấm "Cho phép" trong trang tiện ích vừa mở.'],
      managed: ['info', 'Kết nối này đang dùng tài khoản/mật khẩu, hệ thống tự đăng nhập — không cần tiện ích.'],
      unknown_source: ['err', 'Tiện ích chưa đăng nhập tài khoản Vala. Bấm biểu tượng Vala trên thanh công cụ để đăng nhập.'],
    };
    const m = msg[e.status];
    if (m) setNote({ tone: m[0], text: m[1] });
  }, [conns]);
  const ext = useValaExtension(onExtEvent);
  const extReady = !!ext.info?.logged_in;
  const extOtherUser = extReady && ext.info?.email && ext.info.email.toLowerCase() !== me.email.toLowerCase();

  // Đến từ Tổng quan (?ket-noi=egov): đợi biết có tiện ích hay không (tối đa ~1,5 giây) rồi kết nối ngay.
  const want = params.get('ket-noi');
  const handled = useRef(false);
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 1500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!want || handled.current || !conns.data) return;
    const c = conns.data.find((x) => x.source_system === want);
    if (!c) return;
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
      setNote(r.ok ? { tone: 'ok', text: `Kết nối ${c.source_ten} hoạt động tốt.` } : { tone: 'err', text: r.message ?? 'Kết nối lỗi' });
      conns.reload();
    } finally { setBusy(null); }
  };
  // "Đồng bộ ngay": lấy dữ liệu tức thì cho riêng người này, không cần đặt lịch. Giới hạn 10 phút/lần mỗi hệ thống.
  const syncNow = async (c: Connection) => {
    setBusy(c.source_system); setNote(null);
    try {
      const r = await api.post<{ executor: string; queued: number }>(`/me/sources/${c.source_system}/run-now`);
      setNote({ tone: 'ok', text: `Đang lấy dữ liệu ${c.source_ten} ngay (${r.executor === 'crawlab' ? 'qua spider' : 'qua worker'}). Số liệu cập nhật sau ít phút — mở Tổng quan hoặc Báo cáo để xem.` });
      conns.reload();
    } catch (e) {
      if (e instanceof ApiProblem && e.type === 'rate_limited') setNote({ tone: 'info', text: e.detail ?? 'Vừa lấy gần đây — mỗi hệ thống chỉ đồng bộ ngay được một lần trong 10 phút.' });
      else if (e instanceof ApiProblem) setNote({ tone: 'err', text: e.detail ?? e.title });
      else setNote({ tone: 'err', text: 'Đồng bộ lỗi' });
    } finally { setBusy(null); }
  };
  const remove = async (c: Connection) => {
    if (!confirm(`Gỡ tài khoản ${c.source_ten}? Hệ thống xoá phiên và mật khẩu đã lưu ngay, các lịch lấy dữ liệu từ ${c.source_ten} dừng lại. Dữ liệu đã lấy về vẫn được giữ.`)) return;
    setBusy(c.source_system);
    try { await api.del(`/me/connections/${c.source_system}`); setNote({ tone: 'ok', text: `Đã gỡ tài khoản ${c.source_ten}.` }); conns.reload(); }
    finally { setBusy(null); }
  };

  return (
    <>
      <PageTitle title="Tài khoản nguồn"
        subtitle="Cấp tài khoản của bạn trên từng hệ thống để hệ thống lấy dữ liệu thay bạn theo lịch. Mật khẩu và cookie được lưu trong kho bí mật, không ai xem lại được — kể cả quản trị." />
      {params.get('ket_qua') === 'ok' && <Banner tone="ok">Đã uỷ quyền qua Bkav SSO.</Banner>}
      {params.get('ket_qua') === 'loi' && <Banner tone="err">{GRANT_ERRORS[params.get('ly_do') ?? ''] ?? 'Uỷ quyền không thành công.'}</Banner>}
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      {ext.info && !ext.info.logged_in && <Banner tone="info">Đã cài tiện ích Vala nhưng chưa đăng nhập. Bấm biểu tượng Vala trên thanh công cụ trình duyệt để đăng nhập, rồi quay lại đây.</Banner>}
      {extOtherUser && <Banner tone="warn">Tiện ích Vala đang đăng nhập bằng tài khoản khác ({ext.info!.email}). Đăng xuất tiện ích và đăng nhập bằng {me.email} để kết nối cho bạn.</Banner>}
      {result && (
        <ResultDialog ok={result.ok} onClose={() => setResult(null)}
          title={result.ok ? `Đã kết nối ${result.ten}` : `Chưa kết nối được ${result.ten}`}
          action={result.ok ? { label: 'Xem báo cáo', onClick: () => navigate('/bao-cao') } : undefined}>
          {result.ok
            ? `Vala đã nhận phiên đăng nhập ${result.ten}. Hệ thống sẽ lấy dữ liệu thay bạn theo lịch — bạn không phải dán cookie hay đăng nhập lại.`
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
                  <dt className="text-slate-500 dark:text-slate-400">Cách lấy</dt><dd>{c.auth_method ? METHOD_LABEL[c.auth_method] : '–'}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Tài khoản</dt><dd>{c.source_username ?? '–'}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Lấy được lần cuối</dt><dd className="tabular-nums">{fmtDateTime(c.last_success_at)}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Phiên dùng tới</dt><dd className="tabular-nums">{fmtDateTime(c.session_expires_at)}</dd>
                </dl>
              ) : (
                <Muted className="mt-3">Chưa cấp tài khoản. Báo cáo dùng dữ liệu {c.source_ten} sẽ chưa có số liệu.</Muted>
              )}
              {c.last_error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{c.last_error}</p>}
              {c.state === 'failed' && <Muted className="mt-1">Hệ thống đã dừng tự đăng nhập để tránh khoá tài khoản của bạn. Hãy cập nhật mật khẩu.</Muted>}
              {c.state === 'expired' && c.auth_method === 'cookie' && <Muted className="mt-1">Cookie đã hết hạn — dán cookie mới.</Muted>}
              {c.state === 'expired' && c.auth_method === 'extension' && <Muted className="mt-1">Phiên đã hết hạn — đăng nhập {c.source_ten} trên trình duyệt có tiện ích Vala, tiện ích tự gửi phiên mới.</Muted>}
              {(() => {
                const canExt = extReady && !extOtherUser && (c.connection_methods ?? ['extension']).includes('extension');
                const extActive = canExt && configured && c.state === 'active';   // gửi lại phiên: ít dùng (tiện ích tự lo) → menu
                const extReconnect = canExt && (!configured || c.state === 'expired');   // cần kết nối lại → nút nổi bật
                // Hành động ít dùng gộp vào menu "…".
                const more: MenuItem[] = [
                  ...(extActive ? [{ label: 'Gửi lại phiên qua tiện ích', onClick: () => { setNote(null); ext.connect(c.source_system); }, disabled: busy !== null }] : []),
                  ...(configured ? [{ label: 'Thử kết nối', onClick: () => void test(c), disabled: busy !== null }] : []),
                  ...(ssoOn && !configured ? [{ label: 'Uỷ quyền qua Bkav SSO', onClick: () => void startGrant(c.source_system), disabled: busy !== null }] : []),
                  ...(configured ? [{ label: 'Gỡ tài khoản', onClick: () => void remove(c), danger: true, disabled: busy !== null }] : []),
                ];
                return (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button variant={configured ? 'default' : 'primary'} disabled={busy !== null} onClick={() => { setEditing(c); setNote(null); }}>
                      {configured ? 'Cập nhật' : 'Cấp tài khoản'}
                    </Button>
                    {configured && c.state === 'active' && <Button variant="primary" disabled={busy !== null} onClick={() => void syncNow(c)}>{busy === c.source_system ? 'Đang lấy…' : 'Đồng bộ ngay'}</Button>}
                    {extReconnect && (
                      <Button variant="primary" disabled={busy !== null} onClick={() => { setNote(null); ext.connect(c.source_system); }}>
                        Đăng nhập qua tiện ích
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
 * Tiện ích trình duyệt: người dùng đăng nhập hệ thống nguồn như mọi ngày, tiện ích tự gửi phiên về đây —
 * không phải dán cookie. Mỗi trình duyệt đã kết nối có token riêng, ngắt được ngay tại đây.
 */
function ExtensionDevices() {
  const devs = useAsync(() => api.get<ExtensionDevice[]>('/me/extension-devices'), []);
  const [busy, setBusy] = useState<number | null>(null);
  const revoke = async (d: ExtensionDevice) => {
    if (!confirm(`Ngắt tiện ích trên "${d.ten}"? Trình duyệt đó sẽ không gửi phiên nữa. Phiên đã gửi vẫn dùng tới khi hết hạn hoặc bạn gỡ tài khoản.`)) return;
    setBusy(d.id);
    try { await api.del(`/me/extension-devices/${d.id}`); devs.reload(); } finally { setBusy(null); }
  };
  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold">Tiện ích trình duyệt</h2>
      <Muted className="mt-1">
        Không muốn dán cookie hay đưa mật khẩu? Cài tiện ích Vala trên Chrome/Edge, đăng nhập bằng tài khoản cổng này, bấm "Cho phép"
        cho từng hệ thống. Sau đó mỗi lần bạn đăng nhập các hệ thống đó như bình thường, tiện ích tự gửi phiên cho Vala — chỉ đúng
        các cookie phiên cần thiết, không gửi mật khẩu.
      </Muted>
      {devs.error ? <ErrorBox error={devs.error} onRetry={devs.reload} /> : null}
      {devs.data && !devs.data.length && <Muted className="mt-3">Chưa có trình duyệt nào kết nối.</Muted>}
      {!!devs.data?.length && (
        <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
          {devs.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="flex-1">
                <div className="font-medium">{d.ten}</div>
                <Muted className="text-xs">Kết nối {fmtDateTime(d.created_at)} · dùng lần cuối {fmtDateTime(d.last_used_at)}</Muted>
              </div>
              <Button variant="danger" disabled={busy !== null} onClick={() => void revoke(d)}>{busy === d.id ? 'Đang ngắt…' : 'Ngắt kết nối'}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

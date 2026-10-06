import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime, type AdapterSummary, type AdminSource, type AuthMethod, type AuthProfile } from '../api';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Field, Input, Muted, PageTitle, Select, Table, Td, Th } from '../components/ui';
import { METHOD_LABEL } from './AdminConnections';
import { locale, messages, useT } from '../i18n';

const M = messages({
  enabled: 'Đang bật', disabled: 'Đã tắt',
  toggled: (on: boolean, ten: string) => `Đã ${on ? 'bật' : 'tắt'} ${ten}.`,
  title: 'Hệ thống nguồn',
  subtitle: (crawl: ReactNode): ReactNode => <>Các hệ thống mà Vala lấy dữ liệu thay người dùng. Thêm hệ thống mới thì người dùng <strong>kết nối được ngay</strong> (tiện ích trình duyệt hoặc dán cookie); muốn có báo cáo từ hệ thống đó cần thêm spider ở {crawl} và báo cáo tương ứng.</>,
  crawlLink: 'Script crawl',
  search: 'Tìm theo tên, mã, địa chỉ…', add: 'Thêm hệ thống nguồn', empty: 'Chưa có hệ thống nguồn nào.',
  thSystem: 'Hệ thống', thAddress: 'Địa chỉ', thSession: 'Cấu hình phiên', thMethods: 'Cách kết nối', thConns: 'Đang kết nối',
  thSpiders: 'Spider / báo cáo', thStatus: 'Trạng thái',
  envOverride: (db: string) => `Ghi đè bằng biến môi trường (CSDL: ${db})`,
  quick: 'Cấu hình nhanh', full: (v: string) => `Cấu hình đầy đủ${v}`,
  adapterError: 'Cấu hình lỗi — hệ thống đang bỏ qua', noSession: 'Chưa có cấu hình phiên',
  mfaYes: 'Có xác thực 2 lớp', mfaNo: 'Không có xác thực 2 lớp', mfaUnknown: '2 lớp: chưa rõ',
  passwordConns: (n: number) => `${n} kết nối đang dùng mật khẩu — sẽ lỗi khi hết phiên, đổi sang tiện ích`,
  edit: 'Sửa', adapter: 'Cấu hình adapter', turnOff: 'Tắt', turnOn: 'Bật', unit: 'hệ thống',
  added: (ten: string) => `Đã thêm ${ten}. Người dùng thấy hệ thống này ở "Tài khoản nguồn" và trong tiện ích.`,
  saved: (ten: string) => `Đã lưu ${ten}.`,
  editTitle: (ten: string) => `Sửa: ${ten}`,
  fullNote: 'Phiên đăng nhập và cách lấy dữ liệu của hệ thống này nằm trong cấu hình đầy đủ — sửa bằng nút "Cấu hình adapter". Ở đây sửa tên, địa chỉ và cách kết nối.',
  code: 'Mã hệ thống', codePh: 'vd hr_portal', name: 'Tên hiển thị', namePh: 'vd Cổng nhân sự', address: 'Địa chỉ',
  desc: 'Mô tả (không bắt buộc)', mfa: 'Xác thực 2 lớp (OTP) khi đăng nhập hệ thống này',
  mfaOptUnknown: 'Chưa rõ', mfaOptNo: 'Không có — máy chủ tự đăng nhập bằng tài khoản/mật khẩu được',
  mfaOptYes: 'Có — chỉ kết nối qua tiện ích trình duyệt / cookie',
  mfaHintYes: 'Máy chủ không tự nhập được OTP nên không cho kết nối bằng tài khoản/mật khẩu; người dùng đăng nhập (kể cả OTP) trên trình duyệt, tiện ích tự gửi phiên.',
  mfaHintNo: 'Kết nối bằng tài khoản/mật khẩu: máy chủ tự đăng nhập lại khi hết phiên, không phụ thuộc trình duyệt người dùng.',
  mfaHintUnknown: 'Chưa xác nhận: vẫn cho dùng tài khoản/mật khẩu; lần tự đăng nhập nào gặp OTP hệ thống tự chuyển sang "Có".',
  mfaDetected: (d: string) => ` Hệ thống tự phát hiện OTP lúc ${d}.`,
  methodsLegend: 'Cách kết nối người dùng được chọn',
  session: 'Phiên đăng nhập',
  sessionHint: 'Cách nhận biết người dùng đã đăng nhập hệ thống này. Không chắc cookie nào là phiên? Đăng nhập hệ thống đó rồi dùng nút "Dò cookie phiên" trong tiện ích Vala.',
  required: 'Cookie phiên bắt buộc', requiredPh: 'mỗi dòng một cookie\nsessionid\nauth_new | auth_old',
  requiredHint: 'Mỗi dòng một cookie; tên thay thế nhau ngăn bằng “|”.',
  optional: 'Cookie gửi kèm nếu có', optionalPh: 'vd csrftoken',
  domain: 'Tên miền cookie (nếu đặt ở tên miền cha)', domainPh: 'vd bkav.com',
  probe: 'Trang kiểm tra phiên', pattern: 'Mẫu nhận diện tài khoản (regex, một nhóm bắt)',
  probeHint: 'Hệ thống mở trang kiểm tra bằng cookie của người dùng; tìm thấy mẫu ⇒ phiên còn sống, giá trị trong ( … ) là mã tài khoản trên hệ thống đó (dùng để không gán nhầm dữ liệu của người khác).',
  cancel: 'Huỷ', saving: 'Đang lưu…', addBtn: 'Thêm', save: 'Lưu',
  adapterSaved: (ten: string) => `Đã lưu cấu hình adapter của ${ten}. Áp dụng ngay cho cổng; worker và spider nhận trong vòng 1 phút.`,
  adapterTitle: (ten: string) => `Cấu hình adapter: ${ten}`,
  adapterIntro: 'Xác thực, endpoint được phép gọi, cách lấy và chuẩn hoá dữ liệu, bảng đích (sink), thẻ Tổng quan.',
  lastEdited: (d: string) => ` Sửa lần cuối ${d}.`,
  adapterWarn: 'Thay đổi áp dụng cho mọi người dùng của hệ thống này. Danh sách allowed_endpoints là chốt chặn an toàn: chỉ thêm endpoint chỉ-đọc đã kiểm chứng.',
  quickNote: (code: ReactNode): ReactNode => <>Hệ thống đang dùng cấu hình nhanh. Dán một adapter đầy đủ (có thể sao từ hệ thống khác rồi sửa mã {code}) để hệ thống lấy được dữ liệu.</>,
  storedError: (e: string) => `Cấu hình đang lưu bị lỗi, hệ thống đang bỏ qua: ${e}`,
  yamlLabel: 'Cấu hình adapter (YAML)',
  valid: 'Hợp lệ', allowedEndpoints: (n: number) => `${n} endpoint được phép`, passwordLogin: ' · tự đăng nhập bằng mật khẩu',
  check: 'Kiểm tra',
}, {
  enabled: 'Enabled', disabled: 'Disabled',
  toggled: (on: boolean, ten: string) => `${ten} ${on ? 'enabled' : 'disabled'}.`,
  title: 'Source systems',
  subtitle: (crawl: ReactNode): ReactNode => <>Systems Vala fetches data from on behalf of users. Once a new system is added, users <strong>can connect right away</strong> (browser extension or pasted cookie); to get reports from it, add a spider under {crawl} and a matching report.</>,
  crawlLink: 'Crawl scripts',
  search: 'Search by name, code, address…', add: 'Add source system', empty: 'No source systems yet.',
  thSystem: 'System', thAddress: 'Address', thSession: 'Session config', thMethods: 'Connection methods', thConns: 'Connected',
  thSpiders: 'Spiders / reports', thStatus: 'Status',
  envOverride: (db: string) => `Overridden by environment variable (database: ${db})`,
  quick: 'Quick config', full: (v: string) => `Full config${v}`,
  adapterError: 'Invalid config — being ignored', noSession: 'No session config',
  mfaYes: 'Two-factor authentication', mfaNo: 'No two-factor authentication', mfaUnknown: '2FA: unknown',
  passwordConns: (n: number) => `${n} connection(s) use a password — they will fail when the session expires; switch to the browser extension`,
  edit: 'Edit', adapter: 'Adapter config', turnOff: 'Disable', turnOn: 'Enable', unit: 'systems',
  added: (ten: string) => `${ten} added. Users see this system under "Source accounts" and in the browser extension.`,
  saved: (ten: string) => `${ten} saved.`,
  editTitle: (ten: string) => `Edit: ${ten}`,
  fullNote: 'This system’s sign-in session and data fetching live in its full config — edit them with "Adapter config". Here you edit the name, address and connection methods.',
  code: 'System code', codePh: 'e.g. hr_portal', name: 'Display name', namePh: 'e.g. HR portal', address: 'Address',
  desc: 'Description (optional)', mfa: 'Two-factor authentication (OTP) when signing in to this system',
  mfaOptUnknown: 'Unknown', mfaOptNo: 'No — the server can sign in with username/password',
  mfaOptYes: 'Yes — connect only via browser extension / cookie',
  mfaHintYes: 'The server cannot enter OTP codes, so username/password connections are not allowed; users sign in (including OTP) in their browser and the extension sends the session.',
  mfaHintNo: 'Username/password connections: the server signs in again when the session expires, independent of the user’s browser.',
  mfaHintUnknown: 'Not confirmed: username/password is still allowed; if an automatic sign-in hits an OTP prompt, the system switches this to "Yes".',
  mfaDetected: (d: string) => ` OTP auto-detected at ${d}.`,
  methodsLegend: 'Connection methods users can choose',
  session: 'Sign-in session',
  sessionHint: 'How to tell a user is signed in to this system. Not sure which cookie holds the session? Sign in to that system, then use "Detect session cookies" in the Vala browser extension.',
  required: 'Required session cookies', requiredPh: 'one cookie per line\nsessionid\nauth_new | auth_old',
  requiredHint: 'One cookie per line; separate alternative names with “|”.',
  optional: 'Extra cookies to send if present', optionalPh: 'e.g. csrftoken',
  domain: 'Cookie domain (if set on the parent domain)', domainPh: 'e.g. bkav.com',
  probe: 'Session check page', pattern: 'Account pattern (regex, one capture group)',
  probeHint: 'The system opens the check page with the user’s cookies; if the pattern matches, the session is alive, and the value in ( … ) is the account ID on that system (used to avoid attributing someone else’s data).',
  cancel: 'Cancel', saving: 'Saving…', addBtn: 'Add', save: 'Save',
  adapterSaved: (ten: string) => `Adapter config for ${ten} saved. It applies to the portal immediately; workers and spiders pick it up within 1 minute.`,
  adapterTitle: (ten: string) => `Adapter config: ${ten}`,
  adapterIntro: 'Authentication, allowed endpoints, how data is fetched and normalized, target tables (sinks), Overview cards.',
  lastEdited: (d: string) => ` Last edited ${d}.`,
  adapterWarn: 'Changes apply to every user of this system. The allowed_endpoints list is a safety gate: only add verified read-only endpoints.',
  quickNote: (code: ReactNode): ReactNode => <>This system uses a quick config. Paste a full adapter (you can copy one from another system and change {code}) so the system can fetch data.</>,
  storedError: (e: string) => `The stored config is invalid and is being ignored: ${e}`,
  yamlLabel: 'Adapter config (YAML)',
  valid: 'Valid', allowedEndpoints: (n: number) => `${n} allowed endpoint(s)`, passwordLogin: ' · signs in with password',
  check: 'Validate',
});

const cookieText = (groups: Array<string | string[]>) => groups.map((g) => (Array.isArray(g) ? g.join(' | ') : g)).join('\n');
const parseCookies = (t: string): Array<string | string[]> => t.split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => { const alts = l.split('|').map((x) => x.trim()).filter(Boolean); return alts.length > 1 ? alts : alts[0]!; });

/**
 * Quản trị — Hệ thống nguồn. Mọi hệ thống cấu hình trong CSDL và sửa ngay tại đây:
 *   - cấu hình đầy đủ (adapter): xác thực, endpoint được phép, cách lấy + chuẩn hoá dữ liệu, bảng đích, thẻ Tổng quan;
 *   - cấu hình nhanh: chỉ phiên đăng nhập — hệ thống mới kết nối được ngay, chưa lấy dữ liệu.
 */
export function AdminSourcesPage() {
  const t = useT(M);
  const list = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const [editing, setEditing] = useState<AdminSource | 'new' | null>(null);
  const [adapterOf, setAdapterOf] = useState<AdminSource | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const tv = useTableView(list.data, (s) => `${s.ten} ${s.code} ${s.mo_ta ?? ''} ${s.effective_base_url} ${s.enabled ? t.enabled : t.disabled}`);

  const toggle = async (s: AdminSource) => {
    await api.patch(`/admin/sources/${s.code}`, { enabled: !s.enabled });
    setNote(t.toggled(!s.enabled, s.ten));
    list.reload();
  };

  return (
    <>
      <PageTitle title={t.title}
        subtitle={t.subtitle(<Link to="/script-crawl" className="text-blue-700 dark:text-blue-400">{t.crawlLink}</Link>)} />
      {note && <Banner tone="ok" role="status">{note}</Banner>}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder={t.search} />
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setEditing('new'); setNote(null); }}>{t.add}</Button>
      </div>
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>{t.empty}</Empty>}
      {!!list.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr><Th>{t.thSystem}</Th><Th>{t.thAddress}</Th><Th>{t.thSession}</Th><Th>{t.thMethods}</Th><Th num>{t.thConns}</Th><Th num>{t.thSpiders}</Th><Th>{t.thStatus}</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((s) => (
              <tr key={s.code}>
                <Td><div className="font-medium">{s.ten}</div><Muted className="font-mono text-xs">{s.code}</Muted>{s.mo_ta && <Muted className="text-xs">{s.mo_ta}</Muted>}</Td>
                <Td>
                  <div className="min-w-[170px] [overflow-wrap:anywhere]">{s.effective_base_url}</div>
                  {s.effective_base_url.replace(/\/+$/, '') !== s.base_url.replace(/\/+$/, '') && <Muted className="text-xs">{t.envOverride(s.base_url)}</Muted>}
                </Td>
                <Td>
                  <Badge tone={s.managed_by === 'portal' ? 'info' : 'neutral'}>{s.managed_by === 'portal' ? t.quick : t.full(s.adapter ? ` · v${s.adapter.version}` : '')}</Badge>
                  {s.adapter_error && <div className="mt-1 text-xs text-red-700 dark:text-red-400" title={s.adapter_error}>{t.adapterError}</div>}
                  {s.adapter && <Muted className="mt-1 text-xs">{s.adapter.capabilities.map((c) => (c.sink ? `${c.id} → ${c.sink}` : c.id)).join(', ')}</Muted>}
                  {s.auth
                    ? <Muted className="mt-1 font-mono text-xs">{s.auth.cookie_groups.map((g) => g.join('|')).join(', ')}{s.auth.cookie_domain ? ` @ ${s.auth.cookie_domain}` : ''}</Muted>
                    : <div className="mt-1 text-xs text-red-700 dark:text-red-400">{t.noSession}</div>}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">{s.connection_methods.map((m) => <Badge key={m} tone="neutral">{METHOD_LABEL[m]}</Badge>)}</div>
                  <div className="mt-1.5">
                    {s.mfa === 'co' ? <Badge tone="warn">{t.mfaYes}</Badge> : s.mfa === 'khong' ? <Badge tone="ok">{t.mfaNo}</Badge> : <Badge tone="neutral">{t.mfaUnknown}</Badge>}
                  </div>
                  {s.mfa === 'co' && s.password_conns > 0 && (
                    <div className="mt-1 text-xs text-red-700 dark:text-red-400">{t.passwordConns(s.password_conns)}</div>
                  )}
                </Td>
                <Td num>{s.conns}</Td>
                <Td num>{s.spiders} / {s.reports}</Td>
                <Td><Badge tone={s.enabled ? 'ok' : 'neutral'}>{s.enabled ? t.enabled : t.disabled}</Badge></Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button onClick={() => { setEditing(s); setNote(null); }}>{t.edit}</Button>
                    <Button onClick={() => { setAdapterOf(s); setNote(null); }}>{t.adapter}</Button>
                    <Button onClick={() => void toggle(s)}>{s.enabled ? t.turnOff : t.turnOn}</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit={t.unit} />
      </>)}
      {adapterOf && (
        <AdapterEditor source={adapterOf} onClose={() => setAdapterOf(null)}
          onSaved={(msg) => { setAdapterOf(null); setNote(msg); list.reload(); }} />
      )}
      {editing && (
        <SourceEditor source={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNote(msg); list.reload(); }} />
      )}
    </>
  );
}

function SourceEditor({ source, onClose, onSaved }: { source: AdminSource | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const t = useT(M);
  const isNew = !source;
  const portal = isNew || source.managed_by === 'portal';
  const p: AuthProfile | null = source?.auth_profile ?? null;
  const [code, setCode] = useState('');
  const [ten, setTen] = useState(source?.ten ?? '');
  const [moTa, setMoTa] = useState(source?.mo_ta ?? '');
  const [baseUrl, setBaseUrl] = useState(source?.base_url ?? 'https://');
  const [mfa, setMfa] = useState<AdminSource['mfa']>(source?.mfa ?? 'chua_ro');
  // Có xác thực 2 lớp ⇒ bỏ "tài khoản/mật khẩu" (máy chủ không tự nhập được OTP); đổi lại "không có" ⇒ hiện lại nếu adapter hỗ trợ.
  const canPassword = !!source?.adapter?.password_login && mfa !== 'co';
  const supported: AuthMethod[] = [...(source?.supported_methods ?? ['extension', 'cookie']).filter((m) => m !== 'password'), ...(canPassword ? ['password' as const] : [])];
  const [methods, setMethods] = useState<AuthMethod[]>(source?.connection_methods ?? ['extension', 'cookie']);
  const chosen = methods.filter((m) => supported.includes(m));
  const [required, setRequired] = useState(p ? cookieText(p.cookies_required) : '');
  const [optional, setOptional] = useState(p?.cookies_optional?.join(', ') ?? '');
  const [domain, setDomain] = useState(p?.cookie_domain ?? '');
  const [probePath, setProbePath] = useState(p?.probe.path ?? '/');
  const [pattern, setPattern] = useState(p?.probe.pattern ?? '');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = { ten, mo_ta: moTa || null, base_url: baseUrl, connection_methods: chosen, mfa };
    if (portal) {
      body.auth_profile = {
        cookies_required: parseCookies(required),
        cookies_optional: optional.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
        ...(domain.trim() ? { cookie_domain: domain.trim().replace(/^\./, '') } : {}),
        probe: { path: probePath.trim(), pattern },
      };
    }
    try {
      if (isNew) await api.post('/admin/sources', { code, ...body });
      else await api.patch(`/admin/sources/${source.code}`, body);
      onSaved(isNew ? t.added(ten) : t.saved(ten));
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true">
      <Card className="my-8 w-full max-w-2xl">
        <h2 className="text-lg font-semibold">{isNew ? t.add : t.editTitle(source.ten)}</h2>
        {!portal && <Muted className="mt-1">{t.fullNote}</Muted>}
        {err ? <ErrorBox error={err} /> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {isNew && (
            <Field label={t.code}>
              <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder={t.codePh} pattern="[a-z][a-z0-9_]{1,29}" />
            </Field>
          )}
          <Field label={t.name}><Input value={ten} onChange={(e) => setTen(e.target.value)} placeholder={t.namePh} /></Field>
          <div className="sm:col-span-2"><Field label={t.address}><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://hr.bkav.com" /></Field></div>
          <div className="sm:col-span-2"><Field label={t.desc}><Input value={moTa} onChange={(e) => setMoTa(e.target.value)} /></Field></div>
          <div className="sm:col-span-2">
            <Field label={t.mfa}>
              <Select value={mfa} onChange={(e) => setMfa(e.target.value as AdminSource['mfa'])}>
                <option value="chua_ro">{t.mfaOptUnknown}</option>
                <option value="khong">{t.mfaOptNo}</option>
                <option value="co">{t.mfaOptYes}</option>
              </Select>
            </Field>
            <Muted className="mt-1 text-xs">
              {mfa === 'co' ? t.mfaHintYes
                : mfa === 'khong' ? t.mfaHintNo
                  : t.mfaHintUnknown}
              {source?.mfa_detected_at ? t.mfaDetected(new Date(source.mfa_detected_at).toLocaleString(locale())) : ''}
            </Muted>
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">{t.methodsLegend}</legend>
            <div className="flex flex-wrap gap-4">
              {supported.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={chosen.includes(m)}
                    onChange={(e) => setMethods(e.target.checked ? [...methods, m] : methods.filter((x) => x !== m))} />
                  {METHOD_LABEL[m]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {portal && (
          <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
            <div className="sm:col-span-2">
              <h3 className="font-semibold">{t.session}</h3>
              <Muted className="text-sm">{t.sessionHint}</Muted>
            </div>
            <Field label={t.required}>
              <textarea value={required} onChange={(e) => setRequired(e.target.value)} rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder={t.requiredPh} />
              <Muted className="text-xs">{t.requiredHint}</Muted>
            </Field>
            <div className="grid gap-4">
              <Field label={t.optional}><Input value={optional} onChange={(e) => setOptional(e.target.value)} placeholder={t.optionalPh} /></Field>
              <Field label={t.domain}><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t.domainPh} /></Field>
            </div>
            <Field label={t.probe}><Input value={probePath} onChange={(e) => setProbePath(e.target.value)} placeholder="/Home/Index" /></Field>
            <Field label={t.pattern}>
              <Input value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" placeholder={'userid\\s*=\\s*(\\d+)'} />
            </Field>
            <Muted className="text-xs sm:col-span-2">{t.probeHint}</Muted>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>{t.cancel}</Button>
          <Button variant="primary" disabled={busy || !ten.trim() || !chosen.length || (isNew && !code)} onClick={() => void save()}>
            {busy ? t.saving : isNew ? t.addBtn : t.save}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Sửa cấu hình adapter đầy đủ (YAML, cùng định dạng mẫu trong repo). Máy chủ kiểm tra trước khi lưu:
 * đúng lược đồ, đúng mã hệ thống, bảng/cột đích nằm trong danh sách cho phép. Lưu xong áp dụng ngay.
 */
function AdapterEditor({ source, onClose, onSaved }: { source: AdminSource; onClose: () => void; onSaved: (msg: string) => void }) {
  const t = useT(M);
  const cur = useAsync(() => api.get<{ yaml: string | null; updated_at: string | null; error: string | null }>(`/admin/sources/${source.code}/adapter`), [source.code]);
  const [text, setText] = useState<string | null>(null);
  const [check, setCheck] = useState<{ ok: true; summary: AdapterSummary } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const yaml = text ?? cur.data?.yaml ?? '';

  const validate = async () => {
    setBusy(true); setErr(null); setCheck(null);
    try { setCheck(await api.post(`/admin/sources/${source.code}/adapter/validate`, { yaml })); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.put(`/admin/sources/${source.code}/adapter`, { yaml });
      onSaved(t.adapterSaved(source.ten));
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true">
      <Card className="my-6 w-full max-w-4xl">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t.adapterTitle(source.ten)}</h2>
            <Muted className="text-sm">
              {t.adapterIntro}
              {cur.data?.updated_at ? t.lastEdited(fmtDateTime(cur.data.updated_at)) : ''}
            </Muted>
          </div>
        </div>
        <Banner tone="info">{t.adapterWarn}</Banner>
        {source.managed_by === 'portal' && !cur.data?.yaml && (
          <Muted className="mt-2 text-sm">{t.quickNote(<code>source_system: {source.code}</code>)}</Muted>
        )}
        {cur.data?.error && <Banner tone="err">{t.storedError(cur.data.error)}</Banner>}
        {cur.loading && <Loading rows={6} />}
        {!cur.loading && (
          <textarea value={yaml} onChange={(e) => { setText(e.target.value); setCheck(null); }} spellCheck={false}
            aria-label={t.yamlLabel}
            className="mt-3 h-[55vh] w-full rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
        )}
        {err ? <ErrorBox error={err} /> : null}
        {check && (
          <Banner tone="ok">
            {t.valid} — {check.summary.id} v{check.summary.version} · {t.allowedEndpoints(check.summary.allowed_endpoints)} ·
            {' '}{check.summary.capabilities.map((c) => (c.sink ? `${c.id} → ${c.sink}` : c.id)).join(', ')}
            {check.summary.password_login ? t.passwordLogin : ''}
          </Banner>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>{t.cancel}</Button>
          <Button disabled={busy || !yaml.trim()} onClick={() => void validate()}>{t.check}</Button>
          <Button variant="primary" disabled={busy || !yaml.trim() || text === null} onClick={() => void save()}>{busy ? t.saving : t.save}</Button>
        </div>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime, type AdapterSummary, type AdminSource, type AuthMethod, type AuthProfile } from '../api';
import { useAsync } from '../hooks';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Field, Input, Muted, PageTitle, Table, Td, Th } from '../components/ui';
import { METHOD_LABEL } from './AdminConnections';

const cookieText = (groups: Array<string | string[]>) => groups.map((g) => (Array.isArray(g) ? g.join(' | ') : g)).join('\n');
const parseCookies = (t: string): Array<string | string[]> => t.split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => { const alts = l.split('|').map((x) => x.trim()).filter(Boolean); return alts.length > 1 ? alts : alts[0]!; });

/**
 * Quản trị — Hệ thống nguồn. Mọi hệ thống cấu hình trong CSDL và sửa ngay tại đây:
 *   - cấu hình đầy đủ (adapter): xác thực, endpoint được phép, cách lấy + chuẩn hoá dữ liệu, bảng đích, thẻ Tổng quan;
 *   - cấu hình nhanh: chỉ phiên đăng nhập — hệ thống mới kết nối được ngay, chưa lấy dữ liệu.
 */
export function AdminSourcesPage() {
  const list = useAsync(() => api.get<AdminSource[]>('/admin/sources'), []);
  const [editing, setEditing] = useState<AdminSource | 'new' | null>(null);
  const [adapterOf, setAdapterOf] = useState<AdminSource | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = async (s: AdminSource) => {
    await api.patch(`/admin/sources/${s.code}`, { enabled: !s.enabled });
    setNote(`Đã ${s.enabled ? 'tắt' : 'bật'} ${s.ten}.`);
    list.reload();
  };

  return (
    <>
      <PageTitle title="Hệ thống nguồn"
        subtitle={<>Các hệ thống mà Vala lấy dữ liệu thay người dùng. Thêm hệ thống mới thì người dùng <strong>kết nối được ngay</strong> (tiện ích trình duyệt hoặc dán cookie); muốn có báo cáo từ hệ thống đó cần thêm spider ở <Link to="/script-crawl" className="text-blue-700 dark:text-blue-400">Script crawl</Link> và báo cáo tương ứng.</>} />
      {note && <Banner tone="ok" role="status">{note}</Banner>}
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => { setEditing('new'); setNote(null); }}>Thêm hệ thống nguồn</Button>
      </div>
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>Chưa có hệ thống nguồn nào.</Empty>}
      {!!list.data?.length && (
        <Table>
          <thead><tr><Th>Hệ thống</Th><Th>Địa chỉ</Th><Th>Cấu hình phiên</Th><Th>Cách kết nối</Th><Th num>Đang kết nối</Th><Th num>Spider / báo cáo</Th><Th>Trạng thái</Th><Th /></tr></thead>
          <tbody>
            {list.data.map((s) => (
              <tr key={s.code}>
                <Td><div className="font-medium">{s.ten}</div><Muted className="font-mono text-xs">{s.code}</Muted>{s.mo_ta && <Muted className="text-xs">{s.mo_ta}</Muted>}</Td>
                <Td>
                  <div className="min-w-[170px] [overflow-wrap:anywhere]">{s.effective_base_url}</div>
                  {s.effective_base_url.replace(/\/+$/, '') !== s.base_url.replace(/\/+$/, '') && <Muted className="text-xs">Ghi đè bằng biến môi trường (CSDL: {s.base_url})</Muted>}
                </Td>
                <Td>
                  <Badge tone={s.managed_by === 'portal' ? 'info' : 'neutral'}>{s.managed_by === 'portal' ? 'Cấu hình nhanh' : `Cấu hình đầy đủ${s.adapter ? ` · v${s.adapter.version}` : ''}`}</Badge>
                  {s.adapter_error && <div className="mt-1 text-xs text-red-700 dark:text-red-400" title={s.adapter_error}>Cấu hình lỗi — hệ thống đang bỏ qua</div>}
                  {s.adapter && <Muted className="mt-1 text-xs">{s.adapter.capabilities.map((c) => (c.sink ? `${c.id} → ${c.sink}` : c.id)).join(', ')}</Muted>}
                  {s.auth
                    ? <Muted className="mt-1 font-mono text-xs">{s.auth.cookie_groups.map((g) => g.join('|')).join(', ')}{s.auth.cookie_domain ? ` @ ${s.auth.cookie_domain}` : ''}</Muted>
                    : <div className="mt-1 text-xs text-red-700 dark:text-red-400">Chưa có cấu hình phiên</div>}
                </Td>
                <Td><div className="flex flex-wrap gap-1">{s.connection_methods.map((m) => <Badge key={m} tone="neutral">{METHOD_LABEL[m]}</Badge>)}</div></Td>
                <Td num>{s.conns}</Td>
                <Td num>{s.spiders} / {s.reports}</Td>
                <Td><Badge tone={s.enabled ? 'ok' : 'neutral'}>{s.enabled ? 'Đang bật' : 'Đã tắt'}</Badge></Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button onClick={() => { setEditing(s); setNote(null); }}>Sửa</Button>
                    <Button onClick={() => { setAdapterOf(s); setNote(null); }}>Cấu hình adapter</Button>
                    <Button onClick={() => void toggle(s)}>{s.enabled ? 'Tắt' : 'Bật'}</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
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
  const isNew = !source;
  const portal = isNew || source.managed_by === 'portal';
  const p: AuthProfile | null = source?.auth_profile ?? null;
  const [code, setCode] = useState('');
  const [ten, setTen] = useState(source?.ten ?? '');
  const [moTa, setMoTa] = useState(source?.mo_ta ?? '');
  const [baseUrl, setBaseUrl] = useState(source?.base_url ?? 'https://');
  const supported: AuthMethod[] = source?.supported_methods ?? ['extension', 'cookie'];
  const [methods, setMethods] = useState<AuthMethod[]>(source?.connection_methods ?? ['extension', 'cookie']);
  const [required, setRequired] = useState(p ? cookieText(p.cookies_required) : '');
  const [optional, setOptional] = useState(p?.cookies_optional?.join(', ') ?? '');
  const [domain, setDomain] = useState(p?.cookie_domain ?? '');
  const [probePath, setProbePath] = useState(p?.probe.path ?? '/');
  const [pattern, setPattern] = useState(p?.probe.pattern ?? '');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = { ten, mo_ta: moTa || null, base_url: baseUrl, connection_methods: methods };
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
      onSaved(isNew ? `Đã thêm ${ten}. Người dùng thấy hệ thống này ở "Tài khoản nguồn" và trong tiện ích.` : `Đã lưu ${ten}.`);
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true">
      <Card className="my-8 w-full max-w-2xl">
        <h2 className="text-lg font-semibold">{isNew ? 'Thêm hệ thống nguồn' : `Sửa: ${source.ten}`}</h2>
        {!portal && <Muted className="mt-1">Phiên đăng nhập và cách lấy dữ liệu của hệ thống này nằm trong cấu hình đầy đủ — sửa bằng nút "Cấu hình adapter". Ở đây sửa tên, địa chỉ và cách kết nối.</Muted>}
        {err ? <ErrorBox error={err} /> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {isNew && (
            <Field label="Mã hệ thống">
              <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="vd hr_portal" pattern="[a-z][a-z0-9_]{1,29}" />
            </Field>
          )}
          <Field label="Tên hiển thị"><Input value={ten} onChange={(e) => setTen(e.target.value)} placeholder="vd Cổng nhân sự" /></Field>
          <div className="sm:col-span-2"><Field label="Địa chỉ"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://hr.bkav.com" /></Field></div>
          <div className="sm:col-span-2"><Field label="Mô tả (không bắt buộc)"><Input value={moTa} onChange={(e) => setMoTa(e.target.value)} /></Field></div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Cách kết nối người dùng được chọn</legend>
            <div className="flex flex-wrap gap-4">
              {supported.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={methods.includes(m)}
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
              <h3 className="font-semibold">Phiên đăng nhập</h3>
              <Muted className="text-sm">Cách nhận biết người dùng đã đăng nhập hệ thống này. Không chắc cookie nào là phiên? Đăng nhập hệ thống đó rồi dùng nút "Dò cookie phiên" trong tiện ích Vala.</Muted>
            </div>
            <Field label="Cookie phiên bắt buộc">
              <textarea value={required} onChange={(e) => setRequired(e.target.value)} rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder={'mỗi dòng một cookie\nsessionid\nauth_new | auth_old'} />
              <Muted className="text-xs">Mỗi dòng một cookie; tên thay thế nhau ngăn bằng “|”.</Muted>
            </Field>
            <div className="grid gap-4">
              <Field label="Cookie gửi kèm nếu có"><Input value={optional} onChange={(e) => setOptional(e.target.value)} placeholder="vd csrftoken" /></Field>
              <Field label="Tên miền cookie (nếu đặt ở tên miền cha)"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="vd bkav.com" /></Field>
            </div>
            <Field label="Trang kiểm tra phiên"><Input value={probePath} onChange={(e) => setProbePath(e.target.value)} placeholder="/Home/Index" /></Field>
            <Field label="Mẫu nhận diện tài khoản (regex, một nhóm bắt)">
              <Input value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" placeholder={'userid\\s*=\\s*(\\d+)'} />
            </Field>
            <Muted className="text-xs sm:col-span-2">Hệ thống mở trang kiểm tra bằng cookie của người dùng; tìm thấy mẫu ⇒ phiên còn sống, giá trị trong ( … ) là mã tài khoản trên hệ thống đó (dùng để không gán nhầm dữ liệu của người khác).</Muted>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={busy || !ten.trim() || !methods.length || (isNew && !code)} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : isNew ? 'Thêm' : 'Lưu'}
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
      onSaved(`Đã lưu cấu hình adapter của ${source.ten}. Áp dụng ngay cho cổng; worker và spider nhận trong vòng 1 phút.`);
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 dark:bg-black/60" role="dialog" aria-modal="true">
      <Card className="my-6 w-full max-w-4xl">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Cấu hình adapter: {source.ten}</h2>
            <Muted className="text-sm">
              Xác thực, endpoint được phép gọi, cách lấy và chuẩn hoá dữ liệu, bảng đích (sink), thẻ Tổng quan.
              {cur.data?.updated_at ? ` Sửa lần cuối ${fmtDateTime(cur.data.updated_at)}.` : ''}
            </Muted>
          </div>
        </div>
        <Banner tone="info">Thay đổi áp dụng cho mọi người dùng của hệ thống này. Danh sách allowed_endpoints là chốt chặn an toàn: chỉ thêm endpoint chỉ-đọc đã kiểm chứng.</Banner>
        {source.managed_by === 'portal' && !cur.data?.yaml && (
          <Muted className="mt-2 text-sm">Hệ thống đang dùng cấu hình nhanh. Dán một adapter đầy đủ (có thể sao từ hệ thống khác rồi sửa mã <code>source_system: {source.code}</code>) để hệ thống lấy được dữ liệu.</Muted>
        )}
        {cur.data?.error && <Banner tone="err">Cấu hình đang lưu bị lỗi, hệ thống đang bỏ qua: {cur.data.error}</Banner>}
        {cur.loading && <Loading rows={6} />}
        {!cur.loading && (
          <textarea value={yaml} onChange={(e) => { setText(e.target.value); setCheck(null); }} spellCheck={false}
            aria-label="Cấu hình adapter (YAML)"
            className="mt-3 h-[55vh] w-full rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
        )}
        {err ? <ErrorBox error={err} /> : null}
        {check && (
          <Banner tone="ok">
            Hợp lệ — {check.summary.id} v{check.summary.version} · {check.summary.allowed_endpoints} endpoint được phép ·
            {' '}{check.summary.capabilities.map((c) => (c.sink ? `${c.id} → ${c.sink}` : c.id)).join(', ')}
            {check.summary.password_login ? ' · tự đăng nhập bằng mật khẩu' : ''}{check.summary.folder_kpis ? ` · ${check.summary.folder_kpis} thẻ Tổng quan` : ''}
          </Banner>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>Huỷ</Button>
          <Button disabled={busy || !yaml.trim()} onClick={() => void validate()}>Kiểm tra</Button>
          <Button variant="primary" disabled={busy || !yaml.trim() || text === null} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu'}</Button>
        </div>
      </Card>
    </div>
  );
}

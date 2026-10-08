import { useEffect, useState, type ReactNode } from 'react';
import { ApiProblem, api } from '@vala/ui/api';
import { useAsync } from '@vala/ui/hooks';
import { ErrorBox, Loading } from '@vala/ui/States';
import { Badge, Banner, Button, Card, Field, Input, Menu, Muted, PageTitle, Select, Table, Td, Th } from '@vala/ui/ui';
import { messages, useT } from '@vala/ui/i18n';

/**
 * Quản trị hệ thống → Đơn vị (đợt 3 nhiều đơn vị): chỉ quản trị hệ thống. Tạo đơn vị (máy chủ dựng schema riêng, chép
 * cấu hình từ đơn vị khác nếu chọn, tạo quản trị đầu tiên với mật khẩu tạm), sửa tên / tên miền / cách đăng nhập / SSO,
 * tạm khoá / mở lại, thử lại khi dựng lỗi. Không xoá đơn vị ở đây. Bkav: cách đăng nhập theo cấu hình máy chủ (.env).
 */
type Status = 'dang_tao' | 'hoat_dong' | 'tam_khoa' | 'loi';
interface Sso {
  issuer?: string; origin?: string; client_id?: string; authorize_url?: string; token_url?: string; userinfo_url?: string;
  login_scope?: string; username_claim?: string; match_by?: string; auto_create?: boolean; pkce?: boolean;
  email_domain?: string; password_url?: string;
}
interface Tenant {
  ma: string; ten: string; domains: string[]; status: Status; status_note: string | null; login_methods: Array<'password' | 'sso'>;
  sso: Sso | null; login_fill: 'account' | 'email'; login_selectors: { username?: string; password?: string } | null;
  users?: number | null; current?: boolean; has_sso_secret?: boolean;
}
interface Draft {
  isNew: boolean; ma: string; ten: string; domains: string; copy_from: string; password: boolean; sso: boolean; ssoCfg: Sso;
  secret: string; hasSecret: boolean; login_fill: 'account' | 'email'; selUser: string; selPass: string;
  admin: { username: string; ho_ten: string; email: string; password: string };
}

const M = messages({
  title: 'Đơn vị',
  subtitle: 'Các đơn vị dùng chung máy chủ Vala. Mỗi đơn vị có dữ liệu, người dùng, hệ thống nguồn và ứng dụng riêng; người dùng đăng nhập bằng tài khoản@tên miền của đơn vị.',
  add: 'Thêm đơn vị', thCode: 'Mã', thName: 'Tên đơn vị', thDomains: 'Tên miền', thLogin: 'Đăng nhập', thUsers: 'Người dùng', thStatus: 'Trạng thái',
  status: { dang_tao: 'Đang tạo', hoat_dong: 'Hoạt động', tam_khoa: 'Tạm khoá', loi: 'Lỗi' } as Record<Status, string>,
  methodPassword: 'Mật khẩu', methodSso: 'SSO', youAreHere: 'đang đăng nhập',
  edit: 'Sửa', suspend: 'Tạm khoá', resume: 'Mở lại', retry: 'Thử lại',
  suspendConfirm: (ten: string) => `Tạm khoá “${ten}”? Mọi người của đơn vị này sẽ không đăng nhập / dùng Vala Desktop được cho tới khi mở lại (có hiệu lực trong khoảng 30 giây).`,
  newTitle: 'Thêm đơn vị', editTitle: (ten: string) => `Sửa: ${ten}`,
  secBasic: 'Thông tin đơn vị', secLogin: 'Cách đăng nhập', secSso: 'Cấu hình SSO', secAdvanced: 'Nâng cao', secAdmin: 'Quản trị đầu tiên của đơn vị',
  code: 'Mã đơn vị', codeHint: 'Chữ thường và số, bắt đầu bằng chữ (2–20 ký tự). Không đổi được sau khi tạo.',
  name: 'Tên đơn vị', domains: 'Tên miền', domainsHint: 'Cách nhau bằng dấu phẩy, vd: sotttt.gov.vn, tttt.gov.vn. Người dùng đăng nhập bằng tài khoản@tên miền.',
  copyFrom: 'Sao chép cấu hình từ', copyNone: 'Không sao chép (đơn vị trống)',
  copyHint: 'Chép hệ thống nguồn, spider, báo cáo, tab Tổng quan, kịch bản Desktop, ứng dụng Desktop và thương hiệu. Không chép người dùng hay dữ liệu. Sửa lại địa chỉ hệ thống nguồn của đơn vị mới sau khi tạo.',
  password: 'Mật khẩu Vala', sso: 'SSO của đơn vị',
  issuer: 'Issuer (OIDC)', issuerHint: 'Có thì tự đọc các địa chỉ đăng nhập, vd https://sso.tinh.gov.vn/realms/cong-chuc',
  origin: 'Địa chỉ gốc SSO', originHint: 'Để trống nếu đã có Issuer.',
  clientId: 'Client ID', clientSecret: 'Client secret', secretKept: 'Đã lưu — để trống nếu không đổi', secretHint: 'Lưu trong kho bí mật, không hiện lại.',
  matchBy: 'Ghép tài khoản có sẵn theo', matchOpts: { 'email,username': 'Email, rồi tên đăng nhập', 'username,email': 'Tên đăng nhập, rồi email', email: 'Chỉ email', username: 'Chỉ tên đăng nhập' } as Record<string, string>,
  autoCreate: 'Tự tạo tài khoản khi người dùng SSO đăng nhập lần đầu', pkce: 'Dùng PKCE',
  emailDomain: 'Tên miền email (SSO không trả email thì ghép tên đăng nhập@tên miền này)',
  passwordUrl: 'Trang đổi mật khẩu SSO', passwordUrlHint: 'Vala Desktop mở trang này khi người dùng chỉ đăng nhập bằng SSO chọn "Đổi mật khẩu SSO".',
  authorizeUrl: 'Authorize URL', tokenUrl: 'Token URL', userinfoUrl: 'Userinfo URL', loginScope: 'Scope đăng nhập', usernameClaim: 'Claim tên đăng nhập',
  loginFill: 'Bước 2 trên trang SSO điền', fillAccount: 'Tên tài khoản (phần trước @)', fillEmail: 'Email đầy đủ',
  selUser: 'Bộ chọn ô tài khoản trên trang SSO', selPass: 'Bộ chọn ô mật khẩu trên trang SSO', selHint: 'Để trống ⇒ mặc định của WSO2 (Vala Desktop tự điền và khoá ô tài khoản).',
  bkavNote: 'Cách đăng nhập của Bkav đặt ở cấu hình máy chủ (.env) — ở đây chỉ sửa tên và tên miền.',
  adminUser: 'Tên đăng nhập', adminName: 'Họ tên', adminEmail: 'Email (không bắt buộc)', adminEmailPh: 'mặc định: tên đăng nhập@tên miền đầu tiên',
  adminPassword: 'Mật khẩu tạm — ít nhất 8 ký tự, có cả chữ và số', adminHint: 'Người này là quản trị của đơn vị mới, phải đổi mật khẩu ở lần đăng nhập đầu.',
  cancel: 'Huỷ', save: 'Lưu', create: 'Tạo đơn vị', saving: 'Đang lưu…',
  created: (ten: string, login: string) => `Đang dựng “${ten}” (thường mất vài giây). Quản trị đầu tiên đăng nhập Vala Desktop bằng ${login} và mật khẩu tạm, rồi đặt mật khẩu mới.`,
  saved: (ten: string) => `Đã lưu “${ten}”.`,
  needSso: 'Bật đăng nhập SSO thì cần Issuer hoặc địa chỉ gốc SSO và Client ID.',
  needSecret: 'Bật đăng nhập SSO thì cần nhập Client secret.',
  ssoOnlyAdmin: 'Đơn vị chỉ đăng nhập bằng SSO: quản trị đầu tiên đăng nhập bằng SSO của đơn vị với đúng tên đăng nhập / email ở trên (không có mật khẩu tạm). Tài khoản này phải có sẵn trên SSO.',
  createdSso: (ten: string, login: string) => `Đang dựng “${ten}” (thường mất vài giây). Quản trị đầu tiên đăng nhập Vala Desktop bằng ${login} qua SSO của đơn vị.`,
  needMethod: 'Chọn ít nhất một cách đăng nhập.',
}, {
  title: 'Organizations',
  subtitle: 'Organizations sharing this Vala server. Each has its own data, users, source systems and apps; users sign in as account@organization-domain.',
  add: 'Add organization', thCode: 'Code', thName: 'Organization', thDomains: 'Domains', thLogin: 'Sign-in', thUsers: 'Users', thStatus: 'Status',
  status: { dang_tao: 'Setting up', hoat_dong: 'Active', tam_khoa: 'Suspended', loi: 'Error' } as Record<Status, string>,
  methodPassword: 'Password', methodSso: 'SSO', youAreHere: 'signed in here',
  edit: 'Edit', suspend: 'Suspend', resume: 'Resume', retry: 'Retry',
  suspendConfirm: (ten: string) => `Suspend “${ten}”? Nobody in this organization can sign in or use Vala Desktop until you resume it (takes effect within about 30 seconds).`,
  newTitle: 'Add organization', editTitle: (ten: string) => `Edit: ${ten}`,
  secBasic: 'Organization', secLogin: 'Sign-in methods', secSso: 'SSO settings', secAdvanced: 'Advanced', secAdmin: "Organization's first administrator",
  code: 'Organization code', codeHint: "Lowercase letters and digits, starting with a letter (2–20 characters). Can't be changed later.",
  name: 'Organization name', domains: 'Domains', domainsHint: 'Comma-separated, e.g. dict.gov.vn, ict.gov.vn. Users sign in as account@domain.',
  copyFrom: 'Copy settings from', copyNone: "Don't copy (empty organization)",
  copyHint: "Copies source systems, spiders, reports, Overview tabs, Desktop scripts, Desktop apps and branding. Users and data aren't copied. Update the new organization's source-system addresses afterwards.",
  password: 'Vala password', sso: "Organization's SSO",
  issuer: 'Issuer (OIDC)', issuerHint: 'If set, sign-in endpoints are discovered automatically, e.g. https://sso.province.gov.vn/realms/staff',
  origin: 'SSO base address', originHint: 'Leave empty if Issuer is set.',
  clientId: 'Client ID', clientSecret: 'Client secret', secretKept: 'Saved. Leave empty to keep it.', secretHint: "Stored in the secret vault and never shown again.",
  matchBy: 'Match existing accounts by', matchOpts: { 'email,username': 'Email, then username', 'username,email': 'Username, then email', email: 'Email only', username: 'Username only' } as Record<string, string>,
  autoCreate: 'Create an account automatically on first SSO sign-in', pkce: 'Use PKCE',
  emailDomain: "Email domain (used as username@domain when SSO doesn't return an email)",
  passwordUrl: 'SSO change-password page', passwordUrlHint: 'Vala Desktop opens this page when an SSO-only user chooses "Change SSO password".',
  authorizeUrl: 'Authorize URL', tokenUrl: 'Token URL', userinfoUrl: 'Userinfo URL', loginScope: 'Sign-in scope', usernameClaim: 'Username claim',
  loginFill: 'Step 2 on the SSO page fills in', fillAccount: 'Account name (before the @)', fillEmail: 'Full email',
  selUser: 'Account field selector on the SSO page', selPass: 'Password field selector on the SSO page', selHint: 'Leave empty for the WSO2 defaults (Vala Desktop fills and locks the account field).',
  bkavNote: "Bkav's sign-in methods are set in the server configuration (.env); only the name and domains can be changed here.",
  adminUser: 'Username', adminName: 'Full name', adminEmail: 'Email (optional)', adminEmailPh: 'default: username@first domain',
  adminPassword: 'Temporary password: at least 8 characters, with letters and numbers', adminHint: 'This person administers the new organization and must change the password at first sign-in.',
  cancel: 'Cancel', save: 'Save', create: 'Create organization', saving: 'Saving…',
  created: (ten: string, login: string) => `Setting up “${ten}” (usually takes a few seconds). The first administrator signs in to Vala Desktop as ${login} with the temporary password, then sets a new one.`,
  saved: (ten: string) => `Saved “${ten}”.`,
  needSso: 'SSO sign-in needs an Issuer or SSO base address, and a Client ID.',
  needSecret: 'SSO sign-in needs the client secret.',
  ssoOnlyAdmin: 'This organization only signs in with SSO: the first administrator signs in with the organization’s SSO using the username / email above (no temporary password). The account must already exist in the SSO.',
  createdSso: (ten: string, login: string) => `Setting up “${ten}” (usually takes a few seconds). The first administrator signs in to Vala Desktop as ${login} through the organization’s SSO.`,
  needMethod: 'Choose at least one sign-in method.',
});

const TONE: Record<Status, 'ok' | 'warn' | 'err' | 'info'> = { dang_tao: 'info', hoat_dong: 'ok', tam_khoa: 'warn', loi: 'err' };

const blank = (copyFrom: string): Draft => ({
  isNew: true, ma: '', ten: '', domains: '', copy_from: copyFrom, password: true, sso: false, ssoCfg: { match_by: 'email,username' },
  secret: '', hasSecret: false, login_fill: 'account', selUser: '', selPass: '', admin: { username: '', ho_ten: '', email: '', password: '' },
});
const toDraft = (x: Tenant): Draft => ({
  isNew: false, ma: x.ma, ten: x.ten, domains: x.domains.join(', '), copy_from: '', password: x.login_methods.includes('password'),
  sso: x.login_methods.includes('sso'), ssoCfg: { match_by: 'email,username', ...(x.sso ?? {}) }, secret: '', hasSecret: !!x.has_sso_secret,
  login_fill: x.login_fill, selUser: x.login_selectors?.username ?? '', selPass: x.login_selectors?.password ?? '',
  admin: { username: '', ho_ten: '', email: '', password: '' },
});
/** Mã gợi ý từ tên: bỏ dấu, chữ thường + số, bắt đầu bằng chữ. */
const codeOf = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/[^a-z0-9]/g, '').replace(/^\d+/, '').slice(0, 20);

export function AdminTenantsPage() {
  const t = useT(M);
  const list = useAsync(() => api.get<Tenant[]>('/system/tenants'), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: ReactNode } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = list.data ?? [];
  const current = rows.find((r) => r.current)?.ma ?? 'bkav';

  // Đơn vị đang dựng ⇒ hỏi lại mỗi 2 giây tới khi xong / lỗi.
  const pending = rows.some((r) => r.status === 'dang_tao');
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => list.reload(), 2000);
    return () => window.clearInterval(id);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => setNote({ tone: 'err', text: e instanceof ApiProblem ? <><b>{e.title}</b>{e.detail ? ` — ${e.detail}` : ''}</> : String(e) });
  const act = async (fn: () => Promise<unknown>) => { setNote(null); try { await fn(); list.reload(); } catch (e) { fail(e); } };

  const edit = async (x: Tenant) => {
    setNote(null);
    try { setDraft(toDraft(await api.get<Tenant>(`/system/tenants/${x.ma}`))); } catch (e) { fail(e); }
  };

  const bkav = !!draft && !draft.isNew && draft.ma === 'bkav';
  const ssoOk = !draft?.sso || (!!(draft.ssoCfg.issuer?.trim() || draft.ssoCfg.origin?.trim()) && !!draft.ssoCfg.client_id?.trim());
  const secretOk = !draft?.sso || !!draft.secret || draft.hasSecret;
  const methodOk = !!draft && (draft.password || draft.sso);

  const save = async () => {
    if (!draft) return;
    setBusy(true); setNote(null);
    const domains = draft.domains.split(/[,\s]+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
    const login = bkav ? {} : {
      login_methods: [...(draft.password ? ['password'] : []), ...(draft.sso ? ['sso'] : [])],
      sso: draft.sso ? Object.fromEntries(Object.entries(draft.ssoCfg).filter(([, v]) => v !== '' && v !== undefined)) : null,
      ...(draft.sso && draft.secret ? { sso_client_secret: draft.secret } : {}),
      login_fill: draft.login_fill,
      login_selectors: draft.selUser.trim() || draft.selPass.trim()
        ? { ...(draft.selUser.trim() ? { username: draft.selUser.trim() } : {}), ...(draft.selPass.trim() ? { password: draft.selPass.trim() } : {}) } : null,
    };
    try {
      if (draft.isNew) {
        const a = draft.admin;
        await api.post('/system/tenants', {
          ma: draft.ma, ten: draft.ten.trim(), domains, copy_from: draft.copy_from || null, ...login,
          admin: { username: a.username.trim().toLowerCase(), ho_ten: a.ho_ten.trim(), ...(a.email.trim() ? { email: a.email.trim() } : {}), ...(draft.password ? { password: a.password } : {}) },
        });
        const who = `${a.username.trim().toLowerCase()}@${domains[0] ?? ''}`;
        setNote({ tone: 'ok', text: draft.password ? t.created(draft.ten.trim(), who) : t.createdSso(draft.ten.trim(), who) });
      } else {
        await api.patch(`/system/tenants/${draft.ma}`, { ten: draft.ten.trim(), domains, ...login });
        setNote({ tone: 'ok', text: t.saved(draft.ten.trim()) });
      }
      setDraft(null);
      list.reload();
    } catch (e) { fail(e); }
    setBusy(false);
  };

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setSso = (p: Partial<Sso>) => setDraft((d) => (d ? { ...d, ssoCfg: { ...d.ssoCfg, ...p } } : d));
  const ssoInput = (k: keyof Sso, label: string, hint?: string, type = 'text') => (
    <Field label={label}>
      <Input type={type} value={String(draft?.ssoCfg[k] ?? '')} onChange={(e) => setSso({ [k]: e.target.value } as Partial<Sso>)} />
      {hint && <span className="font-normal text-slate-400">{hint}</span>}
    </Field>
  );
  const weak = !!draft?.isNew && draft.password && !!draft.admin.password && (draft.admin.password.length < 8 || !/[A-Za-zÀ-ỹ]/.test(draft.admin.password) || !/\d/.test(draft.admin.password));
  const canSave = !!draft && !busy && draft.ten.trim().length >= 2 && !!draft.domains.trim() && (bkav || (methodOk && ssoOk && secretOk))
    && (!draft.isNew || (/^[a-z][a-z0-9]{1,19}$/.test(draft.ma) && !!draft.admin.username.trim() && draft.admin.ho_ten.trim().length >= 2
      && (!draft.password || (!!draft.admin.password && !weak))));
  const H = ({ children }: { children: ReactNode }) => <h3 className="mt-2 border-t border-slate-200 pt-3 text-sm font-semibold dark:border-slate-700">{children}</h3>;

  return (
    <div>
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {note && <Banner tone={note.tone} role={note.tone === 'err' ? 'alert' : 'status'}>{note.text}</Banner>}

      {draft ? (
        <Card className="mb-4 max-w-2xl rounded-2xl">
          <h2 className="mb-3 text-base font-semibold">{draft.isNew ? t.newTitle : t.editTitle(draft.ten)}</h2>
          <div className="grid gap-3">
            <Field label={t.name}>
              <Input value={draft.ten} maxLength={120} onChange={(e) => set({ ten: e.target.value, ...(draft.isNew ? { ma: codeOf(e.target.value) } : {}) })} />
            </Field>
            {draft.isNew && (
              <Field label={t.code}>
                <Input value={draft.ma} maxLength={20} className="font-mono" onChange={(e) => set({ ma: e.target.value.toLowerCase() })} />
                <span className="font-normal text-slate-400">{t.codeHint}</span>
              </Field>
            )}
            <Field label={t.domains}>
              <Input value={draft.domains} placeholder="donvi.gov.vn" onChange={(e) => set({ domains: e.target.value })} />
              <span className="font-normal text-slate-400">{t.domainsHint}</span>
            </Field>
            {draft.isNew && (
              <Field label={t.copyFrom}>
                <Select value={draft.copy_from} onChange={(e) => set({ copy_from: e.target.value })}>
                  <option value="">{t.copyNone}</option>
                  {rows.filter((r) => r.status === 'hoat_dong' || r.status === 'tam_khoa').map((r) => <option key={r.ma} value={r.ma}>{r.ten} ({r.ma})</option>)}
                </Select>
                <span className="font-normal text-slate-400">{t.copyHint}</span>
              </Field>
            )}

            <H>{t.secLogin}</H>
            {bkav ? <Muted>{t.bkavNote}</Muted> : (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.password} onChange={(e) => set({ password: e.target.checked })} />{t.password}</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.sso} onChange={(e) => set({ sso: e.target.checked })} />{t.sso}</label>
                {!methodOk && <p className="text-sm text-amber-800 dark:text-amber-300">{t.needMethod}</p>}
                {draft.sso && (
                  <>
                    <H>{t.secSso}</H>
                    {ssoInput('issuer', t.issuer, t.issuerHint, 'url')}
                    {ssoInput('origin', t.origin, t.originHint, 'url')}
                    {ssoInput('client_id', t.clientId)}
                    <Field label={t.clientSecret}>
                      <Input type="password" autoComplete="new-password" value={draft.secret} placeholder={draft.hasSecret ? t.secretKept : ''} onChange={(e) => set({ secret: e.target.value })} />
                      <span className="font-normal text-slate-400">{t.secretHint}</span>
                    </Field>
                    <Field label={t.matchBy}>
                      <Select value={draft.ssoCfg.match_by ?? 'email,username'} onChange={(e) => setSso({ match_by: e.target.value })}>
                        {Object.entries(t.matchOpts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Select>
                    </Field>
                    {ssoInput('email_domain', t.emailDomain)}
                    {ssoInput('password_url', t.passwordUrl, t.passwordUrlHint, 'url')}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.ssoCfg.auto_create} onChange={(e) => setSso({ auto_create: e.target.checked })} />{t.autoCreate}</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.ssoCfg.pkce} onChange={(e) => setSso({ pkce: e.target.checked })} />{t.pkce}</label>
                    {!ssoOk && <p className="text-sm text-amber-800 dark:text-amber-300">{t.needSso}</p>}
                    {ssoOk && !secretOk && <p className="text-sm text-amber-800 dark:text-amber-300">{t.needSecret}</p>}
                    <details className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                      <summary className="cursor-pointer text-sm font-medium">{t.secAdvanced}</summary>
                      <div className="mt-3 grid gap-3">
                        <Field label={t.loginFill}>
                          <Select value={draft.login_fill} onChange={(e) => set({ login_fill: e.target.value as Draft['login_fill'] })}>
                            <option value="account">{t.fillAccount}</option>
                            <option value="email">{t.fillEmail}</option>
                          </Select>
                        </Field>
                        <Field label={t.selUser}><Input value={draft.selUser} className="font-mono" placeholder="#usernameUserInput" onChange={(e) => set({ selUser: e.target.value })} /></Field>
                        <Field label={t.selPass}>
                          <Input value={draft.selPass} className="font-mono" placeholder="#password" onChange={(e) => set({ selPass: e.target.value })} />
                          <span className="font-normal text-slate-400">{t.selHint}</span>
                        </Field>
                        {ssoInput('authorize_url', t.authorizeUrl, undefined, 'url')}
                        {ssoInput('token_url', t.tokenUrl, undefined, 'url')}
                        {ssoInput('userinfo_url', t.userinfoUrl, undefined, 'url')}
                        {ssoInput('login_scope', t.loginScope)}
                        {ssoInput('username_claim', t.usernameClaim)}
                      </div>
                    </details>
                  </>
                )}
              </>
            )}

            {draft.isNew && (
              <>
                <H>{t.secAdmin}</H>
                <Muted>{t.adminHint}</Muted>
                <Field label={t.adminUser}>
                  <Input value={draft.admin.username} autoComplete="off" onChange={(e) => set({ admin: { ...draft.admin, username: e.target.value } })} />
                </Field>
                <Field label={t.adminName}>
                  <Input value={draft.admin.ho_ten} onChange={(e) => set({ admin: { ...draft.admin, ho_ten: e.target.value } })} />
                </Field>
                <Field label={t.adminEmail}>
                  <Input type="email" value={draft.admin.email} placeholder={t.adminEmailPh} onChange={(e) => set({ admin: { ...draft.admin, email: e.target.value } })} />
                </Field>
                {draft.password ? (
                  <Field label={t.adminPassword}>
                    <Input type="password" autoComplete="new-password" value={draft.admin.password} onChange={(e) => set({ admin: { ...draft.admin, password: e.target.value } })} />
                  </Field>
                ) : <p className="text-sm text-amber-800 dark:text-amber-300">{t.ssoOnlyAdmin}</p>}
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setDraft(null)}>{t.cancel}</Button>
              <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{busy ? t.saving : draft.isNew ? t.create : t.save}</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="mb-3 flex justify-end"><Button variant="primary" onClick={() => { setNote(null); setDraft(blank(current)); }}>{t.add}</Button></div>
      )}

      {list.loading && !list.data && <Loading rows={3} />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {rows.length > 0 && (
        <Table>
          <thead><tr><Th>{t.thCode}</Th><Th>{t.thName}</Th><Th>{t.thDomains}</Th><Th>{t.thLogin}</Th><Th num>{t.thUsers}</Th><Th>{t.thStatus}</Th><Th /></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.ma}>
                <Td><span className="font-mono">{x.ma}</span></Td>
                <Td>
                  <div className="font-medium">{x.ten}</div>
                  {x.current && <div className="text-xs text-slate-500">{t.youAreHere}</div>}
                </Td>
                <Td><div className="grid gap-0.5 text-sm">{x.domains.map((d) => <span key={d} className="whitespace-nowrap">{d}</span>)}</div></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {x.login_methods.includes('password') && <Badge tone="neutral">{t.methodPassword}</Badge>}
                    {x.login_methods.includes('sso') && <Badge tone="info">{t.methodSso}</Badge>}
                  </div>
                </Td>
                <Td num>{x.users ?? '—'}</Td>
                <Td>
                  <Badge tone={TONE[x.status]}>{t.status[x.status]}</Badge>
                  {x.status_note && <div className="mt-1 max-w-xs break-words text-xs text-red-700 dark:text-red-300">{x.status_note}</div>}
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    {x.status === 'loi' && <Button onClick={() => void act(() => api.post(`/system/tenants/${x.ma}/retry`, {}))}>{t.retry}</Button>}
                    {x.status !== 'dang_tao' && <Button onClick={() => void edit(x)}>{t.edit}</Button>}
                    {(x.status === 'hoat_dong' || x.status === 'tam_khoa') && !x.current && <Menu items={[
                      x.status === 'hoat_dong'
                        ? { label: t.suspend, danger: true, onClick: () => { if (window.confirm(t.suspendConfirm(x.ten))) void act(() => api.patch(`/system/tenants/${x.ma}`, { status: 'tam_khoa' })); } }
                        : { label: t.resume, onClick: () => void act(() => api.patch(`/system/tenants/${x.ma}`, { status: 'hoat_dong' })) },
                    ]} />}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

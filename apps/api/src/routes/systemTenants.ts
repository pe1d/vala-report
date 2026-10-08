/**
 * Quản trị hệ thống → Đơn vị (đợt 3 — docs/superpowers/plans/2026-10-08-multi-tenant-dot3-don-vi.md). Chỉ quản trị hệ
 * thống (`core.system_admins` của đơn vị đang đăng nhập). Giao diện nằm trong Vala Desktop (trang Quản trị).
 *
 *   - Tạo: ghi `core.tenants` trạng thái `dang_tao` + yêu cầu dựng (`provision`: chép cấu hình từ đơn vị nào, quản trị đầu
 *     tiên — mật khẩu tạm đã băm) ⇒ báo worker (việc `tenant_provision`) dựng schema bằng quyền chủ CSDL.
 *   - Sửa: tên, tên miền, cách đăng nhập, SSO (client secret vào vault, không bao giờ trả ra), điền tài khoản / bộ chọn ô của
 *     trang SSO, tạm khoá / mở lại. Bkav: cách đăng nhập theo .env của máy chủ — chỉ sửa tên, tên miền.
 *   - Không xoá đơn vị trên giao diện. Lỗi dựng ⇒ thử lại.
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { DEFAULT_TENANT, L, Problem, currentTenant, forgetTenantCache, hashPassword, isTenantCode, passwordPolicyError, tenantSchema, withCore, withTenant, type Tx } from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';
import { tenantSsoRef } from '../sso-clients.js';

const DOMAIN = '^(?=.{3,120}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';
const USERNAME = '^[a-z0-9][a-z0-9._-]{2,39}$';
const EMAIL = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
const URL_RE = '^https?://[^\\s]{1,500}$';

/** Các khoá SSO quản trị sửa được (như .env viết thường bỏ `SSO_` — ssoConfigFromJson). */
const ssoSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    issuer: { type: 'string', maxLength: 500 }, origin: { type: 'string', maxLength: 500 },
    client_id: { type: 'string', maxLength: 200 },
    authorize_url: { type: 'string', maxLength: 500 }, token_url: { type: 'string', maxLength: 500 },
    userinfo_url: { type: 'string', maxLength: 500 }, revoke_url: { type: 'string', maxLength: 500 },
    login_scope: { type: 'string', maxLength: 200 }, grant_scope: { type: 'string', maxLength: 200 },
    username_claim: { type: 'string', maxLength: 60 },
    match_by: { type: 'string', enum: ['email,username', 'username,email', 'email', 'username'] },
    auto_create: { type: 'boolean' }, pkce: { type: 'boolean' },
    email_domain: { type: 'string', maxLength: 120 },
    password_url: { type: 'string', maxLength: 500 },
  },
} as const;
const URL_KEYS = ['issuer', 'origin', 'authorize_url', 'token_url', 'userinfo_url', 'revoke_url', 'password_url'] as const;

const editable = {
  ten: { type: 'string', minLength: 2, maxLength: 120 },
  domains: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', pattern: DOMAIN } },
  login_methods: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'string', enum: ['password', 'sso'] } },
  sso: { anyOf: [ssoSchema, { type: 'null' }] },
  sso_client_secret: { type: 'string', minLength: 1, maxLength: 500 },
  login_fill: { type: 'string', enum: ['account', 'email'] },
  login_selectors: {
    anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, properties: {
      username: { type: 'string', maxLength: 300 }, password: { type: 'string', maxLength: 300 } } }],
  },
} as const;

interface Editable {
  ten?: string; domains?: string[]; login_methods?: Array<'password' | 'sso'>; sso?: Record<string, unknown> | null;
  sso_client_secret?: string; login_fill?: 'account' | 'email'; login_selectors?: { username?: string; password?: string } | null;
}
interface CreateBody extends Editable {
  ma?: string; copy_from?: string | null;
  admin?: { username?: string; ho_ten?: string; email?: string; password?: string };
}
interface PatchBody extends Editable { status?: 'hoat_dong' | 'tam_khoa' }

const COLS = 'ma, ten, domains, status, status_note, login_methods, sso, login_fill, login_selectors, created_at, updated_at';

/** SSO đã làm sạch: bỏ chuỗi rỗng, địa chỉ phải http(s). */
function cleanSso(s: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!s) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'string') { const x = v.trim(); if (!x) continue; out[k] = x; } else out[k] = v;
  }
  for (const k of URL_KEYS) {
    if (out[k] !== undefined && !new RegExp(URL_RE).test(String(out[k]))) {
      throw new Problem('invalid_params', L('Địa chỉ SSO không hợp lệ', 'Invalid SSO address'), `${k}: ${String(out[k])}`);
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Tên miền đã thuộc đơn vị khác ⇒ báo rõ tên miền nào (mỗi tên miền chỉ thuộc một đơn vị — bước 1 đăng nhập). */
async function checkDomains(t: Tx, ma: string, domains: string[]): Promise<void> {
  const taken = await t.map('SELECT domain FROM tenant_domains WHERE domain = ANY($1) AND tenant <> $2 ORDER BY domain', [domains, ma],
    (r: { domain: string }) => r.domain);
  if (taken.length) {
    throw new Problem('invalid_params', L('Tên miền đã thuộc đơn vị khác', 'This domain already belongs to another organization'), taken.join(', '));
  }
}

export const systemTenantRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/v1/system/')) return;
    if (!req.user?.is_system_admin) throw new Problem('forbidden', L('Chỉ dành cho quản trị hệ thống', 'System administrators only'));
  });
  const kick = () => deps.maintenance?.add('tenant_provision', {}, { removeOnComplete: true, removeOnFail: 100 }).catch(() => undefined);
  const tenantAudit = (req: FastifyRequest, ma: string, detail: Record<string, unknown>) =>
    withTenant(deps.writer, (t) => audit(t, req, 'source_change', { type: 'tenant', id: ma }, detail));
  const one = (t: Tx, ma: string) => t.oneOrNone<Record<string, unknown>>(`SELECT ${COLS} FROM tenants WHERE ma = $1`, [ma]);
  const notFound = () => new Problem('not_found', L('Không có đơn vị này', 'Organization not found'));
  const needSecret = () => new Problem('invalid_params', L('Bật đăng nhập SSO thì phải nhập Client secret', 'Enabling SSO sign-in requires the client secret'),
    L('Đội quản trị SSO của đơn vị cấp Client ID và Client secret', "The organization's SSO team issues the client ID and secret"));
  const hasSecret = async (ma: string) => !!(await deps.secrets.get<{ client_secret?: string }>(tenantSsoRef(ma)))?.client_secret;

  app.get('/system/tenants', async () => {
    const rows = await withCore(deps.writer, (t) => t.any<Record<string, unknown> & { ma: string; status: string }>(
      `SELECT ${COLS}, EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'tenant_' || ma) AS ready FROM tenants ORDER BY created_at, ma`));
    // Số người dùng của từng đơn vị đã dựng (mỗi đơn vị một schema).
    return withCore(deps.writer, (t) => Promise.all(rows.map(async ({ ready, ...r }) => ({
      ...r,
      users: ready ? (await t.one('SELECT count(*)::int AS n FROM $1:name.app_users WHERE is_active', [tenantSchema(r.ma)], (x: { n: number }) => x.n)) : null,
      current: r.ma === currentTenant(),
    }))));
  });

  app.get<{ Params: { ma: string } }>('/system/tenants/:ma', async (req) => {
    const r = await withCore(deps.writer, (t) => one(t, req.params.ma));
    if (!r) throw notFound();
    return { ...r, has_sso_secret: await hasSecret(req.params.ma), current: req.params.ma === currentTenant() };
  });

  app.post<{ Body: CreateBody }>('/system/tenants', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['ma', 'ten', 'domains', 'admin'], properties: {
      ...editable,
      ma: { type: 'string', pattern: '^[a-z][a-z0-9]{1,19}$' },
      copy_from: { anyOf: [{ type: 'string', pattern: '^[a-z][a-z0-9]{1,19}$' }, { type: 'null' }] },
      admin: { type: 'object', additionalProperties: false, required: ['username', 'ho_ten'], properties: {
        username: { type: 'string', pattern: USERNAME }, ho_ten: { type: 'string', minLength: 2, maxLength: 120 },
        email: { type: 'string', pattern: EMAIL, maxLength: 200 }, password: { type: 'string', maxLength: 400 } } },
    } } },
  }, async (req, reply) => {
    const b = req.body;
    const ma = b.ma!;
    if (!isTenantCode(ma)) throw new Problem('invalid_params', L('Mã đơn vị không hợp lệ', 'Invalid organization code'));
    const domains = [...new Set(b.domains!.map((d) => d.toLowerCase()))];
    const sso = cleanSso(b.sso);
    const methods = b.login_methods ?? ['password'];
    if (methods.includes('sso') && !sso) throw new Problem('invalid_params', L('Bật đăng nhập SSO thì phải khai cấu hình SSO', 'Enabling SSO sign-in requires an SSO configuration'));
    if (methods.includes('sso') && !b.sso_client_secret) throw needSecret();
    // Đơn vị chỉ SSO ⇒ quản trị đầu tiên đăng nhập bằng SSO (ghép theo tên đăng nhập / email), không có mật khẩu tạm.
    const withPassword = methods.includes('password');
    if (withPassword) {
      const policy = passwordPolicyError(b.admin!.password ?? '');
      if (policy) throw new Problem('invalid_params', L('Mật khẩu chưa đạt', 'Password does not meet the requirements'), policy);
    }
    const username = b.admin!.username!.toLowerCase();
    const provision = {
      copy_from: b.copy_from ?? null,
      admin: {
        username, ho_ten: b.admin!.ho_ten!.trim(),
        email: (b.admin!.email?.trim() || `${username}@${domains[0]}`).toLowerCase(),
        password_hash: withPassword ? await hashPassword(b.admin!.password!) : null,
      },
    };
    await withCore(deps.writer, async (t) => {
      if (await t.oneOrNone('SELECT 1 FROM tenants WHERE ma = $1', [ma])) throw new Problem('invalid_params', L('Mã đơn vị đã có', 'This organization code already exists'));
      if (b.copy_from && !(await t.oneOrNone(`SELECT 1 FROM tenants WHERE ma = $1 AND status IN ('hoat_dong', 'tam_khoa')`, [b.copy_from]))) {
        throw new Problem('invalid_params', L('Không có đơn vị để chép cấu hình', 'The organization to copy settings from was not found'));
      }
      await checkDomains(t, ma, domains);
      await t.none(`INSERT INTO tenants (ma, ten, domains, status, login_methods, sso, login_fill, login_selectors, provision)
                    VALUES ($1, $2, $3, 'dang_tao', $4, $5, $6, $7, $8)`,
      [ma, b.ten!.trim(), domains, methods, sso, b.login_fill ?? 'account', b.login_selectors ?? null, provision]);
      for (const d of domains) await t.none('INSERT INTO tenant_domains (domain, tenant) VALUES ($1, $2)', [d, ma]);
    });
    if (b.sso_client_secret) await deps.secrets.put(tenantSsoRef(ma), { client_secret: b.sso_client_secret });
    await tenantAudit(req, ma, { op: 'create', copy_from: b.copy_from ?? null, domains, admin: username });
    forgetTenantCache();
    void kick();
    const r = await withCore(deps.writer, (t) => one(t, ma));
    return reply.status(201).send(r);
  });

  app.patch<{ Params: { ma: string }; Body: PatchBody }>('/system/tenants/:ma', {
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      ...editable, status: { type: 'string', enum: ['hoat_dong', 'tam_khoa'] } } } },
  }, async (req) => {
    const { ma } = req.params;
    const b = req.body;
    const cur = await withCore(deps.writer, (t) => t.oneOrNone<{ status: string; login_methods: string[] }>('SELECT status, login_methods FROM tenants WHERE ma = $1', [ma]));
    if (!cur) throw notFound();
    if (ma !== DEFAULT_TENANT && (b.login_methods ?? cur.login_methods).includes('sso') && !b.sso_client_secret && !(await hasSecret(ma))) throw needSecret();
    if (ma === DEFAULT_TENANT && (b.login_methods || b.sso !== undefined || b.sso_client_secret || b.login_fill || b.login_selectors !== undefined)) {
      throw new Problem('invalid_params', L('Cách đăng nhập của Bkav đặt ở cấu hình máy chủ (.env)', "Bkav's sign-in settings are configured on the server (.env)"));
    }
    if (b.status && (cur.status === 'dang_tao' || cur.status === 'loi')) {
      throw new Problem('invalid_params', L('Đơn vị chưa dựng xong', 'This organization has not finished setting up'));
    }
    if (b.status === 'tam_khoa' && ma === currentTenant()) {
      throw new Problem('invalid_params', L('Không tự khoá đơn vị mình đang đăng nhập', 'You cannot suspend the organization you are signed in to'));
    }
    const sso = b.sso === undefined ? undefined : cleanSso(b.sso);
    await withCore(deps.writer, async (t) => {
      const sets: string[] = [];
      const vals: unknown[] = [ma];
      const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
      if (b.ten !== undefined) set('ten', b.ten.trim());
      if (b.login_methods) set('login_methods', b.login_methods);
      if (sso !== undefined) set('sso', sso);
      if (b.login_fill) set('login_fill', b.login_fill);
      if (b.login_selectors !== undefined) set('login_selectors', b.login_selectors);
      if (b.status) { set('status', b.status); sets.push('status_note = NULL'); }
      if (b.domains) {
        const domains = [...new Set(b.domains.map((d) => d.toLowerCase()))];
        await checkDomains(t, ma, domains);
        set('domains', domains);
        await t.none('DELETE FROM tenant_domains WHERE tenant = $1', [ma]);
        for (const d of domains) await t.none('INSERT INTO tenant_domains (domain, tenant) VALUES ($1, $2)', [d, ma]);
      }
      if (sets.length) await t.none(`UPDATE tenants SET ${sets.join(', ')}, updated_at = now() WHERE ma = $1`, vals);
      const after = await t.one<{ login_methods: string[]; sso: unknown }>('SELECT login_methods, sso FROM tenants WHERE ma = $1', [ma]);
      if (after.login_methods.includes('sso') && !after.sso) {
        throw new Problem('invalid_params', L('Bật đăng nhập SSO thì phải khai cấu hình SSO', 'Enabling SSO sign-in requires an SSO configuration'));
      }
    });
    if (b.sso_client_secret) await deps.secrets.put(tenantSsoRef(ma), { client_secret: b.sso_client_secret });
    await tenantAudit(req, ma, { op: 'update', fields: Object.keys(b).map((k) => (k === 'sso_client_secret' ? 'sso_client_secret(***)' : k)) });
    forgetTenantCache();
    const r = await withCore(deps.writer, (t) => one(t, ma));
    return { ...r, has_sso_secret: await hasSecret(ma), current: ma === currentTenant() };
  });

  /** Dựng lỗi ⇒ dựng lại (yêu cầu dựng vẫn giữ ở `provision`). */
  app.post<{ Params: { ma: string } }>('/system/tenants/:ma/retry', async (req) => {
    const n = await withCore(deps.writer, (t) => t.result(
      `UPDATE tenants SET status = 'dang_tao', status_note = NULL, updated_at = now() WHERE ma = $1 AND status = 'loi' AND provision IS NOT NULL`,
      [req.params.ma], (r) => r.rowCount));
    if (!n) throw new Problem('invalid_params', L('Đơn vị không ở trạng thái lỗi', 'This organization is not in an error state'));
    await tenantAudit(req, req.params.ma, { op: 'retry' });
    forgetTenantCache();
    void kick();
    return withCore(deps.writer, (t) => one(t, req.params.ma));
  });
};

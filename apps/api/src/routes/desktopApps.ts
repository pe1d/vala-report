/**
 * Danh mục ứng dụng của Vala Desktop theo đơn vị (họp 07/10 phần 3): quản trị đơn vị khai trang web, hệ thống nguồn, Báo
 * cáo; mỗi người dùng có bố cục riêng (ứng dụng ghim + thứ tự). Bảng nằm trong schema đơn vị (migration đơn vị 002).
 *   GET  /ext/apps                 danh mục đang bật + bố cục của người dùng (token thiết bị)
 *   PUT  /ext/layout               lưu bố cục
 *   /admin/desktop-apps…           quản trị đơn vị thêm / sửa / xoá / sắp xếp
 */
import type { FastifyPluginAsync } from 'fastify';
import { L, Problem, currentTenant, withTenant, type Tx } from '@vala/core';
import { isColor, libraryIconName, resolveAppIcon } from '@vala/ui/app-icons';
import { loginMethodsOf, ssoHostsOf, ssoPasswordUrlOf, tenantByCode } from '../login-target.js';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';

export interface DesktopApp {
  ma: string;
  ten: string;
  kind: 'web' | 'source' | 'reports';
  url: string | null;
  source_system: string | null;
  /** Ảnh riêng (http(s) / data:image) hoặc `lucide:<tên>` (bộ có sẵn — @vala/ui/app-icons); null ⇒ mặc định theo loại. */
  icon: string | null;
  /** Màu ô biểu tượng (khoá APP_COLORS); null ⇒ tự gán theo mã. */
  mau: string | null;
  /** Mô tả ngắn (≤ 300 ký tự) — hiện ở khung Tất cả ứng dụng / ghi chú khi rê chuột. */
  mo_ta: string | null;
  sort: number;
  pinned_default: boolean;
  is_default: boolean;
  enabled: boolean;
}

const COLS = 'ma, ten, kind, url, source_system, icon, mau, mo_ta, sort, pinned_default, is_default, enabled';
const MA = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * Một tên miền quản trị nhập (chấp nhận dán cả địa chỉ, "*.", chữ hoa) ⇒ tên miền chuẩn, vd "https://*.Bkav.com/x" ⇒
 * "bkav.com"; không hợp lệ ⇒ null.
 */
export function domainOf(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^\*\./, '').replace(/\.$/, '');
  return /^(?=.{3,200}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) || s === 'localhost' ? s : null;
}
export const normalizeDomains = (list: string[]): string[] => [...new Set(list.map(domainOf).filter((d): d is string => !!d))];

/** Bố cục: chỉ giữ mã ứng dụng còn trong danh mục, không trùng, đúng thứ tự người dùng xếp. */
export function cleanLayout(pinned: unknown, available: string[]): string[] {
  if (!Array.isArray(pinned)) return [];
  const out: string[] = [];
  for (const m of pinned) if (typeof m === 'string' && available.includes(m) && !out.includes(m)) out.push(m);
  return out;
}

const listApps = (t: Tx, onlyEnabled: boolean) =>
  t.any<DesktopApp>(`SELECT ${COLS} FROM desktop_apps ${onlyEnabled ? 'WHERE enabled' : ''} ORDER BY is_default DESC, sort, ten`);

/** Ứng dụng của Desktop (token thiết bị). */
export const desktopAppExtRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/ext/apps', async (req) => withTenant(deps.writer, async (t) => {
    // Ứng dụng hệ thống nguồn: địa chỉ = base_url của hệ thống (Desktop mở được cả khi người dùng chưa kết nối nguồn).
    const apps = await t.any<DesktopApp>(
      `SELECT a.ma, a.ten, a.kind, CASE WHEN a.kind = 'source' THEN ss.base_url ELSE a.url END AS url, a.source_system, a.icon,
              a.mau, a.mo_ta, a.sort, a.pinned_default, a.is_default, a.enabled
         FROM desktop_apps a LEFT JOIN source_systems ss ON ss.code = a.source_system
        WHERE a.enabled AND (a.kind <> 'source' OR ss.enabled) ORDER BY a.is_default DESC, a.sort, a.ten`);
    const row = await t.oneOrNone<{ pinned: string[] }>('SELECT pinned FROM desktop_app_layouts WHERE app_user_id = $1', [req.user.id]);
    const tenant = await tenantByCode(deps, currentTenant());
    const inside = await t.oneOrNone<{ d: string[] }>('SELECT desktop_open_inside AS d FROM app_settings WHERE id = 1');
    return {
      // Biểu tượng chuẩn dựng sẵn (ô nền màu + biểu tượng trắng / ảnh riêng / mặc định theo loại) ⇒ Desktop chỉ việc hiện ảnh.
      apps: apps.map(({ enabled: _e, mau: _m, ...a }) => ({ ...a, icon: resolveAppIcon({ ma: a.ma, kind: a.kind, icon: a.icon, mau: _m }) })),
      // Tên miền mà link mở cửa sổ mới tới đó mở thành tab trong Desktop (ngoài tên miền của các ứng dụng trong danh mục).
      open_inside: inside?.d ?? [],
      layout: { pinned: row ? cleanLayout(row.pinned, apps.map((a) => a.ma)) : null },
      // Host SSO của đơn vị: Desktop giữ phiên SSO + mật khẩu SSO dùng chung cho mọi ứng dụng.
      sso_hosts: tenant ? ssoHostsOf(deps, tenant) : [],
      // Quản trị đơn vị ⇒ Desktop hiện mục "Quản trị đơn vị".
      is_admin: req.user.is_ops_admin,
    is_system_admin: req.user.is_system_admin,
      // Đổi mật khẩu trong Desktop: có mật khẩu Vala ⇒ form ngay trong app; chỉ dùng SSO ⇒ mở trang đổi mật khẩu của SSO.
      // Đơn vị đã tắt mật khẩu Vala ⇒ mật khẩu cũ (nếu còn) không dùng được nữa: coi như chỉ SSO.
      account: { has_password: req.user.has_password && (!tenant || loginMethodsOf(deps, tenant).includes('password')), sso_password_url: tenant ? ssoPasswordUrlOf(deps, tenant) : null },
    };
  }));

  app.put<{ Body: { pinned: string[] } }>('/ext/layout', {
    schema: { body: { type: 'object', required: ['pinned'], properties: { pinned: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 40 } } } } },
  }, async (req) => withTenant(deps.writer, async (t) => {
    const avail = (await listApps(t, true)).map((a) => a.ma);
    const pinned = cleanLayout(req.body.pinned, avail);
    await t.none(`INSERT INTO desktop_app_layouts (app_user_id, pinned, updated_at) VALUES ($1, $2, now())
                  ON CONFLICT (app_user_id) DO UPDATE SET pinned = EXCLUDED.pinned, updated_at = now()`, [req.user.id, pinned]);
    return { pinned };
  }));
};

interface AppBody {
  ma?: string; ten?: string; kind?: DesktopApp['kind']; url?: string | null; source_system?: string | null; icon?: string | null;
  mau?: string | null; mo_ta?: string | null;
  pinned_default?: boolean; is_default?: boolean; enabled?: boolean;
}
const appBodySchema = {
  type: 'object', additionalProperties: false, properties: {
    ma: { type: 'string', maxLength: 40 }, ten: { type: 'string', minLength: 1, maxLength: 60 },
    kind: { type: 'string', enum: ['web', 'source', 'reports'] },
    url: { type: ['string', 'null'], maxLength: 500 }, source_system: { type: ['string', 'null'], maxLength: 40 },
    icon: { type: ['string', 'null'], maxLength: 200000 },
    mau: { type: ['string', 'null'], maxLength: 20 }, mo_ta: { type: ['string', 'null'], maxLength: 300 },
    pinned_default: { type: 'boolean' }, is_default: { type: 'boolean' }, enabled: { type: 'boolean' },
  },
} as const;

const reportsFixed = () => new Problem('invalid_params', L('Báo cáo luôn có trong Vala Desktop', 'Reports is always part of Vala Desktop'),
  L('Chỉ đổi được tên, mô tả, biểu tượng, thứ tự, ghim sẵn của ứng dụng Báo cáo', 'You can only change the name, description, icon, order and default pin of the Reports app'));

/** Biểu tượng `lucide:<tên>` phải có trong bộ; màu phải trong bảng màu. */
function checkDisplay(b: AppBody): void {
  if (typeof b.icon === 'string' && b.icon.startsWith('lucide:') && !libraryIconName(b.icon.trim())) {
    throw new Problem('invalid_params', L('Biểu tượng không có trong bộ có sẵn', 'Icon is not in the built-in set'));
  }
  if (b.mau && !isColor(b.mau)) throw new Problem('invalid_params', L('Màu biểu tượng không hợp lệ', 'Invalid icon colour'));
}

/** Lỗi ràng buộc CSDL ⇒ câu dễ hiểu cho quản trị. */
function friendly(e: unknown): never {
  const c = (e as { code?: string; constraint?: string }).constraint ?? '';
  const code = (e as { code?: string }).code;
  if (code === '23505' && c === 'desktop_apps_pkey') throw new Problem('invalid_params', L('Mã ứng dụng đã có', 'This app code already exists'));
  if (code === '23505' && c === 'desktop_apps_one_reports') throw new Problem('invalid_params', L('Đã có ứng dụng Báo cáo', 'A Reports app already exists'));
  if (code === '23505' && c === 'desktop_apps_source') throw new Problem('invalid_params', L('Hệ thống nguồn này đã có trong danh mục', 'This source system is already in the catalog'));
  if (code === '23503') throw new Problem('invalid_params', L('Không có hệ thống nguồn này', 'Source system not found'));
  if (code === '23514') throw new Problem('invalid_params', L('Thông tin ứng dụng chưa hợp lệ', 'Invalid app details'),
    L('Trang web cần địa chỉ http(s); hệ thống nguồn cần chọn hệ thống; biểu tượng chọn từ bộ có sẵn, địa chỉ ảnh hoặc ảnh tải lên; mô tả tối đa 300 ký tự',
      'A web page needs an http(s) address; a source app needs a source system; the icon must come from the built-in set, an image URL or an uploaded image; the description is at most 300 characters'));
  throw e;
}

/** Quản trị đơn vị sửa danh mục (đã kiểm is_ops_admin ở adminRoutes). */
export const adminDesktopAppRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/admin/desktop-apps', async () => withTenant(deps.writer, (t) => listApps(t, false)));

  /** Liên kết mở trong Vala Desktop (tên miền; gồm cả tên miền con). */
  app.get('/admin/desktop-links', async () => withTenant(deps.writer, async (t) =>
    ({ domains: (await t.oneOrNone<{ d: string[] }>('SELECT desktop_open_inside AS d FROM app_settings WHERE id = 1'))?.d ?? [] })));
  app.put<{ Body: { domains: string[] } }>('/admin/desktop-links', {
    schema: { body: { type: 'object', required: ['domains'], additionalProperties: false, properties: {
      domains: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 200 } } } } },
  }, async (req) => {
    const domains = normalizeDomains(req.body.domains);
    const bad = req.body.domains.filter((d) => d.trim() && !domainOf(d));
    if (bad.length) throw new Problem('invalid_params', L('Tên miền không hợp lệ', 'Invalid domain'), bad.join(', '));
    await withTenant(deps.writer, async (t) => {
      // Hàng cấu hình của đơn vị luôn có (migration / dựng đơn vị tạo); pool ghi chỉ có quyền UPDATE trên bảng này.
      await t.none('UPDATE app_settings SET desktop_open_inside = $1, updated_at = now(), updated_by = $2 WHERE id = 1', [domains, req.user.id]);
      await audit(t, req, 'source_change', { type: 'desktop_links' }, { domains });
    });
    return { domains };
  });

  app.post<{ Body: AppBody }>('/admin/desktop-apps', { schema: { body: { ...appBodySchema, required: ['ma', 'ten', 'kind'] } } }, async (req, reply) => {
    const b = req.body;
    if (!MA.test(b.ma!)) throw new Problem('invalid_params', L('Mã ứng dụng: chữ thường, số, gạch dưới; bắt đầu bằng chữ', 'App code: lowercase letters, digits, underscores; starts with a letter'));
    checkDisplay(b);
    const row = await withTenant(deps.writer, async (t) => {
      // Mặc định mới ⇒ bỏ mặc định cũ (chỉ một mục mặc định).
      if (b.is_default) await t.none('UPDATE desktop_apps SET is_default = false WHERE is_default');
      const sort = await t.one<{ s: number }>('SELECT coalesce(max(sort), 0) + 10 AS s FROM desktop_apps WHERE kind <> $1', ['reports']);
      const r = await t.one<DesktopApp>(
        `INSERT INTO desktop_apps (ma, ten, kind, url, source_system, icon, mau, mo_ta, sort, pinned_default, is_default, enabled, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${COLS}`,
        [b.ma, b.ten!.trim(), b.kind, b.kind === 'web' ? b.url?.trim() || null : null, b.kind === 'source' ? b.source_system || null : null,
          b.icon?.trim() || null, b.mau || null, b.mo_ta?.trim() || null, sort.s, b.pinned_default ?? true, b.is_default ?? false, b.enabled ?? true, req.user.id]);
      await audit(t, req, 'source_change', { type: 'desktop_app', id: r.ma }, { op: 'create' });
      return r;
    }).catch(friendly);
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { ma: string }; Body: AppBody }>('/admin/desktop-apps/:ma', { schema: { body: appBodySchema } }, async (req) => {
    const b = req.body;
    checkDisplay(b);
    return withTenant(deps.writer, async (t) => {
      const cur = await t.oneOrNone<DesktopApp>(`SELECT ${COLS} FROM desktop_apps WHERE ma = $1`, [req.params.ma]);
      if (!cur) throw new Problem('not_found', L('Không có ứng dụng này', 'App not found'));
      // Báo cáo luôn đi kèm Vala Desktop (phiên, kết nối nguồn ở đó): đổi tên / biểu tượng / thứ tự được, không tắt, không đổi loại.
      if (cur.kind === 'reports' && ((b.kind && b.kind !== 'reports') || b.enabled === false)) throw reportsFixed();
      if (b.is_default) await t.none('UPDATE desktop_apps SET is_default = false WHERE is_default AND ma <> $1', [cur.ma]);
      const kind = b.kind ?? cur.kind;
      const r = await t.one<DesktopApp>(
        `UPDATE desktop_apps SET ten = $2, kind = $3, url = $4, source_system = $5, icon = $6, pinned_default = $7, is_default = $8,
                enabled = $9, updated_at = now(), updated_by = $10, mau = $11, mo_ta = $12 WHERE ma = $1 RETURNING ${COLS}`,
        [cur.ma, b.ten?.trim() ?? cur.ten, kind,
          kind === 'web' ? (b.url !== undefined ? b.url?.trim() || null : cur.url) : null,
          kind === 'source' ? (b.source_system !== undefined ? b.source_system : cur.source_system) : null,
          b.icon !== undefined ? b.icon?.trim() || null : cur.icon,
          b.pinned_default ?? cur.pinned_default, b.is_default ?? cur.is_default, b.enabled ?? cur.enabled, req.user.id,
          b.mau !== undefined ? b.mau || null : cur.mau, b.mo_ta !== undefined ? b.mo_ta?.trim() || null : cur.mo_ta]);
      await audit(t, req, 'source_change', { type: 'desktop_app', id: r.ma }, { op: 'update' });
      return r;
    }).catch(friendly);
  });

  app.post<{ Body: { ma: string[] } }>('/admin/desktop-apps/order', {
    schema: { body: { type: 'object', required: ['ma'], properties: { ma: { type: 'array', maxItems: 500, items: { type: 'string', maxLength: 40 } } } } },
  }, async (req) => withTenant(deps.writer, async (t) => {
    let i = 0;
    for (const ma of req.body.ma) await t.none('UPDATE desktop_apps SET sort = $2, updated_at = now() WHERE ma = $1', [ma, (i += 10)]);
    await audit(t, req, 'source_change', { type: 'desktop_app', id: '*' }, { op: 'order' });
    return listApps(t, false);
  }));

  app.delete<{ Params: { ma: string } }>('/admin/desktop-apps/:ma', async (req, reply) => {
    await withTenant(deps.writer, async (t) => {
      const kind = await t.oneOrNone<{ kind: string }>('SELECT kind FROM desktop_apps WHERE ma = $1', [req.params.ma]);
      if (kind?.kind === 'reports') throw reportsFixed();
      const r = await t.result('DELETE FROM desktop_apps WHERE ma = $1', [req.params.ma]);
      if (!r.rowCount) throw new Problem('not_found', L('Không có ứng dụng này', 'App not found'));
      await audit(t, req, 'source_change', { type: 'desktop_app', id: req.params.ma }, { op: 'delete' });
    });
    return reply.status(204).send();
  });
};

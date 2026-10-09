/**
 * Báo lỗi / crash của Vala Desktop (người dùng chốt 08/10/2026 — tự gửi, tắt được trong Cài đặt của app):
 *   POST /ext/desktop/errors          lỗi JS / trang chết / treo / cập nhật / kịch bản (token thiết bị, theo lô)
 *   POST /desktop-crash               minidump Crashpad gửi (multipart — Crashpad không kèm header xác thực được: app gửi
 *                                     kèm SHA-256 của token thiết bị để biết máy nào; giới hạn nhịp theo IP, ≤ 5 MB)
 *   GET/DELETE /system/desktop-errors quản trị hệ thống xem / xoá (trang Quản trị → Lỗi Desktop)
 * Lỗi giống nhau gom một dòng (core.desktop_errors.dau_van), đếm số lần. Dữ liệu đã làm sạch (desktop-errors.ts).
 */
import type { FastifyPluginAsync } from 'fastify';
import { L, Problem, currentTenant, isTenantCode, setRequestTenant, withCore, withTenant } from '@vala/core';
import { cleanLoi, fingerprint, parseMultipart, scrub, type LoiGui } from '../desktop-errors.js';
import { takeN } from '../login-target.js';
import type { ApiDeps } from '../deps.js';

const MAX_DUMP = 5 * 1024 * 1024;

async function luu(deps: ApiDeps, e: LoiGui, ai: { tenant: string | null; user: number | null; device: number | null }, dump?: Buffer): Promise<number> {
  // Lỗi kịch bản gom riêng theo đơn vị (mã gói chỉ có nghĩa trong một đơn vị — tình trạng gói ở packageHealth).
  const dau = e.loai === 'kich_ban' ? fingerprint({ ...e, thong_bao: `${ai.tenant ?? ''}|${e.thong_bao}` }) : fingerprint(e);
  const r = await withCore(deps.writer, (t) => t.one<{ id: number }>(
    `INSERT INTO core.desktop_errors (dau_van, loai, phien_ban, he_dieu_hanh, thong_bao, stack, ngu_canh, tenant, user_id, device_id, so_lan, dump, dump_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (dau_van) DO UPDATE SET so_lan = core.desktop_errors.so_lan + EXCLUDED.so_lan, lan_cuoi = now(),
       stack = COALESCE(EXCLUDED.stack, core.desktop_errors.stack), ngu_canh = EXCLUDED.ngu_canh, he_dieu_hanh = EXCLUDED.he_dieu_hanh,
       tenant = EXCLUDED.tenant, user_id = EXCLUDED.user_id, device_id = EXCLUDED.device_id,
       dump = COALESCE(EXCLUDED.dump, core.desktop_errors.dump), dump_bytes = COALESCE(EXCLUDED.dump_bytes, core.desktop_errors.dump_bytes)
     RETURNING id`,
    [dau, e.loai, e.phien_ban, e.he_dieu_hanh, e.thong_bao, e.stack, e.ngu_canh, ai.tenant, ai.user, ai.device, e.so_lan,
     dump ?? null, dump ? dump.length : null]));
  return r.id;
}

/**
 * Tình trạng các gói kịch bản (phiên dịch) của một đơn vị, từ lỗi `kich_ban` Desktop gửi về trong 7 ngày: `loi` (thao tác
 * lỗi / thiếu phụ thuộc / nạp lỗi) hoặc `doi` (trang gốc chỉ đổi phiên bản — nên kiểm). Gói không có ⇒ tốt.
 */
export interface PackageHealth { muc: 'loi' | 'doi'; thong_bao: string; lan_cuoi: Date; so_lan: number }
export async function packageHealth(deps: ApiDeps, tenant: string): Promise<Record<string, PackageHealth>> {
  const rows = await withCore(deps.writer, (t) => t.any<{ goi: string; loi: boolean; thong_bao: string; lan_cuoi: Date; so_lan: number }>(
    `SELECT ngu_canh->>'goi' AS goi,
            bool_or(COALESCE(ngu_canh->>'kieu', 'loi_nap') <> 'doi_phien_ban') AS loi,
            (array_agg(thong_bao ORDER BY (COALESCE(ngu_canh->>'kieu', '') = 'doi_phien_ban'), lan_cuoi DESC))[1] AS thong_bao,
            max(lan_cuoi) AS lan_cuoi, sum(so_lan)::int AS so_lan
       FROM core.desktop_errors
      WHERE loai = 'kich_ban' AND tenant = $1 AND ngu_canh ? 'goi' AND lan_cuoi > now() - interval '7 days'
      GROUP BY 1`, [tenant]));
  return Object.fromEntries(rows.map((r) => [r.goi, { muc: r.loi ? 'loi' : 'doi', thong_bao: r.thong_bao, lan_cuoi: r.lan_cuoi, so_lan: r.so_lan }]));
}

/** Quản trị đã kiểm / sửa gói ⇒ xoá cảnh báo của gói đó (lỗi mới sẽ tạo cảnh báo mới). */
export const clearPackageHealth = (deps: ApiDeps, tenant: string, goi: string) => withCore(deps.writer, (t) => t.none(
  `DELETE FROM core.desktop_errors WHERE loai = 'kich_ban' AND tenant = $1 AND ngu_canh->>'goi' = $2`, [tenant, goi]));

/** /ext/desktop/errors — đăng ký trong extensionRoutes (đã xác thực token thiết bị). */
export const desktopErrorExtRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.post<{ Body: { items: unknown[] } }>('/ext/desktop/errors', {
    bodyLimit: 512 * 1024,
    schema: { body: { type: 'object', required: ['items'], properties: { items: { type: 'array', maxItems: 50 } } } },
  }, async (req) => {
    const ai = { tenant: currentTenant(), user: req.user.id, device: req.extDeviceId ?? null };
    let n = 0;
    for (const raw of req.body.items) {
      const e = cleanLoi(raw);
      if (e) { await luu(deps, e, ai); n++; }
    }
    return { nhan: n };
  });

  /** Quản trị đơn vị: các gói đang lỗi / trang gốc đổi ⇒ Vala Desktop báo (admin-alert.ts). Người dùng thường ⇒ rỗng. */
  app.get('/ext/desktop/package-health', async (req) => {
    if (!req.user.is_ops_admin) return { goi: [] };
    const h = await packageHealth(deps, currentTenant());
    const ten = await withTenant(deps.writer, (t) => t.any<{ code: string; ten: string }>('SELECT code, ten FROM desktop_packages'));
    const byCode = new Map(ten.map((x) => [x.code, x.ten]));
    return { goi: Object.entries(h).map(([code, x]) => ({ code, ten: byCode.get(code) ?? code, ...x })) };
  });
};

/** /desktop-crash — công khai (Crashpad), đăng ký trong nhóm không xác thực. */
export const desktopCrashRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.addContentTypeParser(/^multipart\/form-data/, { parseAs: 'buffer', bodyLimit: MAX_DUMP + 256 * 1024 }, (_req, body, done) => done(null, body));
  app.post('/desktop-crash', async (req, reply) => {
    if (!(await takeN(deps.limiter, `crash:${req.ip}`, 10, 600))) {
      throw new Problem('rate_limited', L('Gửi báo crash quá nhiều', 'Too many crash reports'));
    }
    const boundary = /boundary=("?)([^";]+)\1/.exec(String(req.headers['content-type'] ?? ''))?.[2];
    if (!boundary || !Buffer.isBuffer(req.body)) throw new Problem('invalid_params', L('Báo crash không đúng định dạng', 'Malformed crash report'));
    const { fields, files } = parseMultipart(req.body, boundary);
    const dump = files.upload_file_minidump?.data;
    // Máy nào: SHA-256 của token thiết bị (máy chủ chỉ lưu đúng giá trị băm này — biết nó không đăng nhập được).
    let ai: { tenant: string | null; user: number | null; device: number | null } = { tenant: null, user: null, device: null };
    const tnt = fields.vala_tenant;
    const dev = fields.vala_device;
    if (isTenantCode(tnt) && dev && /^[0-9a-f]{64}$/.test(dev)) {
      const ok = await withCore(deps.writer, (t) => t.oneOrNone(`SELECT 1 FROM core.tenants WHERE ma = $1 AND status = 'hoat_dong'`, [tnt]));
      if (ok) {
        setRequestTenant(tnt);
        const d = await withTenant(deps.writer, (t) => t.oneOrNone<{ id: number; app_user_id: number }>(
          `SELECT id, app_user_id FROM extension_devices WHERE token_hash = decode($1, 'hex') AND revoked_at IS NULL`, [dev]));
        ai = { tenant: tnt, user: d?.app_user_id ?? null, device: d?.id ?? null };
      }
    }
    const loai = cleanLoi({
      loai: 'crash',
      thong_bao: `Crash tiến trình ${fields.process_type || fields.ptype || '?'}${fields.reason ? ` (${fields.reason})` : ''}`,
      phien_ban: fields.ver || fields._version || '?',
      he_dieu_hanh: [fields.platform || fields.plat || '', fields.os_version || ''].filter(Boolean).join(' ') || '?',
      ngu_canh: Object.fromEntries(Object.entries(fields).filter(([k]) => !/^vala_/.test(k)).map(([k, v]) => [k, scrub(v)])),
    });
    const id = await luu(deps, loai!, ai, dump && dump.length <= MAX_DUMP ? dump : undefined);
    // Crashpad đọc thân trả về làm mã báo cáo.
    return reply.type('text/plain').send(String(id));
  });
};

/** /system/desktop-errors — quản trị hệ thống (đăng ký trong nhóm đã xác thực). */
export const desktopErrorSystemRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/v1/system/desktop-errors')) return;
    if (!req.user?.is_system_admin) throw new Problem('forbidden', L('Chỉ dành cho quản trị hệ thống', 'System administrators only'));
  });
  const notFound = () => new Problem('not_found', L('Không có lỗi này', 'Error not found'));

  app.get<{ Querystring: { loai?: string; phien_ban?: string } }>('/system/desktop-errors', async (req) => {
    const rows = await withCore(deps.writer, (t) => t.any(
      `SELECT e.id, e.loai, e.phien_ban, e.he_dieu_hanh, e.thong_bao, e.so_lan, e.lan_dau, e.lan_cuoi, e.tenant, e.dump_bytes,
              t.ten AS tenant_ten
         FROM core.desktop_errors e LEFT JOIN core.tenants t ON t.ma = e.tenant
        WHERE ($1::text IS NULL OR e.loai = $1) AND ($2::text IS NULL OR e.phien_ban = $2)
        ORDER BY e.lan_cuoi DESC LIMIT 500`, [req.query.loai || null, req.query.phien_ban || null]));
    const phien_ban = await withCore(deps.writer, (t) => t.map('SELECT DISTINCT phien_ban FROM core.desktop_errors ORDER BY phien_ban DESC', [], (r: { phien_ban: string }) => r.phien_ban));
    return { loi: rows, phien_ban };
  });

  app.get<{ Params: { id: string } }>('/system/desktop-errors/:id', async (req) => {
    const r = await withCore(deps.writer, (t) => t.oneOrNone<Record<string, unknown> & { tenant: string | null; user_id: number | null }>(
      `SELECT id, loai, phien_ban, he_dieu_hanh, thong_bao, stack, ngu_canh, tenant, user_id, device_id, so_lan, lan_dau, lan_cuoi, dump_bytes
         FROM core.desktop_errors WHERE id = $1`, [Number(req.params.id) || 0]));
    if (!r) throw notFound();
    // Người gặp lỗi gần nhất (tên + email) — tra trong schema của đơn vị đó.
    let nguoi: { ho_ten: string; email: string } | null = null;
    if (r.tenant && r.user_id && isTenantCode(r.tenant)) {
      setRequestTenant(r.tenant);
      nguoi = await withTenant(deps.writer, (t) => t.oneOrNone('SELECT ho_ten, email FROM app_users WHERE id = $1', [r.user_id]));
    }
    return { ...r, nguoi };
  });

  app.get<{ Params: { id: string } }>('/system/desktop-errors/:id/dump', async (req) => {
    const r = await withCore(deps.writer, (t) => t.oneOrNone<{ dump: Buffer | null; phien_ban: string }>(
      'SELECT dump, phien_ban FROM core.desktop_errors WHERE id = $1', [Number(req.params.id) || 0]));
    if (!r?.dump) throw notFound();
    return { ten: `vala-desktop-${r.phien_ban}-${req.params.id}.dmp`, base64: r.dump.toString('base64') };
  });

  app.delete<{ Params: { id: string } }>('/system/desktop-errors/:id', async (req, reply) => {
    await withCore(deps.writer, (t) => t.none('DELETE FROM core.desktop_errors WHERE id = $1', [Number(req.params.id) || 0]));
    return reply.status(204).send();
  });
};

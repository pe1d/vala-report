/**
 * Cấu hình chung của đơn vị triển khai — tên ứng dụng, tên đơn vị, dòng mô tả, logo, màu chủ đạo, tên hiển thị của
 * SSO. Không gắn cứng với Bkav: mỗi nơi triển khai tự đặt trên cổng (Quản trị → Cấu hình chung).
 *   GET  /branding          công khai (trang đăng nhập cần trước khi đăng nhập) — không chứa bí mật
 *   GET  /admin/settings    quản trị
 *   PUT  /admin/settings    quản trị (có audit)
 */
import type { FastifyPluginAsync } from 'fastify';
import { Problem, withTenant } from '@vala/core';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';

export interface Branding {
  ten_ung_dung: string; ten_don_vi: string | null; mo_ta: string | null; logo: string | null; mau_chu_dao: string; ten_sso: string;
  updated_at: string;
}
const COLS = 'ten_ung_dung, ten_don_vi, mo_ta, logo, mau_chu_dao, ten_sso, updated_at';
const LOGO = /^data:image\/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/;
/** Giới hạn ~300 KB ảnh gốc (data URL base64 dài hơn ~4/3). */
const LOGO_MAX = 400_000;

const loadBranding = (deps: ApiDeps) => withTenant(deps.reader, (t) => t.one<Branding>(`SELECT ${COLS} FROM app_settings WHERE id = 1`));

/** Công khai: chỉ đọc. */
export const brandingRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/branding', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return loadBranding(deps);
  });
};

type SettingsBody = Partial<Omit<Branding, 'updated_at'>>;
const text = (max: number) => ({ type: ['string', 'null'], maxLength: max });

/** Quản trị (đường dẫn /admin/* — đã chặn người không phải quản trị ở adminRoutes). */
export const adminSettingsRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/admin/settings', async () => loadBranding(deps));

  app.put<{ Body: SettingsBody }>('/admin/settings', {
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      ten_ung_dung: { type: 'string', minLength: 1, maxLength: 60 }, ten_don_vi: text(120), mo_ta: text(160),
      logo: { type: ['string', 'null'], maxLength: LOGO_MAX }, mau_chu_dao: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      ten_sso: { type: 'string', minLength: 1, maxLength: 40 },
    } } },
  }, async (req) => {
    const b = req.body;
    if (b.logo && !LOGO.test(b.logo)) throw new Problem('invalid_params', 'Logo không hợp lệ', 'Chỉ nhận ảnh PNG, JPEG, SVG hoặc WebP');
    const trim = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.trim() || null);
    const sets: string[] = [];
    const vals: unknown[] = [];
    const put = (col: keyof SettingsBody, v: unknown) => { if (v !== undefined) { vals.push(v); sets.push(`${col} = $${vals.length}`); } };
    put('ten_ung_dung', b.ten_ung_dung?.trim());
    put('ten_don_vi', trim(b.ten_don_vi));
    put('mo_ta', trim(b.mo_ta));
    put('logo', b.logo);
    put('mau_chu_dao', b.mau_chu_dao?.toLowerCase());
    put('ten_sso', b.ten_sso?.trim());
    if (!sets.length) return loadBranding(deps);
    vals.push(req.user.id);
    await withTenant(deps.writer, async (t) => {
      await t.none(`UPDATE app_settings SET ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length} WHERE id = 1`, vals);
      // Không ghi cả ảnh logo vào nhật ký — chỉ ghi là có đổi.
      await audit(t, req, 'source_change', { type: 'app_settings', id: '1' },
        { ...b, ...(b.logo !== undefined ? { logo: b.logo ? `(ảnh ${Math.round(b.logo.length / 1024)} KB)` : null } : {}) });
    });
    return loadBranding(deps);
  });
};

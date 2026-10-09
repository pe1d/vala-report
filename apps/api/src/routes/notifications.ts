/**
 * Trung tâm thông báo (09/10/2026) — thông báo của từng người dùng, gom từ Vala và các ứng dụng tích hợp. Token thiết bị
 * (Vala Desktop); mỗi người chỉ thấy / sửa thông báo của chính mình (app_user_id = người gọi).
 *   GET  /ext/notifications                 danh sách (lọc: trang_thai cho_xu_ly | tat_ca, ung_dung) + số đếm
 *   POST /ext/notifications                 đẩy thông báo vào (kịch bản của Desktop / bản dev tạo mẫu) — chống trùng nguon_id
 *   POST /ext/notifications/mark            đánh dấu đã đọc / đã xử lý (hoặc ngược lại) theo danh sách id
 *   POST /ext/notifications/clear           xoá (ẩn) theo id, hoặc mọi thông báo đã xử lý
 */
import type { FastifyPluginAsync } from 'fastify';
import { L, Problem, withTenant } from '@vala/core';
import type { ApiDeps } from '../deps.js';

export interface Notification {
  id: string; ung_dung: string; tieu_de: string; noi_dung: string | null; link: string | null;
  quan_trong: boolean; da_doc: boolean; da_xu_ly: boolean; luc: string;
}
const COLS = 'id::text AS id, ung_dung, tieu_de, noi_dung, link, quan_trong, da_doc, da_xu_ly, luc';
const MA = '^[a-z][a-z0-9_]{1,39}$';
const ids = { type: 'array', maxItems: 500, items: { type: 'string', pattern: '^[0-9]{1,18}$' } } as const;

export const notificationExtRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get<{ Querystring: { trang_thai?: string; ung_dung?: string; limit?: number } }>('/ext/notifications', {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      trang_thai: { type: 'string', enum: ['cho_xu_ly', 'tat_ca'] }, ung_dung: { type: 'string', pattern: MA },
      limit: { type: 'integer', minimum: 1, maximum: 500 } } } },
  }, async (req) => withTenant(deps.writer, async (t) => {
    const uid = req.user.id;
    const cho = (req.query.trang_thai ?? 'cho_xu_ly') === 'cho_xu_ly';
    const items = await t.any<Notification>(
      `SELECT ${COLS} FROM notifications
        WHERE app_user_id = $1 AND xoa_luc IS NULL AND ($2::boolean = false OR NOT da_xu_ly) AND ($3::text IS NULL OR ung_dung = $3)
        ORDER BY luc DESC, id DESC LIMIT $4`, [uid, cho, req.query.ung_dung ?? null, req.query.limit ?? 200]);
    // Số đếm cho chuông + bộ lọc: chờ xử lý (tổng / theo ứng dụng), chưa đọc, đã xử lý (để "Xoá tất cả đã xử lý").
    const counts = await t.any<{ ung_dung: string; cho: number; chua_doc: number; da_xu_ly: number }>(
      `SELECT ung_dung, count(*) FILTER (WHERE NOT da_xu_ly)::int AS cho, count(*) FILTER (WHERE NOT da_doc AND NOT da_xu_ly)::int AS chua_doc,
              count(*) FILTER (WHERE da_xu_ly)::int AS da_xu_ly
         FROM notifications WHERE app_user_id = $1 AND xoa_luc IS NULL GROUP BY ung_dung`, [uid]);
    return {
      items,
      dem: {
        cho_xu_ly: counts.reduce((n, c) => n + c.cho, 0),
        chua_doc: counts.reduce((n, c) => n + c.chua_doc, 0),
        da_xu_ly: counts.reduce((n, c) => n + c.da_xu_ly, 0),
        theo_ung_dung: Object.fromEntries(counts.map((c) => [c.ung_dung, { cho: c.cho, chua_doc: c.chua_doc }])),
      },
    };
  }));

  app.post<{ Body: { items: Array<{ ung_dung: string; nguon_id?: string | null; tieu_de: string; noi_dung?: string | null; link?: string | null; quan_trong?: boolean; da_xu_ly?: boolean; luc?: string | null }> } }>('/ext/notifications', {
    schema: { body: { type: 'object', required: ['items'], additionalProperties: false, properties: {
      items: { type: 'array', maxItems: 200, items: { type: 'object', required: ['ung_dung', 'tieu_de'], additionalProperties: false, properties: {
        ung_dung: { type: 'string', pattern: MA }, nguon_id: { type: ['string', 'null'], maxLength: 200 },
        tieu_de: { type: 'string', minLength: 1, maxLength: 300 }, noi_dung: { type: ['string', 'null'], maxLength: 2000 },
        link: { type: ['string', 'null'], maxLength: 2000, pattern: '^https?://\\S+$' }, quan_trong: { type: 'boolean' }, da_xu_ly: { type: 'boolean' },
        luc: { type: ['string', 'null'], format: 'date-time' } } } } } } },
  }, async (req) => withTenant(deps.writer, async (t) => {
    let moi = 0;
    for (const n of req.body.items) {
      // Đã có (cùng ứng dụng + nguon_id) ⇒ cập nhật nội dung / trạng thái xử lý bên nguồn; giữ đã đọc, đã xoá của người dùng.
      const r = await t.oneOrNone<{ inserted: boolean }>(
        `INSERT INTO notifications (app_user_id, ung_dung, nguon_id, tieu_de, noi_dung, link, quan_trong, da_xu_ly, luc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()))
         ON CONFLICT (app_user_id, ung_dung, nguon_id) WHERE nguon_id IS NOT NULL DO UPDATE
           SET tieu_de = EXCLUDED.tieu_de, noi_dung = EXCLUDED.noi_dung, link = EXCLUDED.link, quan_trong = EXCLUDED.quan_trong,
               da_xu_ly = notifications.da_xu_ly OR EXCLUDED.da_xu_ly, updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [req.user.id, n.ung_dung, n.nguon_id ?? null, n.tieu_de.trim(), n.noi_dung?.trim() || null, n.link || null, n.quan_trong ?? false, n.da_xu_ly ?? false, n.luc ?? null]);
      if (r?.inserted) moi++;
    }
    return { moi };
  }));

  app.post<{ Body: { ids: string[]; da_doc?: boolean; da_xu_ly?: boolean } }>('/ext/notifications/mark', {
    schema: { body: { type: 'object', required: ['ids'], additionalProperties: false, properties: { ids, da_doc: { type: 'boolean' }, da_xu_ly: { type: 'boolean' } } } },
  }, async (req) => {
    const { da_doc, da_xu_ly } = req.body;
    if (da_doc === undefined && da_xu_ly === undefined) throw new Problem('invalid_params', L('Thiếu trạng thái cần đổi', 'Nothing to change'));
    return withTenant(deps.writer, async (t) => {
      // Đã xử lý ⇒ cũng coi như đã đọc.
      const r = await t.result(
        `UPDATE notifications SET da_doc = coalesce($3, CASE WHEN $4 THEN true ELSE da_doc END), da_xu_ly = coalesce($4, da_xu_ly), updated_at = now()
          WHERE app_user_id = $1 AND id = ANY($2::bigint[]) AND xoa_luc IS NULL`, [req.user.id, req.body.ids, da_doc ?? null, da_xu_ly ?? null]);
      return { so: r.rowCount };
    });
  });

  app.post<{ Body: { ids?: string[]; da_xu_ly?: boolean } }>('/ext/notifications/clear', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { ids, da_xu_ly: { type: 'boolean' } } } },
  }, async (req) => {
    if (!req.body.ids?.length && !req.body.da_xu_ly) throw new Problem('invalid_params', L('Chọn thông báo cần xoá', 'Choose notifications to clear'));
    return withTenant(deps.writer, async (t) => {
      const r = req.body.ids?.length
        ? await t.result('UPDATE notifications SET xoa_luc = now() WHERE app_user_id = $1 AND id = ANY($2::bigint[]) AND xoa_luc IS NULL', [req.user.id, req.body.ids])
        : await t.result('UPDATE notifications SET xoa_luc = now() WHERE app_user_id = $1 AND da_xu_ly AND xoa_luc IS NULL', [req.user.id]);
      return { so: r.rowCount };
    });
  });
};

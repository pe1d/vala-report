/**
 * Khu quản trị (is_ops_admin):
 *   - Kết nối dữ liệu: cấu hình hộ người dùng (tài khoản/mật khẩu hoặc cookie hệ thống nguồn).
 *   - Script crawl: thêm/sửa mã spider trên cổng (lưu CSDL), đồng bộ lên Crawlab, chạy thử cho một người.
 * Bí mật chỉ vào vault; không endpoint nào trả lại mật khẩu hay cookie.
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  getSpider, L, langOf, launchSpider, localizeStored, Problem, spiderMainPy, syncCrawlab, withTenant,
} from '@vala/core';
import { audit } from '../audit.js';
import { configureConnection, connectionBodySchema, deleteConnection, listConnections, testConnection, type ConnectionBody } from '../connections.js';
import type { ApiDeps } from '../deps.js';
import { adminDesktopRoutes } from './adminDesktop.js';
import { adminDesktopAppRoutes } from './desktopApps.js';
import { adminReportRoutes } from './adminReports.js';
import { adminSourceRoutes } from './adminSources.js';
import { adminUserRoutes } from './adminUsers.js';
import { adminSettingsRoutes } from './settings.js';

interface SpiderBody {
  ten: string; mo_ta?: string | null; source_system: string;
  entity?: 'records'; is_enabled?: boolean; main_py: string;
}
const spiderBodySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    ten: { type: 'string', minLength: 1, maxLength: 200 },
    mo_ta: { type: ['string', 'null'], maxLength: 1000 },
    source_system: { type: 'string', minLength: 1, maxLength: 64 },
    entity: { type: 'string', enum: ['records'] },
    is_enabled: { type: 'boolean' },
    main_py: { type: 'string', minLength: 1, maxLength: 200_000 },
  },
} as const;

/** Lỗi ràng buộc CSDL ⇒ thông báo dễ hiểu cho quản trị (trùng mã, sai hệ thống nguồn, sai loại dữ liệu). */
function spiderDbError(e: { code?: string; constraint?: string }): never {
  if (e.code === '23505') throw new Problem('invalid_params', L('Mã spider đã tồn tại', 'Spider code already exists'));
  if (e.code === '23503') throw new Problem('invalid_params', L('Không có hệ thống nguồn này', 'Source system not found'));
  if (e.code === '23514') throw new Problem('invalid_params', L('Dữ liệu spider không hợp lệ', 'Invalid spider data'), e.constraint);
  throw e;
}

export const adminRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/v1/admin/')) return;
    if (!req.user?.is_ops_admin) throw new Problem('forbidden', L('Chỉ dành cho quản trị', 'Admins only'));
  });

  await app.register(adminSourceRoutes(deps));                 // hệ thống nguồn (thêm/sửa)
  await app.register(adminReportRoutes(deps));                 // cấu hình báo cáo (không viết code)
  await app.register(adminUserRoutes(deps));                   // người dùng cổng
  await app.register(adminSettingsRoutes(deps));               // cấu hình chung: tên, logo, màu, tên SSO
  await app.register(adminDesktopRoutes(deps));                // gói kịch bản Vala Desktop
  await app.register(adminDesktopAppRoutes(deps));             // danh mục ứng dụng Vala Desktop của đơn vị

  // ---- kết nối dữ liệu ----
  app.get('/admin/connections', async (req) => listConnections(deps, undefined, langOf(req.headers['accept-language'])));

  app.put<{ Params: { userId: string; source: string }; Body: ConnectionBody }>('/admin/connections/:userId/:source', {
    schema: { body: connectionBodySchema },
  }, async (req) => {
    const userId = Number(req.params.userId);
    const u = await withTenant(deps.writer, (t) => t.oneOrNone('SELECT 1 FROM app_users WHERE id = $1 AND is_active', [userId]));
    if (!u) throw new Problem('not_found', L('Không có người dùng này', 'User not found'));
    const r = await configureConnection(deps, req, userId, req.params.source, req.body);
    return { app_user_id: userId, source_system: req.params.source, auth_method: req.body.auth_method, ...r };
  });

  app.post<{ Params: { userId: string; source: string } }>('/admin/connections/:userId/:source/test',
    async (req) => testConnection(deps, Number(req.params.userId), req.params.source, langOf(req.headers['accept-language'])));

  app.delete<{ Params: { userId: string; source: string } }>('/admin/connections/:userId/:source', async (req, reply) => {
    await deleteConnection(deps, req, Number(req.params.userId), req.params.source);
    return reply.status(204).send();
  });

  // ---- script crawl (Crawlab) ----
  app.get('/admin/spiders', async () => {
    const spiders = await withTenant(deps.writer, (t) => t.any(
      `SELECT sp.code, sp.ten, sp.mo_ta, sp.source_system, ss.ten AS source_ten, sp.entity, sp.is_enabled,
              sp.crawlab_spider_id, sp.synced_at,
              (SELECT count(*)::int FROM spider_schedules sc WHERE sc.spider_code = sp.code AND sc.crawlab_schedule_id IS NOT NULL) AS schedules,
              (SELECT count(DISTINCT ds.app_user_id)::int FROM data_schedules ds WHERE ds.spider_code = sp.code AND ds.is_enabled) AS subscribers,
              (SELECT json_build_object('status', r.status, 'started_at', r.started_at, 'error_code', r.error_code)
                 FROM crawl_runs r WHERE r.spider_code = sp.code ORDER BY r.started_at DESC LIMIT 1) AS last_run
         FROM crawl_spiders sp JOIN source_systems ss ON ss.code = sp.source_system
        ORDER BY sp.code`));
    return { crawlab_url: deps.config.crawlabWebUrl ?? null, crawlab_configured: !!deps.crawlab, spiders };
  });

  app.post('/admin/spiders/sync', async () => {
    if (!deps.crawlab) throw new Problem('internal', L('Chưa cấu hình Crawlab', 'Crawlab is not configured'), L('Đặt CRAWLAB_URL trong .env', 'Set CRAWLAB_URL in .env'));
    try {
      return await syncCrawlab(deps.writer, deps.crawlab, { apiUrlForSpiders: deps.config.spiderApiUrl, internalToken: deps.config.internalToken });
    } catch (e) {
      // Hiện đúng nguyên nhân cho quản trị (vd dịch vụ file của Crawlab chưa sẵn sàng sau khi khởi động).
      const m = (e as Error).message.slice(0, 400);
      throw new Problem('internal', L('Đồng bộ Crawlab không thành công', 'Crawlab sync failed'), L(m, localizeStored(m, 'en')));
    }
  });

  // Mã spider nằm trong CSDL: quản trị viết/sửa ngay trên cổng, thêm hệ thống nguồn mới không cần sửa code.
  // main_py là mã Python chạy trên Crawlab — chỉ quản trị vận hành (hook ở trên), mọi lần sửa ghi audit.
  app.get<{ Params: { code: string } }>('/admin/spiders/:code', async (req) => {
    const s = await getSpider(deps.writer, req.params.code);
    const main = spiderMainPy(s);
    return { code: s.code, ten: s.ten, mo_ta: s.mo_ta ?? null, source_system: s.source_system, entity: s.entity,
      is_enabled: s.is_enabled, main_py: main ?? '', from_repo: !s.main_py && !!main };
  });

  app.post<{ Body: SpiderBody & { code: string } }>('/admin/spiders', {
    schema: { body: { ...spiderBodySchema, required: ['code', 'ten', 'source_system', 'main_py'],
      properties: { ...spiderBodySchema.properties, code: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,62}$' } } } },
  }, async (req, reply) => {
    const b = req.body;
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `INSERT INTO crawl_spiders (code, ten, mo_ta, source_system, entity, is_enabled, main_py, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [b.code, b.ten, b.mo_ta ?? null, b.source_system, 'records', b.is_enabled ?? true, b.main_py, req.user.id]).catch(spiderDbError);
      await audit(t, req, 'source_change', { type: 'spider', id: b.code }, { op: 'create', source_system: b.source_system });
    });
    return reply.status(201).send({ code: b.code, note: langOf(req.headers['accept-language']) === 'en'
      ? 'Click "Sync Crawlab" to push the spider to Crawlab and create its schedules.'
      : 'Bấm "Đồng bộ Crawlab" để đẩy spider lên Crawlab và tạo lịch.' });
  });

  app.patch<{ Params: { code: string }; Body: Partial<SpiderBody> }>('/admin/spiders/:code', {
    schema: { body: spiderBodySchema },
  }, async (req) => {
    const cur = await getSpider(deps.writer, req.params.code);
    const b = req.body;
    await withTenant(deps.writer, async (t) => {
      await t.none(
        `UPDATE crawl_spiders SET ten = $2, mo_ta = $3, entity = $4, is_enabled = $5, main_py = $6,
                updated_at = now(), updated_by = $7 WHERE code = $1`,
        [cur.code, b.ten ?? cur.ten, b.mo_ta !== undefined ? b.mo_ta : cur.mo_ta ?? null, b.entity ?? cur.entity,
         b.is_enabled ?? cur.is_enabled, b.main_py !== undefined ? b.main_py : cur.main_py ?? null, req.user.id]).catch(spiderDbError);
      if (b.main_py !== undefined) await audit(t, req, 'source_change', { type: 'spider', id: cur.code }, { op: 'edit_code', bytes: b.main_py.length });
    });
    return { code: cur.code, note: langOf(req.headers['accept-language']) === 'en'
      ? 'Saved. Click "Sync Crawlab" to apply it on Crawlab.'
      : 'Đã lưu. Bấm "Đồng bộ Crawlab" để áp dụng lên Crawlab.' };
  });

  /** Chạy thử spider cho một người dùng ngay bây giờ (không cần người đó đặt lịch). */
  app.post<{ Params: { code: string }; Body: { user_id: number } }>('/admin/spiders/:code/run', {
    schema: { body: { type: 'object', required: ['user_id'], properties: { user_id: { type: 'integer' } } } },
  }, async (req, reply) => {
    if (!deps.crawlab) throw new Problem('internal', L('Chưa cấu hình Crawlab', 'Crawlab is not configured'));
    const sp = await getSpider(deps.writer, req.params.code);
    if (!sp.crawlab_spider_id) throw new Problem('invalid_params', L('Spider chưa đồng bộ lên Crawlab', 'Spider has not been synced to Crawlab'), L('Bấm "Đồng bộ Crawlab" trước', 'Click "Sync Crawlab" first'));
    const tasks = await launchSpider(deps.writer, deps.crawlab, { spiderCode: sp.code, userId: req.body.user_id, trigger: 'manual' });
    return reply.status(202).send({ crawlab_task_ids: tasks });
  });
};

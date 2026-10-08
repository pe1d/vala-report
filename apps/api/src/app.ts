import Fastify, { type FastifyError } from 'fastify';
import { Problem, langOf, tenantStatus } from '@vala/core';
import { authenticate } from './auth.js';
import { installTenantHook } from './tenant-hook.js';
import type { ApiDeps } from './deps.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { extensionDeviceRoutes, extensionLoginRoutes, extensionRoutes } from './routes/extension.js';
import { grantRoutes } from './routes/grants.js';
import { internalRoutes } from './routes/internal.js';
import { meRoutes } from './routes/me.js';
import { myConnectionRoutes } from './routes/myConnections.js';
import { opsRoutes } from './routes/ops.js';
import { reportRoutes } from './routes/reports.js';
import { ssoRoutes } from './routes/sso.js';
import { dataScheduleRoutes } from './routes/dataSchedules.js';
import { brandingRoutes } from './routes/settings.js';

export async function buildApp(deps: ApiDeps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ? {
      level: 'info',
      // Không bao giờ log header Authorization/Cookie.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    } : false,
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  // Mỗi request chạy trong ngữ cảnh một đơn vị (theo token) — trước mọi hook / route khác.
  installTenantHook(app, { jwtSecret: deps.config.jwtSecret, internalToken: deps.config.internalToken,
    status: (ma) => tenantStatus(deps.writer, ma) });

  // Lỗi theo RFC 7807. Problem ⇒ đúng mã; lỗi validate của Fastify ⇒ 422; còn lại ⇒ 500 không lộ chi tiết.
  app.setErrorHandler((err: FastifyError | Problem, req, reply) => {
    const lang = langOf(req.headers['accept-language']);
    if (err instanceof Problem) {
      return reply.status(err.status).type('application/problem+json').send(err.toJSON(lang));
    }
    if ((err as FastifyError).validation) {
      return reply.status(422).type('application/problem+json').send({
        type: 'invalid_params', title: lang === 'en' ? 'Invalid request' : 'Yêu cầu không hợp lệ', status: 422, detail: err.message,
      });
    }
    req.log?.error({ err }, 'lỗi không xử lý');
    return reply.status(500).type('application/problem+json').send({ type: 'internal', title: lang === 'en' ? 'System error' : 'Lỗi hệ thống', status: 500 });
  });

  app.get('/healthz', async () => ({ ok: true }));

  await app.register(async (pub) => {
    await pub.register(authRoutes(deps));                       // đăng nhập bằng mật khẩu + đổi mật khẩu
    await pub.register(brandingRoutes(deps));                   // tên / logo / màu của đơn vị (trang đăng nhập cần)
    // Luôn đăng ký: mỗi đơn vị tự có (hoặc không) SSO — /auth/sso/start báo lỗi rõ cho đơn vị chưa cấu hình.
    await pub.register(ssoRoutes(deps));
    await pub.register(extensionLoginRoutes(deps));             // tiện ích trình duyệt đăng nhập
  }, { prefix: '/api/v1' });

  // Tiện ích trình duyệt: token thiết bị riêng, không dùng chung với token cổng.
  await app.register(extensionRoutes(deps), { prefix: '/api/v1' });

  await app.register(async (api) => {
    api.addHook('onRequest', authenticate(deps));
    await api.register(meRoutes(deps));
    await api.register(myConnectionRoutes(deps));                // người dùng tự cấp tài khoản nguồn
    await api.register(extensionDeviceRoutes(deps));
    await api.register(grantRoutes(deps));
    await api.register(reportRoutes(deps));
    await api.register(dashboardRoutes(deps));                  // Tổng quan + lấy dữ liệu ngay
    await api.register(dataScheduleRoutes(deps));
    await api.register(opsRoutes(deps));
    await api.register(adminRoutes(deps));                      // cấu hình kết nối crawl (chỉ quản trị)
  }, { prefix: '/api/v1' });

  await app.register(internalRoutes(deps), { prefix: '/internal' });
  return app;
}

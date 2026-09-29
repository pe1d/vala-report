/**
 * Người dùng tự cấp tài khoản hệ thống nguồn cho chính mình, để hệ thống crawl thay mà không bắt họ
 * đăng nhập mỗi lần: dán cookie/phiên, hoặc nhập tài khoản/mật khẩu (hệ thống tự đăng nhập lấy phiên).
 * Chỉ tác động lên kết nối của CHÍNH người gọi (userId lấy từ token, không nhận từ request).
 */
import type { FastifyPluginAsync } from 'fastify';
import { configureConnection, connectionBodySchema, deleteConnection, listConnections, testConnection, type ConnectionBody } from '../connections.js';
import type { ApiDeps } from '../deps.js';

export const myConnectionRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/me/connections', async (req) => listConnections(deps, req.user.id));

  app.put<{ Params: { source: string }; Body: ConnectionBody }>('/me/connections/:source', {
    schema: { body: connectionBodySchema },
  }, async (req) => ({
    source_system: req.params.source, auth_method: req.body.auth_method,
    ...(await configureConnection(deps, req, req.user.id, req.params.source, req.body)),
  }));

  app.post<{ Params: { source: string } }>('/me/connections/:source/test', async (req) => testConnection(deps, req.user.id, req.params.source));

  app.delete<{ Params: { source: string } }>('/me/connections/:source', async (req, reply) => {
    await deleteConnection(deps, req, req.user.id, req.params.source);
    return reply.status(204).send();
  });
};

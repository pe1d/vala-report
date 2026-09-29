/**
 * API cho spider Python trong Crawlab (qua crawlers/_sdk/vala_sdk.py). Đăng ký bên trong /internal
 * nên đã có kiểm tra internal token. Không mở ra người dùng cuối.
 *
 *   POST /internal/spider/runs                      bắt đầu: danh sách người dùng cần crawl
 *   POST /internal/spider/runs/:id/session          cookie phiên (backend tự lấy phiên mới khi cần)
 *   POST /internal/spider/runs/:id/account          định danh người dùng bên hệ thống nguồn
 *   POST /internal/spider/runs/:id/records          bản ghi thô → kho
 *   POST /internal/spider/runs/:id/finish           kết thúc lượt chạy của một người
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  finishSpiderRun, spiderAccount, spiderRecords, spiderSession, startSpiderRun, type FinishRequest, type RecordsRequest,
} from '@vala/core';
import type { ApiDeps } from '../deps.js';

export const spiderInternalRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  const sd = { writer: deps.writer, secrets: deps.secrets, connections: deps.connections, sourceInfo: deps.sourceInfo };
  const runId = (p: { id: string }) => Number(p.id);

  app.post<{ Body: { spider: string; preset?: string; user_id?: number; crawlab_task_id?: string } }>('/runs', {
    schema: { body: { type: 'object', required: ['spider'], properties: {
      spider: { type: 'string' }, preset: { type: 'string' }, user_id: { type: 'integer' }, crawlab_task_id: { type: ['string', 'null'] } } } },
  }, async (req) => startSpiderRun(sd, {
    spider: req.body.spider, preset: req.body.preset, userId: req.body.user_id, crawlabTaskId: req.body.crawlab_task_id ?? undefined,
  }));

  app.post<{ Params: { id: string }; Body: { refresh?: boolean } }>('/runs/:id/session', async (req) => {
    const s = await spiderSession(sd, runId(req.params), { refresh: !!req.body?.refresh });
    // Ghi nhận cấp phiên (không ghi giá trị cookie).
    req.log.info({ run: runId(req.params), renewed: s.renewed }, 'cấp phiên cho spider');
    return s;
  });

  app.post<{ Params: { id: string }; Body: { source_user_id: string } }>('/runs/:id/account', {
    schema: { body: { type: 'object', required: ['source_user_id'], properties: { source_user_id: { type: 'string' } } } },
  }, async (req, reply) => {
    await spiderAccount(sd, runId(req.params), req.body.source_user_id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string }; Body: RecordsRequest }>('/runs/:id/records', {
    bodyLimit: 20 * 1024 * 1024,
    schema: { body: { type: 'object', required: ['capability', 'items'], properties: {
      capability: { type: 'string' }, items: { type: 'array' }, context: { type: 'object' }, meta: { type: 'object' } } } },
  }, async (req) => spiderRecords(sd, runId(req.params), req.body));

  app.post<{ Params: { id: string }; Body: FinishRequest }>('/runs/:id/finish', {
    schema: { body: { type: 'object', required: ['status'], properties: {
      status: { type: 'string', enum: ['ok', 'failed'] }, error_code: { type: ['string', 'null'] },
      error_detail: { type: ['string', 'null'] }, http_calls: { type: 'integer' } } } },
  }, async (req) => finishSpiderRun(sd, runId(req.params), {
    ...req.body, error_code: req.body.error_code ?? undefined, error_detail: req.body.error_detail ?? undefined,
  }));
};

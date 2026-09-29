import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Problem, fanOut, isPreset, withTenant } from '@vala/core';
import type { ApiDeps } from '../deps.js';
import { spiderInternalRoutes } from './spider.js';

/** Chỉ Crawlab gọi. Không mở qua nginx ra người dùng cuối. */
export const internalRoutes = (deps: ApiDeps) => {
  const plugin: FastifyPluginAsync = async (app) => {
    app.addHook('onRequest', async (req) => {
      const got = Buffer.from(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '');
      const want = Buffer.from(deps.config.internalToken);
      if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Problem('unauthenticated', 'Sai internal token');
    });

    await app.register(spiderInternalRoutes(deps), { prefix: '/spider' });

    app.post<{ Body: { source: string; capability: string; preset: string; crawlab_task_id?: string; crawlab_run_id?: string } }>(
      '/crawl/fan-out', {
        schema: { body: { type: 'object', required: ['source', 'capability', 'preset'], properties: {
          source: { type: 'string' }, capability: { type: 'string' }, preset: { type: 'string' },
          crawlab_task_id: { type: 'string' }, crawlab_run_id: { type: 'string' } } } },
      }, async (req) => {
        const b = req.body;
        if (!isPreset(b.preset)) throw new Problem('invalid_params', 'Preset không hợp lệ');
        const res = await fanOut(deps.writer, deps.queue as never, {
          source: b.source, capability: b.capability, preset: b.preset,
          crawlabTaskId: b.crawlab_task_id, crawlabRunId: b.crawlab_run_id, trigger: 'schedule',
        });
        return { run_key: res.runKey, users: res.users };
      });

    app.get<{ Params: { runKey: string } }>('/crawl/fan-out/:runKey', async (req) => withTenant(deps.writer, (t) => t.one(
      `SELECT count(*) FILTER (WHERE status <> 'running')::int AS done,
              count(*) FILTER (WHERE status = 'ok')::int AS ok,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              count(*) FILTER (WHERE status = 'skipped')::int AS skipped
         FROM crawl_runs WHERE crawlab_run_id = $1`, [req.params.runKey])));
  };
  return plugin;
};

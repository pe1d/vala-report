import type { FastifyPluginAsync } from 'fastify';
import { SCHEDULE_PRESETS, allowedScopes, isPreset, loadMemberships, nextRuns, withTenant, Problem } from '@vala/core';
import type { ApiDeps } from '../deps.js';

export const meRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/me', async (req) => {
    const memberships = await withTenant(deps.reader, (t) => loadMemberships(t, req.user.id));
    return {
      id: req.user.id,
      ho_ten: req.user.ho_ten,
      email: req.user.email,
      is_ops_admin: req.user.is_ops_admin,
      org_units: memberships,
      scopes: allowedScopes(memberships),
    };
  });

  /** Danh sách preset + các lần chạy kế tiếp, cho form đặt lịch. Người dùng không bao giờ thấy cron. */
  app.get<{ Querystring: { preset?: string; count?: string } }>('/presets', async (req) => {
    const count = Math.min(Number(req.query.count ?? 5) || 5, 10);
    if (req.query.preset !== undefined) {
      if (!isPreset(req.query.preset)) throw new Problem('invalid_params', 'Lịch không hợp lệ');
      return { code: req.query.preset, label: SCHEDULE_PRESETS[req.query.preset].label, next_runs: nextRuns(req.query.preset, count) };
    }
    return Object.entries(SCHEDULE_PRESETS).map(([code, p]) => ({
      code, label: p.label, next_runs: nextRuns(code as keyof typeof SCHEDULE_PRESETS, count),
    }));
  });
};

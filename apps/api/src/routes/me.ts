import type { FastifyPluginAsync } from 'fastify';
import { SCHEDULE_TEMPLATES, allowedScopes, describeSchedule, loadMemberships, nextScheduleRuns, parseSchedule, withTenant } from '@vala/core';
import type { ApiDeps } from '../deps.js';

export const meRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  app.get('/me', async (req) => {
    const memberships = await withTenant(deps.reader, (t) => loadMemberships(t, req.user.id));
    return {
      id: req.user.id,
      ho_ten: req.user.ho_ten,
      email: req.user.email,
      is_ops_admin: req.user.is_ops_admin,
      must_change_password: req.user.must_change_password,
      has_password: req.user.has_password,
      org_units: memberships,
      scopes: allowedScopes(memberships),
    };
  });

  /** Mẫu lịch chọn nhanh (dạng có cấu trúc) + các lần chạy kế tiếp, cho form đặt lịch. Người dùng không thấy cron. */
  app.get('/presets', async () => SCHEDULE_TEMPLATES.map((x) => ({
    code: x.code, label: describeSchedule(x.schedule), schedule: x.schedule, next_runs: nextScheduleRuns(x.schedule, 5),
  })));

  /** Xem trước một lịch người dùng đang đặt: mô tả + 5 lần chạy tới; lịch sai ⇒ 422 nói rõ chỗ sai. */
  app.post<{ Body: { schedule: unknown } }>('/schedules/preview', {
    schema: { body: { type: 'object', required: ['schedule'], properties: { schedule: { type: 'object' } } } },
  }, async (req) => {
    const s = parseSchedule(req.body.schedule);
    return { schedule: s, label: describeSchedule(s), next_runs: nextScheduleRuns(s, 5) };
  });
};

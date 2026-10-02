import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  describeSchedule, launchSpider, nextScheduleRuns, parseSchedule, Problem, withTenant, withUserContext, type Schedule, type UserContext,
} from '@vala/core';
import { loadAllSpecs } from '@vala/core/adapter';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';

const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });
const RUN_NOW_WINDOW_S = 300;
/** Mỗi người tối đa bao nhiêu lịch đang bật (chống đặt quá nhiều lịch dồn lên hệ thống nguồn). */
const MAX_ENABLED_PER_USER = Number(process.env.MAX_SUBSCRIPTIONS_PER_USER ?? 10);

/** Một nguồn dữ liệu: script crawl (spider) hoặc capability của adapter do worker chạy. */
interface Target { source_system: string; spider_code: string | null; capability: string | null }
const keyOf = (x: Target) => (x.spider_code ? `spider:${x.spider_code}` : `cap:${x.source_system}:${x.capability}`);

interface ScheduleRow extends Target {
  id: number; schedule: Schedule; is_enabled: boolean; next_run_at: string | null; last_run_at: string | null;
}
interface RunRow { source_system: string; key: string; status: string; started_at: string; finished_at: string | null; records_seen: number | null; error_detail: string | null }

/**
 * Lịch lấy dữ liệu theo NGUỒN DỮ LIỆU (data_schedules): mỗi người × một nguồn dữ liệu (script crawl, hoặc capability
 * adapter do worker chạy) một lịch. Một lượt chạy cập nhật dữ liệu cho MỌI báo cáo dùng nguồn đó — danh sách báo cáo
 * trả kèm để giao diện nói rõ. Đổi lịch không gọi Crawlab — worker hẹn giờ theo next_run_at.
 */
export const dataScheduleRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /** Nguồn dữ liệu của các báo cáo đang bật (+ lịch của người gọi, kể cả lịch cho nguồn không còn báo cáo nào dùng). */
  const listSources = async (userId: number) => {
    const { reports, spiders, schedules, grants, runs } = await withUserContext(deps.reader, own(userId), async (t) => ({
      reports: await t.any<Target & { code: string; ten: string }>(
        `SELECT rc.code, rc.ten, rc.source_system, rc.spider_code, CASE WHEN rc.spider_code IS NULL THEN rc.capability END AS capability
           FROM report_catalog rc JOIN core.source_systems ss ON ss.code = rc.source_system AND ss.enabled
          WHERE rc.is_active AND rc.definition IS NOT NULL ORDER BY rc.ten`),
      spiders: await t.any<{ code: string; ten: string; is_enabled: boolean }>('SELECT code, ten, is_enabled FROM core.crawl_spiders'),
      schedules: await t.any<ScheduleRow>(
        `SELECT id, source_system, spider_code, capability, schedule, is_enabled, next_run_at, last_run_at
           FROM data_schedules WHERE app_user_id = $1`, [userId]),
      grants: await t.any<{ source_system: string; state: string }>(
        `SELECT source_system, CASE WHEN revoked_at IS NOT NULL THEN 'revoked' ELSE session_state END AS state
           FROM source_grants WHERE app_user_id = $1`, [userId]),
      // Lượt lấy dữ liệu gần nhất của người này cho từng nguồn dữ liệu (spider ghi capability = mã spider).
      runs: await t.any<RunRow>(
        `SELECT DISTINCT ON (source_system, key) * FROM (
           SELECT source_system, CASE WHEN spider_code IS NOT NULL THEN 'spider:' || spider_code ELSE 'cap:' || source_system || ':' || capability END AS key,
                  status, started_at, finished_at, records_seen, error_detail
             FROM crawl_runs WHERE app_user_id = $1 AND started_at > now() - interval '60 days') r
          ORDER BY source_system, key, started_at DESC`, [userId]),
    }));
    const specs = loadAllSpecs();
    const capName = (source: string, cap: string) =>
      specs.find((s) => s.source_system === source)?.capabilities.find((c) => c.id === cap)?.ten ?? cap;
    const spiderOf = new Map(spiders.map((s) => [s.code, s]));
    const grantOf = new Map(grants.map((g) => [g.source_system, g.state]));
    const runOf = new Map(runs.map((r) => [r.key, r]));
    const items = new Map<string, Target & { reports: Array<{ code: string; ten: string }> }>();
    for (const r of reports) {
      const k = keyOf(r);
      if (!items.has(k)) items.set(k, { source_system: r.source_system, spider_code: r.spider_code, capability: r.capability, reports: [] });
      items.get(k)!.reports.push({ code: r.code, ten: r.ten });
    }
    for (const s of schedules) if (!items.has(keyOf(s))) items.set(keyOf(s), { source_system: s.source_system, spider_code: s.spider_code, capability: s.capability, reports: [] });
    const schedOf = new Map(schedules.map((s) => [keyOf(s), s]));
    return [...items.entries()].map(([key, it]) => {
      const sc = schedOf.get(key);
      const run = runOf.get(key);
      const state = grantOf.get(it.source_system) ?? 'chua_cau_hinh';
      const spider = it.spider_code ? spiderOf.get(it.spider_code) : undefined;
      return {
        key, ...it,
        kind: it.spider_code ? 'spider' : 'capability',
        ten: spider?.ten ?? (it.capability ? capName(it.source_system, it.capability) : key),
        source_ten: deps.sources.get(it.source_system)?.ten ?? it.source_system,
        grant_state: state,
        can_run: state === 'active' && (it.spider_code ? spider?.is_enabled !== false && !!deps.crawlab : true),
        schedule: sc ? {
          id: sc.id, schedule: sc.schedule, schedule_label: safeLabel(sc.schedule), is_enabled: sc.is_enabled,
          next_run_at: sc.next_run_at, last_run_at: sc.last_run_at,
        } : null,
        last_run: run ? { status: run.status, started_at: run.started_at, finished_at: run.finished_at, records_seen: run.records_seen, error: run.error_detail } : null,
      };
    }).sort((a, b) => a.source_ten.localeCompare(b.source_ten, 'vi') || a.ten.localeCompare(b.ten, 'vi'));
  };
  /** Nguồn dữ liệu người gọi được đặt lịch: phải là nguồn của một báo cáo đang bật (hoặc đã có lịch). */
  const findSource = async (userId: number, b: Partial<Target>) => {
    const want = keyOf({ source_system: b.source_system ?? '', spider_code: b.spider_code ?? null, capability: b.spider_code ? null : b.capability ?? null });
    const it = (await listSources(userId)).find((x) => x.key === want);
    if (!it) throw new Problem('not_found', 'Không có nguồn dữ liệu này', want);
    return it;
  };
  const enabledCount = (userId: number, exceptId?: number) => withUserContext(deps.reader, own(userId), (t) => t.one(
    'SELECT count(*)::int AS n FROM data_schedules WHERE app_user_id = $1 AND is_enabled AND ($2::bigint IS NULL OR id <> $2)',
    [userId, exceptId ?? null], (r: { n: number }) => r.n));
  const tooMany = () => new Problem('invalid_params', 'Đã đủ số lịch', `Mỗi người tối đa ${MAX_ENABLED_PER_USER} lịch đang bật — tắt hoặc xoá bớt lịch cũ`);

  const target = { source_system: { type: 'string' }, spider_code: { type: ['string', 'null'] }, capability: { type: ['string', 'null'] } };

  /** Nguồn dữ liệu của tôi + lịch + lượt chạy gần nhất + các báo cáo dùng chung. ?report=<mã> ⇒ chỉ nguồn của báo cáo đó. */
  app.get<{ Querystring: { report?: string } }>('/data-sources', async (req) => {
    const all = await listSources(req.user.id);
    return req.query.report ? all.filter((x) => x.reports.some((r) => r.code === req.query.report)) : all;
  });

  /** Đặt (hoặc thay) lịch cho một nguồn dữ liệu — mỗi người × nguồn một lịch. Lưu ⇒ lịch bật. */
  app.put<{ Body: Target & { schedule: unknown } }>('/data-schedules', {
    schema: { body: { type: 'object', required: ['source_system', 'schedule'], properties: { ...target, schedule: { type: 'object' } } } },
  }, async (req) => {
    const schedule = parseSchedule(req.body.schedule);
    const src = await findSource(req.user.id, req.body);
    const cur = src.schedule;
    if ((!cur || !cur.is_enabled) && (await enabledCount(req.user.id, cur?.id)) >= MAX_ENABLED_PER_USER) throw tooMany();
    await withUserContext(deps.reader, own(req.user.id), async (t) => {
      const id = await t.one(
        `INSERT INTO data_schedules (app_user_id, source_system, spider_code, capability, schedule, is_enabled, next_run_at)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (app_user_id, source_system, coalesce(spider_code, ''), coalesce(capability, ''))
         DO UPDATE SET schedule = EXCLUDED.schedule, is_enabled = true, next_run_at = EXCLUDED.next_run_at, updated_at = now()
         RETURNING id`,
        [req.user.id, src.source_system, src.spider_code, src.capability, JSON.stringify(schedule), nextScheduleRuns(schedule)[0] ?? null],
        (r: { id: number }) => r.id);
      await audit(t, req, 'schedule_change', { type: 'data_schedule', id: String(id) }, { op: cur ? 'update' : 'create', source: src.key, schedule });
    });
    return (await findSource(req.user.id, src));
  });

  /** Bật / tắt lịch. Bật lại lịch một lần đã qua giờ ⇒ báo rõ (parseSchedule), không lặng lẽ không chạy. */
  app.patch<{ Params: { id: string }; Body: { is_enabled: boolean } }>('/data-schedules/:id', {
    schema: { body: { type: 'object', required: ['is_enabled'], properties: { is_enabled: { type: 'boolean' } } } },
  }, async (req) => {
    const id = Number(req.params.id);
    const t0 = await withUserContext(deps.reader, own(req.user.id), (t) => t.oneOrNone<ScheduleRow>('SELECT * FROM data_schedules WHERE id = $1', [id]));
    if (!t0) throw new Problem('not_found', 'Không có lịch này');
    const enabling = req.body.is_enabled && !t0.is_enabled;
    if (enabling && (await enabledCount(req.user.id, id)) >= MAX_ENABLED_PER_USER) throw tooMany();
    const next = enabling ? nextScheduleRuns(parseSchedule(t0.schedule))[0] ?? null : undefined;
    await withUserContext(deps.reader, own(req.user.id), async (t) => {
      await t.none(
        `UPDATE data_schedules SET is_enabled = $2, updated_at = now(), next_run_at = CASE WHEN $3 THEN $4::timestamptz ELSE next_run_at END WHERE id = $1`,
        [id, req.body.is_enabled, next !== undefined, next ?? null]);
      await audit(t, req, 'schedule_change', { type: 'data_schedule', id: String(id) }, { op: 'update', is_enabled: req.body.is_enabled });
    });
    return findSource(req.user.id, t0);
  });

  app.delete<{ Params: { id: string } }>('/data-schedules/:id', async (req, reply) => {
    const id = Number(req.params.id);
    await withUserContext(deps.reader, own(req.user.id), async (t) => {
      const n = await t.result('DELETE FROM data_schedules WHERE id = $1', [id], (r) => r.rowCount);
      if (!n) throw new Problem('not_found', 'Không có lịch này');
      await audit(t, req, 'schedule_change', { type: 'data_schedule', id: String(id) }, { op: 'delete' });
    });
    return reply.status(204).send();
  });

  /** Cập nhật ngay một nguồn dữ liệu cho chính người gọi (không cần có lịch, không đổi giờ hẹn). */
  app.post<{ Body: Target }>('/data-sources/run-now', {
    schema: { body: { type: 'object', required: ['source_system'], properties: target } },
  }, async (req, reply) => {
    const src = await findSource(req.user.id, req.body);
    if (src.grant_state === 'expired' || src.grant_state === 'failed') throw new Problem('session_expired', 'Phiên đã hết hạn', 'Kết nối lại rồi thử lại', { source_system: src.source_system });
    if (src.grant_state !== 'active') throw new Problem('grant_required', 'Cần kết nối hệ thống này trước', undefined, { source_system: src.source_system });
    if (!(await deps.limiter.take(`run-now:${req.user.id}:${src.key}`, RUN_NOW_WINDOW_S))) {
      throw new Problem('rate_limited', 'Vừa cập nhật gần đây', 'Mỗi nguồn dữ liệu chỉ cập nhật ngay được một lần trong 5 phút');
    }
    await withTenant(deps.writer, (t) => audit(t, req, 'run_now', { type: 'data_source', id: src.key }));
    if (src.spider_code) {
      if (!deps.crawlab) throw new Problem('internal', 'Chưa cấu hình Crawlab', 'Nguồn này lấy dữ liệu bằng script crawl');
      const tasks = await launchSpider(deps.writer, deps.crawlab, { spiderCode: src.spider_code, userId: req.user.id, trigger: 'manual' });
      return reply.status(202).send({ run_key: tasks[0] ?? null, executor: 'crawlab', reports: src.reports.length });
    }
    // Không có spider: worker chạy các bước lấy dữ liệu trong cấu hình adapter, riêng cho người này.
    const runKey = randomUUID();
    await deps.queue.addBulk([{
      name: `${src.source_system}.${src.capability}`,
      data: { source: src.source_system, capability: src.capability!, userId: req.user.id, trigger: 'manual' as const, crawlabRunId: runKey },
      opts: { jobId: `${runKey}_${req.user.id}`, attempts: 1, removeOnComplete: 5000, removeOnFail: 5000 },
    }]);
    return reply.status(202).send({ run_key: runKey, executor: 'worker', reports: src.reports.length });
  });
};

function safeLabel(s: Schedule): string {
  try { return describeSchedule(s); } catch { return 'Lịch không hợp lệ'; }
}

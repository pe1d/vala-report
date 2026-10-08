import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { describeSchedule, L, langOf, launchSpider, localizeStored, nextScheduleRuns, parseSchedule, Problem, withTenant, withUserContext, type Lang, type Schedule, type UserContext, currentTenant } from '@vala/core';
import { loadAllSpecs } from '@vala/core/adapter';
import { audit } from '../audit.js';
import type { ApiDeps } from '../deps.js';

const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });
const RUN_NOW_WINDOW_S = 300;
/** Tự cập nhật khi mở báo cáo: nguồn chưa lấy thành công trong khoảng này thì lấy lại. */
const AUTO_VIEW_MINUTES = Number(process.env.AUTO_REFRESH_MINUTES ?? 15);
/** Tự cập nhật khi người dùng vừa làm việc trên hệ thống nguồn (tiện ích báo rời tab): ngưỡng ngắn hơn. */
const AUTO_EXT_MINUTES = Number(process.env.AUTO_REFRESH_EXT_MINUTES ?? 3);
/** Mỗi người tối đa bao nhiêu lịch đang bật (chống đặt quá nhiều lịch dồn lên hệ thống nguồn). */
const MAX_ENABLED_PER_USER = Number(process.env.MAX_SUBSCRIPTIONS_PER_USER ?? 10);

/** Một nguồn dữ liệu: script crawl (spider) hoặc capability của adapter do worker chạy. */
interface Target { source_system: string; spider_code: string | null; capability: string | null }
const keyOf = (x: Target) => (x.spider_code ? `spider:${x.spider_code}` : `cap:${x.source_system}:${x.capability}`);

interface ScheduleRow extends Target {
  id: number; schedule: Schedule; is_enabled: boolean; next_run_at: string | null; last_run_at: string | null;
}
interface RunRow { source_system: string; key: string; status: string; started_at: string; finished_at: string | null; records_seen: number | null; error_detail: string | null }

/** Nguồn dữ liệu của các báo cáo đang bật (+ lịch / tuỳ chọn của người gọi, kể cả nguồn không còn báo cáo nào dùng). */
export async function listSources(deps: ApiDeps, userId: number, lang: Lang = 'vi') {
  const { reports, spiders, schedules, grants, runs, okRuns, prefs } = await withUserContext(deps.reader, own(userId), async (t) => ({
    reports: await t.any<Target & { code: string; ten: string }>(
      `SELECT rc.code, rc.ten, rc.source_system, rc.spider_code, CASE WHEN rc.spider_code IS NULL THEN rc.capability END AS capability
         FROM report_catalog rc JOIN source_systems ss ON ss.code = rc.source_system AND ss.enabled
        WHERE rc.is_active AND rc.definition IS NOT NULL ORDER BY rc.ten`),
    spiders: await t.any<{ code: string; ten: string; is_enabled: boolean }>('SELECT code, ten, is_enabled FROM crawl_spiders'),
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
    // Lần lấy THÀNH CÔNG gần nhất (dữ liệu đang có mới tới đâu) — khác lượt gần nhất (có thể đang chạy / lỗi).
    okRuns: await t.any<{ key: string; at: string }>(
      `SELECT CASE WHEN spider_code IS NOT NULL THEN 'spider:' || spider_code ELSE 'cap:' || source_system || ':' || capability END AS key,
              max(coalesce(finished_at, started_at)) AS at
         FROM crawl_runs WHERE app_user_id = $1 AND status = 'ok' AND started_at > now() - interval '60 days' GROUP BY 1`, [userId]),
    prefs: await t.any<Target & { auto_refresh: boolean }>(
      'SELECT source_system, spider_code, capability, auto_refresh FROM data_source_prefs WHERE app_user_id = $1', [userId]),
  }));
  const specs = loadAllSpecs();
  const capName = (source: string, cap: string) =>
    specs.find((s) => s.source_system === source)?.capabilities.find((c) => c.id === cap)?.ten ?? cap;
  const spiderOf = new Map(spiders.map((s) => [s.code, s]));
  const grantOf = new Map(grants.map((g) => [g.source_system, g.state]));
  const runOf = new Map(runs.map((r) => [r.key, r]));
  const okOf = new Map(okRuns.map((r) => [r.key, r.at]));
  const prefOf = new Map(prefs.map((p) => [keyOf(p), p.auto_refresh]));
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
        id: sc.id, schedule: sc.schedule, schedule_label: safeLabel(sc.schedule, lang), is_enabled: sc.is_enabled,
        next_run_at: sc.next_run_at, last_run_at: sc.last_run_at,
      } : null,
      last_run: run ? { status: run.status, started_at: run.started_at, finished_at: run.finished_at, records_seen: run.records_seen, error: localizeStored(run.error_detail, lang) } : null,
      last_success_at: okOf.get(key) ?? null,
      /** Tự lấy lại khi người dùng mở báo cáo / vừa làm việc trên hệ thống nguồn (mặc định bật). */
      auto_refresh: prefOf.get(key) ?? true,
    };
  }).sort((a, b) => a.source_ten.localeCompare(b.source_ten, 'vi') || a.ten.localeCompare(b.ten, 'vi'));
}

export type DataSourceItem = Awaited<ReturnType<typeof listSources>>[number];

/** Chạy lấy dữ liệu một nguồn cho một người: spider trên Crawlab, hoặc job worker theo cấu hình adapter. */
async function launchFor(deps: ApiDeps, userId: number, src: DataSourceItem): Promise<{ executor: string; run_key: string | null }> {
  if (src.spider_code) {
    if (!deps.crawlab) throw new Problem('internal', L('Chưa cấu hình Crawlab', 'Crawlab is not configured'), L('Nguồn này lấy dữ liệu bằng script crawl', 'This data source is fetched by a crawl script'));
    const tasks = await launchSpider(deps.writer, deps.crawlab, { spiderCode: src.spider_code, userId, trigger: 'manual' });
    return { executor: 'crawlab', run_key: tasks[0] ?? null };
  }
  const runKey = randomUUID();
  await deps.queue.addBulk([{
    name: `${src.source_system}.${src.capability}`,
    data: { tenant: currentTenant(), source: src.source_system, capability: src.capability!, userId, trigger: 'manual' as const, crawlabRunId: runKey },
    opts: { jobId: `${runKey}_${currentTenant()}_${userId}`, attempts: 1, removeOnComplete: 5000, removeOnFail: 5000 },
  }]);
  return { executor: 'worker', run_key: runKey };
}

export type AutoReason = 'view' | 'extension';
/** Kết quả tự cập nhật một nguồn: bat_dau = vừa chạy; dang_cap_nhat = đang có lượt chạy; con_moi = vừa lấy gần đây. */
export type AutoState = 'bat_dau' | 'dang_cap_nhat' | 'con_moi' | 'tat' | 'can_ket_noi' | 'khong_the';

/**
 * Tự cập nhật khi người dùng đang dùng (không chờ lịch): mở Tổng quan / báo cáo (view), hoặc tiện ích báo người dùng
 * vừa làm việc trên hệ thống nguồn rồi rời tab (extension). Với mỗi nguồn dữ liệu được hỏi:
 *   - người dùng tắt tự cập nhật nguồn này / chưa kết nối / không chạy được ⇒ bỏ qua;
 *   - đang có lượt chạy (crawl_runs đang chạy, hoặc spider vừa khởi chạy chưa báo về) ⇒ chờ lượt đó;
 *   - đã lấy thành công trong ngưỡng (view 15 phút, extension 3 phút) hoặc đã tự thử trong ngưỡng ⇒ còn mới;
 *   - còn lại ⇒ chạy ngay cho đúng người này.
 * Ngưỡng + giới hạn theo người × nguồn giữ cho F5 liên tục / nhiều tab không dồn tải lên hệ thống nguồn.
 */
export async function autoRefresh(
  deps: ApiDeps, req: FastifyRequest, userId: number, filter: { reports?: string[]; source_system?: string }, reason: AutoReason,
) {
  const minutes = reason === 'extension' ? AUTO_EXT_MINUTES : AUTO_VIEW_MINUTES;
  const all = await listSources(deps, userId, langOf(req.headers['accept-language']));
  const want = all.filter((x) => (filter.reports ? x.reports.some((r) => filter.reports!.includes(r.code)) : true)
    && (filter.source_system ? x.source_system === filter.source_system : true));
  if (!want.length) return [];
  // Đang chạy: lượt crawl_runs 'running' gần đây, hoặc spider đã bảo Crawlab chạy mà chưa gọi về (bảng core, đọc bằng writer).
  const busy = await withTenant(deps.writer, async (t) => new Map([
    ...(await t.any<{ key: string; at: string }>(
      `SELECT CASE WHEN spider_code IS NOT NULL THEN 'spider:' || spider_code ELSE 'cap:' || source_system || ':' || capability END AS key,
              max(started_at) AS at
         FROM crawl_runs WHERE app_user_id = $1 AND status = 'running' AND started_at > now() - interval '20 minutes' GROUP BY 1`, [userId])).map((r) => [r.key, r.at] as const),
    ...(await t.any<{ key: string; at: string }>(
      `SELECT 'spider:' || spider_code AS key, max(launched_at) AS at FROM spider_launches
        WHERE app_user_id = $1 AND status = 'launched' AND launched_at > now() - interval '5 minutes' GROUP BY 1`, [userId])).map((r) => [r.key, r.at] as const),
  ]));
  const out: Array<{ key: string; ten: string; source_ten: string; state: AutoState; last_success_at: string | null; since: string | null }> = [];
  for (const src of want) {
    const base = { key: src.key, ten: src.ten, source_ten: src.source_ten, last_success_at: src.last_success_at, since: null as string | null };
    const fresh = src.last_success_at && Date.now() - new Date(src.last_success_at).getTime() < minutes * 60_000;
    let state: AutoState;
    if (!src.auto_refresh) state = 'tat';
    else if (src.grant_state !== 'active') state = 'can_ket_noi';
    else if (!src.can_run) state = 'khong_the';
    else if (busy.has(src.key)) { state = 'dang_cap_nhat'; base.since = busy.get(src.key)!; }
    else if (fresh || !(await deps.limiter.take(`auto:${reason}:${userId}:${src.key}`, minutes * 60))) state = 'con_moi';
    else {
      try {
        await launchFor(deps, userId, src);
        await withTenant(deps.writer, (t) => audit(t, req, 'run_now', { type: 'data_source', id: src.key }, { auto: reason }));
        state = 'bat_dau'; base.since = new Date().toISOString();
      } catch (e) {
        req.log.warn({ err: e, source: src.key }, 'tự cập nhật không chạy được');
        state = 'khong_the';
      }
    }
    out.push({ ...base, state });
  }
  return out;
}

/**
 * Lịch lấy dữ liệu theo NGUỒN DỮ LIỆU (data_schedules): mỗi người × một nguồn dữ liệu (script crawl, hoặc capability
 * adapter do worker chạy) một lịch. Một lượt chạy cập nhật dữ liệu cho MỌI báo cáo dùng nguồn đó — danh sách báo cáo
 * trả kèm để giao diện nói rõ. Đổi lịch không gọi Crawlab — worker hẹn giờ theo next_run_at. Kèm tự cập nhật khi đang
 * dùng (autoRefresh) và tuỳ chọn bật/tắt của người dùng.
 */
export const dataScheduleRoutes = (deps: ApiDeps): FastifyPluginAsync => async (app) => {
  /** Nguồn dữ liệu người gọi được đặt lịch: phải là nguồn của một báo cáo đang bật (hoặc đã có lịch). */
  const findSource = async (userId: number, b: Partial<Target>, lang: Lang = 'vi') => {
    const want = keyOf({ source_system: b.source_system ?? '', spider_code: b.spider_code ?? null, capability: b.spider_code ? null : b.capability ?? null });
    const it = (await listSources(deps, userId, lang)).find((x) => x.key === want);
    if (!it) throw new Problem('not_found', L('Không có nguồn dữ liệu này', 'Data source not found'), want);
    return it;
  };
  const enabledCount = (userId: number, exceptId?: number) => withUserContext(deps.reader, own(userId), (t) => t.one(
    'SELECT count(*)::int AS n FROM data_schedules WHERE app_user_id = $1 AND is_enabled AND ($2::bigint IS NULL OR id <> $2)',
    [userId, exceptId ?? null], (r: { n: number }) => r.n));
  const tooMany = () => new Problem('invalid_params', L('Đã đủ số lịch', 'Schedule limit reached'),
    L(`Mỗi người tối đa ${MAX_ENABLED_PER_USER} lịch đang bật — tắt hoặc xoá bớt lịch cũ`, `Each user can have at most ${MAX_ENABLED_PER_USER} active schedules — turn off or delete some old ones`));

  const target = { source_system: { type: 'string' }, spider_code: { type: ['string', 'null'] }, capability: { type: ['string', 'null'] } };

  /** Nguồn dữ liệu của tôi + lịch + lượt chạy gần nhất + các báo cáo dùng chung. ?report=<mã> ⇒ chỉ nguồn của báo cáo đó. */
  app.get<{ Querystring: { report?: string } }>('/data-sources', async (req) => {
    const all = await listSources(deps, req.user.id, langOf(req.headers['accept-language']));
    return req.query.report ? all.filter((x) => x.reports.some((r) => r.code === req.query.report)) : all;
  });

  /** Đặt (hoặc thay) lịch cho một nguồn dữ liệu — mỗi người × nguồn một lịch. Lưu ⇒ lịch bật. */
  app.put<{ Body: Target & { schedule: unknown } }>('/data-schedules', {
    schema: { body: { type: 'object', required: ['source_system', 'schedule'], properties: { ...target, schedule: { type: 'object' } } } },
  }, async (req) => {
    const schedule = parseSchedule(req.body.schedule);
    const src = await findSource(req.user.id, req.body, langOf(req.headers['accept-language']));
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
    return (await findSource(req.user.id, src, langOf(req.headers['accept-language'])));
  });

  /** Bật / tắt lịch. Bật lại lịch một lần đã qua giờ ⇒ báo rõ (parseSchedule), không lặng lẽ không chạy. */
  app.patch<{ Params: { id: string }; Body: { is_enabled: boolean } }>('/data-schedules/:id', {
    schema: { body: { type: 'object', required: ['is_enabled'], properties: { is_enabled: { type: 'boolean' } } } },
  }, async (req) => {
    const id = Number(req.params.id);
    const t0 = await withUserContext(deps.reader, own(req.user.id), (t) => t.oneOrNone<ScheduleRow>('SELECT * FROM data_schedules WHERE id = $1', [id]));
    if (!t0) throw new Problem('not_found', L('Không có lịch này', 'Schedule not found'));
    const enabling = req.body.is_enabled && !t0.is_enabled;
    if (enabling && (await enabledCount(req.user.id, id)) >= MAX_ENABLED_PER_USER) throw tooMany();
    const next = enabling ? nextScheduleRuns(parseSchedule(t0.schedule))[0] ?? null : undefined;
    await withUserContext(deps.reader, own(req.user.id), async (t) => {
      await t.none(
        `UPDATE data_schedules SET is_enabled = $2, updated_at = now(), next_run_at = CASE WHEN $3 THEN $4::timestamptz ELSE next_run_at END WHERE id = $1`,
        [id, req.body.is_enabled, next !== undefined, next ?? null]);
      await audit(t, req, 'schedule_change', { type: 'data_schedule', id: String(id) }, { op: 'update', is_enabled: req.body.is_enabled });
    });
    return findSource(req.user.id, t0, langOf(req.headers['accept-language']));
  });

  app.delete<{ Params: { id: string } }>('/data-schedules/:id', async (req, reply) => {
    const id = Number(req.params.id);
    await withUserContext(deps.reader, own(req.user.id), async (t) => {
      const n = await t.result('DELETE FROM data_schedules WHERE id = $1', [id], (r) => r.rowCount);
      if (!n) throw new Problem('not_found', L('Không có lịch này', 'Schedule not found'));
      await audit(t, req, 'schedule_change', { type: 'data_schedule', id: String(id) }, { op: 'delete' });
    });
    return reply.status(204).send();
  });

  /** Mở Tổng quan / báo cáo ⇒ tự lấy lại các nguồn dữ liệu đã cũ của những báo cáo đang hiện (xem autoRefresh). */
  app.post<{ Body: { reports: string[] } }>('/data-sources/refresh', {
    schema: { body: { type: 'object', required: ['reports'], properties: { reports: { type: 'array', maxItems: 100, items: { type: 'string' } } } } },
  }, async (req) => autoRefresh(deps, req, req.user.id, { reports: req.body.reports }, 'view'));

  /** Theo dõi lượt đang chạy: lượt lấy dữ liệu của người gọi bắt đầu từ `since` (giao diện chờ xong thì tải lại số liệu). */
  app.get<{ Querystring: { since: string } }>('/data-sources/activity', {
    schema: { querystring: { type: 'object', required: ['since'], properties: { since: { type: 'string', format: 'date-time' } } } },
  }, async (req) => {
    const lang = langOf(req.headers['accept-language']);
    const rows = await withUserContext(deps.reader, own(req.user.id), (t) => t.any<{ error: string | null }>(
      `SELECT CASE WHEN spider_code IS NOT NULL THEN 'spider:' || spider_code ELSE 'cap:' || source_system || ':' || capability END AS key,
              status, started_at, finished_at, records_changed, error_detail AS error
         FROM crawl_runs WHERE app_user_id = $1 AND started_at >= $2::timestamptz - interval '5 seconds' ORDER BY started_at`,
      [req.user.id, req.query.since]));
    return rows.map((r) => ({ ...r, error: localizeStored(r.error, lang) }));
  });

  /** Bật / tắt tự cập nhật khi mở báo cáo cho một nguồn dữ liệu. */
  app.put<{ Body: Target & { auto_refresh: boolean } }>('/data-sources/prefs', {
    schema: { body: { type: 'object', required: ['source_system', 'auto_refresh'], properties: { ...target, auto_refresh: { type: 'boolean' } } } },
  }, async (req) => {
    const src = await findSource(req.user.id, req.body, langOf(req.headers['accept-language']));
    await withUserContext(deps.reader, own(req.user.id), async (t) => {
      await t.none(
        `INSERT INTO data_source_prefs (app_user_id, source_system, spider_code, capability, auto_refresh) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (app_user_id, source_system, coalesce(spider_code, ''), coalesce(capability, ''))
         DO UPDATE SET auto_refresh = EXCLUDED.auto_refresh, updated_at = now()`,
        [req.user.id, src.source_system, src.spider_code, src.capability, req.body.auto_refresh]);
      await audit(t, req, 'schedule_change', { type: 'data_source', id: src.key }, { auto_refresh: req.body.auto_refresh });
    });
    return findSource(req.user.id, src, langOf(req.headers['accept-language']));
  });

  /** Cập nhật ngay một nguồn dữ liệu cho chính người gọi (không cần có lịch, không đổi giờ hẹn). */
  app.post<{ Body: Target }>('/data-sources/run-now', {
    schema: { body: { type: 'object', required: ['source_system'], properties: target } },
  }, async (req, reply) => {
    const src = await findSource(req.user.id, req.body, langOf(req.headers['accept-language']));
    if (src.grant_state === 'expired' || src.grant_state === 'failed') throw new Problem('session_expired', L('Phiên đã hết hạn', 'Session has expired'), L('Kết nối lại rồi thử lại', 'Reconnect and try again'), { source_system: src.source_system });
    if (src.grant_state !== 'active') throw new Problem('grant_required', L('Cần kết nối hệ thống này trước', 'Connect this system first'), undefined, { source_system: src.source_system });
    if (!(await deps.limiter.take(`run-now:${req.user.id}:${src.key}`, RUN_NOW_WINDOW_S))) {
      throw new Problem('rate_limited', L('Vừa cập nhật gần đây', 'Updated recently'), L('Mỗi nguồn dữ liệu chỉ cập nhật ngay được một lần trong 5 phút', 'Each data source can be updated on demand only once every 5 minutes'));
    }
    await withTenant(deps.writer, (t) => audit(t, req, 'run_now', { type: 'data_source', id: src.key }));
    const r = await launchFor(deps, req.user.id, src);
    return reply.status(202).send({ ...r, reports: src.reports.length });
  });
};

function safeLabel(s: Schedule, lang: Lang = 'vi'): string {
  try { return describeSchedule(s, lang); } catch { return lang === 'en' ? 'Invalid schedule' : 'Lịch không hợp lệ'; }
}

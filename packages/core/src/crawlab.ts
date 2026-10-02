/**
 * Client REST của Crawlab (core v0.6.3, đã kiểm chứng trên image crawlabteam/crawlab ngày 26/09/2026)
 * và phép đồng bộ repo → Crawlab:
 *   crawlers/<code>/*  +  crawlers/_sdk/vala_sdk.py   →  spider <code> trong Crawlab
 *   (không tạo lịch Crawlab — worker Vala hẹn giờ theo lịch từng người rồi chạy spider --user N)
 *   VALA_API_URL, VALA_INTERNAL_TOKEN                  →  biến môi trường toàn cục của Crawlab
 * Người dùng đổi lịch KHÔNG gọi Crawlab: worker Vala đọc data_schedules.schedule mỗi phút và chạy spider cho người đến hạn.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withTenant, type Db } from './db/index.js';
import { REPO_ROOT } from './env.js';
import type { SpiderRow } from './ingest/spider.js';

export interface CrawlabConfig {
  url: string;
  username: string;
  password: string;
}

export function crawlabConfigFromEnv(): CrawlabConfig | null {
  if (!process.env.CRAWLAB_URL) return null;
  return {
    url: process.env.CRAWLAB_URL.replace(/\/$/, ''),
    username: process.env.CRAWLAB_USERNAME ?? 'admin',
    password: process.env.CRAWLAB_PASSWORD ?? 'admin',
  };
}

interface Envelope<T> { status: string; message: string; data: T; error: string; total?: number }

export class CrawlabClient {
  private token?: string;
  constructor(private readonly cfg: CrawlabConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  get webUrl() { return this.cfg.url; }

  private async login(): Promise<string> {
    const res = await this.fetchImpl(`${this.cfg.url}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.cfg.username, password: this.cfg.password }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json()) as Envelope<string>;
    if (j.message !== 'success' || !j.data) throw new Error(`Crawlab từ chối đăng nhập: ${j.error || res.status}`);
    this.token = j.data;
    return j.data;
  }

  async call<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    const token = this.token ?? (await this.login());
    const res = await this.fetchImpl(`${this.cfg.url}/api${path}`, {
      method, headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 && retry) { this.token = undefined; return this.call(method, path, body, false); }
    const j = (await res.json().catch(() => ({ message: 'error', error: `HTTP ${res.status}` }))) as Envelope<T>;
    // Crawlab trả HTTP 200 kèm message "error" khi lỗi nghiệp vụ.
    if (j.message !== 'success') throw new Error(`Crawlab ${method} ${path}: ${j.error || res.status}`);
    return j.data;
  }

  listSpiders() { return this.call<Array<{ _id: string; name: string }>>('GET', '/spiders?page=1&size=1000').then((d) => d ?? []); }
  createSpider(s: { name: string; description: string; cmd: string }) {
    return this.call<{ _id: string }>('POST', '/spiders', { ...s, col_name: `results_${s.name}`, mode: 'random', param: '', priority: 5, node_ids: [] });
  }
  updateSpider(id: string, s: { name: string; description: string; cmd: string }) {
    return this.call('PUT', `/spiders/${id}`, { _id: id, ...s, col_name: `results_${s.name}`, mode: 'random', priority: 5, node_ids: [] });
  }
  /** File ở thư mục gốc của spider trên Crawlab (rỗng nếu Crawlab mất file, vd sau khi khởi động lại). */
  listFiles(spiderId: string, path = '') {
    return this.call<Array<{ name: string; is_dir?: boolean }> | null>('GET', `/spiders/${spiderId}/files/list?path=${encodeURIComponent(path)}`).then((d) => d ?? []);
  }
  /** Nội dung một file của spider trên Crawlab (null nếu không có). */
  getFile(spiderId: string, path: string) {
    return this.call<string | null>('GET', `/spiders/${spiderId}/files/get?path=${encodeURIComponent(path)}`).catch(() => null);
  }
  saveFile(spiderId: string, path: string, data: string) {
    return this.call('POST', `/spiders/${spiderId}/files/save`, { path, data });
  }
  /** Trả mảng task id. */
  runSpider(spiderId: string, param: string) {
    return this.call<string[]>('POST', `/spiders/${spiderId}/run`, { mode: 'random', cmd: 'python main.py', param });
  }
  listSchedules() { return this.call<Array<{ _id: string; name: string; spider_id: string }>>('GET', '/schedules?page=1&size=1000').then((d) => d ?? []); }
  upsertSchedule(id: string | null, s: { name: string; spider_id: string; cron: string; param: string; enabled: boolean }) {
    const body = { ...s, cmd: 'python main.py', mode: 'random', description: 'Tạo bởi Vala Reporting — không sửa tay' };
    return id ? this.call<{ _id: string }>('PUT', `/schedules/${id}`, { _id: id, ...body }) : this.call<{ _id: string }>('POST', '/schedules', body);
  }
  /** Crawlab 0.6 trả HTTP 200 thân rỗng khi xoá được; lịch đã mất thì báo "no documents" — coi như đã xoá. */
  async deleteSchedule(id: string): Promise<void> {
    try { await this.call('DELETE', `/schedules/${id}`); } catch (e) {
      const m = (e as Error).message;
      if (/HTTP 200$/.test(m) || /no documents/.test(m)) return;
      throw e;
    }
  }
  listEnvironments() { return this.call<Array<{ _id: string; key: string; value: string }>>('GET', '/environments?page=1&size=1000').then((d) => d ?? []); }
  async setEnvironment(key: string, value: string) {
    const cur = (await this.listEnvironments()).find((e) => e.key === key);
    return cur ? this.call('PUT', `/environments/${cur._id}`, { _id: cur._id, key, value }) : this.call('POST', '/environments', { key, value });
  }
  taskLogs(taskId: string) { return this.call<string[]>('GET', `/tasks/${taskId}/logs?page=1&size=1000`).then((d) => d ?? []); }
  getTask(taskId: string) { return this.call<{ _id: string; status: string; error?: string }>('GET', `/tasks/${taskId}`); }
}

export const CRAWLERS_DIR = join(REPO_ROOT, 'crawlers');
const SDK_FILE = join(CRAWLERS_DIR, '_sdk', 'vala_sdk.py');

/**
 * Mã main.py của spider: ưu tiên bản trong CSDL (quản trị viết/sửa trên cổng). Chưa có thì lấy mẫu trong
 * repo (crawlers/<mã>/main.py) nếu có — chỉ để khởi tạo spider cũ; spider mới viết thẳng trên cổng.
 */
export function spiderMainPy(row: { code: string; main_py?: string | null }, dir = CRAWLERS_DIR): string | null {
  if (row.main_py) return row.main_py;
  const p = join(dir, row.code, 'main.py');
  return existsSync(p) && statSync(p).isFile() ? readFileSync(p, 'utf8') : null;
}

/** Tệp đẩy lên Crawlab cho một spider: main.py (từ CSDL, hoặc mẫu repo) + vala_sdk.py (thư viện chung, theo backend). */
export function spiderFiles(row: { code: string; main_py?: string | null }, dir = CRAWLERS_DIR): Record<string, string> {
  const main = spiderMainPy(row, dir);
  if (!main) throw new Error(`${row.code}: chưa có mã main.py — viết mã cho spider này trên trang "Script crawl"`);
  return { 'main.py': main, 'vala_sdk.py': readFileSync(SDK_FILE, 'utf8') };
}

export interface SyncOptions {
  /** Địa chỉ API mà spider (chạy trong Crawlab) gọi tới. */
  apiUrlForSpiders: string;
  internalToken: string;
}

export interface SyncResult {
  spiders: Array<{ code: string; crawlab_spider_id: string; files: number; schedules: number }>;
}

export async function syncCrawlab(db: Db, client: CrawlabClient, opts: SyncOptions): Promise<SyncResult> {
  await client.setEnvironment('VALA_API_URL', opts.apiUrlForSpiders);
  await client.setEnvironment('VALA_INTERNAL_TOKEN', opts.internalToken);

  const rows = await withTenant(db, (t) => t.any<SpiderRow>('SELECT * FROM core.crawl_spiders ORDER BY code'));
  const existing = await client.listSpiders();
  const schedules = await client.listSchedules();
  const out: SyncResult = { spiders: [] };

  for (const sp of rows) {
    const meta = { name: sp.code, description: sp.ten, cmd: 'python main.py' };
    let id = sp.crawlab_spider_id && existing.some((e) => e._id === sp.crawlab_spider_id) ? sp.crawlab_spider_id : existing.find((e) => e.name === sp.code)?._id;
    if (id) await client.updateSpider(id, meta);
    else id = (await client.createSpider(meta))._id;

    const files = spiderFiles(sp);
    // Spider cũ chưa có mã trong CSDL: chép mẫu repo vào CSDL, từ đó quản trị sửa trên cổng.
    if (!sp.main_py) await withTenant(db, (t) => t.none('UPDATE core.crawl_spiders SET main_py = $2 WHERE code = $1 AND main_py IS NULL', [sp.code, files['main.py']]));
    for (const [path, data] of Object.entries(files)) await client.saveFile(id, path, data);

    // Lịch cố định theo preset (trước migration 015) thôi dùng: worker Vala tự hẹn giờ theo lịch từng người rồi
    // chạy spider với --user. Xoá hết lịch Crawlab của spider này để không chạy trùng.
    const stale = schedules.filter((x) => x.spider_id === id || x.name.startsWith(`${sp.code}:`));
    for (const x of stale) await client.deleteSchedule(x._id);
    await withTenant(db, (t) => t.none('DELETE FROM core.spider_schedules WHERE spider_code = $1', [sp.code]));
    const n = 0;
    await withTenant(db, (t) => t.none('UPDATE core.crawl_spiders SET crawlab_spider_id = $2, synced_at = now() WHERE code = $1', [sp.code, id]));
    out.spiders.push({ code: sp.code, crawlab_spider_id: id, files: Object.keys(files).length, schedules: n });
  }
  return out;
}

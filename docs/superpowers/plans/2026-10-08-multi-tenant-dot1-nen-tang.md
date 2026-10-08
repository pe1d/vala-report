# Đợt 1 — Nền tảng nhiều đơn vị: kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** backend phục vụ được nhiều đơn vị (mỗi đơn vị một schema `tenant_<mã>`), xác định đơn vị theo ngữ cảnh từng
request / việc của worker; Bkav chạy như cũ, giao diện chưa đổi.

**Architecture:** `AsyncLocalStorage` giữ mã đơn vị; `withTenant` / `withUserContext` đọc từ đó (thiếu ⇒ ném lỗi). API đặt
ngữ cảnh ở hook `onRequest` theo token (JWT có `tnt`, token thiết bị `vxt_<mã>.…`, request nội bộ có header
`X-Vala-Tenant`; không có ⇒ `bkav`). Worker chạy mỗi việc trong ngữ cảnh đơn vị của việc đó, việc định kỳ lặp qua các
đơn vị. Bảng nguồn chuyển từ `core` vào schema đơn vị; danh mục adapter trong bộ nhớ tách theo đơn vị.

**Tech Stack:** Node 18+, TypeScript, Fastify, pg-promise, BullMQ, PostgreSQL 15, vitest; spider Python (`vala_sdk`).

Spec: `docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md` (mục 1, 4, 5; đợt 1 ở mục 6).

## Bản đồ tệp

| Tệp | Việc |
|---|---|
| `packages/core/src/tenant.ts` (mới) | ngữ cảnh đơn vị: `runInTenant`, `currentTenant`, `tenantSchema`, `DEFAULT_TENANT`, kiểm mã |
| `packages/core/src/tenants.ts` (mới) | đọc `core.tenants` (có đệm), `activeTenants`, `forEachTenant` |
| `packages/core/src/db/index.ts` | `withTenant` / `withUserContext` theo ngữ cảnh; thêm `withCore` |
| `packages/core/src/env.ts` | bỏ `TENANT` |
| `db/migrations/027_tenants.sql` (mới) | `core.tenants`, `core.system_admins`, `core.tenant_migrations`, đơn vị `bkav`, chuyển bảng nguồn vào `tenant_bkav`, search_path mặc định của vai trò |
| `db/migrations/tenant/` (mới, có `.gitkeep`) | migration loại đơn vị |
| `packages/core/src/db/migrate.ts` | áp migration loại đơn vị cho từng đơn vị; seed / vai trò không dùng `TENANT` |
| `packages/core/src/sources.ts` | `SourceRegistries` (mỗi đơn vị một `SourceRegistry`), cung cấp adapter theo đơn vị hiện tại |
| `packages/core/src/sessions.ts`, `connections.ts` | `tenant` lấy theo ngữ cảnh (vẫn nhận chuỗi cố định cho test) |
| `packages/core/src/ingest/crawl.ts` | `CrawlJob.tenant` (bắt buộc) |
| `packages/core/src/queue.ts`, `spiderOps.ts`, `crawlab.ts`, … | bỏ tiền tố `core.` của bảng đã chuyển; heartbeat dùng `withCore`; khởi chạy spider kèm `--tenant` |
| `apps/api/src/tenant-hook.ts` (mới) | hook `onRequest` đặt ngữ cảnh đơn vị từ token / header |
| `apps/api/src/auth.ts`, `routes/extension.ts`, `routes/sso.ts`, `routes/auth.ts` | token mang mã đơn vị |
| `apps/api/src/main.ts`, `deps.ts`, `app.ts` | bỏ `config.tenant`; dùng `SourceRegistries`; đăng ký hook |
| `apps/worker/src/main.ts` | việc chạy trong ngữ cảnh đơn vị; việc định kỳ lặp đơn vị |
| `crawlers/_sdk/vala_sdk.py` | `--tenant` ⇒ header `X-Vala-Tenant` |
| `packages/core/scripts/create-admin.ts` | `--tenant` (mặc định `bkav`) |
| `packages/core/test/*.test.ts`, `packages/core/test/db/*.test.ts`, `apps/api/test/tenant-hook.test.ts` | test |

## Task 1 — Ngữ cảnh đơn vị

**Files:** Create `packages/core/src/tenant.ts`, `packages/core/test/tenant.test.ts`; Modify `packages/core/src/index.ts`.

- [ ] Viết test (thất bại vì chưa có module):

```ts
import { describe, expect, it } from 'vitest';
import { currentTenant, DEFAULT_TENANT, isTenantCode, runInTenant, tenantSchema, setRequestTenant, withTenantStore } from '../src/tenant';

describe('ngữ cảnh đơn vị', () => {
  it('runInTenant ⇒ currentTenant (kể cả sau await); ngoài ngữ cảnh ⇒ lỗi', async () => {
    expect(() => currentTenant()).toThrow(/ngữ cảnh đơn vị/);
    await runInTenant('thu', async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(currentTenant()).toBe('thu');
      await runInTenant('bkav', async () => expect(currentTenant()).toBe('bkav'));
      expect(currentTenant()).toBe('thu');
    });
  });
  it('mã hợp lệ: chữ thường + số, bắt đầu bằng chữ, 2–20 ký tự', () => {
    expect(isTenantCode('bkav')).toBe(true);
    expect(isTenantCode('nuithanh2')).toBe(true);
    for (const bad of ['', 'b', 'Bkav', '1abc', 'a-b', 'a_b', 'x'.repeat(21), "bkav'; drop"]) expect(isTenantCode(bad)).toBe(false);
    expect(() => runInTenant('A B', () => 1)).toThrow();
  });
  it('tenantSchema + mặc định', () => {
    expect(tenantSchema('bkav')).toBe('tenant_bkav');
    expect(DEFAULT_TENANT).toBe('bkav');
  });
  it('kho theo request: đặt mã sau khi mở kho (hook API)', async () => {
    await withTenantStore(async () => {
      expect(() => currentTenant()).toThrow();
      setRequestTenant('thu');
      await Promise.resolve();
      expect(currentTenant()).toBe('thu');
    });
  });
});
```

- [ ] Chạy `pnpm --filter @vala/core test -- tenant` ⇒ FAIL (không tìm thấy module).
- [ ] Viết `packages/core/src/tenant.ts`:

```ts
/**
 * Ngữ cảnh ĐƠN VỊ (multi-tenant, docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md): mỗi request của API /
 * mỗi việc của worker chạy trong ngữ cảnh một đơn vị; withTenant / withUserContext đặt search_path theo đó. Thiếu ngữ
 * cảnh ⇒ ném lỗi — không bao giờ ngầm rơi về một đơn vị mặc định (tránh đọc nhầm dữ liệu đơn vị khác).
 *
 * Kho là một object có thể sửa: API mở kho ở đầu request (withTenantStore) rồi hook đặt mã sau khi đọc token.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export const DEFAULT_TENANT = 'bkav';
const CODE = /^[a-z][a-z0-9]{1,19}$/;
interface Store { tenant: string | null }
const als = new AsyncLocalStorage<Store>();

export const isTenantCode = (s: unknown): s is string => typeof s === 'string' && CODE.test(s);
export const tenantSchema = (code: string): string => `tenant_${code}`;

function check(code: string): string {
  if (!isTenantCode(code)) throw new Error(`Mã đơn vị không hợp lệ: ${JSON.stringify(code)}`);
  return code;
}

export function runInTenant<T>(code: string, fn: () => T): T {
  return als.run({ tenant: check(code) }, fn);
}

/** Mở kho rỗng cho một request (API) — mã đặt sau bằng setRequestTenant. */
export function withTenantStore<T>(fn: () => T): T {
  return als.run({ tenant: null }, fn);
}

export function setRequestTenant(code: string): void {
  const s = als.getStore();
  if (!s) throw new Error('Chưa mở ngữ cảnh đơn vị cho request');
  s.tenant = check(code);
}

export function currentTenant(): string {
  const t = als.getStore()?.tenant;
  if (!t) throw new Error('Thiếu ngữ cảnh đơn vị (runInTenant / hook API)');
  return t;
}

/** Schema của đơn vị hiện tại (vd đường dẫn vault `vault://tenant_bkav/…`). */
export const currentSchema = (): string => tenantSchema(currentTenant());
```

- [ ] Thêm `export * from './tenant.js';` vào `packages/core/src/index.ts`.
- [ ] Chạy lại ⇒ PASS. Commit `feat(core): ngữ cảnh đơn vị (AsyncLocalStorage)`.

## Task 2 — withTenant / withUserContext theo ngữ cảnh; withCore

**Files:** Modify `packages/core/src/db/index.ts`, `packages/core/src/env.ts`.

- [ ] `db/index.ts`: bỏ `import { TENANT }`; thêm `import { currentSchema } from '../tenant.js';`; trong
  `withUserContext` đổi tham số `$4` thành `` `${currentSchema()}, core, public` ``; `withTenant` tương tự. Thêm:

```ts
/** Giao dịch chỉ chạm bảng dùng chung `core.*` (danh mục đơn vị, heartbeat) — không cần ngữ cảnh đơn vị. */
export function withCore<T>(db: Db, fn: (t: Tx) => Promise<T>): Promise<T> {
  return db.tx(async (t) => {
    await t.any(`SELECT set_config('search_path', 'core, public', true)`);
    return fn(t);
  });
}
```

  Lưu ý: `currentSchema()` gọi NGOÀI `db.tx(...)` (đầu hàm) để lỗi thiếu ngữ cảnh ném trước khi mở giao dịch.
- [ ] `env.ts`: xoá dòng `export const TENANT = …`.
- [ ] `pnpm -r typecheck` ⇒ liệt kê mọi chỗ còn dùng `TENANT` (api/main.ts, worker/main.ts, migrate.ts, create-admin.ts) —
  sửa ở Task 4, 7, 9, 10. Chưa commit (build đang đỏ) — commit cùng Task 4.

## Task 3 — Khung test CSDL

**Files:** Create `packages/core/test/db/setup.ts`, `packages/core/vitest.db.config.ts`; Modify `packages/core/package.json`.

- [ ] `vitest.db.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Test chạm CSDL thật (database vala_test tạo lại mỗi lần): pnpm --filter @vala/core test:db. Cần DATABASE_OWNER_URL.
export default defineConfig({
  test: { include: ['test/db/**/*.test.ts'], globalSetup: ['test/db/setup.ts'], fileParallelism: false, testTimeout: 60000 },
});
```

- [ ] `test/db/setup.ts`:

```ts
import { prepareTestDatabase } from '../../src/testing/index';

export default async function setup() {
  const { readerUrl, writerUrl } = await prepareTestDatabase();
  process.env.DATABASE_READER_URL = readerUrl;
  process.env.DATABASE_WRITER_URL = writerUrl;
}
```

- [ ] `packages/core/vitest.config.ts`: thêm `exclude: ['test/db/**', 'node_modules/**']` (test thường không cần CSDL).
- [ ] `package.json` của core: `"test:db": "vitest run -c vitest.db.config.ts"`.

## Task 4 — Migration 027 + migration loại đơn vị

**Files:** Create `db/migrations/027_tenants.sql`, `db/migrations/tenant/.gitkeep`, `packages/core/test/db/tenants.test.ts`;
Modify `packages/core/src/db/migrate.ts`.

- [ ] Test (`test/db/tenants.test.ts`):

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeAllPools, env, runInTenant, withCore, withTenant, writerDb } from '../../src/index';
import { applyTenantMigrations, withDatabase } from '../../src/db/migrate';
import { TEST_DB } from '../../src/testing/index';

const writer = () => writerDb();
afterAll(() => closeAllPools());

describe('migration 027', () => {
  it('có đơn vị bkav, tên miền bkav.com, đang hoạt động', async () => {
    const r = await withCore(writer(), (t) => t.one(`SELECT ma, domains, status FROM tenants WHERE ma = 'bkav'`));
    expect(r).toEqual({ ma: 'bkav', domains: ['bkav.com'], status: 'hoat_dong' });
  });
  it('bảng nguồn nằm trong schema đơn vị, không còn ở core', async () => {
    const rows = await withCore(writer(), (t) => t.any(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_name IN ('source_systems','adapters','crawl_tasks','crawl_spiders','spider_schedules','spider_launches')
        ORDER BY table_name`));
    expect(rows.every((r) => r.table_schema === 'tenant_bkav')).toBe(true);
    expect(rows).toHaveLength(6);
    await runInTenant('bkav', () => withTenant(writer(), (t) => t.any('SELECT code FROM source_systems')));
  });
  it('withTenant ngoài ngữ cảnh ⇒ lỗi', async () => {
    await expect(withTenant(writer(), (t) => t.any('SELECT 1'))).rejects.toThrow(/ngữ cảnh đơn vị/);
  });
});

describe('migration loại đơn vị', () => {
  it('áp cho mọi đơn vị, ghi nhận, không áp lại', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm-'));
    writeFileSync(join(dir, '001_thu.sql'), 'CREATE TABLE thu_bang (id int);');
    const owner = withDatabase(env('DATABASE_OWNER_URL'), TEST_DB);
    expect(await applyTenantMigrations(owner, dir)).toEqual(['bkav:001_thu.sql']);
    expect(await applyTenantMigrations(owner, dir)).toEqual([]);
    await runInTenant('bkav', () => withTenant(writer(), (t) => t.any('SELECT * FROM thu_bang')));
  });
});
```

- [ ] `pnpm --filter @vala/core test:db` ⇒ FAIL.
- [ ] `db/migrations/027_tenants.sql`:

```sql
-- 027 — nhiều đơn vị (docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md).
--   * core.tenants: danh mục đơn vị (mã ⇒ schema tenant_<mã>, tên miền, cách đăng nhập); Bkav là đơn vị đầu tiên.
--   * core.system_admins: quản trị hệ thống (đứng trên mọi đơn vị) — dùng từ đợt 3.
--   * core.tenant_migrations: migration loại đơn vị (db/migrations/tenant/) đã áp cho đơn vị nào.
--   * Danh mục hệ thống nguồn + crawl chuyển từ core vào schema đơn vị (mỗi đơn vị tự quản nguồn của mình). SET SCHEMA giữ
--     nguyên dữ liệu, khoá ngoại, chỉ mục, quyền.
CREATE TABLE core.tenants (
    ma               text        PRIMARY KEY CHECK (ma ~ '^[a-z][a-z0-9]{1,19}$'),
    ten              text        NOT NULL,
    domains          text[]      NOT NULL DEFAULT '{}',
    status           text        NOT NULL DEFAULT 'dang_tao' CHECK (status IN ('dang_tao', 'hoat_dong', 'tam_khoa', 'loi')),
    status_note      text,
    login_methods    text[]      NOT NULL DEFAULT '{password}',
    sso              jsonb,
    login_fill       text        NOT NULL DEFAULT 'account' CHECK (login_fill IN ('account', 'email')),
    login_selectors  jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Mỗi tên miền thuộc đúng một đơn vị.
CREATE TABLE core.tenant_domains (
    domain  text PRIMARY KEY CHECK (domain = lower(domain)),
    tenant  text NOT NULL REFERENCES core.tenants(ma) ON DELETE CASCADE
);
CREATE TABLE core.system_admins (
    tenant   text   NOT NULL REFERENCES core.tenants(ma),
    user_id  bigint NOT NULL,
    PRIMARY KEY (tenant, user_id)
);
CREATE TABLE core.tenant_migrations (
    tenant      text        NOT NULL REFERENCES core.tenants(ma),
    name        text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant, name)
);
GRANT SELECT ON core.tenants, core.tenant_domains, core.system_admins TO app_reader, app_writer;
GRANT INSERT, UPDATE ON core.tenants, core.tenant_domains, core.system_admins TO app_writer;
GRANT DELETE ON core.tenant_domains, core.system_admins TO app_writer;

INSERT INTO core.tenants (ma, ten, domains, status) VALUES ('bkav', 'Bkav', '{bkav.com}', 'hoat_dong');
INSERT INTO core.tenant_domains (domain, tenant) VALUES ('bkav.com', 'bkav');

ALTER TABLE core.source_systems   SET SCHEMA tenant_bkav;
ALTER TABLE core.adapters         SET SCHEMA tenant_bkav;
ALTER TABLE core.crawl_tasks      SET SCHEMA tenant_bkav;
ALTER TABLE core.crawl_spiders    SET SCHEMA tenant_bkav;
ALTER TABLE core.spider_schedules SET SCHEMA tenant_bkav;
ALTER TABLE core.spider_launches  SET SCHEMA tenant_bkav;
```

  (Sequence của cột `bigserial` đi theo bảng khi SET SCHEMA. Cấu hình đăng nhập / SSO / tên miền thật của Bkav lấy từ
  `.env` khi API khởi động ở đợt 2 — 027 chỉ đặt mặc định.)
- [ ] `migrate.ts`:
  - thêm `export async function applyTenantMigrations(ownerUrl: string, dir = join(REPO_ROOT, 'db/migrations/tenant')): Promise<string[]>`:
    đọc `core.tenants` (mọi trạng thái trừ `dang_tao`), với mỗi đơn vị × mỗi file `NNN_*.sql` chưa có trong
    `core.tenant_migrations`: một giao dịch `SET LOCAL search_path = tenant_<mã>, core, public` (tên schema qua `$1:name`)
    + chạy file + ghi nhận. Trả về `['<mã>:<file>', …]`. Thư mục không tồn tại ⇒ `[]`.
  - `migrate()` gọi `applyTenantMigrations(opts.ownerUrl)` sau các migration chung.
  - seed: thay `TENANT` bằng `'tenant_bkav'` (dữ liệu mẫu thuộc Bkav).
  - `ensureLoginRoles`: `ALTER ROLE … SET search_path = core, public` (truy vấn quên ngữ cảnh đơn vị ⇒ báo lỗi bảng
    không tồn tại thay vì âm thầm đọc Bkav).
- [ ] `touch db/migrations/tenant/.gitkeep`. Chạy `pnpm --filter @vala/core test:db` ⇒ PASS.
- [ ] Commit (cùng Task 2, 3): `feat(db): core.tenants + migration loại đơn vị; bảng nguồn vào schema đơn vị`.

## Task 5 — Bỏ tiền tố `core.` của bảng đã chuyển

**Files:** mọi `*.ts` trong `apps/api/src`, `apps/worker/src`, `packages/core/src`, `packages/core/scripts`.

- [ ] Đổi tên (giữ `core.service_heartbeats`, `core.schema_migrations`, `core.tenants…`):

```bash
grep -rlE "core\.(source_systems|adapters|crawl_tasks|crawl_spiders|spider_schedules|spider_launches)\b" \
  apps/api/src apps/worker/src packages/core/src packages/core/scripts \
  | xargs sed -i -E 's/\bcore\.(source_systems|adapters|crawl_tasks|crawl_spiders|spider_schedules|spider_launches)\b/\1/g'
```

- [ ] `spiderOps.ts` `heartbeat()` và `apps/api/src/routes/ops.ts` (đọc `core.service_heartbeats`) dùng `withCore`
  (phần đọc heartbeat của ops tách khỏi truy vấn có bảng đơn vị nếu đang chung một câu).
- [ ] `grep -rn "core\.\(source_systems\|adapters\|crawl_tasks\|crawl_spiders\|spider_schedules\|spider_launches\)" apps packages crawlers --include=*.ts --include=*.py` ⇒ rỗng (spider Python không truy vấn CSDL trực tiếp — kiểm lại).

## Task 6 — Danh mục adapter theo đơn vị

**Files:** Modify `packages/core/src/sources.ts`; Test `packages/core/test/db/sources.test.ts`.

- [ ] Test: tạo đơn vị thử `thu` (schema `tenant_thu` có bảng `source_systems` chép cấu trúc từ `tenant_bkav`:
  `CREATE TABLE tenant_thu.source_systems (LIKE tenant_bkav.source_systems INCLUDING ALL)` qua owner, thêm vào
  `core.tenants` trạng thái `hoat_dong`, cấp quyền như 027), chèn nguồn `rieng` chỉ ở `thu`; `SourceRegistries.reloadAll()`;
  trong `runInTenant('thu')` ⇒ `registries.list()` có `rieng`, trong `bkav` ⇒ không; `loadAllSpecs()` (sau `install()`)
  theo đơn vị hiện tại.
- [ ] Thêm vào `sources.ts`:

```ts
/**
 * Mỗi đơn vị một SourceRegistry (danh mục nguồn nằm trong schema đơn vị). Các hàm get/list/reload/specs/errors làm việc
 * với đơn vị của NGỮ CẢNH HIỆN TẠI — nơi gọi (route, worker) không phải biết có nhiều đơn vị.
 */
export class SourceRegistries {
  private byTenant = new Map<string, SourceRegistry>();
  constructor(private readonly db: Db, private readonly opts: { importFromRepo?: boolean } = {}) {}

  private reg(code = currentTenant()): SourceRegistry {
    let r = this.byTenant.get(code);
    if (!r) { r = new SourceRegistry(this.db, this.opts); this.byTenant.set(code, r); }
    return r;
  }

  /** Nạp lại danh mục của mọi đơn vị đang hoạt động (khởi động + mỗi phút). */
  async reloadAll(): Promise<void> {
    for (const code of await activeTenants(this.db)) await runInTenant(code, () => this.reg(code).reload());
  }

  reload(): Promise<void> { return this.reg().reload(); }
  get(code: string) { return this.reg().get(code); }
  list() { return this.reg().list(); }
  get errors() { return this.reg().errors; }
  readonly specs = (): AdapterSpec[] => this.reg().specs();

  install(): this { setSpecProvider(this.specs); return this; }
}
```

  `SourceRegistry.reload()` giữ nguyên (đã chạy trong ngữ cảnh). Đơn vị chưa nạp mà được gọi ⇒ registry rỗng; route nào
  cần chắc chắn có thể `await reload()`.
- [ ] `packages/core/src/tenants.ts`:

```ts
import { withCore, type Db } from './db/index.js';
import { runInTenant } from './tenant.js';

export interface TenantRow { ma: string; ten: string; status: string; login_methods: string[]; sso: unknown; login_fill: string; login_selectors: unknown }

let cache: { at: number; rows: TenantRow[] } | null = null;
/** Danh mục đơn vị (đệm 30 giây — trạng thái tạm khoá có hiệu lực trong vòng 30 giây). */
export async function tenantRows(db: Db, fresh = false): Promise<TenantRow[]> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.rows;
  const rows = await withCore(db, (t) => t.any<TenantRow>(
    'SELECT ma, ten, status, login_methods, sso, login_fill, login_selectors FROM tenants ORDER BY ma'));
  cache = { at: Date.now(), rows };
  return rows;
}
export const activeTenants = async (db: Db) => (await tenantRows(db)).filter((r) => r.status === 'hoat_dong').map((r) => r.ma);
export const tenantStatus = async (db: Db, ma: string) => (await tenantRows(db)).find((r) => r.ma === ma)?.status ?? null;

/** Chạy fn cho từng đơn vị đang hoạt động, mỗi đơn vị trong ngữ cảnh riêng; lỗi của một đơn vị không chặn đơn vị khác. */
export async function forEachTenant(db: Db, fn: (ma: string) => Promise<void>, onError?: (ma: string, e: Error) => void): Promise<void> {
  for (const ma of await activeTenants(db)) {
    try { await runInTenant(ma, () => fn(ma)); } catch (e) { onError?.(ma, e as Error); }
  }
}
```

  Export từ `index.ts`. Chạy test ⇒ PASS.

## Task 7 — Phiên / kết nối theo ngữ cảnh

**Files:** Modify `packages/core/src/sessions.ts`, `packages/core/src/connections.ts`, `apps/api/src/deps.ts`,
`apps/api/src/routes/grants.ts`, `routes/extension.ts`, `apps/api/src/connections.ts`.

- [ ] Kiểu tuỳ chọn `tenant?: string` (đường dẫn vault, vd `'t'` trong test); không đặt ⇒ `currentSchema()` lúc gọi:
  `private ref(userId, source) { return vaultRef(this.o.tenant ?? currentSchema(), userId, source); }` — thay mọi
  `vaultRef(this.o.tenant, …)`.
- [ ] `deps.config.tenant` ⇒ xoá khỏi `ApiConfig`; các chỗ `vaultRef(deps.config.tenant, …)` ⇒ `vaultRef(currentSchema(), …)`.
  Đường dẫn vault của Bkav không đổi (`vault://tenant_bkav/…`).
- [ ] `pnpm --filter @vala/core test` ⇒ `keepalive.test.ts` vẫn PASS.

## Task 8 — Token mang mã đơn vị + hook API

**Files:** Create `apps/api/src/tenant-hook.ts`, `apps/api/test/tenant-hook.test.ts`; Modify `apps/api/src/auth.ts`,
`routes/auth.ts`, `routes/sso.ts`, `routes/extension.ts`, `apps/api/src/app.ts`.

- [ ] Test (fastify trần + hook, `app.inject`):

```ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { currentTenant } from '@vala/core';
import { sign } from '../src/tokens';
import { tenantHook } from '../src/tenant-hook';

const SECRET = 'x'.repeat(32);
async function app(status: Record<string, string> = { bkav: 'hoat_dong', thu: 'hoat_dong', khoa: 'tam_khoa' }) {
  const a = Fastify();
  await a.register(tenantHook({ jwtSecret: SECRET, internalToken: 'nb', status: async (m) => status[m] ?? null }));
  a.get('/t', async () => { await new Promise((r) => setTimeout(r, 2)); return { t: currentTenant() }; });
  return a;
}
const get = async (headers: Record<string, string>) => (await (await app()).inject({ method: 'GET', url: '/t', headers }));

describe('hook đơn vị', () => {
  it('không token ⇒ bkav', async () => expect((await get({})).json()).toEqual({ t: 'bkav' }));
  it('JWT có tnt ⇒ đơn vị đó (cả sau await); không có tnt (token cũ) ⇒ bkav', async () => {
    expect((await get({ authorization: `Bearer ${sign({ uid: 1, kind: 'portal', tnt: 'thu' }, SECRET, 60)}` })).json()).toEqual({ t: 'thu' });
    expect((await get({ authorization: `Bearer ${sign({ uid: 1, kind: 'portal' }, SECRET, 60)}` })).json()).toEqual({ t: 'bkav' });
  });
  it('token thiết bị vxt_<mã>.… ⇒ đơn vị; vxt_ cũ ⇒ bkav', async () => {
    expect((await get({ authorization: 'Bearer vxt_thu.abcdefghijklmnopqrstuvwxyz' })).json()).toEqual({ t: 'thu' });
    expect((await get({ authorization: 'Bearer vxt_abcdefghijklmnopqrstuvwxyz' })).json()).toEqual({ t: 'bkav' });
  });
  it('X-Vala-Tenant chỉ nhận kèm token nội bộ', async () => {
    expect((await get({ authorization: 'Bearer nb', 'x-vala-tenant': 'thu' })).json()).toEqual({ t: 'thu' });
    expect((await get({ 'x-vala-tenant': 'thu' })).json()).toEqual({ t: 'bkav' });
  });
  it('đơn vị tạm khoá / không tồn tại ⇒ 401', async () => {
    expect((await get({ authorization: `Bearer ${sign({ uid: 1, kind: 'portal', tnt: 'khoa' }, SECRET, 60)}` })).statusCode).toBe(401);
    expect((await get({ authorization: 'Bearer vxt_khong.abcdefghijklmnopqrstuvwxyz' })).statusCode).toBe(401);
  });
});
```

- [ ] Viết `apps/api/src/tenant-hook.ts`:

```ts
/**
 * Đặt ngữ cảnh đơn vị cho mỗi request (multi-tenant): JWT của cổng mang `tnt`; token thiết bị `vxt_<mã>.<ngẫu nhiên>`;
 * request nội bộ (spider, runner — có token nội bộ) gửi `X-Vala-Tenant`. Không có / token cũ ⇒ bkav (bản cài cũ chạy
 * tiếp). Đơn vị không tồn tại / tạm khoá ⇒ 401. Chữ ký JWT vẫn do authenticate() kiểm như cũ; ở đây chỉ đọc claim đã
 * ký (verify) để chọn schema.
 */
import fp from 'fastify-plugin';
import { timingSafeEqual } from 'node:crypto';
import { DEFAULT_TENANT, L, Problem, isTenantCode, setRequestTenant, withTenantStore } from '@vala/core';
import { verify } from './tokens.js';

export interface TenantHookOpts {
  jwtSecret: string;
  internalToken: string;
  status: (ma: string) => Promise<string | null>;
}

const DEVICE = /^vxt_([a-z][a-z0-9]{1,19})\./;

export function tenantFromRequest(h: { authorization?: string; 'x-vala-tenant'?: string | string[] }, o: TenantHookOpts): string {
  const bearer = /^Bearer (.+)$/.exec(h.authorization ?? '')?.[1];
  if (!bearer) return DEFAULT_TENANT;
  const want = Buffer.from(o.internalToken);
  const got = Buffer.from(bearer);
  if (got.length === want.length && timingSafeEqual(got, want)) {
    const t = h['x-vala-tenant'];
    return isTenantCode(t) ? t : DEFAULT_TENANT;
  }
  const d = DEVICE.exec(bearer);
  if (d) return d[1]!;
  if (bearer.startsWith('vxt_')) return DEFAULT_TENANT;
  const p = verify<{ tnt?: string }>(bearer, o.jwtSecret);
  return p && isTenantCode(p.tnt) ? p.tnt : DEFAULT_TENANT;
}

export const tenantHook = (o: TenantHookOpts) => fp(async (app) => {
  // Dạng callback: done() gọi BÊN TRONG withTenantStore ⇒ mọi hook sau + handler chạy trong ngữ cảnh của request này.
  app.addHook('onRequest', (req, reply, done) => {
    withTenantStore(() => {
      const ma = tenantFromRequest(req.headers as never, o);
      o.status(ma).then((st) => {
        if (st !== 'hoat_dong') {
          return done(new Problem('unauthenticated', L('Đơn vị không tồn tại hoặc đang tạm khoá', 'The organization does not exist or is suspended')));
        }
        setRequestTenant(ma);
        done();
      }, (e: Error) => done(e));
    });
  });
});
```

  Nếu test cho thấy ngữ cảnh mất sau `await` trong handler (Fastify gọi handler ngoài chuỗi async của hook) ⇒ thay
  bằng `serverFactory` / `app.addHook('onRequest', …)` + `AsyncResource.bind` cho `done` — test phải PASS trước khi đi tiếp.
- [ ] `fastify-plugin` đã có trong apps/api? (`grep fastify-plugin apps/api/package.json`) — chưa có thì không dùng `fp`,
  thay bằng `app.register` ở cấp gốc với `Symbol.for('skip-override')`.
- [ ] `app.ts`: đăng ký `tenantHook({ jwtSecret, internalToken, status: (m) => tenantStatus(deps.writer, m) })` TRƯỚC mọi route.
- [ ] `auth.ts`: `issuePortalToken(userId, secret)` ⇒ `sign({ uid, kind: 'portal', tnt: currentTenant() }, …)`;
  `authenticate`: payload có `tnt` mà khác `currentTenant()` ⇒ 401 (phòng hờ).
- [ ] `routes/extension.ts` `issueDeviceToken`: token mới `vxt_${currentTenant()}.${random}`; `authenticateDevice` nhận cả
  dạng cũ (regex `^Bearer (vxt_[\w.-]{20,130})$`).
- [ ] `routes/sso.ts`: mọi xử lý callback đã chạy trong ngữ cảnh request (bkav) — đợt 2 mới đưa mã đơn vị vào `state`.
- [ ] `pnpm --filter @vala/api test` ⇒ PASS. Commit `feat(api): token mang mã đơn vị, hook ngữ cảnh đơn vị`.

## Task 9 — Worker + Crawlab theo đơn vị

**Files:** Modify `packages/core/src/ingest/crawl.ts`, `queue.ts`, `spiderOps.ts`, `crawlab.ts`, `apps/worker/src/main.ts`,
`apps/api/src/main.ts`, `apps/api/src/routes/dataSchedules.ts`, `routes/dashboard.ts`, `crawlers/_sdk/vala_sdk.py`.

- [ ] `CrawlJob` thêm `tenant: string` (bắt buộc) ⇒ typecheck chỉ ra mọi chỗ tạo job; mỗi chỗ thêm `tenant: currentTenant()`.
- [ ] Worker `crawlWorker`: `runInTenant(job.data.tenant ?? DEFAULT_TENANT, () => crawlUserSource(…))` (job cũ còn trong
  hàng đợi không có `tenant` ⇒ bkav).
- [ ] Worker bảo trì: `raw_partitions`, `session_refresh`, `session_keepalive`, `due_subscriptions` (gồm
  `checkSpiderLaunches`), `crawlab_health` ⇒ bọc `forEachTenant(writer, async () => { …phần cũ… }, (ma, e) => log.error(…, { tenant: ma }))`;
  `heartbeat` gọi một lần ngoài vòng lặp (bảng core).
- [ ] Khởi động worker: `registerSpecs` + `ensure_raw_partitions` + `ensureRecordIndexes` ⇒ trong `forEachTenant`.
  `SourceRegistry` ⇒ `SourceRegistries` + `reloadAll()` (interval cũng `reloadAll`).
- [ ] API `main.ts`: `SourceRegistries` thay `SourceRegistry`; `sources.reloadAll()` lúc khởi động + mỗi phút;
  `resolveBaseUrl` / `sourceInfo` đã dùng `withTenant` ⇒ chạy theo ngữ cảnh. `ApiDeps.sources: SourceRegistries`.
- [ ] `spiderOps.launchSpider`: tham số chạy thêm `--tenant ${currentTenant()}`.
- [ ] `vala_sdk.py`: `p.add_argument('--tenant')`; có ⇒ mọi request tới API gửi header `X-Vala-Tenant: <mã>`
  (thêm vào header mặc định của client `_api`). Không có ⇒ không gửi (API hiểu là bkav). Chạy
  `crawlers/_sdk` test hiện có (`python -m pytest crawlers/_sdk -q` trong `scratchpad/pyenv` nếu thiếu pytest thì
  `python -m unittest`).
- [ ] `pnpm -r typecheck && pnpm -r test` ⇒ PASS. Commit `feat(worker): việc chạy theo đơn vị; spider gửi mã đơn vị`.

## Task 10 — Script quản trị

**Files:** Modify `packages/core/scripts/create-admin.ts`.

- [ ] Nhận `--tenant <mã>` (mặc định `bkav`); schema `tenantSchema(ma)` thay `TENANT`; kiểm `isTenantCode`.

## Task 11 — Tách dữ liệu + chạy thật

**Files:** Create `packages/core/test/db/isolation.test.ts`.

- [ ] Test: đơn vị `thu` (schema tạo bằng `CREATE TABLE tenant_thu.app_users (LIKE tenant_bkav.app_users INCLUDING ALL)`
  + `records`), chèn người dùng khác nhau mỗi bên; `runInTenant('thu')` + `withTenant` chỉ thấy người của `thu`;
  `withUserContext` (pool reader, RLS) trong `bkav` không thấy bản ghi của `thu`.
- [ ] `pnpm -r typecheck && pnpm -r test && pnpm --filter @vala/core test:db` ⇒ PASS.
- [ ] Chạy thật trên dev: chạy migration (`pnpm db:migrate` hoặc lệnh migrate của dự án) vào CSDL dev; khởi động lại
  container `api-dev`, `worker-dev`; kiểm: đăng nhập cổng (mật khẩu), `/api/v1/me`, Quản trị → Hệ thống nguồn liệt kê
  đủ nguồn, "Chạy ngay" một nguồn (worker log có `crawl xong`), Desktop dev đang đăng nhập vẫn đồng bộ (token cũ ⇒ bkav),
  spider QLVB thử chạy qua Crawlab ghi được bản ghi.
- [ ] Cập nhật `docs/` (mục kiến trúc CSDL / triển khai: migration 027 + thư mục `db/migrations/tenant/`), commit
  `feat: nền tảng nhiều đơn vị (đợt 1)`.

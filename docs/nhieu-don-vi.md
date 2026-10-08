# Nhiều đơn vị (multi-tenant) — cách code chạy

Thiết kế: `docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md`. Đợt 1 (nền tảng) và đợt 2 (đăng nhập 2 bước)
xong 08/10/2026; trang Quản trị hệ thống → Đơn vị (đợt 3) làm sau.

## Mỗi đơn vị một schema

- `core.tenants` — danh mục đơn vị: mã (`[a-z][a-z0-9]{1,19}`) ⇒ schema `tenant_<mã>`, tên, tên miền
  (`core.tenant_domains`, mỗi tên miền thuộc một đơn vị), trạng thái (`dang_tao` · `hoat_dong` · `tam_khoa` · `loi`),
  cách đăng nhập. Bkav = `bkav` (`tenant_bkav`).
- Mọi dữ liệu nghiệp vụ VÀ danh mục hệ thống nguồn (`source_systems`, `adapters`, `crawl_spiders`, `spider_schedules`,
  `spider_launches`, `crawl_tasks` — chuyển từ `core` ở migration 027) nằm trong schema đơn vị. `core` chỉ còn phần dùng
  chung: danh mục đơn vị, `schema_migrations`, `service_heartbeats`, `system_admins`.
- Truy vấn **không ghi tên schema** (`SELECT … FROM source_systems`): `search_path` do ngữ cảnh đơn vị quyết định.

## Ngữ cảnh đơn vị (`packages/core/src/tenant.ts`)

- `withTenant` / `withUserContext` đặt `search_path = tenant_<mã>, core, public` theo đơn vị của ngữ cảnh hiện tại
  (`AsyncLocalStorage`). **Thiếu ngữ cảnh ⇒ lỗi** "Thiếu ngữ cảnh đơn vị" — không có đơn vị mặc định ngầm. Vai trò
  `vala_reader` / `vala_writer` có `search_path` mặc định `core, public`: truy vấn quên ngữ cảnh báo "bảng không tồn tại".
- Chỉ chạm bảng `core.*` ⇒ `withCore`.
- **API** (`apps/api/src/tenant-hook.ts`, hook `onRequest` đầu tiên): JWT cổng có claim `tnt`; token thiết bị
  `vxt_<mã>.<ngẫu nhiên>` (Bkav giữ dạng cũ `vxt_<ngẫu nhiên>` — bản Desktop/tiện ích đã cài kiểm dạng này); request nội
  bộ (token nội bộ) gửi `X-Vala-Tenant`. Không có ⇒ `bkav`. Đơn vị không tồn tại / tạm khoá ⇒ 401.
- **Worker**: việc crawl mang `tenant` (`CrawlJob.tenant`, việc cũ không có ⇒ `bkav`) và chạy trong `runInTenant`; việc
  định kỳ (phân vùng, làm mới / giữ phiên, lịch đến hạn, kiểm tra Crawlab) lặp `forEachTenant` — lỗi của một đơn vị
  không chặn đơn vị khác. `jobId` có mã đơn vị (id người dùng trùng nhau giữa các đơn vị).
- **Spider** (`vala_sdk`): `--tenant <mã>` ⇒ header `X-Vala-Tenant`. Worker chỉ truyền `--tenant` cho đơn vị khác Bkav.
- Danh mục adapter trong bộ nhớ: `SourceRegistries` (mỗi đơn vị một `SourceRegistry`); `loadAllSpecs()` trả adapter
  của đơn vị đang chạy.
- Đường dẫn vault: `vault://tenant_<mã>/users/<id>/<nguồn>` (của Bkav không đổi).

## Đăng nhập 2 bước

- **Bước 1** `POST /auth/lookup {login: "tk@tênmiền"}` (công khai, 20 lần/phút/IP + 10 lần/phút/chuỗi): tên miền ⇒ đơn vị
  (`core.tenant_domains`, đơn vị `hoat_dong`); tài khoản = phần trước @, khớp `username` (hoặc `email` đầy đủ) trong schema
  đơn vị. Trả `{tenant: {ma, ten}, account, methods, fill, selectors}`; lỗi rõ: không có đơn vị / chưa có tài khoản (bỏ
  qua khi đơn vị bật SSO tự tạo tài khoản).
- **Bước 2**: `/auth/login` và `/ext/login` nhận `tenant` (hoặc `username` dạng `tk@tênmiền`; tài khoản trơn ⇒ Bkav);
  SSO `/auth/sso/login?tenant=…&login_hint=…` ⇒ IdP của đơn vị, `state` mang mã đơn vị.
- **Cách đăng nhập**: Bkav theo `.env` như trước (`LOGIN_SSO`, `SSO_*`); đơn vị khác theo `core.tenants.login_methods`
  + `core.tenants.sso` (jsonb: các khoá như `.env` viết thường bỏ `SSO_` — `origin`, `issuer`, `client_id`,
  `authorize_url`, `match_by`, `auto_create`, `email_domain`, `pkce`…; client secret ở vault
  `vault://core/tenants/<mã>/sso`, khoá `client_secret`). `login_fill` = điền `account` hay `email` ở bước 2;
  `login_selectors` = `{username, password}` bộ chọn ô trên trang SSO (Desktop tự điền + khoá; mặc định WSO2).
  Uỷ quyền hệ thống nguồn qua SSO (`grant`) vẫn dùng cấu hình Bkav.
- **Cổng web** `/dang-nhap`: 2 bước, nhớ tài khoản (`localStorage vala.lastLogin`).
- **Vala Desktop 0.2.5**: chưa đăng nhập ⇒ màn hình đăng nhập (`login-page.ts`); SSO mở trong view trong thẻ, bắt
  `/dang-nhap/xong#token=…`. Token cổng ⇒ `/me/extension-devices` ⇒ token thiết bị. Tab Báo cáo lấy phiên qua cầu nối
  (`portal_token`, app xin `POST /ext/portal-token` — chỉ token `extension_devices.kind = 'desktop'`).
- **Tiện ích 0.4.5**: ô tài khoản nhận `tên@đơn vị`.

## Migration

- `db/migrations/NNN_*.sql` — phần chung, chạy một lần (như cũ).
- `db/migrations/tenant/NNN_*.sql` — **thay đổi bảng trong schema đơn vị từ nay viết ở đây**, không ghi tên schema;
  `pnpm db:migrate` áp cho từng đơn vị (`core.tenant_migrations` ghi đã áp cho ai). Nhớ `GRANT` cho `app_reader` /
  `app_writer` như các migration cũ.

## Test

- `pnpm --filter @vala/core test:db` — test chạm CSDL (tạo lại database `vala_test`): migration 027, migration loại đơn
  vị, danh mục nguồn theo đơn vị, tách dữ liệu giữa hai đơn vị (pool ghi + pool đọc có RLS).
- `apps/api/test/tenant-hook.test.ts` — hook chọn đơn vị theo token / header, ngữ cảnh giữ qua hook con + handler.

# Nhiều đơn vị (multi-tenant) — cách code chạy

Thiết kế: `docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md`. Đợt 1 (nền tảng), đợt 2 (đăng nhập 2 bước) và
đợt 3 (Quản trị hệ thống → Đơn vị, trong Vala Desktop) xong 08/10/2026.

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

## Danh mục ứng dụng Vala Desktop (theo đơn vị)

- Bảng `desktop_apps` + `desktop_app_layouts` (migration đơn vị `002_desktop_apps.sql`); thiết kế:
  `docs/superpowers/specs/2026-10-08-desktop-app-catalog-design.md`. Quản trị đơn vị sửa ở Vala Desktop → Quản trị →
  Ứng dụng Desktop (cổng web không còn trang này). Desktop đọc `GET /ext/apps`, lưu bố cục `PUT /ext/layout`.
- **Liên kết mở trong Vala Desktop** (`app_settings.desktop_open_inside`, migration đơn vị 003): tên miền (gồm tên miền con)
  mà link mở cửa sổ / tab mới tới đó mở thành tab trong app thay vì trình duyệt; quản trị khai ở Quản trị → Ứng dụng Desktop
  (`GET/PUT /admin/desktop-links`). `/ext/apps` trả `open_inside`; Desktop cộng thêm tên miền các ứng dụng trong danh mục
  (`apps.ts insideDomains`, `tabs-model.ts openTarget`).
- Báo cáo (`kind = reports`) luôn đi kèm Desktop: không tắt / xoá được; danh mục thiếu thì Desktop tự thêm.
- `app_settings.desktop_home_url` chỉ còn cho Desktop ≤ 0.2.4.

## SSO của Vala Desktop

- Máy chủ trả `sso_hosts` (host SSO của đơn vị: Bkav từ `.env` khi bật SSO, đơn vị khác từ `core.tenants.sso`) ở
  `/auth/lookup` và `/ext/apps`.
- Desktop (`apps/desktop/src/sso-session.ts`): màn hình đăng nhập SSO dùng chung phiên trình duyệt với các tab ⇒ ứng dụng
  dùng cùng SSO vào thẳng; cookie phiên của host SSO được chuyển thành cookie có hạn 14 ngày ⇒ mở lại app vẫn còn; đăng
  xuất ⇒ xoá cookie của host SSO. Mật khẩu SSO lưu một lần với khoá `sso` (autofill.ts) ⇒ trang đăng nhập SSO trong
  bất kỳ ứng dụng nào tự điền / tự đăng nhập (giới hạn chống khoá tài khoản của T08).

## Quản trị hệ thống → Đơn vị (đợt 3)

- Ai: `core.system_admins (tenant, user_id)` — ban đầu dieptx@bkav.com + ops@bkav.com (migration 028, nếu tài khoản có sẵn; dev seed có ops). API trả `is_system_admin`
  ở `/me` và `/ext/apps`. Giao diện: Vala Desktop → menu hồ sơ → Quản trị đơn vị → mục **Đơn vị** (nhóm Quản trị hệ
  thống). Cổng web không có trang này.
- API `/system/tenants` (`apps/api/src/routes/systemTenants.ts`): danh sách (kèm số người dùng), xem, tạo, sửa (tên, tên
  miền, cách đăng nhập, SSO — client secret vào vault `vault://core/tenants/<mã>/sso`, không trả ra; `sso.password_url` =
  trang đổi mật khẩu SSO), tạm khoá / mở lại (không tự khoá đơn vị mình), thử lại khi lỗi. Bkav: cách đăng nhập theo
  `.env`, chỉ sửa tên + tên miền. **Không xoá** đơn vị trên giao diện.
- Tạo ⇒ `core.tenants` trạng thái `dang_tao` + `provision` (chép từ đơn vị nào, quản trị đầu tiên — mật khẩu đã băm; pool
  reader không đọc được cột này) ⇒ API đẩy việc bảo trì `tenant_provision` ⇒ worker dựng bằng **quyền chủ CSDL**
  (`DATABASE_OWNER_URL`) — `packages/core/src/tenant-provision.ts`, một giao dịch: schema từ bản nền → migration đơn vị
  sau bản nền → chép cấu hình (hệ thống nguồn, adapter, spider, tab Tổng quan, báo cáo, kịch bản + ứng dụng Desktop,
  thương hiệu) → `app_settings`, đơn vị tổ chức gốc, quản trị đầu tiên (`must_change_password`), phân vùng → `hoat_dong`.
  Lỗi ⇒ huỷ hết, `loi` + `status_note`. Worker còn quét `dang_tao` lúc khởi động và mỗi phút; dựng xong thì nạp adapter,
  chỉ mục và đẩy spider lên Crawlab ngay.
- **Bản nền** `db/tenant-baseline.sql`: `pg_dump --schema-only` của `tenant_bkav` (bỏ phân vùng `raw_records_*`, chỉ mục
  động `records_f_*`), tên schema là `{{schema}}`, dòng đầu ghi các migration đơn vị đã gồm. Sinh lại:
  `pnpm --filter @vala/core tenant-baseline` (không bắt buộc sau mỗi migration đơn vị — đơn vị mới vẫn được áp các
  migration sau bản nền). Test `test/db/provision.test.ts` so cấu trúc (cột, mặc định, ràng buộc, chỉ mục, RLS, hàm, quyền)
  của đơn vị dựng từ bản nền với `tenant_bkav` dựng từ migration ⇒ lệch là test đỏ.
- **Crawlab** dùng chung: spider của đơn vị khác Bkav tên `<mã đơn vị>__<mã spider>` (`crawlabSpiderName`), Bkav giữ tên cũ.
- Bước 1 đăng nhập báo rõ: đơn vị tạm khoá / đang thiết lập / không có tên miền.

## Migration

- `db/migrations/NNN_*.sql` — phần chung, chạy một lần (như cũ).
- `db/migrations/tenant/NNN_*.sql` — **thay đổi bảng trong schema đơn vị từ nay viết ở đây**, không ghi tên schema;
  `pnpm db:migrate` áp cho từng đơn vị đã có schema (`core.tenant_migrations` ghi đã áp cho ai); đơn vị dựng sau tự áp. Nhớ `GRANT` cho `app_reader` /
  `app_writer` như các migration cũ.

## Test

- `pnpm --filter @vala/core test:db` — test chạm CSDL (tạo lại database `vala_test`): migration 027, migration loại đơn
  vị, danh mục nguồn theo đơn vị, tách dữ liệu giữa hai đơn vị (pool ghi + pool đọc có RLS).
- `apps/api/test/tenant-hook.test.ts` — hook chọn đơn vị theo token / header, ngữ cảnh giữ qua hook con + handler.

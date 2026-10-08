# Đợt 2 — Đăng nhập 2 bước: kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** đăng nhập `tàikhoản@tênmiền` ⇒ đơn vị ⇒ trang đăng nhập của đơn vị (mật khẩu Vala hoặc SSO của đơn vị) trên
cổng web, Vala Desktop (màn hình đăng nhập riêng) và tiện ích; đăng nhập Desktop xong thì tab Báo cáo tự có phiên.

**Architecture:** API thêm `POST /auth/lookup` (tên miền ⇒ đơn vị qua `core.tenant_domains`, kiểm tài khoản trong schema
đơn vị, giới hạn nhịp); mọi đường đăng nhập nhận `tenant` hoặc `tk@tênmiền` và chạy trong `runInTenant`; SSO theo đơn vị
(`state` mang mã đơn vị; Bkav dùng cấu hình `.env`, đơn vị khác dùng `core.tenants.sso` + client secret trong vault).
Desktop: trang cục bộ `login` (như `chat`) thay thanh ứng dụng khi chưa đăng nhập; mật khẩu ⇒ `/auth/login` (+ đổi mật
khẩu tạm) ⇒ `/me/extension-devices`; SSO ⇒ trang SSO của đơn vị trong một view, tự điền + khoá ô tài khoản, bắt
`/dang-nhap/xong#token=…`. Tab Báo cáo lấy phiên từ app qua cầu nối (`portal_token`, app xin bằng `POST /ext/portal-token`).

Spec: `docs/superpowers/specs/2026-10-08-multi-tenant-login-design.md` mục 2, 4, 5.

## Task 1 — Tra đơn vị: `POST /auth/lookup` (+ test)
- `apps/api/src/login-target.ts` (mới): `parseLogin(s)` ⇒ `{ account, domain } | null` (chữ thường, cắt khoảng trắng; không
  có `@` ⇒ `{ account, domain: null }`); `resolveTenant(deps, domain)` ⇒ hàng `core.tenants` đang hoạt động (qua
  `core.tenant_domains`, `withCore`) hoặc `null`; `loginMethods(deps, row)` — Bkav = `deps.config.loginMethods` (cấu hình
  `.env` như cũ), đơn vị khác = `row.login_methods` (bỏ `sso` khi thiếu cấu hình SSO); `accountExists(deps, account,
  full)` trong ngữ cảnh đơn vị: `lower(username) = account OR lower(email) = full`, đang hoạt động.
- Route công khai `POST /auth/lookup {login}` ⇒ `{ tenant: {ma, ten}, account, methods, fill, selectors }`; lỗi
  `tenant_not_found` (404), `account_not_found` (404, bỏ qua khi SSO tự tạo tài khoản), `rate_limited` (429: 20 lần/phút
  theo IP, 10 lần/phút theo `login`). `fill` = `account` hoặc `account@domain` theo `login_fill`.
- Test thuần `apps/api/test/login-target.test.ts` cho `parseLogin`; test CSDL ở core không cần (route mỏng).

## Task 2 — Đăng nhập mật khẩu theo đơn vị
- `checkPortalPassword(deps, username, password)` giữ nguyên chữ ký nhưng chạy trong ngữ cảnh đơn vị do nơi gọi đặt.
- Helper `withLoginTenant(deps, body, fn)`: `body.tenant` (mã) hoặc `username` dạng `tk@tênmiền` ⇒ `runInTenant(mã, fn)`
  với `username = account`; tài khoản trơn ⇒ đơn vị hiện tại của request (bkav). Dùng ở `/auth/login`, `/ext/login`.
- `loginBodySchema` thêm `tenant`.

## Task 3 — SSO theo đơn vị
- `apps/api/src/sso-clients.ts`: `ssoFor(deps, tenant)` ⇒ `SsoClient` — Bkav: `deps.sso`; đơn vị khác: `core.tenants.sso`
  (jsonb: origin/issuer/client_id/endpoint/scope/match_by/auto_create/email_domain) + secret `vault://core/tenants/<mã>/sso`
  (đệm theo `updated_at`). Không đủ cấu hình ⇒ `null`.
- `/auth/sso/login` + `/auth/sso/start` nhận `tenant`, `login_hint`; `state` thêm `tnt`; `authorizeUrl` thêm `login_hint`.
- `/sso/callback` (login) chạy `handleLogin` trong `runInTenant(st.tnt ?? bkav)` với client của đơn vị;
  `findOrLinkUser` dùng `cfg` của client đó. `ssoRoutes` đăng ký luôn (từng đơn vị tự quyết có SSO hay không).
- Uỷ quyền nguồn qua SSO (`grant`) giữ cấu hình Bkav (đơn vị khác chưa dùng) — ghi chú trong docs.

## Task 4 — Token cổng từ token thiết bị Desktop
- Migration loại đơn vị đầu tiên `db/migrations/tenant/001_device_kind.sql`: `extension_devices.kind` (`extension` |
  `desktop`), gán `desktop` cho thiết bị tên bắt đầu `Vala Desktop`.
- `issueDeviceToken` ghi `kind = via`. `POST /ext/portal-token` (token thiết bị, chỉ `kind = desktop`) ⇒ `{access_token,
  expires_in}` — tab Báo cáo trong app tự có phiên.

## Task 5 — Cổng web: `/dang-nhap` 2 bước
- `Login.tsx`: bước 1 ô "Tài khoản (tên@đơn vị)" ⇒ `/auth/lookup`; bước 2 tên đơn vị + tài khoản khoá + "Đổi tài khoản";
  mật khẩu ⇒ `/auth/login {username: account, tenant}`; chỉ SSO ⇒ chuyển `startLogin` kèm `tenant` + `login_hint`; cả hai
  ⇒ form + nút SSO. Nhớ `vala.lastLogin` (localStorage) ⇒ lần sau vào thẳng bước 2. Song ngữ.
- Trong Vala Desktop: App chưa có token mà cầu nối báo `portal_token` ⇒ dùng luôn (không hiện trang đăng nhập); bỏ tự
  chuyển SSO cũ (`autoSso`).
- `reauth.startLogin(next, {tenant, hint})`.

## Task 6 — Desktop: màn hình đăng nhập
- `resources/login.html` + `src/renderer/login.ts` + `src/login-preload.ts` + `src/login-page.ts` + `src/login-strings.ts`.
  Bước 1/2 như web; mật khẩu tạm ⇒ form đổi mật khẩu tại chỗ; SSO ⇒ view trang SSO của đơn vị trong thẻ (tự điền + khoá ô
  tài khoản theo `selectors`, mặc định WSO2 `#usernameUserInput, input[name=username]`), bắt điều hướng tới
  `/dang-nhap/xong#token=…`.
- Xong ⇒ `POST /me/extension-devices` (JWT) ⇒ `adoptDeviceToken`; lưu `lastLogin` trong settings.
- `browser.ts`: chưa đăng nhập ⇒ chỉ hiện trang `login` (thanh ứng dụng ẩn, `sidebarWidth() = 0`); đăng nhập ⇒ Trợ lý AI;
  đăng xuất ⇒ về `login` (bước 2). Nút "Đăng nhập" cũ của thanh dọc / khay ⇒ mở `login`.
- `account.ts` `DEVICE_TOKEN` nhận `vxt_<mã>.…`. Cầu nối `vala:bridge-hello` trả `portal_token` (xin `/ext/portal-token`,
  đệm tới gần hết hạn).
- Song ngữ, sáng/tối, bo tròn như phần còn lại.

## Task 7 — Tiện ích
- Không đổi mã: `/ext/login` hiểu `tk@tênmiền` ở máy chủ. Sửa chữ gợi ý ô tài khoản (nếu có) thành "tên@đơn vị".

## Task 8 — Kiểm thử + chạy thật
- `pnpm -r typecheck && pnpm -r test && pnpm --filter @vala/core test:db`.
- Dev: đơn vị thử `thu` (tên miền `thu.vn`, mật khẩu) tạo bằng script tạm (đợt 3 mới có trang) — chỉ để chạy luồng; xoá
  sau. Web: `ops@bkav.com` 2 bước; `xyz@khong.vn` ⇒ báo không có đơn vị; `khongco@bkav.com` ⇒ báo không có tài khoản.
  Desktop (hồ sơ dev chép riêng): màn hình đăng nhập ⇒ mật khẩu ⇒ vào Trợ lý AI, tab Báo cáo có phiên; SSO qua máy SSO
  giả lập `:4020` ⇒ ô tài khoản được điền + khoá. Chụp ảnh sáng/tối.
- Desktop bump 0.2.5 + CHANGELOG (phát hành khi người dùng muốn).

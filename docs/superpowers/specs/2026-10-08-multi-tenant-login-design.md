# Nhiều đơn vị (multi-tenant) + đăng nhập 2 bước

Ngày 08/10/2026. Nguồn: cuộc họp 07/10 (`plan/toan-van-ghi-am-cuoc-hop-07-10.md` phần 1 + 3,
`plan/ban-de-an-tong-the-vala-ai-desktop.md` mục 2.1) và trao đổi với người dùng 08/10.

Quyết định của người dùng: **một backend chung** phục vụ nhiều đơn vị, mỗi đơn vị một schema CSDL `tenant_<mã>` (đúng thiết
kế sẵn từ migration 001); luồng 2 bước áp dụng **cả Desktop lẫn cổng web**; đơn vị do **quản trị hệ thống** tạo trên
giao diện.

## Hiện trạng (trước thay đổi)

- Một đơn vị duy nhất: `TENANT = process.env.TENANT ?? 'tenant_bkav'` (`packages/core/src/env.ts`). `withTenant` /
  `withUserContext` (192 chỗ gọi, 33 file) đặt `search_path` theo hằng này; worker, `SessionManager`,
  `ConnectionSessions`, script `create-admin` cũng vậy.
- Danh mục hệ thống nguồn và phần crawl nằm ở schema dùng chung `core`: `source_systems` (có `base_url`), `adapters`,
  `crawl_tasks`, `crawl_spiders`, `spider_schedules` (+ `spider_launches`, `service_heartbeats` là vận hành chung).
- Migration 001–026 viết cứng `tenant_bkav` (`SET search_path = tenant_bkav…`, hàm `SECURITY DEFINER`).
- Đăng nhập: cổng có mật khẩu (`/auth/login`, tên đăng nhập trơn) và SSO WSO2 (cấu hình `.env`); Desktop nhận token
  thiết bị gián tiếp khi người dùng đăng nhập cổng ở tab Báo cáo; tiện ích dùng `/ext/login`.

## 1. Backend nhiều đơn vị

### Danh mục đơn vị — `core.tenants`

| cột | ý nghĩa |
|---|---|
| `ma` | mã đơn vị `[a-z][a-z0-9]{1,19}` — schema là `tenant_<ma>` |
| `ten` | tên hiển thị |
| `domains text[]` | tên miền dùng ở bước 1 (`bkav.com`); mỗi tên miền thuộc đúng một đơn vị (chỉ mục duy nhất) |
| `status` | `dang_tao` · `hoat_dong` · `tam_khoa` · `loi` (+ `status_note`) |
| `login_methods text[]` | `password` và/hoặc `sso` |
| `sso jsonb` | `origin`, `client_id`, các endpoint (ghi đè mặc định WSO2), `auto_create`, `match_by`, `email_domain`; **client secret trong vault** (`vault://core/tenants/<ma>/sso`) |
| `login_fill` | điền gì vào trang đăng nhập bước 2: `account` (phần trước @) hoặc `email` (đủ `tk@tênmiền`) |
| `login_selectors jsonb` | bộ chọn ô tài khoản / mật khẩu trên trang SSO (Desktop tự điền + khoá); mặc định khớp WSO2 |

`core.system_admins (tenant, user_id)` — quản trị hệ thống (mục 3).

### Ngữ cảnh đơn vị (AsyncLocalStorage)

- `packages/core`: `tenantContext` (AsyncLocalStorage) + `runInTenant(ma, fn)` / `currentTenant()`. `withTenant` /
  `withUserContext` lấy schema từ ngữ cảnh; **thiếu ngữ cảnh ⇒ ném lỗi** (không rơi về `tenant_bkav` — tránh đọc nhầm
  đơn vị). Các lời gọi giữ nguyên chữ ký.
- API: hook đầu request xác định đơn vị từ token (JWT cổng có claim `tnt`; token thiết bị có tiền tố mã đơn vị
  `vxt_<ma>_…`; route công khai như `/auth/lookup` tự đặt theo tham số) rồi chạy handler trong `runInTenant`.
  Token không có mã đơn vị (bản cũ) ⇒ `bkav`. Đơn vị `tam_khoa` ⇒ từ chối token.
- Worker: mỗi việc trong hàng đợi mang `tenant`; vòng lịch (crawl, giữ phiên, lịch dữ liệu) lặp qua các đơn vị
  `hoat_dong`, mỗi đơn vị chạy trong ngữ cảnh của nó. `SessionManager` / `ConnectionSessions` lấy đơn vị theo ngữ cảnh
  thay vì tham số khởi tạo (đường dẫn vault đã có mã đơn vị).
- Kết quả crawl gửi về mang mã đơn vị (tham số task Crawlab).

### Hệ thống nguồn theo đơn vị

Chuyển `source_systems`, `adapters`, `crawl_tasks`, `crawl_spiders`, `spider_schedules` từ `core` vào schema đơn vị
(dữ liệu hiện có ⇒ `tenant_bkav`). Mỗi đơn vị tự quản nguồn (địa chỉ eGov của Núi Thành khác Bkav). `spider_launches`,
`service_heartbeats` ở lại `core` (thêm cột `tenant` cho `spider_launches`). Tên spider trên Crawlab: của Bkav giữ
nguyên (không đụng phần đang chạy), đơn vị mới đặt tiền tố `<ma>_`.

### Migration hai loại

- `db/migrations/NNN_*.sql` — như cũ, chạy một lần (phần `core`; 001–026 giữ nguyên lịch sử).
- `db/migrations/tenant/NNN_*.sql` — viết **không ghi tên schema**; trình chạy áp cho từng đơn vị (`search_path =
  tenant_<ma>, core, public`), ghi nhận ở `core.tenant_migrations (tenant, name)`.

### Tạo đơn vị mới

Chép **cấu trúc** của `tenant_bkav` sang `tenant_<ma>` (bảng, phân vùng, chỉ mục, ràng buộc, RLS, hàm, quyền —
`pg_dump --schema-only` rồi đổi tên schema), không chép dữ liệu; đánh dấu các migration loại đơn vị đã áp. Việc tạo do
**worker** làm (chỉ worker giữ quyền chủ CSDL; API mở Internet thì không). Tuỳ chọn **sao chép cấu hình từ đơn vị
khác**: hệ thống nguồn (+ adapter, spider), báo cáo, gói kịch bản Desktop.

## 2. Đăng nhập 2 bước

### API (web, Desktop, tiện ích dùng chung)

- `POST /auth/lookup {login: "tk@tênmiền"}` (công khai): tên miền ⇒ đơn vị `hoat_dong`; phần trước @ ⇒ tài khoản
  (`app_users.username` của đơn vị). Trả `{tenant: {ma, ten}, account, methods, fill}` (`fill` = chữ điền sẵn ở bước 2
  theo `login_fill`). Lỗi rõ ngay bước 1: `tenant_not_found` ("Không tìm thấy đơn vị cho tên miền …"),
  `account_not_found` ("Tài khoản … chưa có trong <đơn vị>") — bỏ kiểm tài khoản khi đơn vị bật SSO tự tạo tài khoản.
  Vì báo được tài khoản có tồn tại ⇒ **giới hạn nhịp** theo IP và theo tài khoản.
- `/auth/login`, `/ext/login`: nhận `tenant` (hoặc `username` dạng `tk@tênmiền`); tài khoản trơn ⇒ `bkav`.
- `/auth/sso/start?tenant=…&login_hint=…`: IdP của đơn vị; `state` mang mã đơn vị ⇒ callback cấp token đúng đơn vị.

### Cổng web `/dang-nhap`

Bước 1: "Tài khoản (dạng tên@đơn vị)" ⇒ Tiếp tục. Bước 2: tên đơn vị, tài khoản **khoá** + "Đổi tài khoản"; mật khẩu ⇒
ô mật khẩu; chỉ SSO ⇒ chuyển sang IdP của đơn vị; cả hai ⇒ form mật khẩu + "Đăng nhập bằng SSO của <đơn vị>". Nhớ tài
khoản lần trước (localStorage) ⇒ lần sau vào thẳng bước 2.

### Desktop

- Chưa đăng nhập ⇒ **màn hình đăng nhập** (trang cục bộ, thẻ bo góc giữa cửa sổ, header giữ nút cửa sổ, chưa có thanh
  ứng dụng), 2 bước như trên. Mật khẩu ⇒ nhập ngay trong màn hình (mật khẩu tạm ⇒ đổi tại chỗ). SSO ⇒ trang đăng nhập
  SSO của đơn vị mở trong thẻ; app **tự điền tài khoản và khoá ô tài khoản** (`login_selectors`), người dùng chỉ gõ
  mật khẩu.
- Xong ⇒ token thiết bị; **tab Báo cáo tự có phiên** (app cấp phiên cho cổng — ngược chiều hiện nay); vào thanh ứng dụng.
  Đăng xuất ⇒ về màn hình đăng nhập ở bước 2 với tài khoản cũ. Địa chỉ máy chủ cố định theo bản build.

### Tiện ích Chrome

Ô đăng nhập nhận `tên@đơnvị`; tài khoản trơn ⇒ Bkav.

## 3. Quản trị hệ thống

> Cập nhật 08/10/2026: trang đặt **trong Vala Desktop** (trang Quản trị, mục Đơn vị), không ở cổng web; quản trị hệ thống
> ban đầu ops@bkav.com. Cách làm: `docs/superpowers/plans/2026-10-08-multi-tenant-dot3-don-vi.md`, `docs/nhieu-don-vi.md`.

- `core.system_admins`: vài tài khoản Bkav; thấy thêm **Quản trị hệ thống → Đơn vị**: danh sách (mã, tên, tên miền,
  cách đăng nhập, số người dùng, trạng thái); tạo (mã, tên, tên miền, cách đăng nhập + SSO + bộ chọn, **quản trị đầu
  tiên** — tài khoản + mật khẩu tạm bắt đổi, "Sao chép cấu hình từ đơn vị…") ⇒ "Đang tạo" ⇒ worker ⇒ "Hoạt động" /
  "Lỗi"; sửa; tạm khoá. **Không xoá** trên giao diện.
- Quản trị đơn vị (`is_ops_admin`) giữ các trang Quản trị hiện có, chỉ trong đơn vị mình.

## 4. Tương thích

- Migration tạo đơn vị `bkav` (`tenant_bkav`): tên miền từ `SSO_EMAIL_DOMAIN` (mặc định `bkav.com`), cách đăng nhập +
  SSO từ `.env` hiện tại; chuyển bảng nguồn vào `tenant_bkav` giữ dữ liệu.
- Token cổng / thiết bị / tiện ích cũ chạy tiếp (coi là `bkav`). Desktop 0.2.4 vẫn đăng nhập kiểu cũ; 0.2.5 mới có
  màn hình 2 bước.

## 5. Kiểm thử

- Tích hợp với 2 đơn vị (`bkav` + đơn vị thử `thu`, tên miền `thu.vn`): người đơn vị này không đọc/sửa được dữ liệu đơn
  vị kia qua các API chính (kể cả sửa tay mã đơn vị trong yêu cầu); thiếu ngữ cảnh ⇒ lỗi; `/auth/lookup` (+ giới hạn
  nhịp); schema đơn vị mới khớp cấu trúc `tenant_bkav`; migration loại đơn vị áp cho cả hai.
- Desktop chạy thật: đăng nhập mật khẩu (+ đổi mật khẩu tạm), SSO qua máy SSO giả lập `:4020` (ô tài khoản được điền +
  khoá), tab Báo cáo có phiên sau đăng nhập.
- Toàn bộ test hiện có vẫn qua trên `bkav`.

## 6. Thứ tự làm (mỗi đợt một kế hoạch, commit, kiểm thử riêng)

1. **Nền tảng nhiều đơn vị** — `core.tenants`, ngữ cảnh đơn vị, token mang mã đơn vị, migration theo đơn vị, chuyển
   nguồn vào schema đơn vị. Giao diện chưa đổi; Bkav chạy như cũ.
2. **Đăng nhập 2 bước** — API + cổng web + Desktop + tiện ích. Phát hành Desktop 0.2.5 sau đợt này.
3. **Quản trị hệ thống → Đơn vị** — worker tạo schema + sao chép cấu hình; tạo đơn vị thử, kiểm tách dữ liệu thật.
4. (sau) Danh mục ứng dụng theo đơn vị + bố cục ghim lưu backend (họp phần 3).

Máy chủ thật: người dùng deploy sau đợt 1–3 (migration lớn).

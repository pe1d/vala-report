# Vala Desktop — danh mục ứng dụng theo đơn vị, lịch sử theo ứng dụng, mở link ra trình duyệt

Ngày 08/10/2026. Người dùng: "Đây bây giờ là Vala Desktop rồi, không phải ValaReport nữa — phần report chỉ là phụ". Họp
07/10 phần 3 (danh mục ứng dụng trên backend + bố cục riêng từng người). Chốt với người dùng: quản trị ĐƠN VỊ cấu hình
danh mục, 3 loại ứng dụng; Trợ lý AI vẫn mở đầu tiên; link ngoài hệ thống ⇒ trình duyệt mặc định.

## 1. Danh mục ứng dụng (máy chủ, theo đơn vị)

- Migration đơn vị `db/migrations/tenant/002_desktop_apps.sql`:
  - `desktop_apps`: `ma` (khoá, `[a-z][a-z0-9_]{1,39}`), `ten`, `kind` (`web` | `source` | `reports`), `url` (https/http —
    bắt buộc với `web`), `source_system` (bắt buộc với `source`, khoá ngoại `source_systems`), `icon` (địa chỉ ảnh, tuỳ
    chọn), `sort`, `pinned_default`, `is_default` (tối đa một mục — chỉ mục duy nhất có điều kiện), `enabled`,
    `updated_at`. Chỉ một ứng dụng `reports`.
  - `desktop_app_layouts`: `app_user_id` (khoá), `pinned text[]` (mã ứng dụng, đúng thứ tự), `updated_at` — bố cục riêng.
  - Dữ liệu khởi tạo: `vala` (web, trang chính hiện tại `app_settings.desktop_home_url`, không có ⇒
    `https://vala.bkav.com/`, mặc định), mỗi hệ thống nguồn đang bật có kết nối qua Desktop (`source`), `bao_cao`
    (`reports`).
- API:
  - `GET /ext/apps` (token thiết bị) ⇒ `{ apps: [{ma, ten, kind, url, source_system, icon, pinned_default, is_default}],
    layout: { pinned: string[] | null } }` — ứng dụng đang bật, theo `sort`.
  - `PUT /ext/layout { pinned: string[] }` — lưu bố cục (lọc mã không còn).
  - Quản trị đơn vị (`is_ops_admin`): `GET/POST /admin/desktop-apps`, `PATCH/DELETE /admin/desktop-apps/:ma`,
    `POST /admin/desktop-apps/order { ma: string[] }`.
- Cổng web: trang **Quản trị → Ứng dụng Desktop** (`/ung-dung-desktop`): danh sách (kéo/lên-xuống sắp thứ tự, mặc
  định, ghim sẵn, bật/tắt), thêm/sửa (loại, tên, địa chỉ hoặc hệ thống nguồn, biểu tượng). Song ngữ.
- `app_settings.desktop_home_url` giữ cho Desktop ≤ 0.2.4 (đọc qua /branding).

## 2. Vala Desktop theo danh mục

- Thanh dọc: ✦ Trợ lý AI (cố định, mở đầu tiên) · ỨNG DỤNG = gộp danh mục với bố cục của người dùng (`pinned` của người
  dùng; chưa có ⇒ các mục `pinned_default`; mục không còn trong danh mục bị loại; mục mặc định đứng đầu) · ĐANG MỞ.
  Khung ⊞ = toàn bộ danh mục, ghim/bỏ ghim ⇒ `PUT /ext/layout`.
- Khoá tab: `web:<ma>` (trang web), `src:<mã nguồn>` (hệ thống nguồn — giữ phiên, kịch bản như cũ), `portal` (Báo cáo,
  chỉ có khi danh mục có). Bỏ tab cố định "Vala" (`home`) và "Báo cáo"; bỏ trang chính trong Cài đặt / refreshHome.
- Ứng dụng mặc định nạp sẵn ở nền khi đăng nhập / mở app.
- Danh mục lưu trên máy (`userData/apps.json`) để mất mạng vẫn mở được; làm mới khi đăng nhập, mỗi 15 phút, khi mở khung ⊞.
- Chữ trong app không còn nhắc "Vala Reporting" / "đăng nhập ở tab Báo cáo".

## 3. Tìm kiếm: lịch sử theo ứng dụng

- `userData/history.json` ⇒ `app-history.json`: `{ app, label, at, count }` — ghi khi chuyển sang một ứng dụng (không ghi
  Trợ lý AI / Cài đặt / trang mở từ link). **Không lưu địa chỉ, tiêu đề trang.** Tệp `history.json` cũ bị xoá.
- Ô trống ⇒ "Gần đây" (ứng dụng vừa dùng) + "Hội thoại gần đây". Gõ ⇒ Ứng dụng · Thao tác · Hội thoại (bỏ nhóm Lịch sử
  trang). Chọn ứng dụng ⇒ mở.

## 4. Mở link

- `openTarget` nhận địa chỉ trang đang mở: cửa sổ mới (target=_blank / window.open không kích thước) sang **tên miền gốc
  khác** ⇒ `shell.openExternal` (trình duyệt mặc định); cùng tên miền gốc ⇒ tab trong app (giữ phiên). Popup có kích
  thước, form POST ⇒ cửa sổ trong app như cũ.
- Tên miền gốc: 2 nhãn cuối; đuôi cấp 2 của Việt Nam (`gov.vn`, `com.vn`, `edu.vn`, `org.vn`, `net.vn`, `ac.vn`,
  `info.vn`, `name.vn`, `pro.vn`, `health.vn`, `int.vn`, `biz.vn`) ⇒ 3 nhãn cuối; IP / localhost ⇒ nguyên host.

## 5. Kiểm thử

- Test thuần: `siteOf`, `openTarget` (cùng / khác site, popup, POST, mailto), gộp danh mục + bố cục, search-model mới.
- Test CSDL: migration 002 cho bkav (dữ liệu khởi tạo đúng), ràng buộc một mặc định.
- Chạy thật: Desktop đăng nhập ⇒ thanh dọc theo danh mục; ghim/bỏ ghim lưu máy chủ (mở lại vẫn đúng); trang quản trị
  thêm ứng dụng web ⇒ Desktop thấy; Ctrl+K "Gần đây" là ứng dụng; link ngoài ⇒ trình duyệt (kiểm `shell.openExternal`).

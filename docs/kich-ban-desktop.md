# Kịch bản Desktop

Biên bản họp 10/2026, việc T09 + T11b. Kịch bản tích hợp nằm tách khỏi ứng dụng và được tải từ máy chủ, nên khi đổi kịch bản
không phải phát hành bản Vala Desktop mới.

Một **gói kịch bản** gồm CSS và JavaScript, chạy trong trang của hệ thống nguồn (eGov, eTask…) để:

- **sửa giao diện** khi nhúng trang vào ứng dụng (ẩn thanh lỗi, sửa nút bị che…);
- **khai báo thao tác có tên**, ví dụ lấy danh sách văn bản hay tạo dự thảo. Vala Desktop gọi được các thao tác này, sau này
  AI/tác tử cũng gọi được.

Cùng một gói chạy được ở **hai nơi** (phương án 1 và 2 của biên bản):

| | Vala Desktop (máy người dùng) | Máy chủ (runner) |
|---|---|---|
| Trình duyệt | tab trong ứng dụng | Chromium không giao diện (`apps/runner`) |
| Phiên | phiên người dùng đang đăng nhập trong app | phiên đã lưu trong kho bí mật (vault) |
| Chèn gói | mỗi khung (cả iframe) khớp mẫu địa chỉ, mỗi lần tải trang | như Desktop (`injectionCode` của `@vala/core`) |
| Bộ hàm `vala` | `packages/core/runtime/vala-runtime.js` (đóng gói vào app) | cùng tệp đó |

## Viết gói (Quản trị → Kịch bản Desktop)

- **Áp dụng cho trang**: mỗi dòng một mẫu, ví dụ `https://egov.bkav.com/*` hoặc `https://*.bkav.com/qlvb/*`. Dấu `*` khớp mọi thứ.
  Không chấp nhận mẫu như `https://egov.bkav.com*`, vì mẫu đó khớp cả `egov.bkav.com.evil.com`.
- **CSS**: áp dụng mỗi khi trang khớp tải xong. CSS được nạp qua `adoptedStyleSheets` nên trang có CSP chặn `<style>` vẫn
  nhận được.
- **JavaScript**: là thân của một hàm `async (vala) => { … }`. Mã ở ngoài cùng chạy mỗi lần trang tải. Thao tác thì khai báo
  bằng `vala.action`:

```js
vala.css('.thanh-loi { display: none }');                  // sửa giao diện có điều kiện

vala.action('lay_danh_sach_van_ban', { mo_ta: 'Văn bản chờ xử lý', params: { trang: 'số trang' } }, async ({ trang = 1 }) => {
  const r = await vala.request(`/api/vanban?page=${trang}`);   // gọi API trong phiên của trang
  return r.json;
});

vala.action('luu_du_thao', async ({ trich_yeu }) => {
  await vala.fill('#txtTrichYeu', trich_yeu);                 // điền như người gõ (React/Vue nhận ra)
  const f = vala.form('#form1');                              // gồm cả __VIEWSTATE của ASP.NET
  return (await vala.request(location.pathname, { form: { ...f, __EVENTTARGET: 'btnLuu' } })).status;
});
```

Các hàm của `vala`:

| Hàm | Dùng để |
|---|---|
| `$`, `$$` | tìm phần tử |
| `waitFor(selector \| hàm, { timeout })` | chờ phần tử hoặc điều kiện |
| `click`, `fill` | bấm, điền |
| `read(selector)` | đọc chữ / giá trị |
| `table(selector)` | đọc bảng thành mảng object theo tiêu đề |
| `form(selector)` | đọc các trường của form thành object |
| `request(url, { method, form, json, headers })` | gọi HTTP kèm cookie của trang; trả `{ ok, status, url, text, json }` |
| `css(text)` | thêm CSS |
| `log(...)` | ghi nhật ký |
| `sleep(ms)` | chờ |
| `action(tên, { mo_ta, params }, fn)` | khai báo thao tác |

Kết quả của thao tác phải là dữ liệu JSON, không trả phần tử DOM. Nên lấy dữ liệu bằng `request` thay vì bấm nút để trang
chuyển đi: trang chuyển thì thao tác đang chạy bị cắt ngang.

Mỗi lần lưu mà nội dung đổi (mẫu địa chỉ, CSS hoặc JS) thì phiên bản tăng lên một. Có thể **nạp bản cũ vào ô soạn** hoặc
**quay về bản cũ**. Quay về là tạo một bản mới có nội dung của bản cũ, nên ứng dụng nhận ra có thay đổi. Mọi lần sửa đều
ghi nhật ký (`audit_log`, `source_change`/`desktop_package`).

### Chạy thử

Ô **Chạy thử** trong màn hình sửa gói luôn chạy bằng **bản đã lưu**:

- **Vala Desktop trên máy này**: chỉ dùng được khi cổng đang mở trong Vala Desktop. Chạy trong tab của hệ thống nguồn; tab
  chưa mở thì mở nền, không chuyển tab đang xem.
- **Máy chủ**: chọn một người dùng. Runner mở hệ thống nguồn bằng phiên đã lưu của người đó. Người đó phải đã kết nối hệ
  thống của gói.

## An toàn

- Chỉ quản trị vận hành (`is_ops_admin`) được sửa gói. Gói có kiểm tra cú pháp JS lúc lưu.
- Máy chủ **ký** từng gói bằng Ed25519. Khoá ký là `SCRIPT_SIGNING_KEY` trong `.env`, không có thì suy ra từ
  `AUTH_JWT_SECRET`; khoá không bao giờ nằm trong CSDL. Vala Desktop chỉ chạy gói đúng chữ ký, nên người sửa được CSDL cũng
  không tự đẩy được mã vào máy người dùng. Dấu vân tay khoá hiện ở đầu trang quản trị.
- Kịch bản được ghép thẳng vào mã chèn, không dùng `eval`. Vì vậy trang có CSP chặn eval vẫn chạy được.
- Runner chỉ nhận lời gọi từ api (Bearer `INTERNAL_TOKEN`) và không mở ra ngoài. Mỗi lượt chạy dùng một ngữ cảnh trình
  duyệt riêng và đóng ngay khi xong. Không ghi cookie hay kết quả ra log.

## Vận hành

- **k3s**: `deploy/k8s/deploy.sh` build thêm image `vala-report-runner`. Image này cài Chromium từ kho Debian nên máy chủ phải
  ra được `deb.debian.org`, qua `BUILD_HTTP_PROXY` nếu cần. Bước này **không bắt buộc**: build runner lỗi thì deploy bỏ qua
  runner, cổng vẫn chạy, chỉ báo "Máy chủ chưa bật runner" hoặc "Không gọi được runner" khi bấm chạy trên máy chủ. api nhận
  `RUNNER_URL=http://runner:3100` qua ConfigMap. Runner xin 256 Mi bộ nhớ, giới hạn 1,5 Gi, cho tối đa 3 lượt cùng lúc
  (`RUNNER_CONCURRENCY`).
- **Docker Compose**: có dịch vụ `runner` trong `docker-compose.prod.yml`; `deploy/deploy.sh` bật nó, lỗi thì bỏ qua.
- **Dev**: `CHROMIUM_PATH=/usr/bin/google-chrome RUNNER_PORT=3199 pnpm --filter @vala/runner dev`, rồi đặt
  `RUNNER_URL=http://127.0.0.1:3199` cho api.
- Vala Desktop tải gói lúc đăng nhập, lúc mở app và mỗi 15 phút (`GET /ext/desktop-packages`; nếu không đổi, máy chủ trả
  304). Bản đã kiểm được giữ ở `desktop-packages.json` trong thư mục dữ liệu của app để dùng khi mất mạng.

# Vala Desktop: giao diện cổng chạy từ bản trong máy

Tab **Báo cáo** của Vala Desktop chạy giao diện cổng (React, `apps/web`) từ **bản lưu trong máy**. Backend vẫn ở máy chủ:
mọi dữ liệu và API vẫn gọi lên máy chủ như trước.

## Cách hoạt động

1. Lúc build web, `apps/web/scripts/ui-manifest.mjs` ghi `dist/ui-manifest.json`, gồm danh sách tệp, SHA-256 từng tệp,
   `version` (mã băm của cả gói) và `base` (đường dẫn con, ví dụ `/vala-report/`). nginx phục vụ tệp này ở
   `{PUBLIC_WEB_URL}/ui-manifest.json` và không cache, vì `location /` đã đặt `expires -1`.
2. Vala Desktop đọc manifest này lúc mở app và mỗi 15 phút (`apps/desktop/src/ui-cache.ts`). Khi `version` đổi, app tải
   từng tệp về và **kiểm SHA-256**: đủ và đúng thì mới chuyển sang bản mới, tải lỗi giữa chừng thì giữ bản cũ. App giữ bản
   hiện tại và bản trước đó, xoá các bản cũ hơn.
3. Tab Báo cáo mở `vala-ui://portal/<base>/…` (scheme riêng của app):
   - tệp có trong gói được đọc từ đĩa;
   - `<base>/api/…`, `<base>/healthz` và `<base>/desktop/<tệp>` được chuyển thẳng lên máy chủ. Vì cùng origin với giao
     diện nên không cần CORS;
   - các đường dẫn khác trả `index.html` để định tuyến phía trình duyệt.
4. Trang của cổng trên máy chủ, ví dụ SSO đăng nhập xong chuyển về `https://<máy chủ>/<base>/#token…`, được mở lại đúng
   đường dẫn đó trong bản trong máy (`will-redirect` / `will-navigate`).
5. Bản mới tải xong: nếu tab Báo cáo đang không xem thì nạp ngay bản mới, giữ trang đang mở; nếu đang xem thì để lần mở
   sau, không nạp lại giữa lúc người dùng thao tác.

**Sửa giao diện cổng chỉ cần deploy máy chủ**, không phải phát hành Vala Desktop. Bộ cài Desktop chỉ ra bản mới khi sửa
phần lõi của app: tab, giữ phiên, gói kịch bản, cầu nối.

## Khi nào vẫn nạp thẳng từ máy chủ

- Máy chưa tải được gói lần nào, ví dụ lần mở đầu tiên khi mất mạng.
- Máy chủ chưa có `ui-manifest.json`: bản cũ, hoặc dev chạy Vite (`localhost:5173`). Bản dev vì vậy vẫn tự nạp lại
  (hot reload) như thường.
- `base` của gói khác đường dẫn con của máy chủ đang cấu hình.

## Lưu ý

- Bản trong máy có origin riêng (`vala-ui://portal`), nên lần đầu chuyển sang cách này người dùng phải **đăng nhập lại
  một lần**: token cổng nằm trong localStorage theo origin. Trong app, cổng tự chuyển sang SSO nên thường chỉ mất một
  bước chuyển trang.
- Mất mạng: giao diện vẫn hiện từ bản trong máy, các lời gọi API báo "Không kết nối được máy chủ Vala".
- Cầu nối với app (`portal-preload.ts`, kiểm `isPortalUrl`) chấp nhận cả `vala-ui://portal` lẫn origin máy chủ.

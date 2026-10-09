# Văn bản chung — một giao diện, mỗi phần mềm một "phiên dịch"

Chốt 08/10/2026. Vala Desktop có MỘT giao diện Văn bản dùng cho mọi phần mềm quản lý văn bản (Văn bản Hà Nội — VNPT
iOffice, eGov Bkav, QLVB của từng tỉnh…). Phần mềm của họ giữ nguyên; phần khác nhau nằm ở **phiên dịch** — một gói
kịch bản Desktop (docs/kich-ban-desktop.md) lưu trên máy chủ Vala, chạy trong trang của phần mềm đó, khai báo các thao
tác `vb_*` dưới đây. Thêm phần mềm mới = thêm một gói, không sửa / phát hành lại ứng dụng.

```
 Giao diện Văn bản (Vala Desktop)          ← một, gọi các thao tác vb_* theo hợp đồng
        │
 phiên dịch iOffice · phiên dịch eGov · …   ← gói kịch bản, mỗi phần mềm một gói (chạy trong trang của phần mềm)
        │
 phần mềm văn bản của đơn vị                ← giữ nguyên, Desktop dùng phiên người dùng đã đăng nhập
```

## Nguyên tắc: hệ thống có gì, Vala có nấy

Người dùng chốt 08/10/2026. Giao diện không cố định chức năng — vẽ theo những gì phiên dịch khai báo:

- **Menu** đủ như hệ thống gốc (nhóm ⇒ mục). Mục đã phiên dịch vẽ bằng giao diện Vala; mục **chưa** phiên dịch vẫn có
  trong menu (dấu ↗), bấm vào mở đúng trang đó của hệ thống (`goc`) ⇒ ngay từ đầu không thiếu chức năng nào, phiên dịch
  thêm dần mục nào thì mục đó thành giao diện Vala. Phiên dịch nên đọc chính menu của hệ thống (vd iOffice) để tự đủ.
- **Bộ lọc** riêng từng mục (`loc`), **trường riêng** của hệ thống (`them` — hiện ở "Thông tin khác"), **thao tác xử lý**
  và **form tạo văn bản** đều do phiên dịch khai báo; giao diện tự vẽ form (chữ, đoạn, ngày, chọn một / nhiều, tệp).

## Ứng dụng nào dùng giao diện Văn bản

Ứng dụng trong danh mục Desktop (Quản trị → Ứng dụng) có địa chỉ khớp một gói kịch bản **khai báo `vb_danh_sach`**. Mục
của ứng dụng trên thanh dọc mở giao diện Văn bản; nút **Trang gốc** chuyển sang chính trang của phần mềm (đăng nhập, mã
xác nhận, thao tác phiên dịch chưa có) và chuyển lại được.

## Hợp đồng (thao tác `vb_*`)

Mọi giá trị là chuỗi / số / boolean / mảng / object JSON; ngày dạng `YYYY-MM-DD` hoặc `YYYY-MM-DD HH:mm`; trường không
có thì bỏ trống. Lỗi ném `Error` (kèm `code` nếu biết): `het_phien` = chưa đăng nhập phần mềm ⇒ giao diện mời mở Trang
gốc để đăng nhập. Thao tác không bắt buộc (`vb_dem`, `vb_tep`, `vb_mau_tao`/`vb_tao`) thiếu thì giao diện bỏ phần đó.

| Thao tác | Tham số | Trả về |
|---|---|---|
| `vb_thong_tin` | — | `{ he_thong, nguoi_dung?, menu: [{ ten, muc: [Muc] }], tao: [{ ma, ten }] }` |
| `vb_dem` | — | `{ <mã mục>: { tong, chua_doc?, qua_han? } }` |
| `vb_danh_sach` | `{ hop, trang = 1, so_dong = 20, tim?, loc? }` | `{ tong, so_trang, dong: [Dong] }` |
| `vb_chi_tiet` | `{ id }` | `Dong` + `{ noi_dung?, noi_nhan?, tep: [{ id?, ten, kich_thuoc? }], qua_trinh: [{ luc, nguoi, viec }], thao_tac: [ThaoTac] }` |
| `vb_tep` | `{ id, tep }` | `{ url, ten }` — địa chỉ tải cùng hệ thống (khuyên dùng: Desktop tải bằng phiên của trang qua trình quản lý tải — tiến độ, lịch sử, không dồn tệp vào bộ nhớ) hoặc `{ ten, mime, base64 }` (tệp không có `id` ⇒ chỉ hiện tên) |
| `vb_thuc_hien` | `{ id, thao_tac, ...giá trị form }` | `{ thong_bao? }` |
| `vb_mau_tao` | `{ loai }` | `{ ten, truong: [Truong] }` — form tạo một loại văn bản |
| `vb_tao` | `{ loai, ...giá trị form }` | `{ id?, thong_bao? }` — có `id` ⇒ giao diện mở văn bản vừa tạo |

- `Muc` = `{ ma, ten, loai: 'den' | 'di' | 'khac', goc?, loc?: [Truong] }` — `goc` = địa chỉ trang của hệ thống (mục chưa
  phiên dịch; phải cùng tên miền gốc với hệ thống); `loc` = bộ lọc của mục, giá trị gửi trong `vb_danh_sach.loc`.
- `Dong` = `{ id, so_ky_hieu?, trich_yeu, co_quan?, ngay?, do_khan?, han_xu_ly?, trang_thai?, nguoi_xu_ly?, loai?, da_doc?, them?: [{ ten, gia_tri }] }`.
- `Truong` = `{ ma, ten, loai: 'chu' | 'doan' | 'ngay' | 'chon' | 'tep', bat_buoc?, nhieu?, goi_y?, lua_chon?: [{ ma, ten }] }`;
  giá trị gửi: chữ, mảng mã (`chon` + `nhieu`), ngày `YYYY-MM-DD`, tệp `[{ ten, loai, base64 }]` (tối đa ~25 MB mỗi lần).
- `ThaoTac` = `{ ma, ten, xac_nhan?, truong: [Truong] }` — giao diện vẽ form rồi gọi `vb_thuc_hien`. Thao tác đổi dữ liệu
  thật (chuyển, kết thúc, phát hành…) nên có `xac_nhan` (câu hỏi xác nhận trước khi gửi).

## Giám sát phiên dịch

Phiên dịch nên khai những gì nó dựa vào trang gốc: `vala.phu_thuoc({ khi, ham, chon, phien_ban })` (bộ hàm kịch bản).
Vala Desktop kiểm mỗi lần trang gốc tải: thiếu hàm / phần tử, dấu vân tay `phien_ban` khác lần trước, hoặc thao tác `vb_*`
lỗi (không phải hết phiên / lỗi nghiệp vụ) ⇒ báo về máy chủ. Quản trị → Kịch bản Desktop có cột **Tình trạng** (Đang lỗi /
Trang gốc đổi, 7 ngày), quản trị đơn vị đang mở Desktop nhận thông báo; sửa xong bấm **Đã kiểm**. Thao tác phát hiện trang
gốc đổi giữa chừng (vd thiếu ô form) nên ném lỗi mã `trang_goc_doi`.

## Viết phiên dịch

- Nhanh nhất: **ghi thao tác** (quản trị) trên phần mềm — mở danh sách, xem một văn bản — rồi sửa bản nháp kịch bản sinh
  ra cho đúng hợp đồng.
- Gọi dữ liệu bằng hàm của trang thay vì bấm nút: `vala.request` (HTTP), `vala.dwr` (DWR — VNPT iOffice), `vala.webform`
  (ASP.NET). Không ghép chữ người dùng gõ thẳng vào lời gọi phía máy chủ.
- Gói mẫu: `tools/qlvb-webforms/kich-ban.js` (đủ thao tác, kể cả tạo văn bản có tệp — test Chrome thật),
  `tools/vnpt-ioffice/kich-ban.js` (Văn bản Hà Nội: menu đọc từ hệ thống, 4 mục đã phiên dịch).

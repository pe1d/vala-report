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

## Ứng dụng nào dùng giao diện Văn bản

Ứng dụng trong danh mục Desktop (Quản trị → Ứng dụng) có địa chỉ khớp một gói kịch bản **khai báo `vb_danh_sach`**. Mục
của ứng dụng trên thanh dọc mở giao diện Văn bản; nút **Trang gốc** chuyển sang chính trang của phần mềm (đăng nhập, mã
xác nhận, thao tác phiên dịch chưa có) và chuyển lại được.

## Hợp đồng (thao tác `vb_*`)

Mọi giá trị là chuỗi / số / boolean / mảng / object JSON; ngày dạng `YYYY-MM-DD` hoặc `YYYY-MM-DD HH:mm`; trường không
có thì bỏ trống. Lỗi ném `Error` (kèm `code` nếu biết): `het_phien` = chưa đăng nhập phần mềm ⇒ giao diện mời mở Trang
gốc để đăng nhập.

| Thao tác | Tham số | Trả về |
|---|---|---|
| `vb_thong_tin` | — | `{ he_thong, nguoi_dung, hop: [{ ma, ten, loai: 'den' \| 'di' \| 'khac' }] }` |
| `vb_danh_sach` | `{ hop, trang = 1, so_dong = 20, tim? }` | `{ tong, so_trang, dong: [Dong] }` |
| `vb_chi_tiet` | `{ id, hop? }` | `Dong` + `{ noi_dung?, noi_nhan?, tep: [{ id, ten, kich_thuoc? }], qua_trinh: [{ luc, nguoi, viec }], thao_tac: [ThaoTac] }` |
| `vb_tep` | `{ id, tep }` | `{ ten, mime, base64 }` |
| `vb_thuc_hien` | `{ id, thao_tac, ...giá trị form }` | `{ thong_bao? }` |

`Dong` = `{ id, so_ky_hieu?, trich_yeu, co_quan?, ngay?, do_khan?, han_xu_ly?, trang_thai?, da_doc? }`.

`ThaoTac` = `{ ma, ten, xac_nhan?, truong: [{ ma, ten, loai: 'chu' | 'doan' | 'ngay' | 'chon', bat_buoc?, lua_chon?: [{ ma, ten }] }] }`
— giao diện tự vẽ form theo `truong` rồi gọi `vb_thuc_hien`. Thao tác đổi dữ liệu thật (chuyển, kết thúc, cho ý kiến…)
nên có `xac_nhan` (câu hỏi xác nhận trước khi gửi).

Phiên dịch chỉ cần làm phần phần mềm có; thiếu thao tác nào thì giao diện ẩn phần đó và người dùng làm trên Trang gốc.

## Viết phiên dịch

- Nhanh nhất: **ghi thao tác** (quản trị) trên phần mềm — mở danh sách, xem một văn bản — rồi sửa bản nháp kịch bản sinh
  ra cho đúng hợp đồng.
- Gọi dữ liệu bằng hàm của trang thay vì bấm nút: `vala.request` (HTTP), `vala.dwr` (DWR — VNPT iOffice), `vala.webform`
  (ASP.NET). Không ghép chữ người dùng gõ thẳng vào lời gọi phía máy chủ.
- Gói mẫu: `tools/vnpt-ioffice/kich-ban.js` (Văn bản Hà Nội).

# Văn bản Hà Nội (quanlyvanban.hanoi.gov.vn) — cách lấy dữ liệu

Khảo sát 08/10/2026 trên Vala Desktop (bản dev), tài khoản thử của đơn vị, chỉ đọc. Danh mục đủ ~800 hàm:
[van-ban-ha-noi-ham-dwr.md](van-ban-ha-noi-ham-dwr.md).

## Hệ thống

- VNPT iOffice (`/qlvbdh`), Java + jQuery/SmartAdmin; trang dựng phía máy chủ, nạp từng phần bằng AJAX.
- **Không có REST API / token.** Mọi dữ liệu đi qua **DWR 1.x** (Direct Web Remoting): POST
  `/qlvbdh/dwr/exec/<Lớp>.<phương thức>.dwr`, thân dạng text:

  ```
  callCount=1
  c0-scriptName=NEORemoting
  c0-methodName=getRSet
  c0-id=<số>_<thời điểm ms>
  c0-param0=string:<biểu thức đã encodeURIComponent>
  c0-param1=boolean:false
  xml=true
  ```

  Trả về đoạn JS: `var s0="<chuỗi JSON hoặc HTML>"; DWREngine._handleResponse('<c0-id>', s0);`
- Hai lớp: `NEORemoting` (`getRSet`, `getDoc`, `getRec`, `getValue`) và `DataRemoting` (thêm `getJValue`, `getValueJ`,
  `getRecJ`). Tham số duy nhất là **biểu thức gọi hàm phía máy chủ** dạng chuỗi, vd
  `qlvb.van_ban_den.getVanBanDenPaging("-1","10",'{…JSON…}')`.
- Xác thực: **cookie phiên** của trình duyệt (httpOnly, cùng `SRV`). Đăng nhập trong tab Vala Desktop là đủ — gọi từ
  đúng phiên (session) đó thì có quyền như người dùng.
- Trang chức năng: `GET /qlvbdh/main?IyLlCc5f5w5fCES.=<cấu hình>&CBAkTA9f5o..=<mã menu><tham số>` (tên tham số đã mã
  hoá; lấy nguyên từ menu — `sessionStorage['vi_get_menu_html_0_<tài khoản>']`). Bấm menu còn gọi
  `quantrihethong.Menu.doCountMenu('<mã>')` (đếm lượt).

## Phân trang

Gọi lần 1 với trang `"-1"` ⇒ chỉ số lượng `[{"nor":"<số dòng>","nop":"<số trang>"}]`; sau đó trang `"1"`, `"2"`… lấy
dòng. Tham số thứ 2 là số dòng mỗi trang. Bộ lọc là JSON (chuỗi trong nháy đơn, các trường để trống vẫn phải có).

## Hàm chính (đã thấy gọi thật)

| Việc | Biểu thức |
|---|---|
| Người đang đăng nhập | `DataRemoting.getJValue` · `qlvb.vanban_di.act_activiti.getUserLogin()` |
| Văn bản đến (theo hộp) | `qlvb.van_ban_den.getVanBanDenPaging(trang, số_dòng, '{"kho":"VAN_BAN_DEN_CA_NHAN","vbnoibo":"2",…}')` — `vbnoibo` 2 = ngoài, 1 = trong đơn vị |
| Văn bản đi chờ xử lý | `qlvb.vanban_di.act_activiti.getListPaging(trang, số_dòng, '{"typeget":"vanban_di_choxuly",…}')` |
| Tra cứu | `qlvb.van_ban_den.getTraCuuVanBanPaging(…)` (đếm) · `qlvb.van_ban_den.getDSVanBan(…)` (trả **HTML** bảng) |
| Danh mục | `qlvb.common.loadAttribute("dcm_priority" \| "dcm_type" \| "dcm_linhvuc")`, `qlvb.van_ban_den.getCoQuanBanHanhList()`, `quantrihethong.NhanSu.getListDonVi()` |
| Chi tiết (thấy trong mã, chưa gọi) | `qlvb.van_ban_den.getDocById(…)`, `getFileAttachLst(…)`, `getDcmTrack(…)`, `getDocRelated(…)`, `qlvb.SignatureUtil.getBase64File(…)` |

Hộp khác trong menu (cùng trang, đổi tham số): `VAN_BAN_DA_XU_LY`, `VANBAN_THONGBAO` (xem để biết), `CHO_DUYET_KET_THUC`,
`VAN_BAN_UY_QUYEN`, `VAN_BAN_THEO_DOI`, `vanban_di`.

## Lưu ý an toàn

- Máy chủ nhận **biểu thức tuỳ ý** từ trình duyệt ⇒ giao diện riêng chỉ gọi danh sách hàm cho phép, dựng biểu thức như
  trang gốc (giá trị nằm trong JSON, encodeURIComponent cả chuỗi); **không** đưa chữ người dùng gõ thẳng vào biểu thức.
- Có hàm đổi dữ liệu thật (vd `ketthucVanBan`, `saveAndApproveDoc`, `ketthuc_vb_hangloat`, `deleteDocById`) — không
  gọi khi khảo sát. Mở chi tiết văn bản trên trang gốc có thể ghi nhận "đã xem" — chưa kiểm chứng.
- Tài khoản thử lúc khảo sát có 0 văn bản ở các hộp đã xem ⇒ **chưa thấy dạng dòng dữ liệu** của trang 1 trở đi.

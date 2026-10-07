# Khảo sát eGov và QLVBĐH Đà Nẵng: API của 4 nghiệp vụ văn bản

Khảo sát ngày 07/10/2026, phục vụ T06 và hướng **đồng bộ thao tác**: người dùng thao tác trên eGov, một hệ thống văn bản
khác tự làm thao tác tương ứng.

Cách khảo sát: **chỉ đọc**. Tôi dùng phiên eGov đang lưu, mở `/Home/Index` và tải mã JS giao diện (tệp tĩnh) để đọc bảng
API. Tôi không gọi API thay đổi dữ liệu và không đọc nội dung văn bản.

## Kiến trúc eGov

- ASP.NET MVC. Giao diện dùng jQuery, RequireJS và Backbone, mã nằm ở `/Scripts/bkav.egov/` (`egovcore.js`, `views/…`).
- Có một bảng API chung trong `egovcore.js` (`egov.request.<tên>`), khoảng 230 endpoint dạng `/<Controller>/<Action>`.
  Giao diện gọi API qua `egov.request.<tên>({ data, success })`, dùng jQuery ajax, gửi dữ liệu dạng form.
  Các trường phức tạp được `JSON.stringify` rồi gửi như chuỗi.
- **Token chống giả mạo**: API có `hasToken: true` phải kèm trường `__RequestVerificationToken`. Giá trị lấy từ ô ẩn
  `input[name=__RequestVerificationToken]` nằm trong phần tử có id bằng URL bỏ dấu `/`, ví dụ `#TransferTransferDocument`.
  Kịch bản chạy trong trang (Vala Desktop hoặc runner) đọc token ngay trên trang, nên không cần cơ chế riêng.

## 4 nghiệp vụ

| Nghiệp vụ | API chính (POST, kèm token) | Dữ liệu gửi | API phụ cần trước |
|---|---|---|---|
| **Khởi tạo dự thảo** | `saveDocDraft` → `/Transfer/SaveDocDraft` (sửa: `saveDoc` → `/Transfer/SaveDoc`) | Form văn bản đã serialize, `files`, `modifiedFiles`, `removeAttachmentIds` | Loại văn bản: `getDocTypes` → `/Doctype/GetDocTypes`. Mẫu tạo: `getDocumentInfoForCreate` → `/Document/GetDocumentInfoForCreate`. Hướng chuyển khi tạo: `/Workflow/GetActionsCreate` |
| **Chuyển văn bản đi** (ý kiến + đính kèm) | `transfer` → `/Transfer/TransferDocument`. Theo lô: `/Transfer/TransferMultiple` | `doc` (JSON văn bản, có ý kiến), `destination` (JSON người/đơn vị nhận), `files`, `modifiedFiles`, `removeAttachmentIds`, `storePrivateId`, `destinationPlan` | Hướng chuyển: `/Workflow/GetActionsEdit`. Người nhận theo hướng: `/Workflow/GetUserByAction`, phụ thuộc vai trò và vị trí. Đính kèm tải trước: `/Attachment/UploadTemp` |
| **Kết thúc** | `finish` → `/Finish/UpdateFinish` (lấy lại: `/Finish/UndoFinish`) | `documentCopyId`, `storePrivateId` (JSON), `comment`, `isThongBao` | — |
| **Phát hành** | `publish` → `/Publish/TransferPublish`. Nội bộ: `/Publish/TransferPrivatePublish`. Theo lô: `…TheoLo` | `documentCopyId`, `doc` (JSON), `bussDoc` (loại nghiệp vụ, mặc định 6), `files`, `modifiedFiles`, `removeAttachmentIds`, `publishinfo` (JSON sổ và số phát hành), `usersConsult`, `userHasReceiveDocuments`, `searchAddr`, `targetForComments` | Nơi nhận phát hành: `/Publish/GetAddressDocPublish`. Kiểm tra đã phát hành: `/Document/CheckPublished` |

Đã có trong adapter Vala, dùng cho báo cáo: `/Home/GetFunctionByParentId` (cây thư mục) và `/home/GetDocuments` (danh sách
văn bản).

## Hệ thống B: QLVBĐH UBND TP Đà Nẵng (`qlvbdh.danang.gov.vn`)

Khảo sát ngày 07/10/2026, **chỉ đọc**. Tôi đọc cấu trúc trang đang mở trong Vala Desktop bằng tài khoản thật của người
dùng (không bấm, không mở văn bản) và tải tệp JS tĩnh `/static/js/main.<mã>.js`.

- Ứng dụng React. Đăng nhập qua CAS / SSO Đà Nẵng (`dangnhap.danang.gov.vn`, `sso.danang.gov.vn`).
- API REST dạng JSON, cùng origin, có các nhóm `/major/…` (xử lý), `/unioffice/…` (văn bản, hồ sơ), `/core/…`
  (người dùng, luân chuyển), `/category/…` (danh mục), `/filemanagement/…` (tệp, ký số).
- **Xác thực**: header `Authorization: Bearer <localStorage.token>` và `X-Working-Index`. Kết quả trả về dạng
  `{ errorCode, result }`, `errorCode = 0` là thành công. Kịch bản chạy trong trang gọi `fetch` với đúng các header này.
- **Ký số**: có plugin VGCA (Ban Cơ yếu) và Unitech (`vgcaplugin.js`, `unitech-signer.js`), ngoài ra có ký SIM
  (`/filemanagement/kyso/bcy/sim/…`). Bước nào bắt buộc ký số bằng USB token hoặc SIM thì **người dùng phải tự ký**,
  kịch bản không ký thay được.

| Nghiệp vụ | API chính | API phụ |
|---|---|---|
| **Khởi tạo dự thảo** | `POST /major/xulyduthao/save` (phiên bản mới: `/major/xulyduthao/save/phienbanduthao`) | Khởi tạo form `GET /major/xulyduthao/init`, loại văn bản `POST /category/loaivanban/danhsach`, tải tệp `POST /filemanagement/uploadfile` |
| **Chuyển xử lý** (ý kiến + tệp) | `POST /major/xuly/chuyenxuly` (body có `chuyenViens[]`: người nhận, hạn xử lý, loại) | Hướng chuyển `POST /major/xuly/getListAction`, người xử lý theo quy trình `GET /core/luanchuyen/nguoixuly/{id}`, ý kiến / bút phê `POST /major/xulybutphe/save` |
| **Kết thúc** | `POST /major/xuly/luuketthuc` (nhiều văn bản: `/major/xuly/luuketthucnhieu`) | — |
| **Ban hành / phát hành** | `POST /major/xuly/chuyenbanhanh`, `POST /major/xulyduthao/chonduthaobanhanh` | Vào sổ văn bản đi `POST /major/tiepnhan/vanbandi`, cấp số đi `POST /unioffice/vanbandi/genSoDi`, đơn vị ban hành `GET /core/phongban/getdonvibanhanh` |

## Đối chiếu eGov ↔ Đà Nẵng

| Nghiệp vụ | eGov (nguồn, chỉ lắng nghe) | Đà Nẵng (làm tương ứng) | Cần ánh xạ |
|---|---|---|---|
| Tạo dự thảo | `/Transfer/SaveDocDraft` | `/major/xulyduthao/save` | Loại văn bản, trích yếu, tệp (tải lại sang `filemanagement`) |
| Chuyển | `/Transfer/TransferDocument` | `/major/xuly/chuyenxuly` | **Người nhận** (id mỗi bên khác nhau), hạn xử lý, ý kiến |
| Kết thúc | `/Finish/UpdateFinish` | `/major/xuly/luuketthuc` | Văn bản tương ứng (lưu cặp id eGov ↔ Đà Nẵng khi tạo / chuyển) |
| Phát hành | `/Publish/TransferPublish` | `/major/xuly/chuyenbanhanh` (+ vào sổ đi) | Sổ văn bản, đơn vị nhận; **ký số** do người dùng làm |

## Hướng đồng bộ thao tác (đề xuất)

```
eGov (tab trong Vala Desktop)                       Hệ thống văn bản B (tab / runner)
  người dùng bấm "Chuyển"                               
  └─ gói kịch bản eGov bọc egov.request.transfer        
       thành công ⇒ vala.emit('chuyen_van_ban', {        
         so_ky_hieu, trich_yeu, y_kien, nguoi_nhan, tep … })
                         │
                Vala Desktop: quy tắc ánh xạ
                (eGov.chuyen_van_ban ⇒ B.chuyen_van_ban, đổi mã người nhận / loại văn bản)
                         │
                         └──────────────▶ gói kịch bản B: vala.action('chuyen_van_ban', …)
                                           gọi đúng API / form của B
```

- Bên eGov **chỉ lắng nghe**. Gói kịch bản bọc `egov.request.<tên>` (hoặc `$.ajax`) để biết thao tác nào vừa **thành
  công**, kèm dữ liệu chuẩn hoá. Không đổi gì trên eGov.
- Bên B: mỗi nghiệp vụ là một thao tác có tên trong gói kịch bản của B. Viết theo cách đã có, chạy trong app hoặc runner.
- Phần còn thiếu trong khung hiện tại:
  1. `vala.emit()` để kịch bản báo sự kiện cho app;
  2. **bảng ánh xạ** giữa hai hệ thống: loại văn bản, người hoặc đơn vị nhận, sổ phát hành;
  3. nhật ký đồng bộ: đã làm, lỗi, làm lại.

## Cần để làm tiếp

1. ~~Trang / hệ thống B~~: đã có, là QLVBĐH Đà Nẵng (tài khoản thật).
2. **Một lượt thao tác mẫu trên eGov**, tốt nhất trên văn bản thử, cho từng nghiệp vụ. Vala Desktop ghi lại dữ liệu
   thật gửi đi (che giá trị nhạy cảm), để chốt đúng trường cần chuyển sang B.
3. Danh sách ánh xạ người nhận và đơn vị giữa eGov và B, hoặc quy tắc ghép (theo email hay mã cán bộ).

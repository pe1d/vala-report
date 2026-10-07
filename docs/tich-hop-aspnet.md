# Tích hợp hệ thống ASP.NET không có API

Việc T07 trong biên bản họp Vala Desktop. Nhiều hệ thống của cơ quan nhà nước (quản lý văn bản, một cửa…) viết bằng
**ASP.NET WebForms**: không có API, mọi thao tác là gửi lại form (`__doPostBack`) kèm `__VIEWSTATE`. Tài liệu này hướng dẫn
cách Vala đọc và ghi vào những hệ thống đó. Thiết kế: `docs/superpowers/specs/2026-10-07-t07-aspnet-design.md`.

**Cách làm:** gửi form trực tiếp, có theo dõi trạng thái. Kịch bản không bấm nút trên giao diện. Nó tải trang ngầm, đọc
các trường ẩn, rồi gửi lại form theo đúng chuỗi mà trình duyệt gửi. Cùng một kịch bản chạy được trong Vala Desktop lẫn trên
máy chủ (runner). Để biết "chuỗi mà trình duyệt gửi", dùng công cụ bắt request ở mục 1.

Muốn thử mà không cần hệ thống thật: `tools/qlvb-webforms`, là một hệ thống quản lý văn bản WebForms thật chạy bằng Mono
(`docker compose --profile qlvb up -d qlvb-webforms`, http://localhost:4030).

## 1. Bắt request

### Dùng

1. Mở hệ thống trong Vala Desktop, đăng nhập nếu cần.
2. Chuột phải lên tab của hệ thống ⇒ **Bắt đầu ghi thao tác**. Tab hiện chấm đỏ.
3. Thao tác như bình thường. Mỗi nghiệp vụ nên ghi một lượt riêng, ví dụ chỉ một lần "chuyển văn bản".
4. Chuột phải ⇒ **Dừng ghi thao tác** ⇒ mở tab **Bản ghi thao tác**.

Tab Bản ghi có danh sách bước (bấm vào để xem chi tiết), nút **Lưu ra tệp** (.json), **Sao chép JSON** và **Bản nháp
kịch bản**. Bản nháp là mã `vala.action(…)` dùng `vala.webform()` để dán vào Quản trị → Kịch bản Desktop rồi sửa.

Mục ghi có trên mọi tab trang web, trừ tab Vala và tab Báo cáo. Mỗi lúc chỉ ghi được một tab: bắt đầu ghi tab khác thì bản
đang ghi dừng lại.

### Cái gì được ghi

Mỗi lần tải trang, gửi form, XHR/fetch của tab đó, kể cả iframe, là một bước. Ảnh, CSS, JS không được ghi. Mỗi bước có:

- phương thức, địa chỉ, các trường đã gửi, tệp đính kèm;
- mã phản hồi, địa chỉ chuyển hướng;
- tên các trường ẩn và nút có trên trang trả về;
- với UpdatePanel: id các vùng trang được cập nhật.

Tên bước tự đặt theo cách WebForms gửi:

| Tên bước | Nghĩa |
|---|---|
| `Mở /Chuyen.aspx?id=4` | tải trang (GET) |
| `Gửi lại form: ddlDonVi` | `__EVENTTARGET` = ô đó: AutoPostBack (ô chọn tự gửi) hoặc LinkButton |
| `Sang trang 2: gvVanBan` | GridView phân trang (`__EVENTARGUMENT` = `Page$2`) |
| `Bấm btnChuyen (“Chuyển”)` | bấm nút submit (tên nút có trong trường gửi đi) |
| `… (UpdatePanel)` | gửi một phần trang (header `X-MicrosoftAjax`), phản hồi dạng `độ dài\|loại\|id\|nội dung\|` |
| `Đăng nhập (đã che mật khẩu)` | form có ô mật khẩu |

### An toàn

Bản ghi chỉ nằm trên máy, không gửi lên máy chủ; tắt app là mất trừ khi đã **Lưu ra tệp**.

- Không ghi cookie, header `Authorization`, nội dung phản hồi (chỉ đọc lấy **tên** trường), nội dung tệp (chỉ tên, loại,
  kích thước).
- Ô mật khẩu được che (`••••`): ô `type=password` trên trang, hoặc tên có `pass`, `pwd`, `matkhau`, `password`.
- `__VIEWSTATE`, `__EVENTVALIDATION`, `__RequestVerificationToken` chỉ ghi độ dài.

### Đọc bản ghi để viết kịch bản

- Chuỗi điển hình của một nghiệp vụ WebForms: **mở trang** ⇒ **gửi lại form** cho từng ô AutoPostBack, ví dụ chọn đơn vị
  để nạp người nhận ⇒ **bấm nút** ⇒ **chuyển hướng** sang trang kết quả. Kịch bản phải gửi lại đủ các bước giữa: bỏ bước
  "gửi lại form" thì máy chủ từ chối, vì `__EVENTVALIDATION` không có các lựa chọn mới.
- Ô chọn nhiều (CheckBoxList) gửi `tên$<thứ tự>=<giá trị>`; bản nháp gộp về tên gốc thành mảng.
- Ô nhiều dòng của WebForms hay gửi kèm khoảng trắng dù người dùng không gõ; bản nháp coi là trống.
- Bước đăng nhập không đưa vào kịch bản: kịch bản chạy trong phiên đã đăng nhập (Vala Desktop / phiên lưu trên máy chủ).

### Giới hạn

- Tab đang mở **DevTools** thì không ghi được (Chromium chỉ cho một trình gỡ lỗi). Đóng DevTools rồi thử lại.
- Tối đa **200 bước** mỗi lượt; đủ thì tự dừng và báo.
- Form **có tệp đính kèm**: Chromium không đưa thân request ra giao thức gỡ lỗi. Trong lúc ghi, Vala Desktop gài vào trang
  một đoạn script đọc form ngay lúc gửi (`FormData`, kể cả `form.submit()` của `__doPostBack`), và gỡ khi dừng ghi.
  Không đọc được thì bước ghi chú "không đọc được thân request".
- Đóng tab hoặc tắt app ⇒ dừng ghi và báo.

## 2. Viết thao tác ghi: `vala.webform`

`vala.webform(url)` mở ngầm một trang (fetch, kèm cookie của phiên), đọc form của trang đó và giữ nó làm trạng thái. Các lần
gửi sau tự mang đúng `__VIEWSTATE` / `__EVENTVALIDATION` mới nhất. Hàm không làm đổi trang người dùng đang xem, và chạy giống
nhau trong Vala Desktop lẫn trên runner. Ví dụ đầy đủ: `tools/qlvb-webforms/kich-ban.js` (7 thao tác).

```js
vala.action('chuyen_van_ban', { mo_ta: 'Chuyển văn bản', params: { id: '', don_vi: '', nguoi_nhan: '[]' } }, async (p) => {
  const f = await vala.webform(`/Chuyen.aspx?id=${p.id}`);
  await f.postback('ddlDonVi', { ddlDonVi: p.don_vi });          // AutoPostBack: nạp người nhận của đơn vị
  await f.submit('btnChuyen', { cblNguoiNhan: p.nguoi_nhan, txtYKien: p.y_kien ?? '' },
    { files: { fuDinhKem: { ten: 'to-trinh.pdf', loai: 'application/pdf', base64: p.tep_base64 } } });
  return { url: f.url, trang_thai: f.read('[id$="_lblTrangThai"]') };   // đã theo chuyển hướng sang trang chi tiết
});
```

| Hàm của `f` | Dùng để |
|---|---|
| `postback(đích, trường?, { async, panel, argument })` | như `__doPostBack`: ô AutoPostBack, LinkButton, phân trang GridView (`{ __EVENTARGUMENT: 'Page$2' }`) |
| `submit(nút \| null, trường?, { files })` | bấm nút gửi; `files: { tên: { ten, loai, base64 } }` ⇒ gửi multipart |
| `options(tên)` | lựa chọn của ô chọn / CheckBoxList / RadioButtonList: `[{ value, text, selected }]`; ô chưa có mục ⇒ `[]` |
| `fields()` | trạng thái form như trình duyệt sẽ gửi |
| `name(tên)` | tên ngắn ⇒ tên đầy đủ (`ddlDonVi` ⇒ `ctl00$MainContent$ddlDonVi`), kể cả đích postback như GridView |
| `$`, `read`, `table` | đọc trang hiện tại; `table` bỏ dòng số trang của GridView |
| `url`, `status`, `redirected`, `doc` | trang hiện tại sau lần gửi gần nhất |

- **Tên trường:** dùng tên ngắn hoặc tên đầy đủ. Tên ngắn trùng nhiều trường ⇒ lỗi, khi đó phải dùng tên đầy đủ.
- **Giá trị chọn:** ô chọn nhận cả mã lẫn chữ hiển thị. CheckBoxList nhận **mảng** mã hoặc chữ; hàm tự tích đúng ô
  `tên$<thứ tự>` và bỏ tích các ô còn lại.
- **UpdatePanel:** `postback(…, …, { async: true })`. Hàm tự tìm ScriptManager và UpdatePanel chứa control đó. Mono không
  khai danh sách UpdatePanel, nên khi không tìm được thì phải truyền `{ panel: 'ctl00$MainContent$upSo' }`.
- **Chọn phần tử theo đuôi id** (`[id$="_lblTong"]`): id kiểu cũ là `ctl00_MainContent_lblTong`, ASP.NET 4 là
  `MainContent_lblTong`.
- **Xác nhận sau khi ghi:** đọc lại trang (ví dụ lịch sử có dòng mới chưa). Không xác nhận được thì ném lỗi, đừng báo
  thành công. Thao tác ghi **không tự thử lại**, để tránh chuyển hoặc phát hành hai lần.

### Lỗi

Lỗi ném ra có `code`. `__vala.run` trả về `{ ok: false, error, code, chi_tiet }`.

| `code` | Khi nào |
|---|---|
| `het_phien` | bị đưa về trang đăng nhập (`ReturnUrl=`) — phiên hết hạn |
| `loi_may_chu` | HTTP ≥ 500 hoặc trang lỗi ASP.NET; `error` gồm câu lỗi, ví dụ *Invalid postback or callback argument* (EventValidation: giá trị không có trong ô, hoặc thiếu bước gửi lại form), *Validation of viewstate MAC failed* (ViewState hỏng hoặc của trang khác), hoặc `System.…Exception: …` |
| `du_lieu_khong_hop_le` | sau khi gửi, trang hiện lỗi kiểm tra dữ liệu (ValidationSummary / validator); `chi_tiet` là danh sách câu lỗi |
| `khong_tim_thay_truong` / `truong_trung_ten` | tên trường hoặc lựa chọn không có / trùng nhiều |

### Nạp gói vào CSDL dev

    VALA_PASSWORD=… node tools/qlvb-webforms/nap-kich-ban.mjs     # tạo / cập nhật gói qlvb_thu (máy chủ ký khi lưu)

Test tích hợp (Chrome thật, bộ hàm được chèn đúng như Desktop và runner):
`pnpm --filter @vala/qlvb-webforms test` (`test/kich-ban.test.ts`).

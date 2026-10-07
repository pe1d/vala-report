# T07 — Tích hợp hệ thống ASP.NET không có API

Ngày: 07/10/2026. Việc T07 trong biên bản họp Vala Desktop: "nghiên cứu hướng tích hợp với hệ thống không có API (dạng
ASP.NET, post/submit form): bắt request, mô phỏng submit form". Làm trước T04/T05 vì T04/T05 đang chờ bản eGov cho Núi Thành.
Cách làm tìm ra ở đây dùng lại cho các hệ thống quản lý văn bản thật.

## Mục tiêu và tiêu chí xong

1. Có một hệ thống ASP.NET WebForms **thật** để thử, đủ 4 nghiệp vụ văn bản (tạo dự thảo, chuyển, kết thúc, phát hành).
2. Vala Desktop **bắt được request** khi người dùng thao tác tay, đủ để viết kịch bản.
3. Gói kịch bản **ghi** được cả 4 nghiệp vụ bằng cách gửi form trực tiếp; chạy giống nhau trong Vala Desktop và trên runner.
4. Spider Crawlab **đọc** được danh sách văn bản (đi qua mọi trang của bảng), vào báo cáo như eGov / eTask.
5. Tài liệu `docs/tich-hop-aspnet.md` hướng dẫn tích hợp một hệ thống ASP.NET mới theo cách này.

## Quyết định chính: gửi form trực tiếp, có theo dõi trạng thái

Kịch bản ghi **không điều khiển giao diện**. Nó tải trang ngầm, đọc các trường ẩn, rồi gửi lại form theo đúng chuỗi trình
duyệt gửi (ví dụ: gửi lại "chọn đơn vị" để nạp người nhận, rồi mới "Chuyển"). Một đối tượng "phiên form" nhớ `__VIEWSTATE`,
`__EVENTVALIDATION`, `__VIEWSTATEGENERATOR` qua từng lần gửi.

Lý do: chạy giống nhau ở máy người dùng và máy chủ (yêu cầu của biên bản); trang không chuyển đi nên thao tác không bị cắt
ngang; cùng một mô hình cho cả spider Python (vốn bắt buộc gửi form trực tiếp); bền hơn khi giao diện gốc đổi. Nhược điểm —
phải biết chuỗi gửi form — được giải bằng công cụ bắt request (phần 2).

Điều khiển giao diện (bấm nút, chờ trang tải lại) **chưa làm**. Chỉ thêm khi gặp trang thật mà dữ liệu gửi đi do JS phía trình
duyệt tính ra (mã hoá, ký, chữ ký thời gian) nên không dựng lại được.

Làm theo 4 phần, mỗi phần một kế hoạch và nghiệm thu riêng, theo thứ tự 1 → 2 → 3 → 4.

---

## Phần 1. Hệ thống WebForms giả lập "QLVB Thử nghiệm"

**Công nghệ.** ASP.NET WebForms thật (.aspx + code-behind C#) chạy bằng Mono 6.12 và `xsp4` trong Docker. Mã ở
`tools/qlvb-webforms/`. Chạy bằng `docker compose` (dịch vụ `qlvb-webforms`) ở cổng **4030**. Giao diện tiếng Việt. Dữ liệu
giữ trong bộ nhớ, nạp lại dữ liệu mẫu mỗi lần khởi động; `POST /_dev/reset` đưa về trạng thái ban đầu (cho test).
Ảnh dựa trên Mono 6.12 (Debian buster đã hết hỗ trợ ⇒ nguồn apt trỏ `archive.debian.org`). Máy chủ k3s: làm khi cần
demo (ngoài phần 1).

**Dữ liệu mẫu.**
- 3 đơn vị: Văn phòng, Phòng Tài chính, Phòng Nội vụ.
- 6 cán bộ, trong đó `vanthu` (văn thư, được phát hành) và `chuyenvien`. Mật khẩu chung `Qlvb@2026`.
- 4 loại văn bản; 2 sổ văn bản đi.
- Khoảng 35 văn bản ở đủ các trạng thái (dự thảo, đang xử lý, đã kết thúc, đã phát hành), đủ cho bảng 10 dòng/trang có 4 trang.

**Các trang.**

| Trang | Chức năng | Điểm WebForms cần thử |
|---|---|---|
| `Login.aspx` | đăng nhập | Forms auth: cookie `.ASPXAUTH` + `ASP.NET_SessionId`; hết phiên sau 20 phút |
| `VanBan.aspx` | danh sách văn bản | GridView phân trang qua `__doPostBack('…gvVanBan','Page$2')`; ô tìm kiếm + nút; ô lọc trạng thái tự gửi lại form (AutoPostBack) |
| `ChiTiet.aspx?id=` | xem văn bản + lịch sử xử lý | nút **Kết thúc** là LinkButton (`__doPostBack`), có hộp xác nhận phía trình duyệt |
| `DuThao.aspx` | tạo dự thảo | chọn loại văn bản, trích yếu, nội dung, **đính kèm tệp** (multipart); ô bắt buộc có validator |
| `Chuyen.aspx?id=` | chuyển văn bản | chọn **đơn vị ⇒ danh sách người nhận (CheckBoxList) nạp lại** qua AutoPostBack; ý kiến, hạn xử lý, đính kèm tệp |
| `PhatHanh.aspx?id=` | phát hành (chỉ văn thư) | trong **UpdatePanel**: chọn sổ ⇒ số văn bản tự điền (gửi lại một phần trang); chọn đơn vị nhận |

Mọi trang dùng chung một master page, nên tên trường có dạng `ctl00$MainContent$ddlDonVi`.

**"Bẫy" giữ nguyên như hệ thống thật.**
- `__VIEWSTATE` có mã chống sửa (machineKey cố định): ViewState bị sửa ⇒ lỗi.
- `__EVENTVALIDATION` bật: gửi giá trị không có trong ô chọn ⇒ lỗi "Invalid postback or callback argument". Bấm "Chuyển"
  mà không gửi lại "chọn đơn vị" trước ⇒ danh sách người nhận vẫn là của đơn vị cũ ⇒ bị từ chối, không chuyển được.
- Ô chọn nhiều (CheckBoxList) gửi `tên$<thứ tự>=<giá trị>` (Mono vẽ `value`), không phải `on`.
- Hết phiên ⇒ chuyển về `Login.aspx?ReturnUrl=…`.

**Ngoài phạm vi.** Ký số, phân quyền chi tiết, lưu dữ liệu bền qua lần khởi động lại.

**Kiểm thử.** Bộ test Node (vitest, gọi HTTP) đi qua cả 4 nghiệp vụ bằng cách gửi form thủ công, và xác nhận các bẫy hoạt
động thật (ViewState bị sửa ⇒ lỗi; người nhận sai đơn vị ⇒ lỗi; hết phiên ⇒ về trang đăng nhập). Test tự bỏ qua khi
hệ thống giả lập không chạy.

---

## Phần 2. Công cụ bắt request trong Vala Desktop

**Dùng.** Chuột phải tab hệ thống nguồn → **Bắt đầu ghi thao tác** (tab hiện chấm đỏ) → thao tác tay → chuột phải → **Dừng
ghi** ⇒ mở tab **Bản ghi thao tác** (trang cục bộ như tab Cài đặt).

**Ghi.** Chỉ tab đang ghi (khung chính và iframe); chỉ tải trang, gửi form, XHR/fetch (bỏ ảnh, CSS, JS). Mỗi bước: phương
thức, địa chỉ, các trường form đã gửi (tách từ urlencoded / multipart), mã phản hồi, địa chỉ chuyển hướng, tên các trường ẩn
trang trả về, với UpdatePanel thì các vùng được cập nhật. Tự đặt tên bước theo `__EVENTTARGET` (ví dụ "gửi lại form:
ddlDonVi", "bấm gvVanBan → Page$2").

**Cách bắt.** Giao thức gỡ lỗi của Chromium (`webContents.debugger`, mục Network), chỉ gắn vào tab đang ghi. Không dùng
`session.webRequest` vì nó bắt cả ứng dụng và không đọc được phản hồi. Tab đang mở DevTools thì không ghi được ⇒ báo rõ.

**An toàn.** Bản ghi chỉ ở trên máy, không gửi lên máy chủ. Không ghi cookie, `Authorization`. Che trường mật khẩu (tên chứa
`pass`, `pwd`, `matkhau`… hoặc ô `type=password` trên trang). `__VIEWSTATE` / `__EVENTVALIDATION` chỉ ghi độ dài. Tệp chỉ
ghi tên, loại, kích thước. Tối đa 200 bước; đóng tab hoặc tắt app ⇒ dừng ghi.

**Tab Bản ghi thao tác.** Danh sách bước, bấm xem chi tiết; **Lưu ra tệp** (.json), **Sao chép**; **Bản nháp kịch bản**: chuỗi
bước chuyển thành mã JS dùng `vala.webform()` (phần 3) để dán vào Quản trị → Kịch bản Desktop.

**Ai dùng.** Mọi người dùng Vala Desktop (dữ liệu không rời máy); mục chỉ nằm trong menu chuột phải tab.

**Kiểm thử.** Test đơn vị: tách form, che giá trị, đặt tên bước, sinh bản nháp. Chạy thật trên hệ thống giả lập: ghi lượt
"chuyển văn bản" ra đúng hai lần gửi form (đổi đơn vị, Chuyển); bản nháp sinh ra chạy lại được.

---

## Phần 3. Ghi bằng gói kịch bản

### 3a. `vala.webform()` trong `packages/core/runtime/vala-runtime.js`

```js
const f = await vala.webform('/Chuyen.aspx?id=12');          // tải trang ngầm, đọc form + trường ẩn
f.options('ddlDonVi');                                       // [{ value, text }]; tên ngắn tự khớp ctl00$MainContent$ddlDonVi
await f.postback('ddlDonVi', { ddlDonVi: '3' });             // như __doPostBack; cập nhật ViewState/EventValidation
await f.submit('btnChuyen', { cblNguoiNhan: ['15', '16'], txtYKien: '…' },
               { files: { fuDinhKem: { ten: 'a.pdf', base64: '…' } } });   // có tệp ⇒ multipart
await f.postback('ddlSo', { ddlSo: '2' }, { async: true });  // UpdatePanel (MS AJAX, phản hồi từng phần)
f.read('#lblSoKyHieu'); f.table('#gvLichSu');                // đọc trang vừa trả về
```

- Tên ngắn khớp theo đuôi tên đầy đủ (`…$ddlDonVi`); trùng nhiều trường ⇒ lỗi, phải dùng tên đầy đủ.
- Ô nhiều lựa chọn (CheckBoxList) nhận mảng giá trị; hàm đổi sang tên trường WebForms tương ứng.
- Đi theo chuyển hướng; UpdatePanel: tách phản hồi `độ dài|loại|id|nội dung|`, lấy ViewState mới từ đó.
- Lỗi rõ ràng: về trang đăng nhập ⇒ `het_phien`; trang lỗi ASP.NET (EventValidation, ViewState MAC…) ⇒ `loi_may_chu` + dòng
  lỗi; validator / ValidationSummary báo sai ⇒ `du_lieu_khong_hop_le` + danh sách lỗi.
- Không làm đổi trang người dùng đang xem. Chỉ cần `fetch` + `DOMParser` ⇒ chạy như nhau ở Vala Desktop và runner.

### 3b. Gói kịch bản cho hệ thống giả lập

| Thao tác | Tham số | Trả về |
|---|---|---|
| `lay_danh_muc` | | loại văn bản, đơn vị → người nhận, sổ văn bản |
| `lay_danh_sach_van_ban` | `trang`, `tu_khoa`, `trang_thai` | danh sách + tổng số trang |
| `lay_chi_tiet_van_ban` | `id` | thông tin + lịch sử xử lý |
| `tao_du_thao` | `loai_van_ban`, `trich_yeu`, `noi_dung`, `tep[]` | `id` dự thảo mới |
| `chuyen_van_ban` | `id`, `don_vi`, `nguoi_nhan[]`, `y_kien`, `han_xu_ly`, `tep[]` | lịch sử mới nhất |
| `ket_thuc_van_ban` | `id`, `y_kien` | trạng thái mới |
| `phat_hanh_van_ban` | `id`, `so_van_ban`, `don_vi_nhan[]` | số ký hiệu được cấp |

- Đơn vị, người nhận, loại văn bản, sổ: nhận mã hoặc tên hiển thị.
- Thao tác ghi tự đọc lại để xác nhận (không xác nhận được ⇒ báo lỗi) và **không tự thử lại**.
- `tep[]`: `{ ten, loai, base64 }`.
- Gói lưu trong CSDL (Quản trị → Kịch bản Desktop). Bản mẫu ở `tools/qlvb-webforms/kich-ban.js` + lệnh nạp vào CSDL dev.

**Kiểm thử.** Test tích hợp bằng Chromium thật (playwright-core) trên hệ thống giả lập: nạp `vala-runtime.js` + gói, gọi đủ 7
thao tác, kiểm tra kết quả trên hệ thống giả lập; cả các đường lỗi (hết phiên, người nhận sai đơn vị, thiếu trích yếu).
Chạy thật bằng **Chạy thử** trên cổng: một lần qua Vala Desktop, một lần qua runner.

---

## Phần 4. Đọc bằng Crawlab

### 4a. Lớp `WebForm` trong `crawlers/_sdk/vala_sdk.py`

```python
f = run.webform('/VanBan.aspx')
rows = []
while True:
    rows += f.table('gvVanBan')            # list dict theo tiêu đề cột, kèm id lấy từ liên kết
    nxt = f.next_page('gvVanBan')          # 'Page$3' hoặc None
    if not nxt: break
    f.postback('gvVanBan', nxt)
run.save('van_ban', rows)
```

- Mọi lần gửi đi qua `run._request` (giãn nhịp, tự xin phiên mới một lần, báo nguồn lỗi). `WebForm` tự đi theo chuyển hướng
  sau khi gửi form; chỉ chuyển hướng về trang đăng nhập mới là hỏng phiên.
- Trang lỗi ASP.NET ⇒ lỗi nguồn kèm dòng lỗi, không nhầm thành hết phiên.
- Có `options()`, `read()`, `submit()`, UpdatePanel (`async=True`). Đọc HTML bằng BeautifulSoup (có sẵn trong Crawlab).

### 4b. Nguồn `qlvb_thu` trong Vala
- Adapter: phiên do Vala Desktop gửi (`.ASPXAUTH`, `ASP.NET_SessionId`); kiểm tra phiên bằng `VanBan.aspx` (200 ⇒ còn, về
  đăng nhập ⇒ hết). Worker giữ phiên sẵn có giữ phiên 20 phút khỏi hết hạn.
- Spider `qlvb_thu_van_ban`: mọi trang của danh sách; trường id, số ký hiệu, trích yếu, loại, trạng thái, ngày, người đang xử
  lý; định danh người dùng nguồn lấy từ tên đăng nhập trên trang.
- Báo cáo "Văn bản (QLVB thử nghiệm)", đặt lịch / chạy ngay được.
- Adapter và `main.py` nằm trong CSDL; repo giữ bản mẫu trong `tools/qlvb-webforms/` + lệnh nạp vào CSDL dev.

**Kiểm thử.** `unittest` cho `WebForm` với HTML lưu từ hệ thống giả lập (trường ẩn, bảng, trang sau, UpdatePanel, trang lỗi,
trang đăng nhập). Đầu-cuối: đăng nhập trong Vala Desktop → chạy ngay → báo cáo có đủ 35 văn bản qua 4 trang; đổi một văn
bản bằng thao tác phần 3, chạy lại ⇒ báo cáo cập nhật đúng dòng.

---

## Tài liệu

`docs/tich-hop-aspnet.md`, viết dần qua 4 phần: bắt request; viết thao tác ghi bằng `vala.webform`; viết spider bằng
`WebForm`; bảng lỗi thường gặp (EventValidation, ViewState hết hạn, hết phiên, UpdatePanel).

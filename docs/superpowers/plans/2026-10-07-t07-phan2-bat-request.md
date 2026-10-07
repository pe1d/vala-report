# T07 phần 2 — Công cụ bắt request trong Vala Desktop — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng (quản trị viết kịch bản) bật "ghi thao tác" trên một tab, thao tác tay, dừng ⇒ xem chuỗi request đã gửi
(form, postback, UpdatePanel, XHR) đã che giá trị nhạy cảm, lưu ra tệp và có bản nháp kịch bản dùng `vala.webform()`.

**Architecture:** Ba lớp tách biệt:
1. `src/recording.ts` — thuần (không import electron): kiểu dữ liệu bản ghi, tách form urlencoded/multipart, che giá trị,
   đọc trường ẩn / nút / ô nhập từ HTML, đọc phản hồi UpdatePanel, đặt tên bước. Test đơn vị đầy đủ.
2. `src/recording-draft.ts` — thuần: bản ghi ⇒ mã JS nháp (`vala.action` + `vala.webform`). Test đơn vị.
3. `src/recorder.ts` — gắn `webContents.debugger` (Chrome DevTools Protocol, mục Network) vào đúng tab đang ghi, gom sự kiện
   thành bước bằng các hàm của (1). Tab **Bản ghi thao tác** (`resources/recording.html` + `src/renderer/recording.ts` +
   `src/recording-preload.ts`) như tab Cài đặt. Kiểm bằng chạy thật trên hệ thống giả lập (phần 1) qua Playwright `_electron`.

**Tech Stack:** Electron 32 (`webContents.debugger`, CDP 1.3: `Network.*`, `Target.setAutoAttach` cho iframe khác tiến
trình), TypeScript, vitest, Tailwind (tab Bản ghi), Playwright `_electron` để kiểm đầu-cuối.

Spec: `docs/superpowers/specs/2026-10-07-t07-aspnet-design.md` (phần 2).

## Quyết định chi tiết

- **Một bản ghi tại một thời điểm.** Bắt đầu ghi tab khác ⇒ dừng bản đang ghi trước. Bản ghi cuối giữ trong bộ nhớ (tab Bản
  ghi đọc lại); không lưu đĩa trừ khi người dùng bấm **Lưu ra tệp**.
- **Bước** sinh từ `Network.requestWillBeSent` có `type` ∈ {Document, XHR, Fetch}. Chuyển hướng (`redirectResponse`) ⇒ ghi
  status + `location` vào bước trước, bước mới có `redirectedFrom`.
- **Phản hồi:** với Document/XHR có `mimeType` text/html hoặc text/plain và status 2xx, `Network.getResponseBody` ⇒ chỉ rút
  **tên** trường ẩn, tên nút submit, tên ô nhập (để nhận ra nút được bấm ở bước sau) và với UpdatePanel thì id các vùng cập
  nhật. Không giữ nội dung phản hồi.
- **Thân request:** `request.postData`; thiếu (multipart có tệp) ⇒ `request.postDataEntries` (bytes base64), rồi
  `Network.getRequestPostData`. Không đọc được ⇒ bước ghi `fields: []` + `body_khong_doc_duoc: true`.
- **Che:** tên khớp `/(pass|pwd|matkhau|mat_khau|password)/i` hoặc nằm trong danh sách ô `type=password` của trang (hỏi
  mọi khung của tab mỗi lần trang tải xong) ⇒ giá trị `••••`, `masked: 'mat_khau'`. `__VIEWSTATE`, `__EVENTVALIDATION`,
  `__RequestVerificationToken` ⇒ giá trị `(<n> ký tự)`, `masked: 'trang_thai'`. Tệp: tên, loại, kích thước. Header: chỉ
  giữ `content-type`, `x-microsoftajax`.
- **Giới hạn:** 200 bước ⇒ dừng, `truncated: true`. Tab đóng / trang bị DevTools chiếm (`detach` lý do khác "đã dừng") ⇒
  dừng và báo (thông báo hệ thống).
- **Menu:** chuột phải tab web (nguồn hoặc trang khác, không phải tab Vala/Báo cáo/Cài đặt) ⇒ "Bắt đầu ghi thao tác" /
  "Dừng ghi thao tác" (đang ghi tab đó). Tab đang ghi có chấm đỏ trên thanh tab.
- **API bản nháp** khớp phần 3: `vala.webform(url)` ⇒ `f`; `f.postback(target, fields?, { async? })`;
  `f.submit(button, fields?, { files? })`; giá trị trường `string | string[]` (CheckBoxList: tên gốc + mảng giá trị).

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `apps/desktop/src/recording.ts` | kiểu `Recording`/`RecStep`; `parseBody`, `maskFields`, `pageInfo`, `deltaInfo`, `stepLabel` |
| `apps/desktop/src/recording-draft.ts` | `draftScript(rec, lang)` |
| `apps/desktop/src/recorder.ts` | `startRecording(key, wc)`, `stopRecording()`, `recordingKey()`, `lastRecording()`, sự kiện `recorderEvents` |
| `apps/desktop/src/recording-page.ts` | IPC của tab Bản ghi (`vala:rec-state`, `vala:rec-save`, `vala:rec-copy`) — chỉ nhận từ tab đó |
| `apps/desktop/src/recording-preload.ts` | cầu nối tối thiểu cho tab Bản ghi |
| `apps/desktop/src/recording-strings.ts` | chữ hiển thị vi/en của tab Bản ghi |
| `apps/desktop/resources/recording.html`, `src/renderer/recording.ts` | giao diện tab Bản ghi (Tailwind, sáng/tối) |
| `apps/desktop/src/browser.ts` | tab `recording` (như `settings`); `tabWebContents(key)`; trạng thái `recording` cho thanh tab |
| `apps/desktop/src/renderer/tabs.ts` | chấm đỏ cho tab đang ghi |
| `apps/desktop/src/menu.ts` | mục bắt đầu / dừng ghi trong menu chuột phải tab |
| `apps/desktop/src/main.ts` | đăng ký `registerRecordingPage` |
| `apps/desktop/electron-builder.yml` | thêm `resources/recording.html` vào `files` |
| `apps/desktop/test/recording.test.ts`, `test/recording-draft.test.ts` | test đơn vị |
| `docs/tich-hop-aspnet.md` | mục "Bắt request" |

---

### Task 1: `recording.ts` — tách thân request + che giá trị (TDD)

- [ ] Test (`test/recording.test.ts`):
  - `parseBody('application/x-www-form-urlencoded; charset=UTF-8', 'a=1&b=x%20y&ctl00%24c=%C4%90')` ⇒ fields
    `[{name:'a',value:'1'},{name:'b',value:'x y'},{name:'ctl00$c',value:'Đ'}]`, files `[]`.
  - Trường lặp (`cbl$0=3&cbl$2=5`) giữ đủ, đúng thứ tự.
  - multipart (boundary, một trường chữ có dấu, một tệp `to-trinh.pdf` 12 byte `application/pdf`) ⇒ fields 1 mục, files
    `[{name:'fu', filename:'to-trinh.pdf', type:'application/pdf', size:12}]`.
  - `application/json` ⇒ fields `[{name:'(json)', value:<nguyên văn, cắt 2000 ký tự>}]`.
  - `maskFields(fields, new Set(['txtMatKhau']))`: `txtMatKhau` ⇒ `••••`/`mat_khau`; `ctl00$Login1$Password` (khớp tên) ⇒
    che; `__VIEWSTATE` dài 5000 ⇒ `(5000 ký tự)`/`trang_thai`; `__EVENTVALIDATION`, `__RequestVerificationToken` cũng vậy;
    trường thường giữ nguyên.
- [ ] Chạy thấy hỏng (module chưa có) ⇒ viết `parseBody`, `maskFields` ⇒ chạy thấy qua.

### Task 2: `recording.ts` — đọc trang, UpdatePanel, đặt tên bước (TDD)

- [ ] Test:
  - `pageInfo(html)` trên đoạn HTML WebForms (input hidden ×3, submit `ctl00$MainContent$btnChuyen`, select, checkbox,
    textarea, input password) ⇒ `{ hidden:['__VIEWSTATE',…], submits:['ctl00$MainContent$btnChuyen'],
    inputs:[…tên ô nhập không ẩn, không nút…], passwords:[…] }`.
  - `deltaInfo('646|updatePanel|ctl00_MainContent_upSo|<div>…</div>|0|hiddenField|__EVENTTARGET||…')` ⇒
    `{ panels:['ctl00_MainContent_upSo'], hidden:['__EVENTTARGET',…] }`; chuỗi không phải delta ⇒ `null`.
  - `stepLabel`:
    - GET trang ⇒ `Mở /VanBan.aspx` (en: `Open /VanBan.aspx`);
    - POST có `__EVENTTARGET=ctl00$MainContent$gvVanBan`, `__EVENTARGUMENT=Page$2` ⇒ `Sang trang 2: gvVanBan`;
    - POST `__EVENTTARGET=ctl00$MainContent$ddlDonVi` ⇒ `Gửi lại form: ddlDonVi`; kèm `async` ⇒ thêm ` (UpdatePanel)`;
    - POST không có target, có trường là nút submit của trang trước (`ctl00$MainContent$btnChuyen=Chuyển`) ⇒
      `Bấm btnChuyen (“Chuyển”)`;
    - POST có trường bị che `mat_khau` ⇒ `Đăng nhập (đã che mật khẩu)`;
    - XHR ⇒ `POST /api/x`.
- [ ] Chạy thấy hỏng ⇒ viết `pageInfo`, `deltaInfo`, `stepLabel` ⇒ chạy thấy qua.

### Task 3: `recording-draft.ts` (TDD)

- [ ] Test (`test/recording-draft.test.ts`) với bản ghi mẫu "chuyển văn bản" (đăng nhập ⇒ mở `/Chuyen.aspx?id=4` ⇒
  postback ddlDonVi ⇒ submit btnChuyen với `cblNguoiNhan$0=3`, `txtYKien`, tệp ⇒ chuyển hướng `/ChiTiet.aspx?id=4`):
  - có `vala.action('thao_tac_moi'`;
  - bước đăng nhập **không** thành mã, chỉ thành chú thích (`// bỏ qua: Đăng nhập …`);
  - có `const f = await vala.webform('/Chuyen.aspx?id=4');`;
  - có `await f.postback('ctl00$MainContent$ddlDonVi', { 'ctl00$MainContent$ddlDonVi': '2' });`;
  - có `await f.submit('ctl00$MainContent$btnChuyen', {` với `'ctl00$MainContent$cblNguoiNhan': ['3']` (gộp `$0`, `$2`… về
    tên gốc) và `'ctl00$MainContent$txtYKien': 'Đề nghị xử lý'`, không có `__VIEWSTATE` / `__EVENTTARGET`;
  - tệp ⇒ `files: { 'ctl00$MainContent$fuDinhKem': { ten: 'to-trinh.pdf', base64: p.tep_base64 } }` + chú thích kích thước;
  - postback UpdatePanel ⇒ `{ async: true }`;
  - GET trang không có POST theo sau ⇒ chú thích `// mở …`; XHR ⇒ `await vala.request(…)`;
  - chuỗi có `'` hoặc xuống dòng được thoát đúng (mã sinh ra parse được: `new Function('vala', 'return async () => {' + code + '}')` không lỗi cú pháp).
- [ ] Chạy thấy hỏng ⇒ viết `draftScript` ⇒ chạy thấy qua.

### Task 4: `recorder.ts` — gắn debugger, gom bước

- [ ] Viết `startRecording(key, wc, meta)`: `wc.debugger.attach('1.3')` (lỗi ⇒ ném `RecorderError('dang_mo_devtools')`),
  `Network.enable`, `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: false, flatten: true })`; với
  `Target.attachedToTarget` ⇒ `Network.enable` theo `sessionId`. Nghe `message`: `Network.requestWillBeSent`,
  `Network.responseReceived`, `Network.loadingFinished` (đọc body ⇒ `pageInfo`/`deltaInfo`). `did-frame-finish-load` ⇒ hỏi
  tên ô password của mọi khung (`wc.mainFrame.framesInSubtree` ⇒ `executeJavaScript`). Nghe `detach` ⇒ dừng.
  `destroyed` ⇒ dừng.
- [ ] `stopRecording()` ⇒ `wc.debugger.detach()` (nếu còn gắn), `stoppedAt`, phát `recorderEvents.emit('changed')`.
- [ ] Giới hạn 200 bước ⇒ dừng + `truncated`.
- [ ] Không có test đơn vị riêng (cần Chromium thật) — kiểm ở Task 7.

### Task 5: Tab Bản ghi thao tác

- [ ] `browser.ts`: tab `recording` y như `settings` (preload `recording-preload.js`, `resources/recording.html`, chặn điều
  hướng / mở cửa sổ); `openRecordingTab()`, `isRecordingContents(wc)`, `pushRecording()`; `tabWebContents(key)`;
  `pushState` thêm `recording: key === recordingKey()`.
- [ ] `recording-strings.ts` (vi/en, đủ khoá), `recording-page.ts` (IPC chỉ từ tab Bản ghi): `state` ⇒ `{ t, lang,
  recording, draft }`; `save` ⇒ `dialog.showSaveDialog` (`ban-ghi-<host>-<thời điểm>.json`) ⇒ ghi JSON; `copy(kind)` ⇒
  `clipboard.writeText` (JSON hoặc bản nháp).
- [ ] `recording.html` + `renderer/recording.ts`: đầu trang (host, thời điểm, số bước, "đã cắt ở 200 bước" nếu có, các
  nút **Lưu ra tệp** / **Sao chép JSON**); bên trái danh sách bước (số, nhãn, phương thức, status); bên phải chi tiết bước
  (địa chỉ, bảng trường — trường bị che hiện nhãn "đã che", tệp, phản hồi: status, chuyển hướng, trường ẩn, vùng
  UpdatePanel); cuối trang **Bản nháp kịch bản** (`<pre>` + **Sao chép**). Dựng DOM bằng `textContent`. Có sáng/tối.
- [ ] `electron-builder.yml`: thêm `resources/recording.html`.

### Task 6: Menu + chấm đỏ

- [ ] `menu.ts` `tabContextMenu(key, url)`: tab web (không phải `home`/`portal`/`settings`/`recording`, URL http/https) ⇒
  thêm mục "Bắt đầu ghi thao tác" hoặc "Dừng ghi thao tác" (vi/en). Dừng ⇒ mở tab Bản ghi. Lỗi bắt đầu ⇒ thông báo hệ
  thống (đang mở DevTools…). Tab trang khác (không phải nguồn) hiện có menu mật khẩu ⇒ thêm mục vào cuối; tab không có menu
  ⇒ menu chỉ có mục ghi.
- [ ] `renderer/tabs.ts`: `recording: boolean` ⇒ chấm đỏ nhấp nháy nhẹ (`bg-red-500 animate-pulse`) thay chấm trạng thái,
  `title` thêm "— đang ghi thao tác".
- [ ] `main.ts`: `registerRecordingPage(...)`.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`.

### Task 7: Kiểm đầu-cuối trên hệ thống giả lập

- [ ] Script Playwright `_electron` (hồ sơ tạm `VALA_USER_DATA`): mở tab `http://localhost:4030/Login.aspx` (`openTab`),
  bắt đầu ghi (`startRecording`), điền + đăng nhập, mở `Chuyen.aspx?id=4`, chọn đơn vị 2 (AutoPostBack), tích người nhận,
  nhập ý kiến, bấm Chuyển; mở `PhatHanh.aspx?id=8` (đăng nhập `vanthu`) chọn sổ (UpdatePanel); dừng ghi.
- [ ] Kiểm `lastRecording()`:
  - có đúng 2 bước POST cho lượt chuyển: "Gửi lại form: ddlDonVi", "Bấm btnChuyen (“Chuyển”)", sau đó chuyển hướng tới
    `ChiTiet.aspx?id=4`;
  - bước đăng nhập có `txtMatKhau` bị che, không có chuỗi `Qlvb@2026` ở bất kỳ đâu trong JSON bản ghi;
  - `__VIEWSTATE` chỉ có độ dài; không có header `cookie`;
  - bước UpdatePanel `async: true`, `panels` có `ctl00_MainContent_upSo`.
- [ ] Bản nháp: `vala.webform` chưa có (phần 3), nên ở phần 2 chỉ kiểm bản nháp sinh từ lượt ghi thật **parse được** và có
  đúng các lời gọi `webform` / `postback` / `submit`. Chạy lại bản nháp trên hệ thống giả lập là một ca kiểm của phần 3.
- [ ] Mở tab Bản ghi, chụp ảnh (sáng + tối), xem lại giao diện.

### Task 8: Tài liệu

- [ ] `docs/tich-hop-aspnet.md`: mở đầu (T07, cách tiếp cận A) + mục "1. Bắt request" (cách dùng, cái gì được ghi / che,
  đọc bản ghi WebForms: `__EVENTTARGET`, nút, UpdatePanel, chuyển hướng; giới hạn: DevTools, 200 bước, iframe).
- [ ] `apps/desktop/CHANGELOG.md`: chưa thêm mục bản mới (thêm khi phát hành), nhưng ghi chú công cụ vào phần nháp của bản
  kế tiếp nếu đã có mục.

# Vala web: mở 2 tab thì mất kết nối trực tuyến (MQTT) — đề xuất sửa

Gửi đội Vala web. Khảo sát 08/10/2026 trên valabeta.bkav.com (bản build `main.b9c4ea0e4bfae8fb190b.js`) từ Vala Desktop.

## Hiện tượng

Mở 2 tab Vala cùng tài khoản (vd Bảng tin + Tin nhắn, kể cả trong trình duyệt thường): tab mở trước hiện
*"Kết nối trực tuyến bị ngắt, do không hỗ trợ bật nhiều tab trên 1 trình duyệt. Bạn sẽ không nhận được tin nhắn người
khác gửi."* và thôi nhận tin. Bấm "Kết nối lại" ở tab này thì tab kia bị ngắt.

## Nguyên nhân

- Module kết nối MQTT (webpack id `bUAX`): `clientId = jwtDecode(token).clientId + clientIdSuffix`; `clientIdSuffix`
  mặc định `""`.
- Saga mở kết nối (module `FFMl`) gọi module trên với `{id, token, path:"/mqtt", domain, port, clientId, renewToken,
  reconnect}` — **không truyền `clientIdSuffix`** ⇒ mọi tab cùng phiên đăng nhập có cùng clientId (đã đo: hai tab cùng
  `145272975607880_140874927562340`).
- MQTT 5: client mới cùng clientId ⇒ broker ngắt client cũ với reason code **142 (Session taken over)** ⇒ tab cũ vào
  nhánh `SESSION_TAKE_OVER_CODE` (`j.end()`, hiện thông báo trên).
- Thêm: `localStorage.setItem("clientId", …)` dùng chung mọi tab và được đọc lại làm `publisherId` / `answerId` của
  cuộc gọi thoại/video ⇒ khi đã cho nhiều tab, các tab sẽ ghi đè nhau.

## Đề xuất sửa (theo thứ tự)

1. **Mỗi tab một clientId.** Khi mở kết nối truyền `clientIdSuffix = "_" + tabId`; `tabId` sinh ngẫu nhiên một lần
   cho mỗi tab và lưu `sessionStorage` (F5 giữ nguyên, tab mới khác). Hàm `transformWsUrl` (đổi token khi hết hạn) đã
   cộng sẵn suffix — giữ nguyên.
2. **Broker / plugin xác thực:** chấp nhận clientId **bắt đầu bằng** `clientId` trong token (thay vì bằng đúng). Để
   không đọng phiên theo tab: Clean Start = true, Session Expiry Interval = 0 (hoặc ngắn).
3. **Giá trị theo tab cho cuộc gọi:** thay `localStorage.clientId` bằng clientId đầy đủ của tab (biến trong bộ nhớ hoặc
   `sessionStorage`) ở các chỗ đọc làm `publisherId` / `answerId` / `noPermissionId`.
4. **Thông báo không lặp:** mọi tab đều nhận cùng tin ⇒ dùng `BroadcastChannel` chọn một tab (tab đang focus, không có
   thì tab mở gần nhất) hiện thông báo trình duyệt / phát âm báo.
5. (Phương án lớn hơn, không bắt buộc) một kết nối MQTT chung trong `SharedWorker`, các tab nhận qua `MessagePort` —
   ít kết nối hơn khi người dùng mở nhiều tab.

Kiểm tra sau khi sửa: mở Bảng tin + Tin nhắn (2 tab), gửi tin từ tài khoản khác ⇒ cả hai tab nhận, chỉ một thông báo;
F5 từng tab vẫn nhận; gọi thoại từ một tab không làm tab kia nhận nhầm.

## Vala Desktop trong lúc chờ

Vala Desktop tự bấm "Kết nối lại" khi người dùng chuyển sang một tab Vala đang bị ngắt (apps/desktop/src/browser.ts,
`reclaimVala`) ⇒ tab đang xem luôn nhận tin, tab ẩn tạm mất. Gỡ khi Vala web đã sửa.

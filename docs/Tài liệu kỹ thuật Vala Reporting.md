Tài liệu kỹ thuật Vala Reporting

**File kèm theo** `schema.sql` `openapi.yaml` `adapter-egov.yaml` `adapter-etask.yaml`

Bản 1.0 · 25/09/2026 · Giai đoạn nội bộ

# Nền tảng báo cáo theo lịch

Tài liệu đủ để một đội chưa tham gia thiết kế có thể bắt tay code: kiến trúc, dữ liệu, adapter, API, giao diện, bảo mật, vận hành, kiểm thử và backlog.

Backend · **Node / TypeScript** CSDL · **PostgreSQL** Lịch chạy · **Crawlab** Giao diện · **React, tự build** Phạm vi · **eGov + eTask**

01

## Bối cảnh và các quyết định đã chốt

Đọc mục này trước. Nó giải thích vì sao hệ thống có hình dạng như hiện tại, và ghi lại những quyết định mà nếu đảo ngược thì phải làm lại thiết kế.

Hệ thống lấy dữ liệu từ các phần mềm nội bộ không có API công bố (eGov, eTask), chuẩn hoá vào một kho riêng, rồi phục vụ báo cáo cho người dùng qua một cổng web. Người dùng tự đặt lịch chạy; Crawlab thực thi; không có mô hình ngôn ngữ nào trong sản phẩm.

Ràng buộc chi phối toàn bộ thiết kế

**eGov chỉ cho mỗi tài khoản thấy hàng đợi của chính tài khoản đó.** Không có vai trò xem liên người dùng. Hệ quả: không thể dùng một tài khoản dịch vụ để crawl dữ liệu của cả đơn vị — cách làm thông thường của một hệ thống báo cáo.

Giải pháp đã chọn: **phiên uỷ quyền theo từng người dùng**. Mỗi người cho phép hệ thống lấy dữ liệu thay mình; phiên của họ nằm trong vault; Crawlab chạy fan-out một tác vụ cho mỗi người đã uỷ quyền. Dữ liệu về kho gắn `owner_user_id`. Cấp trên xem được dữ liệu cấp dưới là nhờ cây tổ chức cộng chính sách của đơn vị, không phải nhờ một tài khoản nhìn thấy tất cả.

### Nhật ký quyết định

| Quyết định | Đã chọn | Vì sao, và điều gì xảy ra nếu đảo ngược |
| ---------- | ------- | --------------------------------------- |

### Ngoài phạm vi bản 1

- bMail — cần chốt phạm vi trường lấy về trước khi thiết kế; ưu tiên IMAP nếu có.
- Hỏi đáp bằng ngôn ngữ tự nhiên — kho dữ liệu được thiết kế để thêm sau mà không phải làm lại.
- Nhiều đơn vị thật sự — cấu trúc schema đã sẵn sàng, nhưng quy trình onboard chưa nằm trong bản 1.
- Báo cáo gộp liên hệ thống (đối chiếu eGov với eTask) — để sau khi cả hai adapter ổn định.

02

## Kiến trúc hệ thống

Hai đường đi tách rời: đường nạp dữ liệu chạy theo lịch, đường phục vụ báo cáo chỉ đọc từ kho. Người dùng không bao giờ phải chờ hệ thống nguồn.

### Trách nhiệm từng thành phần

| Thành phần | Công nghệ | Chịu trách nhiệm |
| ---------- | --------- | ---------------- |

### Trình tự — một lượt chạy theo lịch

```
Crawlab (cron 06:00)
  └─ POST /internal/crawl/fan-out  { source: "egov", capability: "documents_by_node" }
       └─ API chọn danh sách người dùng đủ điều kiện
            SELECT app_user_id FROM source_grants
             WHERE source_system='egov' AND revoked_at IS NULL AND session_state='active'
       └─ với mỗi người dùng, đẩy một job vào hàng đợi Redis (rải đều 30 phút, tối đa 5 song song)

Worker (mỗi job = một người dùng)
  1. lấy phiên từ Vault theo vault_ref                     → hỏng? đánh dấu expired, dừng
  2. GET /Home/Index → regex lấy puid                      → lưu user_source_accounts
  3. GET /Home/GetFunctionByParentId?parentId=0&puid=...   → danh sách node
  4. với mỗi node: POST /home/GetDocuments {id, paramsQuery, puid}
  5. ghi raw_records (nguyên văn) — luôn ghi, kể cả khi bước 6 lỗi
  6. chuẩn hoá theo output_schema → tính content_hash
  7. so với bản hiện hành: khác thì đóng bản cũ (valid_to=now) và chèn bản mới
  8. cập nhật crawl_runs: status, records_seen, records_changed
```

Lưu ý cài đặt

Bước 5 phải xảy ra trước bước 6 và trong transaction riêng. Nếu bóc tách lỗi mà lớp thô đã ghi thì vẫn tính lại được sau; nếu gộp chung transaction thì lỗi bóc tách làm mất luôn dữ liệu thô, và dữ liệu đó không lấy lại được vì hệ thống nguồn chỉ có trạng thái hiện tại.

03

## Mô hình dữ liệu

Lược đồ đầy đủ nằm trong `schema.sql` — chạy trực tiếp được. Mục này giải thích những chỗ mà đọc DDL không thấy được lý do.

#### Lớp 1 — `raw_records`

Nguyên văn response, phân vùng theo tháng, giữ 90 ngày. Tồn tại để tính lại lớp 2 khi phát hiện bóc tách sai, mà không phải gọi lại hệ thống nguồn.

#### Lớp 2 — `documents`, `tasks`

Đã chuẩn hoá, có lịch sử kiểu SCD2. Là thứ báo cáo truy vấn. Chịu row-level security.

#### Lớp 3 — materialized view

Chỉ dựng khi báo cáo chậm. Không chịu RLS nên phải giữ khoá phân quyền trong view và lọc lại ở tầng truy vấn.

#### Bổ trợ — `crawl_runs`

Nguồn cho dòng “số liệu tính đến…” và cho toàn bộ cảnh báo giám sát. Không phải bảng phụ.

### Vì sao lưu lịch sử bằng hash thay vì lưu lát cắt

Hệ thống nguồn chỉ có trạng thái hiện tại, nên mỗi lần chạy là một lát cắt. Ghi lại toàn bộ bản ghi sau mỗi lần chạy thì với 200 người dùng và lịch hàng ngày, phần lớn dữ liệu là bản sao y hệt. Cách dùng ở đây: băm các trường nghiệp vụ, so với bản hiện hành, chỉ ghi khi khác.

```
-- content_hash tính trên đúng các trường khai báo trong adapter spec
-- (content_hash_fields), không gồm cột kỹ thuật như valid_from hay crawl_run_id
const hash = sha256(JSON.stringify(pick(row, spec.content_hash_fields)));

-- đóng bản cũ rồi chèn bản mới, trong cùng một transaction
UPDATE documents SET valid_to = now()
 WHERE ma_van_ban = $1 AND owner_user_id = $2 AND valid_to IS NULL
   AND content_hash <> $3;
INSERT INTO documents (...) SELECT ... WHERE NOT EXISTS (
   SELECT 1 FROM documents WHERE ma_van_ban=$1 AND owner_user_id=$2
     AND valid_to IS NULL AND content_hash = $3);
```

### Row-level security — hợp đồng bắt buộc giữa API và CSDL

Phân quyền được cưỡng chế ở tầng CSDL, không chỉ trong code. API phải mở transaction và đặt ba biến phiên trước mọi truy vấn dữ liệu. Không đặt thì RLS trả về rỗng — đó là hành vi đúng theo nguyên tắc mặc định từ chối.

```
await db.tx(async t => {
  await t.none(/* sql */ `
    SELECT set_config('app.user_id',           $1, true),
           set_config('app.org_units_allowed', $2, true),
           set_config('app.scope',             $3, true)`,
    [user.id, toPgArray(orgUnitsAllowed), scope]);
  return t.any(reportQuery, params);   // kết nối dùng vai trò app_reader (KHÔNG BYPASSRLS)
});
```

Sai lầm dễ mắc nhất

Dùng nhầm vai trò `app_writer` (có `BYPASSRLS`) cho đường phục vụ báo cáo. Khi đó mọi truy vấn sẽ trả về dữ liệu của tất cả mọi người và không có lỗi nào được báo. Hai vai trò phải dùng hai connection pool riêng biệt, cấu hình ở hai biến môi trường khác nhau, và có test tự động khẳng định pool đọc không bypass được RLS.

04

## Adapter — cách nối một hệ thống nguồn

Adapter là bản khai báo YAML, không phải script rời. Runtime đọc spec và thực thi; thêm hệ thống mới nghĩa là thêm một file spec, không phải thêm một chương trình.

### Quy trình thêm một adapter mới

05

## API nội bộ

Đặc tả đầy đủ trong `openapi.yaml` (11 nhóm endpoint). Mục này nêu các hợp đồng mà đọc OpenAPI không suy ra được.

| Endpoint | Vai trò | Ràng buộc bắt buộc |
| -------- | ------- | ------------------ |

### Quy ước chung

- Mọi phản hồi dữ liệu báo cáo đều kèm khối `freshness`; frontend hiển thị nó, không được bỏ.
- Lỗi trả theo RFC 7807 (`application/problem+json`) với `type` là mã máy đọc được: `session_expired`, `grant_required`, `scope_denied`, `schema_drift`.
- `session_expired` và `grant_required` phải được frontend xử lý riêng — dẫn người dùng đi uỷ quyền lại, không hiện lỗi kỹ thuật.
- Không endpoint nào nhận cron thô từ người dùng ở bản 1; chỉ nhận `schedule_preset` rồi backend quy đổi.
- Mọi lần xem báo cáo và xuất file ghi `audit_log` trước khi trả dữ liệu, không phải sau.

06

## Tài liệu giao diện

Sáu màn hình cho bản 1. Wireframe là bố cục và thứ bậc thông tin, không phải thiết kế cuối; màu sắc và khoảng cách theo hệ thiết kế ở cuối mục.

### Trạng thái bắt buộc có cho mọi màn hình dữ liệu

| Trạng thái | Khi nào | Giao diện phải làm gì |
| ---------- | ------- | --------------------- |

### Hệ thiết kế

#### Chữ

Tiêu đề và nhãn giao diện dùng một font sans có hỗ trợ tiếng Việt đầy đủ. Số liệu trong bảng dùng `font-variant-numeric: tabular-nums` để cột số thẳng hàng.

#### Màu

Một màu nhấn duy nhất cho hành động chính. Màu trạng thái (tốt / cảnh báo / lỗi) tách riêng khỏi màu nhấn và luôn đi kèm chữ, không bao giờ chỉ dùng màu.

#### Biểu đồ

Chuỗi thời gian dùng đường; so sánh hạng mục dùng cột ngang. Không dùng hai trục y. Không quá sáu chuỗi trên một biểu đồ. Nhãn trục phải là giá trị thật mà biểu đồ chạm tới.

#### Bảng

Cột đầu là thứ người dùng tìm kiếm bằng mắt (trích yếu, tiêu đề công việc). Ngày tháng định dạng dd/MM/yyyy. Dòng trống hiển thị dấu gạch, không để ô rỗng.

07

## Bảo mật và phân quyền

Ba lớp độc lập: uỷ quyền của người dùng với hệ thống nguồn, phạm vi xem trong cổng báo cáo, và cưỡng chế ở tầng CSDL. Hỏng một lớp thì hai lớp còn lại vẫn chặn.

### Vòng đời một uỷ quyền

```
pending ──đăng nhập SSO và đồng ý──> active ──phiên hết hạn──> expired
   ▲                                     │                            │
   └────────người dùng uỷ quyền lại──────┴────────────────────────────┘
                                         │
                                         └──người dùng thu hồi──> revoked
                                              (xoá phiên khỏi vault ngay,
                                               huỷ mọi lịch fan-out,
                                               dữ liệu đã crawl giữ nguyên
                                               trừ khi yêu cầu xoá riêng)
```

### Nguyên tắc không được vi phạm

- Không bao giờ lưu mật khẩu người dùng. Chỉ lưu phiên hoặc refresh token, và chỉ trong vault.
- Giá trị phiên không xuất hiện trong log, trong thông báo lỗi, trong phản hồi API, hay trong bảng CSDL nào.
- Adapter chỉ gọi được endpoint nằm trong `allowed_endpoints`. Runtime từ chối phần còn lại, kể cả khi spec yêu cầu.
- Adapter luôn gửi đúng định danh của phiên đang dùng. Nếu phát hiện hệ thống nguồn chấp nhận định danh của người khác, đó là lỗ hổng của hệ thống nguồn — báo cho đội phát triển, không xây tính năng dựa trên nó.
- Người dùng phải xem được chính xác hệ thống nào đang được lấy dữ liệu thay mình, lần cuối lúc nào, và thu hồi được bất cứ lúc nào chỉ bằng một thao tác.

### Phân quyền xem dữ liệu

| Phạm vi | Ai được chọn                                            | Điều kiện kỹ thuật                                                                                                                                                                      |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ca_nhan | Mọi người dùng                                          | `owner_user_id = current_app_user()`. Luôn khả dụng, không cần cấu hình.                                                                                                                |
| don_vi  | Người có vai trò `truong_don_vi` trong `user_org_units` | API tính danh sách đơn vị cấp dưới từ `org_units.path` rồi truyền vào `app.org_units_allowed`. Chỉ thấy bản ghi có `org_unit_id` thuộc danh sách đó và chỉ của những người đã uỷ quyền. |

Điều phải nói rõ với người dùng

Vì dữ liệu chỉ có được khi người dùng uỷ quyền, báo cáo cấp đơn vị **luôn là dữ liệu chưa đầy đủ** nếu còn người chưa uỷ quyền. Giao diện phải hiện rõ “đang tổng hợp từ 12/18 thành viên đã uỷ quyền”, chứ không được im lặng trình bày như thể đó là toàn bộ đơn vị. Đây là yêu cầu chức năng, không phải chi tiết trang trí.

08

## Vận hành

### Triển khai

Toàn bộ chạy trên hạ tầng nội bộ, đóng gói Docker Compose cho bản 1. Không dịch vụ nào cần ra Internet ngoài việc gọi chính eGov và eTask.

```
# các dịch vụ và cổng nội bộ
api           node:20      :3000    — Fastify, 2 pool: app_reader / app_writer
web           nginx        :80      — build tĩnh của React
worker        node:20      —        — tiêu thụ hàng đợi Redis, chạy adapter
crawlab       crawlab      :8080    — chỉ mở cho kỹ sư vận hành, KHÔNG cho người dùng cuối
postgres      postgres:16  :5432
redis         redis:7      :6379
vault         vault        :8200    — hoặc dịch vụ quản lý bí mật sẵn có của đơn vị
minio         minio        :9000    — file Excel/PDF xuất ra
```

### Cảnh báo

| Điều kiện | Mức | Hành động |
| --------- | --- | --------- |

### Sổ tay xử lý sự cố

09

## Kiểm thử

Một bộ test quan trọng hơn tất cả phần còn lại: ma trận phân quyền. Đây là chỗ mà một lỗi làm lộ dữ liệu của cả đơn vị.

### Ma trận phân quyền — bắt buộc tự động, chạy mỗi lần CI

| Tình huống | Phạm vi chọn | Kết quả đúng |
| ---------- | ------------ | ------------ |

### Các nhóm test còn lại

- **Adapter** — chạy trên bản ghi mẫu đã lưu (fixture từ response thật), khẳng định output_schema đúng và content_hash ổn định giữa hai lần chạy với dữ liệu không đổi.
- **Phát hiện lệch schema** — cho fixture thiếu một trường trong schema_baseline, khẳng định run bị đánh dấu failed với `error_code = 'schema_drift'`.
- **Hết phiên** — giả lập `session_probe` thất bại, khẳng định grant chuyển `expired`, không có raw_records nào được ghi, và người dùng thấy lời nhắc uỷ quyền lại.
- **Lịch sử** — chạy adapter hai lần với một trường thay đổi, khẳng định có đúng hai dòng và dòng cũ có `valid_to`.
- **Chốt chặn endpoint** — cho spec một endpoint ngoài `allowed_endpoints`, khẳng định runtime từ chối trước khi phát request.
- **Tải** — fan-out 200 người dùng giả, khẳng định không vượt rate limit khai báo và hoàn tất trong cửa sổ đã định.

### Điều kiện nghiệm thu bản 1

- Một người dùng thật uỷ quyền eGov, đặt lịch hàng ngày, và nhận báo cáo đúng số liệu trong ba ngày liên tiếp không ai can thiệp.
- Một trưởng đơn vị xem được phạm vi đơn vị, thấy rõ tỉ lệ thành viên đã uỷ quyền, và không thấy dữ liệu của đơn vị khác.
- Thu hồi uỷ quyền làm phiên biến mất khỏi vault trong vòng một phút và mọi lịch liên quan dừng chạy.
- Ma trận phân quyền xanh toàn bộ trong CI.
- Một sự cố giả lập (đổi tên trường trong fixture) được cảnh báo phát hiện trước khi có người dùng phản ánh.

10

## Backlog

Chia theo thứ tự phụ thuộc. Ước lượng theo người-ngày cho một đội hai người full-stack; con số là để xếp thứ tự, không phải cam kết.

| Mã  | Hạng mục | Ước lượng | Phụ thuộc và ghi chú |
| --- | -------- | --------- | -------------------- |

Việc đầu tiên, trước mọi thứ khác

**E0 — xác minh cách lấy phiên uỷ quyền.** Hỏi đội SSO xem Bkav SSO có hỗ trợ luồng authorization code cho một client nội bộ hay không. Có thì toàn bộ thiết kế chạy như tài liệu này. Không có thì phải chuyển sang phương án extension đồng bộ cookie, và điều đó thay đổi mục 06 (thêm màn hình cài extension), mục 07 (mô hình uỷ quyền) và mục 08 (không refresh được phiên khi người dùng không mở trình duyệt). Đừng bắt đầu E2 trước khi có câu trả lời này.

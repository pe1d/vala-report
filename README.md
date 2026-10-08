# Vala Reporting

Nền tảng báo cáo theo lịch cho eGov/eTask. Thiết kế đầy đủ nằm trong [docs/](docs/): tài liệu kỹ thuật, phương án triển khai, `openapi.yaml`, `adapter-egov.yaml`, lược đồ gốc.

## Chạy ở máy dev

Cần Node 18+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up                       # postgres :5441, redis :6391, vault (dev) :8201
docker compose up -d crawlab     # Crawlab :8080 (admin/admin) + MongoDB riêng của nó :27018 — image ~5 GB
pnpm db:seed                     # migration + dữ liệu mẫu (1 tài khoản quản trị: ops)

# Cách 1 — tất cả trong Docker (một lệnh, hot-reload):
pnpm dev:up         # postgres/redis/vault + api :3000 + worker + web :5173
#   Thêm COMPOSE_PROFILES=dev vào .env thì `docker compose up -d` bật tất cả (kể cả Crawlab).
#   Máy dev tắt là tắt, không tự lên lại; chỉ prod (RESTART_POLICY=unless-stopped) mới tự lên.
# Cách 2 — chạy tay từng tiến trình:
pnpm dev:api        # Fastify :3000
pnpm dev:worker     # bảo trì: làm mới phiên, phân vùng, lớp tổng hợp
pnpm dev:web        # React :5173 — mở trình duyệt ở đây
```

Hệ thống nguồn (eGov/eTask…) **không seed trong code** — quản trị thêm và cấu hình adapter trên
giao diện *Hệ thống nguồn*. Tài khoản quản trị dev: `ops` / `Vala@2026`. Người dùng thật vào qua SSO.

Thử toàn luồng:
1. `ops` → *Hệ thống nguồn* → thêm hệ thống + dán adapter; → *Script crawl* → **Đồng bộ Crawlab**.
2. Người dùng → *Tài khoản nguồn* → kết nối bằng **Vala Desktop** (đăng nhập hệ thống nguồn trong app, app tự giữ và gửi phiên) hoặc mật khẩu (nếu adapter có tự-đăng-nhập).
3. *Cấu hình báo cáo* tạo báo cáo → *Lịch chạy* → **Chạy ngay** → dashboard có số liệu.

```bash
pnpm typecheck      # kiểm tra kiểu toàn workspace
pnpm test           # bộ test cũ (phụ thuộc eGov/eTask giả lập) đã gỡ; sẽ dựng bộ test mới không phụ thuộc nguồn
```

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `db/migrations/` | `001` = lược đồ gốc (sửa 2 chỗ để chạy được), `002`–`004` = bản vá, `003` = danh mục báo cáo, `005` = đăng nhập mật khẩu + kết nối, `006` = spider Crawlab, `007` = tiện ích trình duyệt, `008` = quản trị thêm hệ thống nguồn, `009` = cấu hình adapter nằm trong CSDL, `010` = bảng dữ liệu chung + báo cáo cấu hình, `011` = tham số lọc lấy từ dữ liệu, …, `027` = nhiều đơn vị (`core.tenants`, bảng nguồn vào schema đơn vị), `028` = dựng đơn vị từ giao diện + quản trị hệ thống. `db/tenant-baseline.sql` = bản nền schema đơn vị. `db/migrations/tenant/` = migration áp cho từng đơn vị — xem `docs/nhieu-don-vi.md` |
| `adapters/` | **Mẫu khởi tạo** adapter (hiện để trống). Nếu có file `*.yaml`, lần chạy đầu chép vào CSDL cho hệ thống chưa có `adapter_yaml`; hiện egov/etask cấu hình hoàn toàn trên giao diện |
| `packages/core` | CSDL (2 pool), phân quyền, adapter runtime, pipeline nạp, vault, hàng đợi fan-out |
| `apps/api` | Fastify, theo `openapi.yaml` |
| `apps/worker` | Bảo trì: làm mới phiên sắp hết hạn, phân vùng lớp thô, lớp tổng hợp. (Hàng đợi crawl nội bộ giữ lại làm dự phòng khi không có Crawlab) |
| `crawlers/` | Chỉ còn thư viện chung `_sdk/vala_sdk.py`. **Mã spider (`main.py`) lưu trong CSDL**, quản trị viết/sửa trên trang *Script crawl* |
| `apps/web` | React + Tailwind 3, 6 màn hình, chuyển sáng/tối/theo hệ thống |
| `apps/desktop` | **Vala Desktop** (Electron) — sản phẩm chính: thanh ứng dụng theo danh mục đơn vị, Trợ lý AI, giữ phiên các hệ thống nguồn, **trang Quản trị đơn vị** (`admin/`) |
| `packages/ui` | Giao diện dùng chung (React + Tailwind preset): song ngữ, sáng/tối, thành phần, client API |
| `packages/admin` | Các trang Quản trị đơn vị (người dùng, ứng dụng, kịch bản, hệ thống nguồn, cấu hình chung) — dùng trong Vala Desktop; cổng web dùng tạm |

## Crawlab và script crawl (cập nhật 26/09/2026)

```
Quản trị    Script crawl: main.py lưu CSDL (Python + vala_sdk) ──"Đồng bộ Crawlab"──▶ spider (không tạo lịch Crawlab)
Người dùng  "Tài khoản nguồn": tự cấp cookie/phiên hoặc tài khoản/mật khẩu (lưu trong vault)
Người dùng  tự đặt lịch cho báo cáo: giờ tuỳ ý, theo thứ, hàng tháng, nhiều lần trong ngày, một lần (không nhập cron)
Worker      mỗi phút: lịch nào đến hạn ⇒ bảo Crawlab chạy python main.py --user N --trigger schedule
  vala_sdk  → POST /internal/spider/runs            "người N có kết nối còn hiệu lực?"
            → POST /internal/spider/runs/:id/session cookie của người đó (backend tự đăng nhập lại khi cần)
            → spider gọi hệ thống nguồn
            → POST /internal/spider/runs/:id/records bản ghi THÔ → lớp thô → chuẩn hoá theo adapters/*.yaml → lịch sử
            → POST /internal/spider/runs/:id/finish
Cổng        dashboard có sẵn đọc từ kho, vd "Việc của tôi hôm nay"
```

- **Script Python không bao giờ nhận mật khẩu**, chỉ nhận cookie đúng lúc dùng. Tự đăng nhập bằng mật khẩu nằm ở backend.
- **Dữ liệu không lưu vào MongoDB của Crawlab**; Crawlab chỉ giữ script, lịch và log.
- **Hẹn giờ nằm ở worker Vala, không ở Crawlab** (cập nhật 29/09/2026, migration 015). Lịch lưu dạng có cấu trúc trong
  `report_subscriptions.schedule` ([packages/core/src/schedule.ts](packages/core/src/schedule.ts)); worker (`runDueSchedules`) mỗi
  phút tìm lịch đến hạn, dời `next_run_at` ngay rồi chạy spider cho đúng người đó. Rào chắn: các giờ trong ngày cách nhau
  ≥ 60 phút; gộp nhiều lịch cùng người × hệ thống thành một lượt; bỏ qua nếu người đó vừa có lượt chạy trong 50 phút
  (`SCHEDULE_MIN_GAP_MINUTES`); rải giờ 0–4 phút sau giờ đặt; mỗi hệ thống tối đa 20 lượt bắt đầu mỗi phút
  (`MAX_STARTS_PER_SOURCE_PER_MINUTE`), phần dư chạy phút sau; mỗi người tối đa 10 lịch đang bật (`MAX_SUBSCRIPTIONS_PER_USER`);
  kết nối hết hạn thì bỏ qua lượt đó. Lịch một lần chạy xong tự tắt. "Đồng bộ Crawlab" xoá các lịch cố định (preset) cũ.
- "Chạy ngay" của người dùng và "Chạy thử" của quản trị chạy spider trên Crawlab với `--user N`.
- **Theo dõi lỗi trong Crawlab (cập nhật 30/09/2026, migration 019).** Mọi lần chạy spider đi qua `launchSpider`
  ([packages/core/src/spiderOps.ts](packages/core/src/spiderOps.ts)): kiểm tra mã spider trên Crawlab còn đủ file
  (thiếu thì đẩy lại từ CSDL), chạy, ghi `core.spider_launches`. Spider gọi Vala ⇒ `reported`; quá 3 phút không thấy
  (task Crawlab không còn chạy) ⇒ worker lấy dòng lỗi từ log Crawlab và ghi một lượt `spider_not_started` vào
  Nhật ký chạy. Worker ghi "còn sống" mỗi phút và kiểm tra Crawlab mỗi 10 phút + lúc khởi động (tự khôi phục mã spider
  khi Crawlab mất file, vd sau khi máy chủ khởi động lại) — trang *Vận hành* hiện Worker, Crawlab, Lịch trễ, Spider
  không tới được Vala. Máy chủ chạy thật đặt `RESTART_POLICY=unless-stopped` để container tự lên lại sau khi khởi động máy.
- Lỗi của một người không làm hỏng cả lượt; spider báo lỗi Crawlab khi quá 50% người dùng lỗi.

**Viết spider mới cho một trang:**
1. `adapters/<nguồn>.yaml`: cách đăng nhập (`auth.password_login`), cookie phiên (`cookies_required`), ánh xạ trường (`output_schema`), trường để phát hiện lệch schema.
2. `main.py` của spider (viết trên trang *Script crawl*, lưu CSDL): chỉ lo "gọi trang nào, lấy gì" bằng `run.get()/run.post()` rồi `run.save(capability, items)`. SDK tự lấy phiên mới khi bị chuyển hướng/401.
3. Thêm dòng vào `core.crawl_spiders`, bảng đích vào `SINKS` (`packages/core/src/ingest/crawl.ts`), báo cáo vào `report_catalog` + `apps/api/src/reports/`.
4. *Script crawl* → **Đồng bộ Crawlab** → **Chạy thử** cho một người.

Sửa mã trên trang *Script crawl* rồi đồng bộ. Đừng sửa trực tiếp trên Crawlab: lần đồng bộ sau sẽ ghi đè bằng bản trong CSDL.

## Đăng nhập và kết nối dữ liệu (cập nhật 25/09/2026)

**Đăng nhập cổng bằng tài khoản/mật khẩu** (form chuẩn). Mật khẩu cổng băm scrypt trong `app_users.password_hash`; vai trò đọc báo cáo không đọc được cột này. Dev: tài khoản = phần trước @ của email (vd `binhlt`, `ops`), mật khẩu `Vala@2026`. Bật thêm đăng nhập Bkav SSO bằng `LOGIN_SSO=true`.

**Kết nối crawl do quản trị cấu hình** (màn hình *Kết nối dữ liệu*, chỉ `is_ops_admin`). Mỗi kết nối = (người dùng) × (hệ thống nguồn) × cách xác thực (`source_grants.auth_method`):

| Cách | Quản trị nhập | Tự làm mới? |
| --- | --- | --- |
| `password` | Tài khoản + mật khẩu hệ thống nguồn | Có — hệ thống tự đăng nhập lại |
| `cookie` | Chuỗi cookie copy từ trình duyệt | Không — hết hạn phải dán lại |
| `sso` | (người dùng tự uỷ quyền qua Bkav SSO) | Có — refresh token |
| `extension` | (không nhập gì — Vala Desktop tự gửi; tên giữ từ thời tiện ích trình duyệt) | Vala Desktop gửi lại mỗi khi người dùng đăng nhập nguồn trong app |

Bí mật (mật khẩu/cookie nguồn) **chỉ nằm trong vault**, không trả qua API, không ghi log. **Vault chạy chế độ lưu bền**
(cập nhật 30/09/2026, [infra/vault](infra/vault)): dữ liệu ở volume `vault-file`, tự khởi tạo + tự mở khoá khi khởi động
(khoá mở ở volume `vault-keys`, chmod 600), token ứng dụng `VAULT_TOKEN` chỉ có quyền `secret/*`. Trước đó chạy `server -dev`
(lưu trong bộ nhớ) — máy chủ khởi động lại là mất hết phiên đã lưu. Phân loại lỗi khi lấy dữ liệu: `session_missing` (kho
không còn phiên), `session_expired` (nguồn từ chối chính phiên — kiểm tra lại bằng session_probe trước khi kết luận),
`source_denied` (nguồn từ chối một request nhưng phiên vẫn tốt), `source_unavailable` (nguồn lỗi 5xx / không phản hồi,
spider thử lại một lần) — chỉ hai loại đầu mới bắt người dùng đăng nhập lại. Sai mật khẩu hoặc tài khoản bật OTP ⇒ dừng, không thử lại (tránh khoá tài khoản nguồn). eGov thật đăng nhập qua `iam.bkav.com` (WSO2); cách đăng nhập khai báo ở `adapters/egov.documents.yaml` mục `auth.password_login`.

Thử trên dev:
- Quản trị (`ops`) → *Kết nối dữ liệu* → *Cấu hình* cho một người dùng → chọn "Tài khoản/mật khẩu", nhập tên nguồn (vd `binhlt`) + `Egov@2026` → Lưu (hệ thống thử đăng nhập iam giả lập ngay).
- Đăng nhập lại bằng tài khoản người đó → đặt lịch, xem báo cáo.

## Tổng quan và hệ thống nguồn (cập nhật 28/09/2026)

**Tổng quan** (`/tong-quan`, trang mặc định) **cấu hình hoàn toàn trên cổng** (cập nhật 29/09/2026): gồm các **tab** do quản trị tạo (*Cấu hình báo cáo → Tab trên Tổng quan*, bảng `dashboard_tabs`), mỗi tab gồm các **khối**, mỗi khối là một báo cáo cấu hình chọn "Ở tab" đó (`report_catalog.dashboard_tab`, độ rộng `dashboard_width` 1–3 phần ba hàng, thứ tự `dashboard_order`). Báo cáo hiện trên Tổng quan mà không thuộc tab nào nằm ở tab *Báo cáo của bạn*. Tab gắn một hệ thống nguồn thì hiện tình trạng kết nối và nút Kết nối / Cập nhật ngay; tab không có khối nào người xem được thì tự ẩn. Dữ liệu lấy từ `GET /api/v1/dashboard`; mỗi khối chạy báo cáo qua đúng `runReport`, tức là có RLS và audit. Khối tự đổi theo tình trạng:

| Tình trạng | Ô hiện |
| --- | --- |
| `ok` | thẻ số liệu / biểu đồ đầu tiên / 5 dòng đầu, kèm "Cập nhật ngay" |
| `can_ket_noi` | nút **Kết nối <nguồn>**: trong Vala Desktop thì mở hệ thống đó trong app để đăng nhập, ngoài app thì mở *Tài khoản nguồn* (`?ket-noi=<nguồn>`) |
| `het_han` | nút **Kết nối lại** |
| `chua_co_du_lieu` | nút **Lấy dữ liệu ngay** (`POST /me/sources/:nguồn/run-now`, một lần / 10 phút) |

Khối vẽ bằng **ECharts** theo loại biểu đồ trong định nghĩa báo cáo: cột ngang (so sánh hạng mục), cột đứng (theo ngày/tháng), đường (xu hướng), vành khuyên (phần của tổng, 3 nhóm lớn + "Khác"), lịch nhiệt (mật độ theo ngày). Thẻ số liệu có thể kèm **xu hướng theo tháng** của một trường ngày (số tháng này, chênh lệch so với tháng trước, sparkline 12 tháng) hoặc là **tỉ lệ %** (thanh tiến độ). Không còn phần Văn bản / Công việc viết cứng trong code: hai tab đó giờ là cấu hình mẫu trong CSDL, sửa/xoá như mọi tab khác.

Bảng màu lấy theo palette tham chiếu của skill dataviz ([apps/web/src/viz.ts](apps/web/src/viz.ts)) và đã chạy validator trên đúng nền thẻ của cổng, cả sáng lẫn tối. Số liệu có hiệu ứng đếm lên, biểu đồ có hiệu ứng xuất hiện; cả hai tắt khi người dùng bật *giảm chuyển động*.

Kết nối qua Vala Desktop xong thì Tổng quan tự gọi "Lấy dữ liệu ngay", rồi làm mới mỗi 5 giây trong 1 phút.

**Hệ thống nguồn** (Vala Desktop → Quản trị → Hệ thống nguồn, chỉ quản trị — không còn trên cổng web): thêm hệ thống mới, không chỉ có eGov/eTask cố định. Khai mã, tên, địa chỉ, cách kết nối cho phép, cookie phiên (tên thay thế ngăn bằng `|`), cookie tuỳ chọn, tên miền cookie, trang kiểm tra phiên và mẫu regex nhận diện tài khoản; phần này lưu ở `core.source_systems.auth_profile`. Hệ thống mới tự hiện ở *Kết nối dữ liệu*, *Tài khoản nguồn* và trong Vala Desktop. Người dùng kết nối được ngay bằng Vala Desktop hoặc dán cookie; mật khẩu và SSO cần adapter YAML có cách tự đăng nhập. Muốn có **báo cáo** từ hệ thống mới: thêm spider ngay trên trang *Script crawl* (viết `main.py`, không cần sửa code) rồi tạo báo cáo. Với eGov/eTask (adapter YAML) chỉ sửa được tên, địa chỉ, bật/tắt và cách kết nối. Hệ thống không xoá được, chỉ tắt, vì dữ liệu và lịch sử chạy tham chiếu tới nó.

**Cấu hình nằm trong CSDL, không nằm trong code (cập nhật 28/09/2026).** Mỗi hệ thống, kể cả eGov và eTask, có một *cấu hình adapter* (YAML) trong `core.source_systems.adapter_yaml`. Quản trị sửa ở *Hệ thống nguồn → Cấu hình adapter*, có nút **Kiểm tra** trước khi **Lưu**. Cấu hình gồm:
- xác thực: cookie phiên, tên miền cookie, trang kiểm tra phiên, cách tự đăng nhập;
- `allowed_endpoints`: các endpoint được phép gọi;
- các capability và `output_schema`;
- **`sink`**: nơi lưu của từng capability — luôn là **kho chung `records`** (xem mục *Kho dữ liệu chung* bên dưới). `columns` chọn trường từ `output_schema`, `extra` là trường ngữ cảnh lúc crawl (vd thư mục), `extra_schema` khai kiểu + nhãn cho các trường đó.

Code không còn nhắc tới `egov`/`etask`. Hệ thống tạo nhanh (chỉ phiên đăng nhập) nâng lên cấu hình đầy đủ bằng cách dán adapter vào cùng hộp đó. Mọi lần lưu đều ghi `core.adapters` và audit `source_change`. Cổng áp dụng ngay; worker nạp lại mỗi phút.

**Kho dữ liệu chung (cập nhật 30/09/2026, migration 016–017).** Mọi hệ thống nguồn — kể cả eGov, eTask — lưu vào
**một bảng `records`**: `source_system` + `capability` cho biết dữ liệu của hệ thống nào, loại nào; `record_key` là khoá
(trường `key: true`); các trường nằm trong `data` (jsonb) theo `output_schema`; `owner_user_id`/`org_unit_id` cho RLS;
`valid_from`/`valid_to`/`content_hash` giữ lịch sử. Không còn bảng riêng theo nghiệp vụ (`documents`/`tasks` đã chuyển
sang `records` rồi xoá, 12 báo cáo đối chiếu trước/sau giống hệt) ⇒ thêm hệ thống mới, hay triển khai cho đơn vị khác,
**không đổi lược đồ CSDL**. Trường khai `index: true` (trong `output_schema` hoặc `sink.extra_schema`) được tạo chỉ mục
qua hàm CSDL `ensure_record_index` (tự dựng tên/biểu thức, kiểm định danh — cấu hình không chèn được SQL); ngày đọc qua
`rec_date()` để khớp chỉ mục. Mỗi đơn vị triển khai vẫn có schema riêng (`tenant_<mã>`).

**Thêm hệ thống mới từ đầu đến Tổng quan, không sửa code (cập nhật 28/09/2026):**
1. *Hệ thống nguồn → Thêm*: dán cấu hình adapter. Capability khai `sink: { table: records }`: trường theo `output_schema` (nhãn lấy từ `label`, `index: true` cho trường hay lọc/nhóm), có lịch sử SCD2 và RLS cá nhân/đơn vị.
2. Người dùng kết nối: Vala Desktop, cookie, hoặc mật khẩu nếu adapter có `password_login`.
3. *Lấy dữ liệu*: báo cáo không có spider thì **worker chạy thẳng các bước trong adapter**. Mỗi phút worker kiểm tra lịch đến hạn (`runDueSchedules`) và dời `next_run_at` ngay, nên lỗi không làm chạy lặp. Nút "Lấy dữ liệu ngay" cũng đi đường này. Spider Python chỉ còn cần cho trang phức tạp.
4. *Cấu hình báo cáo → Tạo báo cáo* (`/cau-hinh-bao-cao`), không viết SQL. Chọn:
   - hệ thống, tập dữ liệu, kiểu *Thống kê* (nhóm theo, phép tính, biểu đồ) hoặc *Danh sách* (cột);
   - trường ngày cho tham số khoảng thời gian, ô từ khoá, bộ lọc người xem tự chọn (lựa chọn lấy từ dữ liệu);
   - điều kiện cố định (kể cả so với hôm nay: trước/đúng/đến hôm nay, trong tháng này, trong N ngày tới/qua), thẻ KPI có ngưỡng cảnh báo, xu hướng theo tháng hoặc tỉ lệ %;
   - **Hiện trên Tổng quan**: ở tab nào, độ rộng khối, thứ tự.

   Có nút *Xem thử* trên dữ liệu quản trị được xem. Máy chủ dựng SQL từ danh mục trường cho phép, còn mọi giá trị đi qua tham số ([reports/defined.ts](apps/api/src/reports/defined.ts)). Báo cáo trên văn bản/công việc tự nối với spider có sẵn của hệ thống đó.
5. Mọi báo cáo đều là báo cáo cấu hình (không còn báo cáo viết trong code): sửa được toàn bộ, xoá được (kèm lịch chạy của nó) trong menu "…".

`scheduling.selector` (SQL trong YAML cũ) **không còn được dùng**: cấu hình sửa được trên cổng thì không được chứa câu lệnh chạy bằng quyền ghi. Người cần crawl do `FANOUT_SELECTOR` cố định trong `queue.ts` chọn.

Danh mục hệ thống nằm trong bộ nhớ API (`SourceRegistry`), được nạp lại sau mỗi lần sửa. Chạy nhiều tiến trình API thì phải nạp lại ở mọi tiến trình, hoặc khởi động lại.

## Tiện ích trình duyệt — đã ngừng (08/10/2026)

Tiện ích Chrome/Edge (`apps/extension`) đã gỡ: dùng hoàn toàn **Vala Desktop** — người dùng đăng nhập các hệ thống nguồn
trong app, app tự giữ và gửi phiên cho Vala (cách kết nối `extension` trong CSDL nay nghĩa là "qua Vala Desktop"). Máy chủ
không còn `/ext/login`, và từ chối token thiết bị loại `extension` còn sót. Cầu nối cổng ↔ app (`apps/web/src/extension.ts`)
giữ nguyên giao thức cũ nhưng chỉ Vala Desktop trả lời.

## Phiên uỷ quyền — cách hệ thống tự lấy phiên

Theo mục 07 của tài liệu kỹ thuật và mục 08 của phương án triển khai:

```
Uỷ quyền:  người dùng → Bkav SSO (đăng nhập, đồng ý offline_access) → cổng nhận code
           → đổi lấy refresh token (vault://…/users/{id}/sso)
           → đi theo chuỗi chuyển hướng eGov → SSO → eGov để lấy cookie phiên (vault://…/users/{id}/egov)

Tự làm mới: worker, mỗi 10 phút: phiên eGov sắp hết hạn → lấy lại từ SSO (refresh token xoay vòng)
            lúc crawl: phiên eGov hỏng → lấy lại từ SSO, probe lại một lần

Hết phiên:  SSO từ chối refresh token → grant = expired, xoá khỏi vault
            → giao diện hiện hộp "Cần đăng nhập lại", 5 giây sau tự chuyển sang trang đăng nhập Bkav SSO
Cổng:       phiên đăng nhập cổng hết hạn (401) → tự chuyển sang Bkav SSO, quay về đúng trang đang xem
```

Không bao giờ lưu mật khẩu. Access token SSO chỉ được gửi cho host SSO, không bao giờ gửi cho eGov. Chuỗi chuyển hướng chỉ được đi tới host eGov và host SSO. Người đăng nhập SSO lúc uỷ quyền phải chính là người dùng cổng; nhầm tài khoản thì từ chối.

Để nối Bkav SSO thật, chỉ cần đổi cấu hình, không phải đổi code:
- `SSO_*` trong `.env`: client do đội SSO cấp. Redirect URI cần đăng ký: `{PUBLIC_API_URL}/api/v1/sso/callback`.
- `auth.bootstrap` trong `adapters/egov.documents.yaml`: trang bắt đầu và thời hạn phiên. Kiểm chứng bằng DevTools, bắt chuỗi chuyển hướng khi mở eGov từ trạng thái chưa có cookie.

Thử trên máy dev:
- `curl -XPOST localhost:4010/_dev/drop-sessions`: eGov quên phiên, hệ thống phải tự lấy lại.
- `curl -XPOST 'localhost:4020/_dev/revoke?sub=dev-binh'`: SSO thu hồi, giao diện phải đưa người dùng đi đăng nhập lại.

## Quy ước giao diện

- Style bằng **Tailwind**. Không viết file CSS theo class tự đặt; component cơ sở nằm ở `packages/ui/src/ui.tsx` (dùng chung cổng web và trang Quản trị của Vala Desktop).
- Mọi màu phải có biến thể `dark:`. Chế độ tối dùng class `dark` trên `<html>`, do nút chuyển Sáng / Tối / Theo hệ thống điều khiển (`src/theme.ts`, lưu ở localStorage). Một script nhỏ trong `index.html` đặt class này trước khi React chạy, để trang không nháy sai màu lúc tải.
- Kiểm tra cả hai chế độ trước khi coi một màn hình là xong.
- Dùng Tailwind 3 vì Tailwind 4 cần Node 20. Khi nâng Node thì có thể chuyển lên v4.

## Trạng thái các giai đoạn

| Giai đoạn | Trạng thái |
| --- | --- |
| 0. Khung dự án, Docker Compose | Xong |
| 1. CSDL, RLS, ma trận phân quyền | Xong — 19 test |
| 2. Adapter runtime (chốt chặn endpoint, rate limit, lệch schema, content_hash) | Xong — 14 test |
| 3. Pipeline nạp per-user, SCD2, vault, fan-out | Xong — 10 test |
| 3b. Phiên: SSO uỷ quyền + tự đăng nhập bằng mật khẩu + dán cookie; tự làm mới, lấy lại phiên | Xong — 9+10 test core, đã chạy trên trình duyệt |
| 3c. Đăng nhập cổng bằng mật khẩu + màn hình quản trị cấu hình kết nối | Xong — trong 22 test API, đã chạy trên trình duyệt |
| 3d. Crawlab: spider Python + vala_sdk, đồng bộ lịch, người dùng tự cấp tài khoản, dashboard "Việc của tôi hôm nay" | Xong — 8 test core + 6 test API; đã chạy thật trên Crawlab, kể cả lịch tự kích hoạt |
| 4. API | Xong — 28 test. Riêng xuất PDF chưa làm |
| 5. Giao diện | Xong 6 màn hình, đã kiểm tra bằng trình duyệt. Chưa có test UI |
| 6. Triển khai thật | Chưa làm: Crawlab, SSO thật, MinIO, cảnh báo chủ động |

## Chỗ lệch so với tài liệu thiết kế

Những chỗ trong tài liệu gốc không chạy được hoặc có lỗ hổng, đã sửa trong code:

- `raw_records`: PostgreSQL không cho khoá chính thiếu cột phân vùng ⇒ đổi thành `PRIMARY KEY (id, fetched_at)`.
- Chỉ có phân vùng 10–11/2026 ⇒ mọi insert trước 01/10 lỗi. Đã thêm hàm `ensure_raw_partitions`, chạy hằng ngày.
- `GRANT SELECT ON ALL TABLES` cho phép `app_reader` đọc thẳng từng phân vùng, mà RLS của bảng cha không áp lên bảng con ⇒ đã thu hồi quyền này.
- Materialized view không chịu RLS ⇒ đã thu hồi quyền, chỉ đọc qua view `v_van_ban_theo_thang` (security_barrier) có cùng điều kiện lọc.
- `audit_log` và `crawl_runs` từng đọc được của mọi người ⇒ đã chặn.
- `BYPASSRLS` không được thừa kế qua membership ⇒ vai trò đăng nhập của worker tự mang thuộc tính này. Có test khẳng định pool reader không bypass được.
- "12/18 thành viên đã uỷ quyền": `app_reader` không đếm được grant của người khác ⇒ thêm hàm `org_coverage()`, chỉ trả số đếm.
- `run-now` trả `run_key` thay vì `crawl_run_id`, vì lúc gọi, dòng `crawl_runs` chưa được tạo.

## Việc còn mở — cần quyết định

1. **Thông số Bkav SSO thật.** Cơ chế đã code xong và chạy được với SSO giả lập. Còn cần đội SSO cung cấp: client id/secret, các endpoint, và xác nhận SSO có cấp refresh token (`offline_access`). Chuỗi chuyển hướng eGov ↔ SSO cũng cần bắt trên hệ thống thật để chỉnh `auth.bootstrap`.
   - Khoá chống refresh song song hiện nằm trong một tiến trình. Muốn chạy nhiều worker thì phải chuyển khoá này sang Redis.
2. **Văn bản nằm ở nhiều thư mục.** Khoá SCD2 là `(ma_van_ban, owner)`, và `node_id` không nằm trong `content_hash_fields`. Hệ quả: khi một văn bản chuyển thư mục, `node_id` giữ giá trị cũ; khi một văn bản nằm ở hai thư mục cùng lúc, chỉ một thư mục được ghi nhận. Cần xác minh trên eGov thật rồi mới chọn cách xử lý.
3. **Văn bản biến mất khỏi mọi thư mục** thì không bị đóng bản hiện hành, vì hiện chưa có bước "đánh dấu vắng mặt".
4. **Rate limit** đang tính theo từng phiên (30 req/phút × tối đa 5 người song song). Spec không nói rõ là theo phiên hay toàn cục.
5. **Phân trang eGov** chưa kiểm chứng. Khi gặp trang đầy, run ghi `pagination_unverified`.

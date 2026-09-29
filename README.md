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
# Cách 2 — chạy tay từng tiến trình:
pnpm dev:api        # Fastify :3000
pnpm dev:worker     # bảo trì: làm mới phiên, phân vùng, lớp tổng hợp
pnpm dev:web        # React :5173 — mở trình duyệt ở đây
```

Hệ thống nguồn (eGov/eTask…) **không seed trong code** — quản trị thêm và cấu hình adapter trên
giao diện *Hệ thống nguồn*. Tài khoản quản trị dev: `ops` / `Vala@2026`. Người dùng thật vào qua SSO.

Thử toàn luồng:
1. `ops` → *Hệ thống nguồn* → thêm hệ thống + dán adapter; → *Script crawl* → **Đồng bộ Crawlab**.
2. Người dùng → *Tài khoản nguồn* → kết nối bằng **tiện ích trình duyệt** (đăng nhập nguồn trên trình duyệt, tiện ích tự gửi phiên) hoặc mật khẩu (nếu adapter có tự-đăng-nhập).
3. *Cấu hình báo cáo* tạo báo cáo → *Lịch chạy* → **Chạy ngay** → dashboard có số liệu.

```bash
pnpm typecheck      # kiểm tra kiểu toàn workspace
pnpm test           # bộ test cũ (phụ thuộc eGov/eTask giả lập) đã gỡ; sẽ dựng bộ test mới không phụ thuộc nguồn
```

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `db/migrations/` | `001` = lược đồ gốc (sửa 2 chỗ để chạy được), `002`–`004` = bản vá, `003` = danh mục báo cáo, `005` = đăng nhập mật khẩu + kết nối, `006` = spider Crawlab, `007` = tiện ích trình duyệt, `008` = quản trị thêm hệ thống nguồn, `009` = cấu hình adapter nằm trong CSDL, `010` = bảng dữ liệu chung + báo cáo cấu hình, `011` = tham số lọc lấy từ dữ liệu |
| `adapters/` | **Mẫu khởi tạo** adapter (hiện để trống). Nếu có file `*.yaml`, lần chạy đầu chép vào CSDL cho hệ thống chưa có `adapter_yaml`; hiện egov/etask cấu hình hoàn toàn trên giao diện |
| `packages/core` | CSDL (2 pool), phân quyền, adapter runtime, pipeline nạp, vault, hàng đợi fan-out |
| `apps/api` | Fastify, theo `openapi.yaml` |
| `apps/worker` | Bảo trì: làm mới phiên sắp hết hạn, phân vùng lớp thô, lớp tổng hợp. (Hàng đợi crawl nội bộ giữ lại làm dự phòng khi không có Crawlab) |
| `crawlers/` | **Script crawl Python** chạy trên Crawlab: `_sdk/vala_sdk.py` (thư viện chung) + mỗi spider một thư mục `<mã>/main.py` |
| `apps/web` | React + Tailwind 3, 6 màn hình, chuyển sáng/tối/theo hệ thống |
| `apps/extension` | **Tiện ích Chrome/Edge** (Manifest V3, React + Tailwind): tự gửi phiên eGov/eTask… về cổng khi người dùng đăng nhập |

## Crawlab và script crawl (cập nhật 26/09/2026)

```
Quản trị    crawlers/<mã>/main.py (Python + vala_sdk) ──"Đồng bộ Crawlab"──▶ spider + lịch cố định (spider × preset)
Người dùng  "Tài khoản nguồn": tự cấp cookie/phiên hoặc tài khoản/mật khẩu (lưu trong vault)
Người dùng  đặt lịch cho báo cáo (chọn preset, không nhập cron)
Crawlab     đến giờ: python main.py --preset P
  vala_sdk  → POST /internal/spider/runs            "ai đã đặt preset P, có kết nối còn hiệu lực?"
            → POST /internal/spider/runs/:id/session cookie của người đó (backend tự đăng nhập lại khi cần)
            → spider gọi hệ thống nguồn
            → POST /internal/spider/runs/:id/records bản ghi THÔ → lớp thô → chuẩn hoá theo adapters/*.yaml → lịch sử
            → POST /internal/spider/runs/:id/finish
Cổng        dashboard có sẵn đọc từ kho, vd "Việc của tôi hôm nay"
```

- **Script Python không bao giờ nhận mật khẩu**, chỉ nhận cookie đúng lúc dùng. Tự đăng nhập bằng mật khẩu nằm ở backend.
- **Dữ liệu không lưu vào MongoDB của Crawlab**; Crawlab chỉ giữ script, lịch và log.
- Lịch Crawlab là **cố định** (mỗi spider × preset một lịch). Người dùng đổi lịch không gọi Crawlab.
- "Chạy ngay" của người dùng và "Chạy thử" của quản trị chạy spider trên Crawlab với `--user N`.
- Lỗi của một người không làm hỏng cả lượt; spider báo lỗi Crawlab khi quá 50% người dùng lỗi.

**Viết spider mới cho một trang:**
1. `adapters/<nguồn>.yaml`: cách đăng nhập (`auth.password_login`), cookie phiên (`cookies_required`), ánh xạ trường (`output_schema`), trường để phát hiện lệch schema.
2. `crawlers/<mã>/main.py`: chỉ lo "gọi trang nào, lấy gì" bằng `run.get()/run.post()` rồi `run.save(capability, items)`. SDK tự lấy phiên mới khi bị chuyển hướng/401.
3. Thêm dòng vào `core.crawl_spiders`, bảng đích vào `SINKS` (`packages/core/src/ingest/crawl.ts`), báo cáo vào `report_catalog` + `apps/api/src/reports/`.
4. *Script crawl* → **Đồng bộ Crawlab** → **Chạy thử** cho một người.

Sửa script trực tiếp trên Crawlab được, nhưng lần đồng bộ sau sẽ ghi đè bằng bản trong repo — chép về repo trước.

## Đăng nhập và kết nối dữ liệu (cập nhật 25/09/2026)

**Đăng nhập cổng bằng tài khoản/mật khẩu** (form chuẩn). Mật khẩu cổng băm scrypt trong `app_users.password_hash`; vai trò đọc báo cáo không đọc được cột này. Dev: tài khoản = phần trước @ của email (vd `binhlt`, `ops`), mật khẩu `Vala@2026`. Bật thêm đăng nhập Bkav SSO bằng `LOGIN_SSO=true`.

**Kết nối crawl do quản trị cấu hình** (màn hình *Kết nối dữ liệu*, chỉ `is_ops_admin`). Mỗi kết nối = (người dùng) × (hệ thống nguồn) × cách xác thực (`source_grants.auth_method`):

| Cách | Quản trị nhập | Tự làm mới? |
| --- | --- | --- |
| `password` | Tài khoản + mật khẩu hệ thống nguồn | Có — hệ thống tự đăng nhập lại |
| `cookie` | Chuỗi cookie copy từ trình duyệt | Không — hết hạn phải dán lại |
| `sso` | (người dùng tự uỷ quyền qua Bkav SSO) | Có — refresh token |
| `extension` | (không nhập gì — tiện ích trình duyệt tự gửi) | Tiện ích gửi lại mỗi khi người dùng đăng nhập nguồn |

Bí mật (mật khẩu/cookie nguồn) **chỉ nằm trong vault**, không trả qua API, không ghi log. Sai mật khẩu hoặc tài khoản bật OTP ⇒ dừng, không thử lại (tránh khoá tài khoản nguồn). eGov thật đăng nhập qua `iam.bkav.com` (WSO2); cách đăng nhập khai báo ở `adapters/egov.documents.yaml` mục `auth.password_login`.

Thử trên dev:
- Quản trị (`ops`) → *Kết nối dữ liệu* → *Cấu hình* cho một người dùng → chọn "Tài khoản/mật khẩu", nhập tên nguồn (vd `binhlt`) + `Egov@2026` → Lưu (hệ thống thử đăng nhập iam giả lập ngay).
- Đăng nhập lại bằng tài khoản người đó → đặt lịch, xem báo cáo.

## Tổng quan và hệ thống nguồn (cập nhật 28/09/2026)

**Tổng quan** (`/tong-quan`, trang mặc định) liệt kê mọi báo cáo người dùng được xem, mỗi báo cáo một ô, dữ liệu lấy từ `GET /api/v1/dashboard`. Mỗi ô chạy báo cáo qua đúng `runReport`, tức là có RLS và audit. Ô tự đổi theo tình trạng:

| Tình trạng | Ô hiện |
| --- | --- |
| `ok` | thẻ số liệu / biểu đồ đầu tiên / 5 dòng đầu, kèm "Cập nhật ngay" |
| `can_ket_noi` | nút **Kết nối <nguồn>**: có tiện ích thì kết nối qua tiện ích, không thì mở *Tài khoản nguồn* (`?ket-noi=<nguồn>`) |
| `het_han` | nút **Kết nối lại** |
| `chua_co_du_lieu` | nút **Lấy dữ liệu ngay** (`POST /me/sources/:nguồn/run-now`, một lần / 5 phút) |

Phần đầu Tổng quan (`GET /api/v1/dashboard/overview`, chỉ dữ liệu của chính người xem, có RLS và audit) vẽ bằng **ECharts**, chỉ nạp các thành phần cần dùng và tách thành chunk riêng:
- Văn bản: thẻ KPI (nhận tháng này kèm chênh lệch so với tháng trước và sparkline 12 tháng, tổng, chờ xử lý, đang theo dõi), đường có vùng tô theo tháng, cột ngang theo thư mục, lịch nhiệt 26 tuần.
- Công việc: thẻ quá hạn, đến hạn 7 ngày, đang làm, thanh tiến độ tỷ lệ hoàn thành, vành khuyên theo trạng thái, cột đến hạn 14 ngày tới.

Bảng màu lấy theo palette tham chiếu của skill dataviz ([apps/web/src/viz.ts](apps/web/src/viz.ts)) và đã chạy validator trên đúng nền thẻ của cổng, cả sáng lẫn tối. Số liệu có hiệu ứng đếm lên, biểu đồ có hiệu ứng xuất hiện; cả hai tắt khi người dùng bật *giảm chuyển động*.

Kết nối qua tiện ích xong thì Tổng quan tự gọi "Lấy dữ liệu ngay", rồi làm mới mỗi 5 giây trong 1 phút.

**Hệ thống nguồn** (`/he-thong-nguon`, chỉ quản trị): thêm hệ thống mới ngay trên cổng, không chỉ có eGov/eTask cố định. Khai mã, tên, địa chỉ, cách kết nối cho phép, cookie phiên (tên thay thế ngăn bằng `|`), cookie tuỳ chọn, tên miền cookie, trang kiểm tra phiên và mẫu regex nhận diện tài khoản; phần này lưu ở `core.source_systems.auth_profile`. Hệ thống mới tự hiện ở *Kết nối dữ liệu*, *Tài khoản nguồn* và trong tiện ích. Người dùng kết nối được ngay bằng tiện ích hoặc dán cookie; mật khẩu và SSO cần adapter YAML có cách tự đăng nhập. Muốn có **báo cáo** từ hệ thống mới thì vẫn cần thêm spider (`crawlers/<mã>/`) và báo cáo. Với eGov/eTask (adapter YAML) chỉ sửa được tên, địa chỉ, bật/tắt và cách kết nối. Hệ thống không xoá được, chỉ tắt, vì dữ liệu và lịch sử chạy tham chiếu tới nó.

**Cấu hình nằm trong CSDL, không nằm trong code (cập nhật 28/09/2026).** Mỗi hệ thống, kể cả eGov và eTask, có một *cấu hình adapter* (YAML) trong `core.source_systems.adapter_yaml`. Quản trị sửa ở *Hệ thống nguồn → Cấu hình adapter*, có nút **Kiểm tra** trước khi **Lưu**. Cấu hình gồm:
- xác thực: cookie phiên, tên miền cookie, trang kiểm tra phiên, cách tự đăng nhập;
- `allowed_endpoints`: các endpoint được phép gọi;
- các capability và `output_schema`;
- **`sink`**: bảng đích của từng capability (`documents` / `tasks`, cột nào). Trước đây phần này viết cứng trong `crawl.ts`. Tên bảng và cột chỉ được chọn trong `SINK_TABLES`, nên cấu hình không thể chèn SQL;
- **`dashboard.folder_kpis`**: thẻ theo thư mục trên Tổng quan.

Tổng quan tự sinh một phần *Văn bản* / *Công việc* cho **mọi** hệ thống có capability ghi vào bảng tương ứng. Code không còn nhắc tới `egov`/`etask`. Hệ thống tạo nhanh (chỉ phiên đăng nhập) nâng lên cấu hình đầy đủ bằng cách dán adapter vào cùng hộp đó. Mọi lần lưu đều ghi `core.adapters` và audit `source_change`. Cổng áp dụng ngay; worker nạp lại mỗi phút.

**Thêm hệ thống mới từ đầu đến Tổng quan, không sửa code (cập nhật 28/09/2026):**
1. *Hệ thống nguồn → Thêm*: dán cấu hình adapter. Capability ghi vào `sink: { table: records }` là **bảng dữ liệu chung** (`records`): trường theo `output_schema`, nhãn lấy từ `label`, có lịch sử SCD2 và RLS cá nhân/đơn vị như văn bản. Muốn đưa vào bảng văn bản/công việc thì dùng `documents` / `tasks`.
2. Người dùng kết nối: tiện ích, cookie, hoặc mật khẩu nếu adapter có `password_login`.
3. *Lấy dữ liệu*: báo cáo không có spider thì **worker chạy thẳng các bước trong adapter**. Mỗi phút worker kiểm tra lịch đến hạn (`enqueueDueSubscriptions`) và dời `next_run_at` ngay, nên lỗi không làm chạy lặp. Nút "Lấy dữ liệu ngay" cũng đi đường này. Spider Python chỉ còn cần cho trang phức tạp.
4. *Cấu hình báo cáo → Tạo báo cáo* (`/cau-hinh-bao-cao`), không viết SQL. Chọn:
   - hệ thống, tập dữ liệu, kiểu *Thống kê* (nhóm theo, phép tính, biểu đồ) hoặc *Danh sách* (cột);
   - trường ngày cho tham số khoảng thời gian, ô từ khoá, bộ lọc người xem tự chọn (lựa chọn lấy từ dữ liệu);
   - điều kiện cố định, thẻ KPI có ngưỡng cảnh báo;
   - **Hiện trên Tổng quan** và thứ tự.

   Có nút *Xem thử* trên dữ liệu quản trị được xem. Máy chủ dựng SQL từ danh mục trường cho phép, còn mọi giá trị đi qua tham số ([reports/defined.ts](apps/api/src/reports/defined.ts)). Báo cáo trên văn bản/công việc tự nối với spider có sẵn của hệ thống đó.
5. Báo cáo có sẵn (viết trong code) vẫn chạy như cũ. Trên trang *Cấu hình báo cáo* chỉ sửa được tên, mô tả, bật/tắt, hiện trên Tổng quan và thứ tự.

`scheduling.selector` (SQL trong YAML cũ) **không còn được dùng**: cấu hình sửa được trên cổng thì không được chứa câu lệnh chạy bằng quyền ghi. Người cần crawl do `FANOUT_SELECTOR` cố định trong `queue.ts` chọn.

Còn là giả định trong code: các mã trạng thái việc (`HoanThanh`, `DangThucHien`, `ChuaBatDau`) mà báo cáo và Tổng quan dùng. Muốn đổi thì chuẩn hoá chúng trong `output_schema`.

Danh mục hệ thống nằm trong bộ nhớ API (`SourceRegistry`), được nạp lại sau mỗi lần sửa. Chạy nhiều tiến trình API thì phải nạp lại ở mọi tiến trình, hoặc khởi động lại.

## Tiện ích trình duyệt — không phải dán cookie (cập nhật 28/09/2026)

Trang Vala không đọc được cookie của `egov.bkav.com` (trình duyệt chặn khác tên miền, cookie phiên lại HttpOnly), nên việc "người dùng đăng nhập eGov rồi Vala tự lấy phiên" đi qua tiện ích `apps/extension`. Cách này dùng được cho **mọi hệ thống nguồn**, kể cả hệ thống ngoài Bkav SSO, có captcha hoặc OTP, vì người dùng tự đăng nhập.

```
Người dùng đăng nhập eGov như mọi ngày
  → tiện ích thấy cookie phiên đổi (chrome.cookies.onChanged, debounce 3 giây; thêm một lượt định kỳ 15 phút)
  → đọc ĐÚNG cookies_required của adapter (vd egov_sid, bkavAuthen, BkavSSOv2) — không đọc cookie khác
  → PUT /api/v1/ext/sources/egov/session
  → API probe phiên (session_probe) → lưu vault → source_grants.auth_method = 'extension'
Crawl/spider dùng phiên đó như mọi cách khác. Phiên hết hạn ⇒ kết nối "hết hạn", lần sau người dùng
đăng nhập eGov thì tiện ích tự gửi phiên mới.
```

Kết nối từ cổng: trên *Tài khoản nguồn*, bấm **Đăng nhập qua tiện ích**. Nếu trình duyệt đã có phiên, tiện ích gửi ngay. Nếu chưa, tiện ích mở trang đăng nhập nguồn; người dùng đăng nhập xong thì tiện ích gửi phiên, hiện thông báo, đóng tab đăng nhập, đưa người dùng quay về cổng và cổng hiện hộp "Đã kết nối". Cổng và tiện ích nói chuyện với nhau qua `bridge.js` bằng `window.postMessage`, chỉ trên đúng origin máy chủ Vala. Kênh này chỉ truyền trạng thái, không có token hay cookie.

Cookie phiên đặt ở tên miền cha (eGov thật dùng `Domain=.bkav.com`) ⇒ adapter khai `auth.cookie_domain`, tiện ích xin thêm quyền `*.bkav.com`. Nếu thiếu quyền này, Chrome không trả các cookie đó cho tiện ích. Nút **Chẩn đoán cookie** trong trang cài đặt liệt kê tên, tên miền, path và cờ của từng cookie, không có giá trị, để đối chiếu với `cookies_required`.

An toàn:
- Tiện ích **không được cấp sẵn quyền cho tên miền nào**. Mỗi hệ thống nguồn, và cả máy chủ Vala, đều phải được người dùng bấm "Cho phép" trong hộp thoại của Chrome, hộp thoại ghi rõ tên miền. Chỉ bản dev mới cấp sẵn `localhost`.
- Token tiện ích (`vxt_…`) khác với token cổng. Nó chỉ gọi được `/api/v1/ext/*` và chỉ gửi được phiên của chính người đó, không đọc được báo cáo. Máy chủ chỉ lưu SHA-256 của token, hạn 180 ngày; người dùng ngắt được ở *Tài khoản nguồn → Tiện ích trình duyệt*.
- Tiện ích không lưu giá trị cookie, chỉ lưu hash để biết phiên đã gửi hay chưa. Nó chỉ gửi tới máy chủ Vala đã cấu hình, và bắt buộc https (trừ localhost).
- Kết nối mật khẩu/SSO còn tốt thì tiện ích **không ghi đè**, vì hệ thống đã tự lấy được phiên.
- Phiên gửi lên thuộc một tài khoản nguồn đã gắn với người dùng khác ⇒ từ chối (403).

Cài trên máy dev:
```bash
pnpm --filter @vala/extension build:dev     # ra apps/extension/dist-dev (cấp sẵn localhost)
# Chrome → chrome://extensions → bật "Developer mode" → "Load unpacked" → chọn apps/extension/dist-dev
# Bấm biểu tượng Vala → Đăng nhập (máy chủ http://localhost:5173, vd dieptx / Vala@2026)
# Mở http://localhost:4010 (eGov giả lập), đăng nhập dieptx / Egov@2026 → vài giây sau cổng hiện "Tiện ích trình duyệt · Đang hoạt động"
```
Bản phát hành: `VITE_VALA_URL=https://<cổng> pnpm --filter @vala/extension build` ra `apps/extension/dist`. Phát hành nội bộ qua Chrome Web Store (chế độ riêng tư) hoặc cài bắt buộc bằng Group Policy (`ExtensionInstallForcelist`).

Chưa kiểm chứng trên eGov thật: eGov có gắn phiên với IP hoặc trình duyệt hay không. Nếu có, cookie gửi lên máy chủ sẽ không dùng được, và probe sẽ báo "hết hạn" ngay khi gửi.

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

- Style bằng **Tailwind**. Không viết file CSS theo class tự đặt; component cơ sở nằm ở `apps/web/src/components/ui.tsx`.
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

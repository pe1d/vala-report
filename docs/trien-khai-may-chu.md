# Triển khai Vala Reporting lên máy chủ

> Máy chủ 10.2.65.146 đã có k3s ⇒ dùng [trien-khai-k3s.md](trien-khai-k3s.md). Tài liệu này dành cho máy chưa có k3s.

Hướng dẫn đưa hệ thống lên một máy chủ Linux bằng Docker Compose. Tất cả chạy trong container;
dữ liệu nằm trong volume Docker nên cập nhật code không làm mất dữ liệu.

```
Người dùng / tiện ích ──HTTP(S)──▶ máy chủ :80 / :443
                                    └─ web (nginx): giao diện + chuyển /api → api
                                         ├─ api, worker            (image vala-report-node)
                                         ├─ postgres, redis, vault (lưu bền, tự mở khoá)
                                         └─ crawlab + mongo        (chạy spider; giao diện chỉ ở 127.0.0.1:8080)
```

Chỉ cổng 80/443 mở ra ngoài. CSDL, Redis, Vault chỉ nằm trong mạng Docker; Crawlab chỉ nghe ở `127.0.0.1`.

## 1. Chuẩn bị máy chủ

- Linux 64-bit, tối thiểu 4 CPU / 8 GB RAM / 40 GB đĩa.
- Docker Engine 24+ và Docker Compose v2 (`docker compose version`).
- `git`, `curl`, `openssl`.
- Máy chủ phải tải được image Docker và thư viện npm. Nếu mạng phải qua proxy công ty, khai proxy cho Docker giống máy
  dev: file `~/.docker/config.json`, mục `"proxies"`, và proxy cho dockerd.
- Máy chủ phải gọi được hệ thống nguồn (eGov, eTask). Spider dùng proxy nếu đặt `SOURCE_HTTP_PROXY` trong `.env.prod`.
- Tường lửa: mở cổng 80 (và 443 nếu dùng HTTPS) cho người dùng.

## 2. Cài lần đầu

```bash
sudo mkdir -p /opt/vala-reporting && sudo chown $USER /opt/vala-reporting
git clone ssh://git@gitmxh.bkav.com:7999/vala-report/vala-reporting.git /opt/vala-reporting
cd /opt/vala-reporting

deploy/gen-env.sh http://10.2.65.146        # tạo .env.prod với mật khẩu/khoá ngẫu nhiên (chmod 600)
nano .env.prod                              # xem lại: SOURCE_HTTP_PROXY, CRAWLAB_*, LOGIN_SSO…
deploy/deploy.sh                            # build, bật CSDL/Vault/Crawlab, migration, bật api/worker/web
```

Chạy xong, `deploy/deploy.sh` in trạng thái các dịch vụ và địa chỉ cổng.

Sau đó chọn **một** trong hai cách dưới.

### 2a. Cài mới: tạo tài khoản quản trị

```bash
deploy/create-admin.sh admin "Quản trị hệ thống" admin@bkav.com
```

Script in ra mật khẩu tạm một lần; lần đăng nhập đầu phải đổi mật khẩu. Sau đó cấu hình hệ thống nguồn, spider, báo cáo
và người dùng trên cổng.

### 2b. Chuyển dữ liệu từ máy đang chạy

Dữ liệu chuyển sang gồm: cấu hình hệ thống nguồn, adapter, spider, báo cáo, tab Tổng quan, người dùng, lịch chạy và dữ liệu
đã lấy về.

```bash
# Trên máy cũ (máy dev):
deploy/export-dev-data.sh
scp deploy/backup/vala-dev-<ngày>.dump <user>@10.2.65.146:/opt/vala-reporting/deploy/backup/

# Trên máy chủ (sau deploy/deploy.sh):
deploy/import-data.sh deploy/backup/vala-dev-<ngày>.dump     # gõ "dong y" để xác nhận ghi đè
```

Sau khi nạp:

- Worker tự đồng bộ spider lên Crawlab của máy chủ; xem ô "Crawlab" trên trang **Vận hành**.
- Phiên và mật khẩu nguồn **không** chuyển theo (Vault không xuất ra ngoài). Hệ quả:
  - mọi kết nối hiện "Cần gửi lại phiên": người dùng mở eGov/eTask trên trình duyệt, tiện ích tự gửi lại;
  - kết nối bằng mật khẩu: quản trị nhập lại ở **Kết nối dữ liệu**.
- Người dùng đăng nhập cổng bằng mật khẩu cũ.

## 3. Tiện ích trình duyệt

Trên mỗi máy người dùng: mở tiện ích Vala → **Tùy chọn** → đổi địa chỉ máy chủ thành `http://10.2.65.146` (hoặc tên miền
HTTPS), rồi đăng nhập lại tiện ích. Token tiện ích cũ không dùng được với máy chủ mới.

## 4. HTTPS (khuyến nghị)

Tiện ích gửi cookie phiên của người dùng về máy chủ, nên nên dùng HTTPS:

1. Có tên miền (ví dụ `vala.bkav.com`) trỏ về máy chủ, và chứng chỉ của công ty.
2. Chép `fullchain.pem` và `privkey.pem` vào `deploy/certs/`.
3. Sửa `.env.prod`: `PUBLIC_WEB_URL=https://vala.bkav.com`, `PUBLIC_API_URL=https://vala.bkav.com`.
4. Chạy `deploy/deploy.sh`.

nginx tự bật cổng 443 khi thấy chứng chỉ, và chuyển HTTP sang HTTPS.

## 5. Cập nhật phiên bản mới

```bash
cd /opt/vala-reporting && git pull && deploy/deploy.sh
```

Migration CSDL chạy tự động. Mã spider mới (SDK, `main.py`) được worker tự đẩy lên Crawlab. Nếu có bản tiện ích mới, gửi
file zip cho người dùng cài đè như trước.

### Phát hành bản Vala Desktop mới

Giống [trien-khai-k3s.md](trien-khai-k3s.md#4b-phát-hành-bản-vala-desktop-mới-tự-cập-nhật), chỉ khác thư mục: chép vào
`deploy/desktop/` trong thư mục cài (docker-compose.prod.yml gắn nó vào web ở `/desktop/`) — file cài trước, `latest.yml`
sau cùng. Lần đầu sau khi thêm thư mục này cần chạy lại `deploy/deploy.sh` để web nhận ổ gắn mới.

## 6. Sao lưu

```bash
deploy/backup.sh      # CSDL + dữ liệu Vault + khoá mở Vault → deploy/backup/<thời điểm>/, giữ 14 bản
```

Nên đặt cron hằng đêm (mẫu có trong đầu file `deploy/backup.sh`) và chép bản sao lưu sang máy khác.

`vault-keys.tgz` chứa khoá mở Vault: ai có nó cùng `vault-file.tgz` là đọc được mật khẩu nguồn. Cất riêng và hạn chế
quyền truy cập.

Khôi phục CSDL từ một bản sao lưu (nạp vào CSDL trống, không ghi đè lên bảng có sẵn):

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C stop api worker
$C exec -T postgres dropdb -U vala_owner --if-exists --force vala
$C exec -T postgres createdb -U vala_owner vala
$C exec -T postgres pg_restore -U vala_owner -d vala --no-owner --role=vala_owner --exit-on-error < deploy/backup/<thời điểm>/vala.dump
$C run --rm tools scripts/migrate.ts
$C up -d api worker
```

Khôi phục Vault (phiên và mật khẩu nguồn): giải nén `vault-file.tgz` và `vault-keys.tgz` vào hai volume `vala-report_vault-file`
và `vala-report_vault-keys` khi container vault đang tắt, rồi bật lại.

## 7. Vận hành hằng ngày

| Việc | Lệnh / nơi xem |
|---|---|
| Tình trạng dịch vụ | trang **Vận hành** (Worker, Crawlab, Lịch trễ…) hoặc `docker compose -f docker-compose.prod.yml --env-file .env.prod ps` |
| Xem log | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f --tail 100 api worker` |
| Giao diện Crawlab | `ssh -L 8080:127.0.0.1:8080 <user>@10.2.65.146` rồi mở `http://localhost:8080` |
| Đặt lại mật khẩu quản trị | `deploy/create-admin.sh <tên đăng nhập>` |

Máy chủ khởi động lại thì mọi container tự lên lại (`restart: unless-stopped`) và Vault tự mở khoá; không cần làm gì.

## 8. Việc nên làm sau khi cài

- **Đổi mật khẩu quản trị Crawlab** (mặc định `admin`/`admin`): vào giao diện Crawlab, đổi mật khẩu, rồi sửa
  `CRAWLAB_PASSWORD` trong `.env.prod` và chạy `deploy/deploy.sh`.
- Giữ `.env.prod` bí mật (đã `chmod 600`, không commit). Mất file này thì không mở được Vault bằng token cũ và phải đặt lại
  mật khẩu CSDL.
- Đăng nhập Bkav SSO: chỉ bật (`LOGIN_SSO=true`, `SSO_*`) khi đã đăng ký client với iam.bkav.com, và redirect URI trỏ về
  `PUBLIC_WEB_URL`.

# Triển khai Vala Reporting lên k3s (máy chủ 10.2.65.146)

Địa chỉ: **https://vala-report.demozone.vn:5443**. Mọi thứ chạy trong namespace riêng `vala-report` của k3s đang có sẵn
trên máy chủ. Không cần cài Docker, không cần registry, không sửa cấu hình k3s và không đụng namespace khác.
(Cách chạy bằng Docker Compose trên máy chưa có k3s: xem [trien-khai-may-chu.md](trien-khai-may-chu.md).)

```
Người dùng / tiện ích ──HTTPS──▶ 10.2.65.146:5443 (hostPort của pod web)
                                   └─ web (nginx, chứng chỉ trong Secret vala-tls) ── /api → api
namespace vala-report:  api, worker (image vala-report-node) · postgres, redis, vault · crawlab + mongo
                        ổ đĩa: local-path (/var/lib/rancher/k3s/storage), đặt Retain — xoá PVC không mất dữ liệu
```

- Chỉ mở cổng 5443. CSDL, Redis, Vault, Crawlab chỉ có ClusterIP; NetworkPolicy chặn truy cập từ namespace khác.
- Tài nguyên có trần: ResourceQuota của namespace (xin tối đa 6 CPU / 6 GiB, giới hạn 16 CPU / 12 GiB, kể cả Job build).
  Khi chạy thực tế xin khoảng 1 CPU và 2 GiB.
- Image build ngay trên máy chủ bằng BuildKit trong một Job (pod privileged, chỉ tồn tại lúc build), rồi nạp vào containerd
  của k3s.

## Tạm chạy dưới đường dẫn con của tên miền đang có (Istio)

Chưa có DNS/chứng chỉ riêng cho `vala-report.demozone.vn` thì chạy sau **Istio ingress gateway có sẵn** của cluster, ở một
đường dẫn con của tên miền đã trỏ về máy chủ, vd **https://qtttboard-demo.demozone.vn:5443/vala-report/**:

```
Người dùng ──HTTPS──▶ 113.190.241.235:5443 ─NAT─▶ istio-ingressgateway (chứng chỉ *.demozone.vn)
   VirtualService cds-nb/superset:  /vala-report/* ──(bỏ tiền tố)──▶ Service web.vala-report:80   · còn lại → superset
```

Khác cách mặc định: không giữ cổng 5443 trên máy chủ, không cần `deploy/certs`. Trong `.env.prod`:

```bash
PUBLIC_WEB_URL=https://qtttboard-demo.demozone.vn:5443/vala-report
PUBLIC_API_URL=https://qtttboard-demo.demozone.vn:5443/vala-report
WEB_EXPOSE=istio
```

Rồi `deploy/k8s/deploy.sh` như bình thường (web tự build cho đường dẫn `/vala-report`, image tên
`…:<commit>-vala-report`), và gắn đường dẫn vào VirtualService **một lần** (thử trước bằng `DRY_RUN=1`):

```bash
DRY_RUN=1 deploy/k8s/istio-route.sh cds-nb/superset /vala-report   # xem trước, không sửa gì
deploy/k8s/istio-route.sh cds-nb/superset /vala-report             # thêm (lưu bản cũ vào /var/tmp)
deploy/k8s/istio-route.sh cds-nb/superset /vala-report --remove    # gỡ ra khi có tên miền riêng
```

Tiện ích trình duyệt hiện chỉ lưu *origin* máy chủ (bỏ đường dẫn) nên chưa kết nối được bản chạy ở đường dẫn con — dùng
tên miền riêng khi cần tiện ích.

## 0. Việc cần có trước

| Việc | Ai làm |
|---|---|
| Chủ cluster đồng ý cho chạy namespace `vala-report` (có Job build privileged, hostPort 5443) | quản trị máy chủ |
| DNS `vala-report.demozone.vn` → `10.2.65.146` | quản trị mạng |
| Chứng chỉ HTTPS cho `vala-report.demozone.vn` (hoặc `*.demozone.vn`): `fullchain.pem` + `privkey.pem` | quản trị mạng |
| Cổng 5443 trên máy chủ còn trống, tường lửa mở 5443 cho người dùng | kiểm tra: `sudo ss -ltnp \| grep :5443` |
| Ổ đĩa: kubelet trục xuất pod khi ổ còn trống dưới khoảng 10–15% | kiểm tra: `df -h /var/lib/rancher` |
| Máy chủ lấy được mã nguồn (git) | xem bước 1 |

## 1. Lấy mã nguồn về máy chủ

Máy chủ không phân giải được `gitmxh.bkav.com`, nên phải khai IP trước, rồi tạo khoá SSH chỉ đọc cho repo:

```bash
echo "10.2.54.60 gitmxh.bkav.com" | sudo tee -a /etc/hosts
ssh-keygen -t ed25519 -N "" -f ~/.ssh/vala_deploy -C "vala-report@10.2.65.146"
cat ~/.ssh/vala_deploy.pub      # dán vào Bitbucket: repo → Repository settings → Access keys (Read)
printf 'Host gitmxh.bkav.com\n  IdentityFile ~/.ssh/vala_deploy\n' >> ~/.ssh/config

sudo mkdir -p /opt/vala-report && sudo chown $USER /opt/vala-report
git clone ssh://git@gitmxh.bkav.com:7999/vala-report/vala-reporting.git /opt/vala-report
cd /opt/vala-report
```

## 2. Cấu hình

```bash
deploy/gen-env.sh https://vala-report.demozone.vn:5443     # tạo .env.prod (mật khẩu/khoá ngẫu nhiên, chmod 600)
nano .env.prod                                             # xem lại SOURCE_HTTP_PROXY (máy chủ gọi thẳng eGov/eTask ⇒ để trống)
cp <nơi để chứng chỉ>/fullchain.pem <nơi để chứng chỉ>/privkey.pem deploy/certs/
```

Chưa có chứng chỉ thì `deploy.sh` hỏi có tạo chứng chỉ tự ký tạm không. Dùng chứng chỉ tự ký thì trình duyệt cảnh báo và
tiện ích có thể không gọi được máy chủ, nên chỉ dùng để thử.

## 3. Triển khai

```bash
deploy/k8s/deploy.sh
```

Các bước script chạy:

1. Tạo namespace, quota, NetworkPolicy, Secret `vala-env` (từ `.env.prod`), `vala-tls` (chứng chỉ), ConfigMap Vault.
2. Build image nếu chưa có image của commit hiện tại. Lần đầu mất 5–15 phút.
3. Bật postgres, redis, vault, crawlab. Đặt ổ đĩa sang Retain.
4. Chạy migration CSDL. Lỗi thì dừng và không bật bản mới.
5. Bật api, worker, web. Kiểm tra `https://127.0.0.1:5443/healthz`.

Script dùng `kubectl`. Nếu user hiện tại không có kubeconfig, script tự dùng `sudo k3s kubectl`, còn image thì nạp bằng
`sudo k3s ctr`.

Sau đó chọn **một** trong hai cách:

- **Cài mới:** `deploy/k8s/create-admin.sh admin "Quản trị hệ thống" admin@ten-don-vi.gov.vn`. Script in mật khẩu tạm một
  lần; lần đầu đăng nhập phải đổi.
- **Chuyển dữ liệu từ máy dev:** trên máy dev chạy `deploy/export-dev-data.sh`, chép file `.dump` sang máy chủ, rồi chạy
  `deploy/k8s/import-data.sh deploy/backup/vala-dev-<ngày>.dump`. Hệ quả giống [trien-khai-may-chu.md](trien-khai-may-chu.md#2b-chuyển-dữ-liệu-từ-máy-đang-chạy):
  spider tự đồng bộ lên Crawlab mới, phiên nguồn phải gửi lại, người dùng giữ mật khẩu cũ.

Đăng nhập cổng bằng tài khoản quản trị, vào **Quản trị → Cấu hình chung** đặt tên ứng dụng, tên đơn vị, logo, màu chủ đạo
và tên hiển thị của SSO (vd "Bkav SSO", "SSO tỉnh"). Chưa đặt thì dùng tên "Vala Reporting", màu xanh mặc định.

**Đăng nhập bằng SSO của đơn vị (tuỳ chọn).** Không cần cài Keycloak hay gì thêm — dùng SSO đơn vị đang có (chuẩn OIDC):
1. Nhờ quản trị SSO đăng ký Vala làm một client (confidential, authorization code), redirect URI
   `{PUBLIC_API_URL}/api/v1/sso/callback`, lấy `client_id` / `client_secret`.
2. Sửa `.env.prod`: `LOGIN_SSO=true`, `SSO_ISSUER=<issuer>` (vd `https://sso.tinh.gov.vn/realms/cong-chuc`; SSO kiểu WSO2
   không có discovery thì dùng `SSO_ORIGIN`), `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`. Chạy lại `deploy/k8s/deploy.sh`.
3. Tạo sẵn người dùng trên cổng với **đúng email** (hoặc tên đăng nhập) như trên SSO — lần đầu đăng nhập SSO tự ghép vào
   tài khoản đó. Muốn ai có tài khoản SSO cũng vào được thì đặt `SSO_AUTO_CREATE=true` (tạo người dùng thường).

Tiện ích trình duyệt: vào **Tùy chọn** → địa chỉ máy chủ `https://vala-report.demozone.vn:5443` → đăng nhập lại.

## 4. Cập nhật phiên bản mới

```bash
cd /opt/vala-report && git pull && deploy/k8s/deploy.sh
```

Script build image mới (tag là mã commit), chạy migration trước rồi mới thay api/worker/web. Image của 3 bản build gần
nhất được giữ lại để quay lại khi cần. Đổi `.env.prod` hoặc chứng chỉ rồi chạy lại `deploy.sh` thì pod tự khởi động lại.

## 4b. Phát hành bản Vala Desktop mới (tự cập nhật)

Vala Desktop hỏi `{PUBLIC_WEB_URL}/desktop/latest.yml` (Windows) / `latest-linux.yml` (Ubuntu) lúc mở và 4 giờ một lần.
Có bản mới thì tự tải, kiểm mã băm sha512, rồi hiện nút **"Đã có bản … — Cập nhật"** trên thanh tab. Windows: không bấm thì
tự cài khi thoát. Ubuntu: chỉ cài khi bấm, và Ubuntu hỏi mật khẩu quản trị. Chỉ bản **cài đặt** tự cập nhật được (Windows
NSIS, Ubuntu .deb), bản zip thì không.

| | Windows | Ubuntu |
|---|---|---|
| Build (trên máy dev Linux) | `apps/desktop/scripts/package-win.sh` (Docker có wine) | `pnpm --filter @vala/desktop package:linux` |
| File trong `apps/desktop/release/` | `vala-desktop-<v>-win-x64.exe`, `.exe.blockmap`, `latest.yml` | `vala-desktop-<v>-linux-amd64.deb`, `latest-linux.yml` |
| Liên kết tải lần đầu | `{PUBLIC_WEB_URL}/desktop/vala-desktop-setup.exe` | `{PUBLIC_WEB_URL}/desktop/vala-desktop.deb` |

Gửi người dùng **trang tải `{PUBLIC_WEB_URL}/desktop`** (không cần đăng nhập; có cả liên kết ở trang đăng nhập cổng): trang tự
nhận ra Windows / Ubuntu, hiện phiên bản mới nhất (đọc latest*.yml) và hướng dẫn cài.
| Cài | chạy file, cảnh báo "Windows protected your PC" ⇒ More info → Run anyway (chưa ký số) | `sudo apt install ./vala-desktop.deb` (cần quyền quản trị) |

Gói .deb kèm hồ sơ AppArmor `/etc/apparmor.d/vala-desktop` (như Ubuntu cấp cho chrome / code): Ubuntu 24.04 chặn user
namespace của ứng dụng không có hồ sơ, sandbox của Chromium không chạy được và ứng dụng dừng ngay khi mở. Vì vậy **không
phát hành AppImage** (không mang theo được hồ sơ này; chạy được chỉ khi tắt sandbox — không an toàn).

1. Tăng `version` trong `apps/desktop/package.json` (ứng dụng chỉ cập nhật lên bản cao hơn) và viết mục `## <phiên bản>`
   trong `apps/desktop/CHANGELOG.md` (`### vi` + `### en`, câu ngắn cho người dùng đọc). Thiếu mục này thì bước đóng gói
   dừng. Nội dung được ghi vào `latest.yml` (trường `releaseNotes`): người dùng thấy hộp "Bản … có gì mới" trước khi cài,
   một thông báo "Đã cập nhật lên bản …" sau khi cài, và danh sách ở Cài đặt → Giới thiệu. Rồi build theo bảng trên
   (Windows trên máy Windows thì `pnpm --filter @vala/desktop package`).
2. Chép các file trong `apps/desktop/release/` lên máy chủ (vd `scp apps/desktop/release/{latest*.yml,*.exe,*.blockmap,*.deb}
   <user>@10.2.65.146:/tmp/vala-desktop/`) rồi trên máy chủ:

```bash
cd /opt/vala-report && deploy/publish-desktop.sh /tmp/vala-desktop      # file cài trước, .yml sau cùng
curl -sk {PUBLIC_WEB_URL}/desktop/latest.yml {PUBLIC_WEB_URL}/desktop/latest-linux.yml   # phải thấy đúng phiên bản mới
```

Script luôn trỏ hai liên kết tải cố định về bản mới nhất.

Thư mục này gắn chỉ-đọc vào pod web (web-*.yaml). **Lần đầu** phải `git pull && deploy/k8s/deploy.sh` để pod web có ổ
gắn này; các lần phát hành sau chỉ cần chép file, không chạy lại `deploy.sh`. Giữ lại vài file cài cũ để quay lại khi
cần: chép lại `latest.yml` của bản cũ. Lưu ý quay lại không tự hạ cấp máy đã lên bản mới — electron-updater chỉ cài bản cao hơn.

## 5. Sao lưu

```bash
deploy/k8s/backup.sh     # CSDL + dữ liệu Vault + khoá mở Vault → deploy/backup/<thời điểm>/, giữ 14 bản
```

Đặt cron hằng đêm (mẫu có trong đầu file) và chép bản sao lưu sang máy khác. `vault-keys.tgz` là khoá mở Vault: cất riêng.

## 6. Vận hành

| Việc | Lệnh |
|---|---|
| Tình trạng | trang **Vận hành**, hoặc `kubectl -n vala-report get pods` |
| Log | `kubectl -n vala-report logs -f deploy/api` (hoặc `deploy/worker`, `deploy/web`, `statefulset/crawlab`) |
| Giao diện Crawlab | trên máy chủ: `kubectl -n vala-report port-forward svc/crawlab 8080:8080`, rồi SSH tunnel tới `localhost:8080` |
| Đặt lại mật khẩu quản trị | `deploy/k8s/create-admin.sh <tên đăng nhập>` |
| Khởi động lại một dịch vụ | `kubectl -n vala-report rollout restart deploy/api` |
| Gỡ hẳn (GIỮ dữ liệu) | `kubectl delete ns vala-report` (thư mục dữ liệu còn trong `/var/lib/rancher/k3s/storage`, PV đặt Retain) |

Máy chủ khởi động lại thì k3s tự bật lại các pod, và Vault tự mở khoá.

## 7. Nếu gặp lỗi

- **Pod web `Pending`, báo cổng 5443 đã bị chiếm:** có dịch vụ khác đang giữ 5443 (`sudo ss -ltnp | grep :5443`).
- **Không vào được từ máy khác, nhưng `curl -k https://127.0.0.1:5443/healthz` trên máy chủ chạy được:** tường lửa, hoặc
  CNI không hỗ trợ hostPort (Calico cần plugin `portmap`, bản cài mặc định đã có).
- **Pod bị `Evicted` do ephemeral-storage / DiskPressure:** ổ đĩa máy chủ gần đầy. Dọn bớt; cache build nằm ở
  `/var/lib/vala-report/buildkit` và xoá được.
- **Máy chủ phải qua proxy mới ra Internet:** `BUILD_HTTP_PROXY=http://proxy:3128 deploy/k8s/deploy.sh`.

#!/usr/bin/env bash
# Chạy MỘT LẦN bằng root sau deploy.sh (WEB_EXPOSE=istio):
#   1. Nâng giới hạn inotify của máy chủ (Crawlab, kubectl logs -f báo "too many open files" khi còn 128).
#   2. Khởi động lại Crawlab.
#   3. Gắn /vala-report vào VirtualService cds-nb/superset (lưu bản cũ vào /var/tmp; gỡ: istio-route.sh ... --remove).
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> 1. inotify"
sysctl -w fs.inotify.max_user_instances=1024 fs.inotify.max_user_watches=524288
printf 'fs.inotify.max_user_instances=1024\nfs.inotify.max_user_watches=524288\n' > /etc/sysctl.d/99-inotify.conf

echo "==> 2. Khởi động lại Crawlab"
kubectl -n vala-report delete pod crawlab-0 --wait=false

echo "==> 3. Xem trước thay đổi VirtualService"
DRY_RUN=1 deploy/k8s/istio-route.sh cds-nb/superset /vala-report
read -r -p "Áp dụng thay đổi trên? Gõ 'co' để tiếp tục: " ok
[ "$ok" = co ] || { echo "Bỏ qua bước 3."; exit 0; }
deploy/k8s/istio-route.sh cds-nb/superset /vala-report

echo "==> Xong. Mở https://qtttboard-demo.demozone.vn:5443/vala-report/"

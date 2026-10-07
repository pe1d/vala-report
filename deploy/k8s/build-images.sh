#!/usr/bin/env bash
# Build image vala-report-node + vala-report-web NGAY TRÊN MÁY CHỦ (không cần Docker): chạy BuildKit trong một Job của
# namespace vala-report, rồi nạp file .tar vào containerd của k3s. deploy.sh tự gọi khi chưa có image của phiên bản này.
#   deploy/k8s/build-images.sh [phiên bản]
# Cổng chạy dưới đường dẫn con: WEB_BASE_PATH=/vala-report/ (deploy.sh tự lấy từ PUBLIC_WEB_URL).
# Máy chủ ra Internet qua proxy: BUILD_HTTP_PROXY=http://proxy:3128 deploy/k8s/build-images.sh
# Thư mục trên máy chủ: /var/lib/vala-report/{images,buildkit} (image vừa build, cache build — xoá được bất cứ lúc nào).
source "$(dirname "$0")/lib.sh"
VER="${1:-$(version)}"
RV="$(runner_version)"
BUILD_RUNNER=1; has_image vala-report-runner "$RV" && BUILD_RUNNER=0
DATA_DIR="${VALA_DATA_DIR:-/var/lib/vala-report}"
IMAGES="$DATA_DIR/images"

echo "==> Build image phiên bản $VER từ $ROOT"
k delete job vala-build --ignore-not-found --wait=true >/dev/null
# Sự kiện của Job cũ cùng tên còn lưu ~1 giờ — xoá để phần báo lỗi bên dưới không đọc nhầm lỗi của lần build trước.
k delete events --field-selector involvedObject.name=vala-build --ignore-not-found >/dev/null 2>&1 || true
sed -e "s|VALA_VERSION|$VER|g" -e "s|RUNNER_VERSION|$RV|g" -e "s|BUILD_RUNNER|$BUILD_RUNNER|g" -e "s|SRC_DIR|$ROOT|" -e "s|IMAGES_DIR|$IMAGES|" -e "s|CACHE_DIR|$DATA_DIR/buildkit|" \
  -e "s|BUILD_PROXY|${BUILD_HTTP_PROXY:-}|g" -e "s|WEB_BASE_PATH|${WEB_BASE_PATH:-/}|g" \
  "$K8S/build-job.yaml" | k apply -f - >/dev/null
# Theo log tới khi Job xong (lần build đầu 5–15 phút: tải image gốc + thư viện npm; sau đó có cache nhanh hơn).
# Pod không tạo được (vd vượt ResourceQuota của namespace) ⇒ báo ngay, không chờ 30 phút.
for _ in $(seq 1 120); do
  phase="$(k get pods -l job-name=vala-build -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)"
  case "$phase" in Running|Succeeded|Failed) break;; esac
  why="$(k get events --field-selector involvedObject.name=vala-build,reason=FailedCreate -o jsonpath='{.items[-1:].message}' 2>/dev/null || true)"
  if [ -n "$why" ]; then
    echo "Job build không tạo được pod: $why"
    echo "Xem hạn mức: $KUBECTL -n $NS describe resourcequota"
    exit 1
  fi
  sleep 2
done
k logs -f job/vala-build 2>/dev/null || echo "(không theo dõi được log — vẫn đợi build xong)"
result=""
for _ in $(seq 1 360); do
  result="$(k get job vala-build -o jsonpath='{.status.succeeded}/{.status.failed}')"
  case "$result" in 1/*|*/1) break;; esac
  sleep 5
done
[ "${result%%/*}" = 1 ] || { echo "Build lỗi — xem: $KUBECTL -n $NS logs job/vala-build"; exit 1; }
k delete job vala-build --wait=false >/dev/null

echo "==> Nạp image vào containerd của k3s"
for img in vala-report-node vala-report-web; do
  $SUDO test -s "$IMAGES/$img-$VER.tar" || { echo "Thiếu $IMAGES/$img-$VER.tar"; exit 1; }
  $CTR images import "$IMAGES/$img-$VER.tar" >/dev/null
  $SUDO rm -f "$IMAGES/$img-$VER.tar"
  has_image "$img" "$VER" || { echo "Nạp $img:$VER không thành công"; exit 1; }
done
# Runner (chạy kịch bản Vala Desktop trên máy chủ) không bắt buộc: build lỗi thì không có tệp, bỏ qua.
if [ "$BUILD_RUNNER" = 0 ]; then
  :
elif $SUDO test -s "$IMAGES/vala-report-runner-$RV.tar"; then
  $CTR images import "$IMAGES/vala-report-runner-$RV.tar" >/dev/null && $SUDO rm -f "$IMAGES/vala-report-runner-$RV.tar"
  echo "$RV" | $SUDO tee -a "$DATA_DIR/runner-versions.log" >/dev/null
  # Runner: giữ 2 bản gần nhất.
  for old in $($SUDO tac "$DATA_DIR/runner-versions.log" | awk '!seen[$0]++' | tail -n +3); do
    has_image vala-report-runner "$old" && $CTR images rm "docker.io/library/vala-report-runner:$old" >/dev/null || true
  done
else
  echo "(không có image runner $RV — bỏ qua; xem log build ở trên)"
fi
# Giữ image của 3 phiên bản build gần nhất (để quay lại được); chỉ xoá image của Vala.
echo "$VER" | $SUDO tee -a "$DATA_DIR/versions.log" >/dev/null
for old in $($SUDO tac "$DATA_DIR/versions.log" | awk '!seen[$0]++' | tail -n +4); do
  for img in vala-report-node vala-report-web; do
    has_image "$img" "$old" && $CTR images rm "docker.io/library/$img:$old" >/dev/null || true
  done
done
echo "OK — đã có vala-report-node:$VER và vala-report-web:$VER"

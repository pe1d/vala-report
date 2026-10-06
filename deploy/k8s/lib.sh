# Dùng chung cho các script trong deploy/k8s (source, không chạy trực tiếp).
# Ghi đè được: KUBECTL (mặc định kubectl, không có quyền thì sudo k3s kubectl), CTR (containerd của k3s), SUDO (lệnh
# chạy với quyền root trên máy chủ k3s — đọc/xoá file image đã build).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
K8S="$ROOT/deploy/k8s"
NS=vala-report
if [ -z "${SUDO+x}" ]; then SUDO=""; [ "$(id -u)" = 0 ] || SUDO=sudo; fi
if [ -z "${KUBECTL:-}" ]; then
  if kubectl get ns kube-system >/dev/null 2>&1; then KUBECTL=kubectl; else KUBECTL="$SUDO k3s kubectl"; fi
fi
CTR="${CTR:-$SUDO k3s ctr -n k8s.io}"
k() { $KUBECTL -n "$NS" "$@"; }
# Phiên bản = mã commit (có sửa chưa commit thì thêm -dirty để không đè image của commit sạch).
version() {
  local v; v="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
  git -C "$ROOT" diff --quiet HEAD 2>/dev/null || v="$v-dirty"
  echo "$v"
}
# KHÔNG dùng grep -q: với pipefail, grep thoát ngay khi thấy ⇒ ctr (danh sách image dài trên k3s dùng chung) bị SIGPIPE
# ⇒ cả lệnh tính là lỗi ⇒ báo nhầm "Chưa có image" dù image đã có. Để grep đọc hết đầu ra.
has_image() { $CTR images ls -q | grep -x "docker.io/library/$1:$2" >/dev/null; }

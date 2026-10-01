#!/usr/bin/env bash
# Triển khai / cập nhật Vala Reporting lên k3s (namespace vala-report). Chạy lại mỗi lần có code mới:
#   cd /opt/vala-report && git pull && deploy/k8s/deploy.sh
# Các bước: Secret từ .env.prod + chứng chỉ → build image (nếu chưa có) → CSDL/Redis/Vault/Crawlab → migration → api,
# worker, web → kiểm tra https://127.0.0.1:<WEB_PORT>/healthz. Dữ liệu nằm trên ổ local-path — cập nhật không mất dữ liệu.
# Chỉ tạo/sửa tài nguyên trong namespace vala-report; không đụng cấu hình k3s hay namespace khác.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
ENV_FILE="$ROOT/.env.prod"
CERT="$ROOT/deploy/certs/fullchain.pem"; KEY="$ROOT/deploy/certs/privkey.pem"
WEB_PORT=5443        # trùng hostPort trong app.yaml
[ -f "$ENV_FILE" ] || { echo "Chưa có .env.prod — chạy: deploy/gen-env.sh https://vala-report.demozone.vn:$WEB_PORT"; exit 1; }
PUBLIC_WEB_URL="$(grep -E '^PUBLIC_WEB_URL=' "$ENV_FILE" | cut -d= -f2-)"
if [ ! -s "$CERT" ] || [ ! -s "$KEY" ]; then
  echo "Chưa có chứng chỉ trong deploy/certs/ (fullchain.pem + privkey.pem) — xem deploy/certs/README.txt."
  echo "Tạm dùng chứng chỉ TỰ KÝ? (trình duyệt sẽ cảnh báo, tiện ích có thể không gọi được máy chủ)"
  read -r -p "Gõ 'tu ky' để tạo chứng chỉ tự ký: " ok
  [ "$ok" = "tu ky" ] || exit 1
  HOST="$(echo "$PUBLIC_WEB_URL" | sed -E 's#^https?://([^:/]+).*#\1#')"
  (umask 077; openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=$HOST" -addext "subjectAltName=DNS:$HOST" \
    -keyout "$KEY" -out "$CERT" 2>/dev/null)
  echo "Đã tạo chứng chỉ tự ký cho $HOST (1 năm)."
fi
VER="$(version)"
# Đường dẫn con của cổng (vd PUBLIC_WEB_URL=https://host:5443/vala-report ⇒ /vala-report/) — build web theo đó.
WEB_BASE_PATH="$(echo "$PUBLIC_WEB_URL" | sed -E 's#^https?://[^/]+##; s#/+$##')/"
export WEB_BASE_PATH

echo "==> Namespace $NS + cấu hình (Secret vala-env, vala-tls; ConfigMap vala-vault)"
$KUBECTL apply -f "$K8S/namespace.yaml" -n "$NS" >/dev/null
# Secret từ .env.prod (bỏ dòng chú thích/trống). SOURCE_HTTP_PROXY luôn có (rỗng = gọi thẳng).
ENV_TMP="$(mktemp)"; trap 'rm -f "$ENV_TMP"' EXIT
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" > "$ENV_TMP"
grep -q '^SOURCE_HTTP_PROXY=' "$ENV_TMP" || echo 'SOURCE_HTTP_PROXY=' >> "$ENV_TMP"
k create secret generic vala-env --from-env-file="$ENV_TMP" --dry-run=client -o yaml | k apply -f - >/dev/null
k create secret tls vala-tls --cert="$CERT" --key="$KEY" --dry-run=client -o yaml | k apply -f - >/dev/null
k create configmap vala-vault --from-file="$ROOT/infra/vault" --dry-run=client -o yaml | k apply -f - >/dev/null
CONFIG_HASH="$(cat "$ENV_TMP" "$CERT" "$KEY" "$ROOT"/infra/vault/* | sha256sum | cut -c1-16)"

echo "==> Image phiên bản $VER"
if [ "${SKIP_BUILD:-}" != 1 ] && { [ "${FORCE_BUILD:-}" = 1 ] || [[ "$VER" == *-dirty ]] || ! has_image vala-report-node "$VER" || ! has_image vala-report-web "$VER"; }; then
  "$K8S/build-images.sh" "$VER"
fi
has_image vala-report-node "$VER" && has_image vala-report-web "$VER" || { echo "Chưa có image $VER trong k3s"; exit 1; }

# Điền phiên bản + mã băm cấu hình; nhiều file ⇒ ngăn bằng '---' (không thì YAML cuối file này dính vào đầu file sau).
render() { for f; do sed -e "s|VALA_VERSION|$VER|g" -e "s|CONFIG_HASH|$CONFIG_HASH|g" "$f"; echo "---"; done; }

echo "==> CSDL, Redis, Vault, Crawlab"
render "$K8S/data.yaml" "$K8S/crawlab.yaml" | k apply -f - >/dev/null
for s in postgres redis vault crawlab-mongo crawlab; do k rollout status "statefulset/$s" --timeout=300s >/dev/null; done
# local-path mặc định XOÁ thư mục dữ liệu khi PVC bị xoá (vd lỡ xoá namespace) ⇒ đổi sang Retain cho ổ của Vala.
for pv in $(k get pvc -o jsonpath='{range .items[*]}{.spec.volumeName}{"\n"}{end}'); do
  $KUBECTL patch pv "$pv" -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}' >/dev/null
done

echo "==> Migration CSDL"
render "$K8S/app.yaml" | awk 'BEGIN{RS="---\n"; ORS="---\n"} /kind: ConfigMap/' | k apply -f - >/dev/null
k delete job vala-migrate --ignore-not-found --wait=true >/dev/null
render "$K8S/migrate-job.yaml" | k apply -f - >/dev/null
if ! k wait --for=condition=complete job/vala-migrate --timeout=300s >/dev/null 2>&1; then
  k logs job/vala-migrate --tail=50 || true
  echo "Migration lỗi — chưa bật bản mới của api/worker/web."; exit 1
fi
k logs job/vala-migrate --tail=3

echo "==> api, worker, web"
render "$K8S/app.yaml" | k apply -f - >/dev/null
for d in api worker web; do k rollout status "deployment/$d" --timeout=300s >/dev/null; done

echo "==> Kiểm tra"
for _ in $(seq 1 30); do
  if curl -fsSk "https://127.0.0.1:$WEB_PORT/healthz" >/dev/null 2>&1; then
    echo "OK — phiên bản $VER đang chạy ở $PUBLIC_WEB_URL"
    k get pods -o wide
    exit 0
  fi
  sleep 2
done
echo "Không gọi được https://127.0.0.1:$WEB_PORT/healthz — xem: $KUBECTL -n $NS logs deploy/web; $KUBECTL -n $NS logs deploy/api"
exit 1

#!/usr/bin/env bash
# Gắn cổng Vala vào một đường dẫn con của tên miền đang có trên Istio (WEB_EXPOSE=istio), vd:
#   deploy/k8s/istio-route.sh cds-nb/superset /vala-report
#   ⇒ https://qtttboard-demo.demozone.vn:5443/vala-report/ → Service web.vala-report:80 (bỏ tiền tố trước khi chuyển)
# Gỡ ra:  deploy/k8s/istio-route.sh cds-nb/superset /vala-report --remove
# Chỉ thêm/bỏ các rule tên vala-report-* ở ĐẦU danh sách http của VirtualService (Istio xét từ trên xuống), rule khác
# giữ nguyên. Lưu bản cũ vào /var/tmp trước khi sửa. Chạy lại nhiều lần không sinh rule trùng.
source "$(dirname "$0")/lib.sh"
VS="${1:-}"; PREFIX="${2:-}"; MODE="${3:-add}"
[[ "$VS" == */* && "$PREFIX" == /?* ]] || { echo "Cách dùng: $0 <namespace>/<virtualservice> </duong-dan> [--remove]"; exit 1; }
VS_NS="${VS%%/*}"; VS_NAME="${VS#*/}"; PREFIX="/${PREFIX#/}"; PREFIX="${PREFIX%/}"

DRY=(); [ "${DRY_RUN:-}" = 1 ] && DRY=(--dry-run=server -o yaml)
# Bỏ các trường máy chủ tự sinh ⇒ bản lưu dùng lại được bằng `kubectl replace -f`.
clean='import json, sys
vs = json.load(sys.stdin); vs.pop("status", None)
for k in ("uid", "creationTimestamp", "generation", "managedFields"): vs["metadata"].pop(k, None)
vs["metadata"].get("annotations", {}).pop("kubectl.kubernetes.io/last-applied-configuration", None)'
cur="$($KUBECTL -n "$VS_NS" get virtualservice "$VS_NAME" -o json)"
backup="/var/tmp/vs-$VS_NS-$VS_NAME-$(date +%Y%m%d%H%M%S).json"
[ "${DRY_RUN:-}" = 1 ] || echo "$cur" | python3 -c "$clean"'
vs["metadata"].pop("resourceVersion", None); json.dump(vs, sys.stdout, indent=1)' > "$backup"

echo "$cur" | python3 -c "$clean"'
prefix, mode, ns = sys.argv[1], sys.argv[2], sys.argv[3]
http = [r for r in vs["spec"].get("http", []) if not r.get("name", "").startswith("vala-report-")]
if mode != "--remove":
    web = {"host": f"web.{ns}.svc.cluster.local", "port": {"number": 80}}
    http = [
        # /vala-report (thiếu dấu / cuối) ⇒ chuyển sang /vala-report/ cho đường dẫn tương đối của web đúng.
        {"name": "vala-report-slash", "match": [{"uri": {"exact": prefix}}], "redirect": {"uri": prefix + "/"}},
        {"name": "vala-report-web", "match": [{"uri": {"prefix": prefix + "/"}}], "rewrite": {"uri": "/"},
         "route": [{"destination": web}], "timeout": "300s"},
    ] + http
vs["spec"]["http"] = http
json.dump(vs, sys.stdout)
' "$PREFIX" "$MODE" "$NS" | $KUBECTL replace "${DRY[@]}" -f - | { [ "${DRY_RUN:-}" = 1 ] && sed -n '/^spec:/,$p' || cat >/dev/null; }
[ "${DRY_RUN:-}" = 1 ] && exit 0

echo "Đã lưu bản cũ: $backup (khôi phục: $KUBECTL -n $VS_NS replace -f $backup)"
$KUBECTL -n "$VS_NS" get virtualservice "$VS_NAME" -o jsonpath='{range .spec.http[*]}{.name}{"\t"}{.match[0].uri}{"\n"}{end}'

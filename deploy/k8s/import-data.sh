#!/usr/bin/env bash
# (Trên MÁY CHỦ, sau deploy/k8s/deploy.sh lần đầu) Nạp CSDL xuất từ máy dev (deploy/export-dev-data.sh).
#   deploy/k8s/import-data.sh deploy/backup/vala-dev-<ngày>.dump
# GHI ĐÈ toàn bộ dữ liệu hiện có. Sau khi nạp: worker tự đồng bộ spider lên Crawlab; mọi kết nối nguồn cần phiên mới
# (Vault không chuyển); người dùng đăng nhập cổng bằng mật khẩu cũ; tiện ích đăng nhập lại với địa chỉ máy chủ mới.
source "$(dirname "$0")/lib.sh"
DUMP="${1:-}"
[ -f "$DUMP" ] || { echo "Cách dùng: deploy/k8s/import-data.sh <file .dump>"; exit 1; }
read -r -p "Ghi đè TOÀN BỘ dữ liệu trên máy chủ bằng $DUMP? Gõ 'dong y' để tiếp tục: " ok
[ "$ok" = "dong y" ] || { echo "Huỷ."; exit 1; }
VER="$(k get deploy/api -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)"

k scale deploy/api deploy/worker --replicas=0 >/dev/null
k wait --for=delete pod -l 'app in (api,worker)' --timeout=120s >/dev/null 2>&1 || true
# Nạp vào CSDL TRỐNG (xoá rồi tạo lại) — không dùng --clean đè lên bảng phân vùng có sẵn; lỗi là dừng.
k exec postgres-0 -- dropdb -U vala_owner --if-exists --force vala
k exec postgres-0 -- createdb -U vala_owner vala
k exec -i postgres-0 -- pg_restore -U vala_owner -d vala --no-owner --role=vala_owner --exit-on-error < "$DUMP"
# Migration: đặt lại mật khẩu vai trò CSDL của máy chủ này + áp migration mới hơn bản dev (nếu có).
k delete job vala-migrate --ignore-not-found --wait=true >/dev/null
sed -e "s|VALA_VERSION|$VER|g" "$K8S/migrate-job.yaml" | k apply -f - >/dev/null
k wait --for=condition=complete job/vala-migrate --timeout=300s >/dev/null || { k logs job/vala-migrate --tail=50; exit 1; }
# Schema dữ liệu của đơn vị (TENANT trong .env.prod; mặc định tenant_bkav — tên nội bộ, xem env.prod.example).
TENANT="$(grep -E '^TENANT=' "$ROOT/.env.prod" 2>/dev/null | cut -d= -f2)"
k exec -i postgres-0 -- psql -U vala_owner -d vala -v ON_ERROR_STOP=1 -v tenant="${TENANT:-tenant_bkav}" <<'SQL'
SET search_path = :"tenant", core, public;
-- Crawlab của máy chủ là mới: bỏ liên kết tới Crawlab máy dev ⇒ worker tự đồng bộ lại.
UPDATE core.crawl_spiders SET crawlab_spider_id = NULL, synced_at = NULL;
DELETE FROM core.spider_schedules;
DELETE FROM core.service_heartbeats;
UPDATE core.spider_launches SET status = 'failed', error = 'Chuyển máy chủ' WHERE status = 'launched';
-- Vault không chuyển theo ⇒ mọi kết nối cần phiên mới, ghi rõ lý do để người dùng không hiểu nhầm là "hết hạn".
UPDATE source_grants
   SET session_state = 'expired', last_error = 'Phiên đã lưu bị mất: chuyển sang máy chủ mới — mở hệ thống nguồn trên trình duyệt, tiện ích tự gửi lại'
 WHERE revoked_at IS NULL AND auth_method IN ('extension', 'cookie', 'sso');
UPDATE source_grants
   SET session_state = 'failed', last_error = 'Chuyển sang máy chủ mới — quản trị nhập lại tài khoản/mật khẩu nguồn ở "Kết nối dữ liệu"'
 WHERE revoked_at IS NULL AND auth_method = 'password';
DELETE FROM extension_devices;   -- token tiện ích cũ vô hiệu: tiện ích đăng nhập lại với máy chủ mới
SQL
k scale deploy/api deploy/worker --replicas=1 >/dev/null
k rollout status deploy/api --timeout=180s >/dev/null
echo "Đã nạp dữ liệu. Worker sẽ tự đồng bộ spider lên Crawlab trong vài giây (xem trang Vận hành)."

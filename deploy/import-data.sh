#!/usr/bin/env bash
# (Chạy trên MÁY CHỦ, sau deploy/deploy.sh lần đầu) Nạp CSDL xuất từ máy dev (deploy/export-dev-data.sh).
#   deploy/import-data.sh deploy/backup/vala-dev-<ngày>.dump
# GHI ĐÈ toàn bộ dữ liệu hiện có trên máy chủ. Sau khi nạp:
#   - spider sẽ được worker tự đồng bộ lên Crawlab của máy chủ (mã lấy từ CSDL);
#   - mọi kết nối nguồn cần phiên mới (Vault không chuyển): tiện ích tự gửi lại khi người dùng mở hệ thống nguồn;
#     kết nối bằng mật khẩu: quản trị nhập lại ở "Kết nối dữ liệu";
#   - người dùng đăng nhập cổng bằng mật khẩu cũ; tiện ích phải đăng nhập lại với địa chỉ máy chủ mới.
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:-}"
[ -f "$DUMP" ] || { echo "Cách dùng: deploy/import-data.sh <file .dump>"; exit 1; }
C=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
read -r -p "Ghi đè TOÀN BỘ dữ liệu trên máy chủ bằng $DUMP? Gõ 'dong y' để tiếp tục: " ok
[ "$ok" = "dong y" ] || { echo "Huỷ."; exit 1; }

"${C[@]}" stop api worker
# Nạp vào CSDL TRỐNG (xoá rồi tạo lại) — không dùng --clean đè lên bảng phân vùng có sẵn; lỗi là dừng.
"${C[@]}" exec -T postgres dropdb -U vala_owner --if-exists --force vala
"${C[@]}" exec -T postgres createdb -U vala_owner vala
"${C[@]}" exec -T postgres pg_restore -U vala_owner -d vala --no-owner --role=vala_owner --exit-on-error < "$DUMP"
# Migration: đặt lại mật khẩu vai trò CSDL của máy chủ này + áp migration mới hơn bản dev (nếu có).
"${C[@]}" run --rm tools scripts/migrate.ts
# Schema dữ liệu của đơn vị (TENANT trong .env.prod; mặc định tenant_bkav — tên nội bộ, xem env.prod.example).
TENANT="$(grep -E '^TENANT=' .env.prod | cut -d= -f2)"
"${C[@]}" exec -T postgres psql -U vala_owner -d vala -v ON_ERROR_STOP=1 -v tenant="${TENANT:-tenant_bkav}" <<'SQL'
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
"${C[@]}" up -d api worker
echo "Đã nạp dữ liệu. Worker sẽ tự đồng bộ spider lên Crawlab trong vài giây (xem trang Vận hành)."

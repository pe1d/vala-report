#!/usr/bin/env bash
# (Chạy trên MÁY DEV) Xuất CSDL đang chạy ở máy dev để chuyển sang máy chủ: cấu hình (hệ thống nguồn, adapter, spider,
# báo cáo, tab Tổng quan), người dùng, lịch chạy và dữ liệu đã lấy về. KHÔNG xuất Vault: phiên/mật khẩu nguồn không mang
# theo — sau khi chuyển, người dùng gửi lại phiên qua tiện ích (quản trị nhập lại mật khẩu cho kết nối mật khẩu).
#   deploy/export-dev-data.sh   ⇒ deploy/backup/vala-dev-<ngày>.dump   (chép file này sang máy chủ)
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p deploy/backup
OUT="deploy/backup/vala-dev-$(date +%Y%m%d-%H%M).dump"
docker compose exec -T postgres pg_dump -U vala_owner -Fc vala > "$OUT"
echo "Đã xuất $OUT ($(du -h "$OUT" | cut -f1)). Chép sang máy chủ, vd:"
echo "  scp $OUT <user>@10.2.65.146:/opt/vala-reporting/deploy/backup/"

#!/usr/bin/env bash
# Tạo .env.prod ở thư mục gốc repo từ deploy/env.prod.example, điền mật khẩu/khoá ngẫu nhiên.
#   deploy/gen-env.sh http://10.2.65.146            (hoặc https://vala.bkav.com)
# Đã có .env.prod thì dừng (tránh đổi mật khẩu CSDL/Vault của hệ thống đang chạy).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-}"
[ -n "$URL" ] || { echo "Cách dùng: deploy/gen-env.sh <địa chỉ web, vd http://10.2.65.146>"; exit 1; }
[ -e .env.prod ] && { echo ".env.prod đã có — không ghi đè. Xoá nó nếu thật sự muốn tạo lại (sẽ đổi mọi mật khẩu)."; exit 1; }
rnd() { openssl rand -hex "${1:-24}"; }
umask 077
sed -e "s|^PUBLIC_WEB_URL=.*|PUBLIC_WEB_URL=${URL%/}|" \
    -e "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=${URL%/}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rnd)|" \
    -e "s|^DB_READER_PASSWORD=.*|DB_READER_PASSWORD=$(rnd)|" \
    -e "s|^DB_WRITER_PASSWORD=.*|DB_WRITER_PASSWORD=$(rnd)|" \
    -e "s|^AUTH_JWT_SECRET=.*|AUTH_JWT_SECRET=$(rnd 32)|" \
    -e "s|^INTERNAL_TOKEN=.*|INTERNAL_TOKEN=$(rnd 32)|" \
    -e "s|^VAULT_TOKEN=.*|VAULT_TOKEN=vala-$(rnd)|" \
    deploy/env.prod.example > .env.prod
echo "Đã tạo .env.prod (chmod 600). Xem lại PUBLIC_WEB_URL, SOURCE_HTTP_PROXY, CRAWLAB_* trước khi chạy deploy/deploy.sh."

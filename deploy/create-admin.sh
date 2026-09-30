#!/usr/bin/env bash
# Tạo / đặt lại tài khoản quản trị đăng nhập bằng mật khẩu (in mật khẩu tạm một lần; lần đầu đăng nhập phải đổi).
#   deploy/create-admin.sh admin "Quản trị hệ thống" admin@bkav.com
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm tools \
  scripts/create-admin.ts --username "${1:-admin}" --name "${2:-Quản trị hệ thống}" --email "${3:-${1:-admin}@bkav.com}"

#!/usr/bin/env bash
# Tạo / đặt lại tài khoản quản trị (in mật khẩu tạm một lần; lần đầu đăng nhập phải đổi).
#   deploy/k8s/create-admin.sh admin "Quản trị hệ thống" admin@bkav.com
source "$(dirname "$0")/lib.sh"
k exec deploy/api -- sh -c 'cd /app/packages/core && exec node_modules/.bin/tsx scripts/create-admin.ts "$@"' _ \
  --username "${1:-admin}" --name "${2:-Quản trị hệ thống}" --email "${3:-${1:-admin}@bkav.com}"

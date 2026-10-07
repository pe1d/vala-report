#!/usr/bin/env bash
# Triển khai / cập nhật Vala Reporting trên máy chủ. Chạy lại mỗi lần có code mới (git pull rồi deploy/deploy.sh).
#   1. build image (api/worker/web)   2. bật CSDL, Redis, Vault, Crawlab   3. migration   4. bật api, worker, web
#   5. kiểm tra /healthz qua nginx.   Dữ liệu nằm trong volume Docker — build/cập nhật không làm mất dữ liệu.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.prod ] || { echo "Chưa có .env.prod — chạy deploy/gen-env.sh <địa chỉ web> trước."; exit 1; }
C=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
export VALA_VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
HTTP_PORT="$(grep -E '^HTTP_PORT=' .env.prod | cut -d= -f2)"; HTTP_PORT="${HTTP_PORT:-80}"

echo "==> Build image (phiên bản $VALA_VERSION)"
"${C[@]}" build api web
"${C[@]}" build worker tools

echo "==> Bật CSDL, Redis, Vault, Crawlab"
"${C[@]}" up -d --wait postgres redis vault crawlab-mongo crawlab

echo "==> Migration CSDL"
"${C[@]}" run --rm tools scripts/migrate.ts

echo "==> Bật api, worker, web"
"${C[@]}" up -d --wait api
"${C[@]}" up -d worker web
# Runner chạy kịch bản Vala Desktop trên máy chủ (Chromium) — không bắt buộc: build lỗi thì cổng vẫn chạy.
"${C[@]}" up -d --build runner || echo "!! runner chưa chạy được — bỏ qua (xem: ${C[*]} logs runner)"

echo "==> Kiểm tra"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${HTTP_PORT}/healthz" >/dev/null 2>&1; then
    echo "OK — cổng chạy ở $(grep -E '^PUBLIC_WEB_URL=' .env.prod | cut -d= -f2)"
    "${C[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
    exit 0
  fi
  sleep 2
done
echo "Không gọi được http://127.0.0.1:${HTTP_PORT}/healthz — xem log: ${C[*]} logs --tail 100 api web"
exit 1

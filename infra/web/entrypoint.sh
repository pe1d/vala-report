#!/bin/sh
# Chọn cấu hình nginx: có chứng chỉ trong /etc/nginx/certs ⇒ HTTPS (80 chuyển sang 443), không có ⇒ chỉ HTTP.
# Điền DNS (lấy từ /etc/resolv.conf — Docker hay Kubernetes đều đúng) và địa chỉ api (API_UPSTREAM).
set -eu
if [ -s /etc/nginx/certs/fullchain.pem ] && [ -s /etc/nginx/certs/privkey.pem ]; then
  SRC=/etc/nginx/vala/nginx-https.conf; MODE=HTTPS
else
  SRC=/etc/nginx/vala/nginx-http.conf; MODE="HTTP (không có chứng chỉ trong /etc/nginx/certs)"
fi
RESOLVER="$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)"
case "$RESOLVER" in *:*) RESOLVER="[$RESOLVER]";; esac
UPSTREAM="${API_UPSTREAM:-http://api:3000}"
case "${PUBLIC_WEB_URL:-}" in https://*) HTTPS_BASE="${PUBLIC_WEB_URL%/}";; *) HTTPS_BASE='https://$host';; esac
sed -e "s|__RESOLVER__|${RESOLVER:-127.0.0.11}|" -e "s|__API_UPSTREAM__|${UPSTREAM}|" -e "s|__HTTPS_BASE__|${HTTPS_BASE}|" \
  "$SRC" > /etc/nginx/conf.d/vala.conf
echo "[vala] nginx: $MODE — api: $UPSTREAM, dns: $RESOLVER"

#!/bin/sh
# Chọn cấu hình nginx: có chứng chỉ trong /etc/nginx/certs ⇒ HTTPS (80 chuyển sang 443), không có ⇒ chỉ HTTP.
if [ -s /etc/nginx/certs/fullchain.pem ] && [ -s /etc/nginx/certs/privkey.pem ]; then
  cp /etc/nginx/vala/nginx-https.conf /etc/nginx/conf.d/vala.conf
  echo "[vala] nginx: HTTPS"
else
  cp /etc/nginx/vala/nginx-http.conf /etc/nginx/conf.d/vala.conf
  echo "[vala] nginx: HTTP (không có chứng chỉ trong /etc/nginx/certs)"
fi

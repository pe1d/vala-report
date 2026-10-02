#!/bin/sh
# Build 2 bản tiện ích và đóng zip để gửi người dùng (giải nén đè vào thư mục cũ rồi Reload trong chrome://extensions):
#   vala-extension-<phiên bản>.zip       bản phát hành — máy chủ thật
#   vala-extension-<phiên bản>-dev.zip   bản dev — http://localhost:5173, tên "Vala Reporting (dev)"
# Sửa tiện ích ⇒ tăng "version" trong package.json trước khi chạy (Chrome cần phiên bản mới).
set -eu
cd "$(dirname "$0")/.."
V="$(node -p "require('./package.json').version")"
tsc -p .
vite build
vite build --mode development
rm -f "vala-extension-$V.zip" "vala-extension-$V-dev.zip"
(cd dist && zip -qr "../vala-extension-$V.zip" .)
(cd dist-dev && zip -qr "../vala-extension-$V-dev.zip" .)
ls -l "vala-extension-$V.zip" "vala-extension-$V-dev.zip"

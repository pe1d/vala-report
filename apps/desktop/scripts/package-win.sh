#!/bin/sh
# Build BỘ CÀI Windows (NSIS, tự cập nhật được) ngay trên máy Linux, trong container có sẵn wine — không cần cài wine.
#   apps/desktop/scripts/package-win.sh            (đặt VALA_HOME_URL / VALA_URL / VALA_UPDATE_URL nếu cần, như pnpm package)
# Ra apps/desktop/release/: vala-desktop-<phiên bản>-win-x64.exe, .exe.blockmap, latest.yml
# → chép lên máy chủ rồi chạy deploy/publish-desktop.sh (xem docs/trien-khai-k3s.md mục 4b).
# Nhớ tăng "version" trong apps/desktop/package.json trước mỗi lần phát hành: ứng dụng chỉ cập nhật lên bản cao hơn.
set -eu
cd "$(dirname "$0")/.."
APP="$(pwd)"
REPO="$(cd ../.. && pwd)"
pnpm build
rm -rf release
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}"
mkdir -p "$CACHE/electron" "$CACHE/electron-builder" "$CACHE/vala-desktop-wine"
docker run --rm -u "$(id -u):$(id -g)" \
  -e HOME=/tmp/home -e ELECTRON_CACHE=/cache/electron -e ELECTRON_BUILDER_CACHE=/cache/electron-builder \
  -e HTTPS_PROXY="${HTTPS_PROXY:-}" -e HTTP_PROXY="${HTTP_PROXY:-}" -e NO_PROXY=localhost,127.0.0.1 \
  -e ELECTRON_GET_USE_PROXY=1 -e GLOBAL_AGENT_HTTPS_PROXY="${HTTPS_PROXY:-}" \
  -v "$CACHE/vala-desktop-wine:/tmp/home" -v "$CACHE/electron:/cache/electron" -v "$CACHE/electron-builder:/cache/electron-builder" \
  -v "$REPO:$REPO" -w "$APP" \
  electronuserland/builder:wine ./node_modules/.bin/electron-builder --win nsis -p never -c.win.signAndEditExecutable=true
ls -l release/*.exe release/latest.yml

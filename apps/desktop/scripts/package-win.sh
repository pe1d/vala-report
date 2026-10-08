#!/bin/sh
# Build BỘ CÀI Windows ngay trên máy Linux, trong container có sẵn wine — không cần cài wine.
#   apps/desktop/scripts/package-win.sh            (đặt VALA_HOME_URL / VALA_URL / VALA_UPDATE_URL nếu cần, như pnpm package)
# Mặc định: MINI INSTALLER (nsis-web) ⇒ apps/desktop/release/nsis-web/: vala-desktop-<v>-win-x64-setup.exe (file cài mini),
#   vala-desktop-<v>-x64.nsis.7z (gói app — file cài mini tải về từ <máy chủ>/desktop/), latest.yml.
#   VALA_UPDATE_URL=<máy chủ>/desktop/ ⇒ file cài mini tải gói từ máy chủ đó (mặc định: publish.url trong electron-builder.yml).
# VALA_OFFLINE=1: bộ cài đầy đủ (nsis) cho máy không ra được máy chủ ⇒ release/: vala-desktop-<v>-win-x64.exe.
# → chép lên máy chủ rồi chạy deploy/publish-desktop.sh (xem docs/trien-khai-k3s.md mục 4b).
# Nhớ tăng "version" trong apps/desktop/package.json trước mỗi lần phát hành (ứng dụng chỉ cập nhật lên bản cao hơn) và
# viết điểm mới của bản đó trong apps/desktop/CHANGELOG.md (thiếu thì dừng).
set -eu
cd "$(dirname "$0")/.."
APP="$(pwd)"
REPO="$(cd ../.. && pwd)"
pnpm build
node scripts/release-notes.cjs --strict
rm -rf release
TARGET=nsis-web
EXTRA=""
[ "${VALA_OFFLINE:-}" = 1 ] && TARGET=nsis
[ "$TARGET" = nsis-web ] && [ -n "${VALA_UPDATE_URL:-}" ] && EXTRA="-c.nsisWeb.appPackageUrl=${VALA_UPDATE_URL%/}/"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}"
mkdir -p "$CACHE/electron" "$CACHE/electron-builder" "$CACHE/vala-desktop-wine"
docker run --rm -u "$(id -u):$(id -g)" \
  -e HOME=/tmp/home -e ELECTRON_CACHE=/cache/electron -e ELECTRON_BUILDER_CACHE=/cache/electron-builder \
  -e HTTPS_PROXY="${HTTPS_PROXY:-}" -e HTTP_PROXY="${HTTP_PROXY:-}" -e NO_PROXY=localhost,127.0.0.1 \
  -e ELECTRON_GET_USE_PROXY=1 -e GLOBAL_AGENT_HTTPS_PROXY="${HTTPS_PROXY:-}" \
  -v "$CACHE/vala-desktop-wine:/tmp/home" -v "$CACHE/electron:/cache/electron" -v "$CACHE/electron-builder:/cache/electron-builder" \
  -v "$REPO:$REPO" -w "$APP" \
  electronuserland/builder:wine ./node_modules/.bin/electron-builder --win "$TARGET" -p never -c.win.signAndEditExecutable=true $EXTRA
if [ "$TARGET" = nsis-web ]; then ls -l release/nsis-web/; else ls -l release/*.exe release/latest.yml; fi

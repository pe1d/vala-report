#!/bin/sh
# Phát hành bản Vala Desktop: chép bộ cài + latest.yml vào thư mục mà web phục vụ ở {PUBLIC_WEB_URL}/desktop/.
#   deploy/publish-desktop.sh <thư mục chứa latest.yml và file cài> [thư mục đích]
# Đích mặc định /var/lib/vala-report/desktop (k3s). Docker Compose: deploy/publish-desktop.sh <thư mục> deploy/desktop
#
# Thứ tự quan trọng: file cài trước, latest.yml SAU CÙNG — ứng dụng chỉ thấy bản mới khi file cài đã chép đủ.
# Kèm liên kết tải cố định cho người cài lần đầu: …/desktop/vala-desktop-setup.exe luôn là bản mới nhất.
set -eu
SRC="${1:?Thiếu thư mục chứa latest.yml và file cài (apps/desktop/release)}"
DEST="${2:-/var/lib/vala-report/desktop}"
YML="$SRC/latest.yml"
[ -f "$YML" ] || { echo "Không có $YML"; exit 1; }
VER="$(sed -n 's/^version: *//p' "$YML" | head -1)"
EXE="$(sed -n 's/^path: *//p' "$YML" | head -1)"
[ -n "$VER" ] && [ -n "$EXE" ] || { echo "$YML không có version/path"; exit 1; }
[ -f "$SRC/$EXE" ] || { echo "Không có $SRC/$EXE (file cài latest.yml trỏ tới)"; exit 1; }

SUDO=""
mkdir -p "$DEST" 2>/dev/null && [ -w "$DEST" ] || SUDO=sudo
$SUDO mkdir -p "$DEST"

$SUDO cp "$SRC/$EXE" "$DEST/"
[ -f "$SRC/$EXE.blockmap" ] && $SUDO cp "$SRC/$EXE.blockmap" "$DEST/"
$SUDO cp "$SRC/$EXE" "$DEST/vala-desktop-setup.exe.tmp" && $SUDO mv "$DEST/vala-desktop-setup.exe.tmp" "$DEST/vala-desktop-setup.exe"
$SUDO cp "$YML" "$DEST/latest.yml.tmp" && $SUDO mv "$DEST/latest.yml.tmp" "$DEST/latest.yml"
$SUDO chmod 644 "$DEST"/*

echo "Đã phát hành Vala Desktop $VER → $DEST"
ls -l "$DEST"

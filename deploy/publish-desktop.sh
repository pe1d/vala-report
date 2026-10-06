#!/bin/sh
# Phát hành bản Vala Desktop: chép bộ cài + file mô tả bản mới vào thư mục mà web phục vụ ở {PUBLIC_WEB_URL}/desktop/.
#   deploy/publish-desktop.sh <thư mục chứa latest.yml / latest-linux.yml và file cài> [thư mục đích]
# Đích mặc định /var/lib/vala-report/desktop (k3s). Docker Compose: deploy/publish-desktop.sh <thư mục> deploy/desktop
#
# Windows: latest.yml + vala-desktop-<v>-win-x64.exe (+ .blockmap)   → liên kết cố định vala-desktop-setup.exe
# Ubuntu:  latest-linux.yml + vala-desktop-<v>-linux-amd64.deb       → liên kết cố định vala-desktop.deb
# Có bản nào phát hành bản đó (một hoặc cả hai). Thứ tự quan trọng: file cài trước, file .yml SAU CÙNG — ứng dụng chỉ thấy
# bản mới khi file cài đã chép đủ.
set -eu
SRC="${1:?Thiếu thư mục chứa latest.yml / latest-linux.yml và file cài (apps/desktop/release)}"
DEST="${2:-/var/lib/vala-report/desktop}"

SUDO=""
mkdir -p "$DEST" 2>/dev/null && [ -w "$DEST" ] || SUDO=sudo
$SUDO mkdir -p "$DEST"

# Chép an toàn: ghi file tạm rồi đổi tên, người đang tải không nhận file dở.
put() { $SUDO cp "$1" "$DEST/$2.tmp" && $SUDO mv "$DEST/$2.tmp" "$DEST/$2"; }

found=0
for spec in "latest.yml:vala-desktop-setup.exe" "latest-linux.yml:vala-desktop.deb"; do
  yml="${spec%%:*}"; alias="${spec#*:}"
  [ -f "$SRC/$yml" ] || continue
  ver="$(sed -n 's/^version: *//p' "$SRC/$yml" | head -1)"
  file="$(sed -n 's/^path: *//p' "$SRC/$yml" | head -1)"
  [ -n "$ver" ] && [ -n "$file" ] || { echo "$SRC/$yml không có version/path"; exit 1; }
  [ -f "$SRC/$file" ] || { echo "Không có $SRC/$file ($yml trỏ tới)"; exit 1; }
  put "$SRC/$file" "$file"
  [ -f "$SRC/$file.blockmap" ] && put "$SRC/$file.blockmap" "$file.blockmap"
  put "$SRC/$file" "$alias"
  put "$SRC/$yml" "$yml"
  echo "Đã phát hành $file ($ver) — tải lần đầu: …/desktop/$alias"
  found=1
done
[ "$found" = 1 ] || { echo "Không thấy latest.yml hay latest-linux.yml trong $SRC"; exit 1; }
$SUDO chmod 644 "$DEST"/*
ls -l "$DEST"

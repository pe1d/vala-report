#!/usr/bin/env bash
# Sao lưu trên máy chủ: CSDL (pg_dump) + dữ liệu Vault (phiên/mật khẩu nguồn, đã mã hoá) + khoá mở Vault.
# Giữ 14 bản gần nhất trong deploy/backup/. Gợi ý cron hằng đêm:
#   15 2 * * *  cd /opt/vala-reporting && deploy/backup.sh >> deploy/backup/backup.log 2>&1
# LƯU Ý: vault-keys.tgz chứa khoá mở Vault — ai có nó + vault-file.tgz là đọc được mật khẩu nguồn. Cất riêng, hạn chế quyền.
set -euo pipefail
cd "$(dirname "$0")/.."
C=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
umask 077
DIR="deploy/backup/$(date +%Y%m%d-%H%M)"
mkdir -p "$DIR"
"${C[@]}" exec -T postgres pg_dump -U vala_owner -Fc vala > "$DIR/vala.dump"
for v in vault-file vault-keys; do
  docker run --rm -v "vala_${v}:/v:ro" -v "$PWD/$DIR:/b" alpine tar czf "/b/${v}.tgz" -C /v .
done
ls -1dt deploy/backup/2* | tail -n +15 | xargs -r rm -rf
echo "Đã sao lưu vào $DIR ($(du -sh "$DIR" | cut -f1))"

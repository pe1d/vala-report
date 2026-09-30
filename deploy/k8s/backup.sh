#!/usr/bin/env bash
# Sao lưu: CSDL (pg_dump) + dữ liệu Vault (phiên/mật khẩu nguồn, đã mã hoá) + khoá mở Vault → deploy/backup/<thời điểm>/,
# giữ 14 bản. Gợi ý cron hằng đêm (crontab của người chạy được kubectl / sudo k3s):
#   15 2 * * *  /opt/vala-report/deploy/k8s/backup.sh >> /opt/vala-report/deploy/backup/backup.log 2>&1
# LƯU Ý: vault-keys.tgz chứa khoá mở Vault — ai có nó + vault-file.tgz là đọc được mật khẩu nguồn. Cất riêng, hạn chế quyền.
source "$(dirname "$0")/lib.sh"
umask 077
DIR="$ROOT/deploy/backup/$(date +%Y%m%d-%H%M)"
mkdir -p "$DIR"
k exec postgres-0 -- pg_dump -U vala_owner -Fc vala > "$DIR/vala.dump"
k exec vault-0 -- tar czf - -C /vault/file . > "$DIR/vault-file.tgz"
k exec vault-0 -- tar czf - -C /vault/keys . > "$DIR/vault-keys.tgz"
ls -1dt "$ROOT"/deploy/backup/2* | tail -n +15 | xargs -r rm -rf
echo "Đã sao lưu vào $DIR ($(du -sh "$DIR" | cut -f1))"

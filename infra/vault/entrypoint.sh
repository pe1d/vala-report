#!/bin/sh
# Khởi động Vault lưu bền + tự khởi tạo / mở khoá (một máy chủ, không có HSM/KMS).
#   - Lần đầu: `operator init` (1 khoá mở), lưu khoá + root token vào volume /vault/keys (chmod 600).
#   - Mỗi lần khởi động: mở khoá (unseal), bật kv-v2 ở `secret/` nếu chưa có, đảm bảo token ứng dụng
#     VAULT_APP_TOKEN (= VAULT_TOKEN trong .env) tồn tại với policy chỉ đọc/ghi `secret/*`, gia hạn token.
# Đánh đổi: khoá mở nằm cùng máy chủ với dữ liệu — chống mất dữ liệu khi khởi động lại, không chống người đã vào được
# máy chủ. Muốn chặt hơn: dùng auto-unseal qua KMS/HSM hoặc mở khoá tay.
set -eu
export VAULT_ADDR=http://127.0.0.1:8200
KEYS=/vault/keys/init.json

vault server -config=/vault/config/config.hcl &
PID=$!
trap 'kill -TERM $PID 2>/dev/null' TERM INT

# Đợi API lên (vault status: 0 = mở, 2 = đang khoá, 1 = lỗi/chưa lên).
i=0
until vault status >/dev/null 2>&1 || [ $? -eq 2 ]; do i=$((i+1)); [ $i -gt 60 ] && { echo "vault không lên"; exit 1; }; sleep 1; done

if vault status 2>/dev/null | grep -q 'Initialized *false'; then
  echo "[vault] khởi tạo lần đầu"
  umask 077
  vault operator init -key-shares=1 -key-threshold=1 -format=json > "$KEYS"
fi
UNSEAL=$(tr -d '\n ' < "$KEYS" | sed -n 's/.*"unseal_keys_b64":\["\([^"]*\)".*/\1/p')
ROOT=$(tr -d '\n ' < "$KEYS" | sed -n 's/.*"root_token":"\([^"]*\)".*/\1/p')
vault status 2>/dev/null | grep -q 'Sealed *true' && vault operator unseal "$UNSEAL" >/dev/null && echo "[vault] đã mở khoá"

export VAULT_TOKEN="$ROOT"
vault secrets list | grep -q '^secret/' || vault secrets enable -path=secret -version=2 kv >/dev/null
printf 'path "secret/*" { capabilities = ["create", "read", "update", "delete", "list"] }\n' | vault policy write vala-app - >/dev/null
if [ -n "${VAULT_APP_TOKEN:-}" ]; then
  vault token lookup "$VAULT_APP_TOKEN" >/dev/null 2>&1 || \
    vault token create -id="$VAULT_APP_TOKEN" -policy=vala-app -orphan -period=8760h -display-name=vala-app >/dev/null
  VAULT_TOKEN="$VAULT_APP_TOKEN" vault token renew >/dev/null 2>&1 || true
  echo "[vault] token ứng dụng sẵn sàng"
fi
unset VAULT_TOKEN ROOT UNSEAL
wait $PID

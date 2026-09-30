# Vault chế độ thật: dữ liệu (phiên/mật khẩu nguồn) lưu ra volume ⇒ KHÔNG mất khi khởi động lại máy chủ.
# (Trước 30/09/2026 chạy `server -dev` — lưu trong bộ nhớ, khởi động lại là mất hết phiên đã lưu.)
storage "file" {
  path = "/vault/file"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1          # chỉ lắng nghe trong máy chủ (cổng 8201 không mở ra ngoài)
}
disable_mlock = true
api_addr      = "http://127.0.0.1:8200"
ui            = false

Đặt chứng chỉ HTTPS ở đây để nginx tự bật HTTPS:
  fullchain.pem  (chứng chỉ + chuỗi trung gian)
  privkey.pem    (khoá riêng)
Không commit các file này. Docker Compose: không có ⇒ chạy HTTP.
k3s (deploy/k8s/deploy.sh): bắt buộc có — chưa có thì script hỏi tạo chứng chỉ tự ký tạm.

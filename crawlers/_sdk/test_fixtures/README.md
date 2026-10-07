# Dữ liệu test của `vala_sdk.WebForm`

Trang HTML thật chụp từ hệ thống ASP.NET WebForms giả lập (`tools/qlvb-webforms`), chỉ chứa dữ liệu mẫu. Chụp lại khi trang
giả lập đổi:

    docker compose --profile qlvb up -d qlvb-webforms
    python3 -I crawlers/_sdk/test_fixtures/chup.py crawlers/_sdk/test_fixtures

| Tệp | Trang |
|---|---|
| `van-ban-trang-1.html`, `van-ban-trang-4.html` | danh sách văn bản trang 1 / trang cuối (GridView phân trang) |
| `phat-hanh.html`, `phat-hanh-delta.txt` | màn hình phát hành và phản hồi UpdatePanel khi chọn sổ |
| `du-thao-loi.html` | tạo dự thảo thiếu trích yếu (ValidationSummary đang hiện) |
| `loi-event-validation.html` | HTTP 500 "Invalid postback or callback argument" |

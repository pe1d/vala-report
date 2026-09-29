# crawlers/

Chỉ còn **thư viện chung** `_sdk/vala_sdk.py` — "Đồng bộ Crawlab" luôn đẩy kèm tệp này cho mọi spider.

Mã spider (`main.py`) **không nằm trong repo nữa**: quản trị viết/sửa trên cổng, trang **Script crawl**
(lưu ở `core.crawl_spiders.main_py`). Thêm hệ thống nguồn mới:

1. *Hệ thống nguồn* → thêm hệ thống + adapter (capability có `sink`).
2. *Script crawl* → **Thêm spider** → chọn hệ thống, bảng dữ liệu, viết `main.py` (có khung mẫu dùng `vala_sdk`).
3. **Đồng bộ Crawlab** → mã được đẩy lên Crawlab và tạo lịch cho mọi preset.

Không cần sửa code hay triển khai lại. Spider cũ từng nằm ở đây đã được chép vào CSDL (xem lịch sử git nếu cần).

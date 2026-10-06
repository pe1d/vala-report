# Báo Cáo Chi Tiết Cuộc Họp Định Hướng Chiến Lược Sản Phẩm Vala AI Desktop (Par Desktop) & Kế Hoạch Phase 1

---

## 1. Tổng Quan & Định Hướng Chiến Lược

### 1.1 Chuyển Đổi Mô Hình Chiến Lược
Cuộc họp thống nhất bước chuyển đổi mang tính quyết định trong kiến trúc sản phẩm của công ty: **chuyển từ giải pháp dạng Plugin đơn lẻ sang xây dựng ứng dụng Par Desktop (Vala AI Desktop)**. 

Ứng dụng Par Desktop được định vị là sản phẩm tích hợp chung, đóng vai trò vỏ bao bọc (wrapper) và nền tảng trung tâm cho tất cả các hệ thống phần mềm hiện có tại các cơ quan, doanh nghiệp (bao gồm cả các hệ thống cũ, hệ thống bên thứ ba không có API chuẩn).

### 1.2 Vai Trò & Tầm Nhìn Sản Phẩm
* **Nền tảng tích hợp toàn diện:** Thay vì tích hợp rời rạc từng hệ thống qua ISO hay BV3 như trước, Par Desktop đóng vai trò là điểm truy cập duy nhất.
* **Tương đương Claude Desktop:** Định hướng phát triển Par Desktop trở thành giải pháp tương đương Claude Desktop, nơi người dùng vừa làm việc với các phần mềm nghiệp vụ, vừa tương tác với AI Agent để tự động hóa công việc.
* **Tầm quan trọng cốt lõi:** Đây là sản phẩm mang tính chất quyết định nhất đối với chiến lược triển khai của công ty cho cả khối hành chính công (KHOP) và khối doanh nghiệp.

---

## 2. Chi Tiết 5 Nhóm Yêu Cầu Kỹ Thuật & Tính Năng Cốt Lõi

### 2.1 Quản Lý Hệ Thống & Tài Khoản Tập Trung
* **Khai báo & Quản lý:** Người dùng sau khi đăng nhập vào ứng dụng Par Desktop sẽ khai báo danh sách tất cả các đường dẫn (URL), tài khoản và mật khẩu của các phần mềm nghiệp vụ đang dùng tại đơn vị.
* **Tiêu chuẩn bảo mật:** Lưu trữ thông tin tài khoản/mật khẩu tuân thủ nghiêm ngặt các tiêu chuẩn quản lý mật khẩu an toàn (tương tự Chrome Password Manager, hỗ trợ xác thực qua Windows Hello, sinh trắc học vân tay, khuôn mặt).
* **Duy trì phiên làm việc (Session Management):** Tự động duy trì phiên đăng nhập cho người dùng trên các hệ thống, loại bỏ việc phải đăng nhập thủ công lặp đi lặp lại.

### 2.2 Kiến Trúc MCP Server (Model Context Protocol)
Sản phẩm triển khai cơ chế MCP Server theo hai phương án linh hoạt tùy thuộc vào cấu hình thiết bị và đặc thù hệ thống:

1. **Phương án MCP Client-side (Chạy trực tiếp trên máy người dùng):**
   * Sử dụng cơ chế tương tác đa dạng với trang web: gọi API, thực thi JavaScript, hoặc mô phỏng thao tác người dùng (submit form, click button, quản lý state trang).
   * **Yêu cầu tải kịch bản động:** Ứng dụng client phải có cơ chế tự động tải các gói kịch bản tương tác (setup packages) từ Backend về khi có thay đổi hoặc bổ sung hệ thống mới mà **không cần phải nâng cấp toàn bộ ứng dụng Par Desktop**.
2. **Phương án MCP Backend-side (Chạy trên Server):**
   * Áp dụng giải pháp **OpenCrawl** chạy ở phía Backend đối với các trường hợp máy tính người dùng có cấu hình yếu hoặc không đủ điều kiện cài đặt kịch bản nặng tại Client.
3. **Duy trì phiên liên tục (Background Session):**
   * Cân nhắc đẩy cơ chế duy trì phiên của một số hệ thống lên Backend để chạy ngầm 24/7, đảm bảo không bị ngắt kết nối ngay cả khi người dùng chưa mở ứng dụng Desktop.

### 2.3 Đồng Nhất Điều Hướng & Can Thiệp Sự Kiện
* **Vấn đề tồn tại:** Các hệ thống web hiện tại có hành vi điều hướng không nhất quán khi người dùng click vào liên kết (lúc chuyển hướng trực tiếp trên trang hiện tại, lúc mở tab mới).
* **Giải pháp can thiệp:** Par Desktop hoạt động như một trình duyệt chuyên dụng, can thiệp trực tiếp vào các sự kiện click để đồng nhất trải nghiệm:
  * Ép buộc mở giao diện làm việc dưới dạng **Pop-up** hoặc **Tab mới**.
  * Cho phép đóng Pop-up/Tab sau khi hoàn thành thao tác để trả về trạng thái màn hình gốc mà không làm mất ngữ cảnh công việc.

### 2.4 Chèn Mã Sửa Lỗi Giao Diện (JavaScript/CSS Injection)
* **Khả năng làm chủ giao diện:** Do Par Desktop làm chủ môi trường hiển thị, ứng dụng cho phép cấu hình và chèn (inject) trực tiếp các đoạn mã JavaScript hoặc CSS vào các trang web bên thứ ba khi tải.
* **Mục đích:** Khắc phục nhanh các lỗi giao diện, lỗi tương thích trình duyệt hoặc điều chỉnh bố cục trang web gốc mà không cần phụ thuộc vào bên phát triển hệ thống gốc.

### 2.5 Tích Hợp AI Agent & Giao Diện Chat (Agentic Interface)
* **Báo cáo Thống kê:** AI tự động thu thập dữ liệu từ các hệ thống thành phần để tổng hợp thành màn hình báo cáo tổng quan cho người dùng.
* **Mô Phỏng Thao Tác:** AI đóng vai trò người trợ lý thực thi các hành động trên hệ thống gốc thay cho người dùng.
* **Giao Diện Chat & Tạo Kịch Bản:**
  * Cung cấp khung Chat cho phép người dùng giao tiếp tự nhiên để ra lệnh (ví dụ: *"Tổng hợp lịch họp và nhiệm vụ trong ngày"*).
  * Hỗ trợ xuất kết quả dưới dạng nhiều công cụ (Tools): file văn bản, **Artifacts**, bản báo cáo **HTML** trực quan.

---

## 3. Kế Hoạch & Yêu Cầu Chi Tiết Phase 1 (Giai Đoạn 1)

### 3.1 Cấu Trúc Ứng Dụng & Chạy Ngầm
* **Windows Service:** Bản Par Desktop Phase 1 phải được đóng gói dưới dạng dịch vụ chạy ngầm trên Windows (**Windows Service / System Tray**).
* **Đảm bảo duy trì:** Khi người dùng tắt giao diện làm việc chính, dịch vụ ngầm vẫn duy trì phiên đăng nhập và thực hiện các tác vụ thu thập dữ liệu định kỳ.
* **Tách biệt kịch bản:** Toàn bộ kịch bản tương tác, logic xử lý phải tách biệt hoàn toàn khỏi giao diện UI và được tải động từ Backend.

### 3.2 Hai Bài Toán Nghiệp Vụ Trọng Tâm Phase 1
1. **Bài toán 1 (Thu thập thông tin):** Xây dựng giải pháp thu thập dữ liệu tổng hợp thay thế hoàn toàn giải pháp BV3 cũ.
2. **Bài toán 2 (Mô phỏng 4 nghiệp vụ Quản lý Văn bản BKVO đè lên hệ thống gốc):**
   Mục tiêu là cho phép người dùng thao tác hoàn toàn trên giao diện **BKVO**, trong khi Par Desktop tự động mô phỏng lại 100% thao tác tương ứng đè lên hệ thống quản lý văn bản gốc (VMPD hoặc Vele) tại đơn vị thử nghiệm (Núi Thành hoặc Đan Phượng).

### 3.3 Chi Tiết 4 Nghiệp Vụ Văn Bản Cần Mô Phỏng
* **Nghiệp vụ 1: Khởi tạo / Dự thảo Văn bản mới:**
  * Lấy danh sách văn bản dự thảo từ hệ thống gốc về hiển thị trên BKVO.
  * Khi người dùng nhập thông tin dự thảo trên BKVO và bấm *"Lưu dự thảo"*, Par Desktop tự động đẩy dữ liệu tương ứng để khởi tạo và lưu bản thảo xuống hệ thống gốc.
* **Nghiệp vụ 2: Chuyển Văn bản:**
  * Mở giao diện chuyển văn bản trên BKVO (mô phỏng chính xác các lựa chọn người nhận từ hệ thống gốc).
  * Cho phép người dùng chọn người nhận, nhập ý kiến xử lý, đính kèm tệp và bấm gửi.
  * Par Desktop tự động thực thi hành động submit chuyển văn bản trên hệ thống gốc.
* **Nghiệp vụ 3: Cho Ý Kiến / Bổ Sung Xử Lý:**
  * Cho phép người dùng mở chi tiết văn bản, xem nội dung và bổ sung ý kiến xử lý theo vai trò người dùng hiện tại.
* **Nghiệp vụ 4: Phát Hành Văn Bản:**
  * Thực hiện quy trình hoàn tất và phát hành văn bản chính thức trên hệ thống.

---

## 4. Quản Lý Tiến Độ, Công Việc Nội Bộ & Phương Pháp Làm Việc Với AI

### 4.1 Chuẩn Hóa Quản Lý Dự Án & Tiến Độ
* **Quản lý theo OKR:** Đôn đốc nhân sự kiểm tra tiến độ hàng ngày dựa trên danh sách OKR đã đăng ký.
* **Xử lý tồn tại dự án của Văn:** Yêu cầu Văn lập tức bổ nhỏ các nhóm công việc của dự án, đưa lên file quản lý chung; loại bỏ tình trạng giao việc trực tiếp phát sinh không qua kế hoạch.
* **Theo dõi công việc của Điệp:** Giao nhân sự theo dõi sát rổ công việc của Điệp để kịp thời phối hợp.

### 4.2 Quy Định Ghi Âm & Làm Biên Bản Cuộc Họp
* Yêu cầu nhân sự phụ trách tham gia đầy đủ tất cả các cuộc họp nội bộ và cuộc họp dự án.
* Bật chức năng ghi âm cuộc họp, tiến hành bóc băng và xuất biên bản họp chính xác để lưu trữ làm đầu bài triển khai.

### 4.3 Định Hướng Phương Pháp Làm Việc Với AI
* **Tư duy chuyên gia:** Xác định AI là một chuyên gia có khả năng thực thi toàn bộ yêu cầu, nhưng người quản lý phải hình dung rõ ràng về **kết quả sản phẩm cuối cùng**.
* **Đầu bài chi tiết:** Mô tả yêu cầu kỹ thuật và kịch bản sử dụng càng rõ ràng, tỉ mỉ từng bước thì kết quả AI tạo ra càng chất lượng.
* **Tập trung nguồn lực:** Yêu cầu nhân sự chính tập trung 100% thời gian cho dự án Par Desktop Phase 1 (dự kiến hoàn thành bản thử nghiệm trong vòng khoảng 1 tuần).

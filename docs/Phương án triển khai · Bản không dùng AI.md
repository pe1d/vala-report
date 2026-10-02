Phương án triển khai · Bản không dùng AI · Giai đoạn nội bộ

# Scheduled Reporting Platform

> **Cập nhật 10/2026:** mô hình lấy dữ liệu đã đổi so với bản này — Vala lấy **dữ liệu cá nhân** của từng người dùng
> (mỗi người tự kết nối tài khoản của mình), không dùng tài khoản dịch vụ và không làm báo cáo theo phòng ban. Xem mục
> **11 · Điều chỉnh 10/2026** ở cuối tài liệu: lý do, hệ quả, phần giữ nguyên và lộ trình tiếp theo.

Không có mô hình ngôn ngữ nào trong sản phẩm. Người dùng chọn báo cáo từ danh mục có sẵn và tự đặt lịch chạy; Crawlab thực thi spider theo lịch; dữ liệu tích luỹ trong kho riêng. Giai đoạn đầu dựng cho nội bộ, kết nối ba hệ thống dùng chung một SSO.

LLM trong sản phẩm · **không có** Phạm vi đầu · **eGov · eTask · bMail** Xác thực · **một SSO cho cả ba** Kích hoạt · **lịch do người dùng đặt** Lấy lại được · **dữ liệu lịch sử**

01

## Bỏ AI thì mất gì, được gì

Bỏ lớp mô hình ngôn ngữ không chỉ là bỏ chatbot — nó bỏ luôn khả năng hiểu câu hỏi tự do. Người dùng không còn gõ “tổng hợp văn bản đã kết thúc quý này theo phòng ban” và nhận về một dashboard sinh ra tại chỗ. Thay vào đó, đội triển khai định nghĩa sẵn một danh mục báo cáo; người dùng chọn báo cáo, điền tham số, đặt lịch, và xem kết quả trong một template cố định. Sản phẩm chuyển từ “hỏi gì cũng được” sang “báo cáo có sẵn, chạy đúng giờ”.

Đổi lại, ba thứ đáng giá quay về. **Dữ liệu lịch sử**: vì có lịch chạy nền, kho dữ liệu tích luỹ theo thời gian, nên mới trả lời được “so với tháng trước” — thứ mà bản chạy theo prompt không làm được. **Tính tất định**: cùng một tham số luôn cho cùng một con số, không có chuyện mô hình đọc sai một ô hay diễn giải khác đi giữa hai lần chạy; với báo cáo hành chính, đây không phải điều xa xỉ mà là yêu cầu. **Không có dữ liệu nào rời khỏi tổ chức để tới một mô hình bên thứ ba** — riêng điều này có thể là khác biệt quyết định khi làm việc với khách hàng khối nhà nước hoặc có yêu cầu bảo mật ngặt.

Cái giá lớn nhất không phải kỹ thuật mà là mô hình vận hành: mỗi báo cáo mới đều cần đội triển khai cấu hình, nên tốc độ đáp ứng nhu cầu khách hàng phụ thuộc vào nhân lực của bạn, không còn co giãn theo trí tưởng tượng của người dùng.

02

## Phạm vi giai đoạn đầu

Dựng cho nội bộ trước, ba hệ thống, một SSO. Việc thu hẹp này bỏ đi phần lớn rủi ro nặng nhất của phương án — nhưng cũng đặt ra một rủi ro mới mà ba hệ thống rời rạc không có.

### eGov

đã khảo sát

Ba endpoint thật đứng sau màn hình “Văn bản mới kết thúc” đã được xác định và chạy thử thành công, adapter mẫu đã có.

Cách nối

API nội bộ, không cần đọc DOM

Dữ liệu

Trích yếu, số ký hiệu, ngày nhận, người tạo, ngày tạo

Còn lại

Chuyển script hiện có thành spider chạy trên Crawlab

### eTask

cần khảo sát

Cùng nhà sản xuất với eGov nên nhiều khả năng dùng chung khung JS và cùng quy ước gọi API — nếu đúng, thời gian khảo sát ngắn hơn hẳn hệ thống lạ. Cần kiểm chứng trước khi tính vào tiến độ.

Cách nối

Dự kiến API nội bộ, xác nhận khi khảo sát

Việc đầu tiên

Bắt request của hai, ba màn hình chính, đối chiếu với khung của eGov

### bMail

khác loại

Đây là hệ thống khác hẳn hai cái kia về bản chất. Trước khi nghĩ tới việc đọc giao diện, cần kiểm tra xem có IMAP không — nếu có thì dùng IMAP, vì đó là giao thức chuẩn, ổn định, không gãy khi đổi giao diện.

Cách nối

Ưu tiên IMAP; chỉ scrape khi không còn cách khác

Cần chốt sớm

Lấy metadata (người gửi, tiêu đề, thời gian) hay cả nội dung — quyết định này ảnh hưởng toàn bộ chính sách bảo mật của kho dữ liệu

Vì cả ba đăng nhập qua cùng một SSO, phần xác thực gọn hơn nhiều so với kịch bản mỗi hệ thống một kiểu: một lần đăng nhập vào SSO, đi theo chuỗi chuyển hướng, và nhận về phiên ứng dụng của từng hệ thống. Vault chỉ cần giữ một bộ thông tin đăng nhập dịch vụ thay vì ba, và worker làm mới cũng chỉ có một luồng.

Mặt trái nằm ngay ở đó: **một tài khoản bị lộ là cả ba hệ thống bị lộ**, và với bMail thì đó là hộp thư chứ không phải danh sách văn bản. Tài khoản dịch vụ cho giai đoạn này cần được cấp quyền hẹp nhất có thể trên từng hệ thống, và phải nằm trong quy trình rà soát quyền định kỳ của bộ phận quản trị nội bộ.

Bù lại, triển khai nội bộ xoá sạch bốn thứ tốn công nhất khi bán ra ngoài: không có vấn đề điều khoản dịch vụ với nhà cung cấp bên ngoài, không cần chữ ký an ninh của từng khách hàng, không phải trả lời câu hỏi dữ liệu nằm ở hạ tầng của ai, và chưa phải tách nhiều khách hàng. Dù vậy vẫn nên giữ cấu trúc tách theo đơn vị ngay từ đầu — thêm đơn vị thứ hai khi đó gần như không tốn gì, còn gắn vào sau thì rất đắt.

03

## Ba phương án cạnh nhau

Bấm vào một dòng để xem vì sao tiêu chí đó quan trọng. Cột được tô là phương án của tài liệu này.

| Tiêu chí | A · ingest nền + chatbot | B · trình duyệt + chatbot | C · lịch + báo cáo |
| -------- | ------------------------ | ------------------------- | ------------------ |

04

## Kiến trúc

Hai đường đi tách rời nhau hoàn toàn: đường nạp dữ liệu chạy theo lịch, đường phục vụ báo cáo chỉ đọc từ kho. Người dùng không bao giờ chờ hệ thống nguồn.

Chọn một khối để xem trách nhiệm

Đường nạp dữ liệu — chạy theo lịch, không có người ngồi chờ Đường phục vụ — chỉ đọc từ kho, không chạm hệ thống nguồn

Khối được chọn Crawlab

Nhật ký luồng Chưa chạy luồng nào

1. Bấm một trong ba nút ở trên để xem dữ liệu đi qua sơ đồ theo từng bước.

05

## Người dùng thấy gì

Đây là chỗ thay thế cho ô chat. Người dùng không viết câu hỏi — họ chọn báo cáo, điền tham số và đặt lịch. Đổi lịch bên dưới để xem các lần chạy kế tiếp được tính ra.

Cổng báo cáo · Đặt lịch chạy phác thảo giao diện — không nối hệ thống thật

Báo cáo

Văn bản đã kết thúc theo phòng ban _egov.bkav.com_

Khoảng thời gian

Tháng hiện tại _tự trượt theo ngày chạy_

Phạm vi

Phòng ban của tôi và cấp dưới _theo phân quyền_

Lịch chạy

Các lần chạy kế tiếp

Đừng đưa Crawlab cho người dùng cuối

Crawlab là công cụ vận hành dành cho kỹ sư: nó phơi ra mã spider, biến môi trường, node, log thô. Kế toán hay văn thư của khách hàng không nên nhìn thấy màn hình đó, và cũng không nên có quyền sửa spider. Lịch phải được đặt qua cổng báo cáo của bạn, rồi cổng này gọi API của Crawlab để tạo và sửa lịch bên dưới — người dùng chỉ thấy “hàng ngày 7:00”, còn cron expression là chuyện nội bộ.

06

## Dữ liệu crawl về lưu ở đâu

Điều quan trọng nhất phải chốt trước khi viết spider đầu tiên: kho MongoDB mặc định của Crawlab **không** phải nơi lưu chính thức. Chọn một lớp để xem vai trò và lược đồ của nó.

Đừng lấy kho của Crawlab làm nơi lưu chính thức

Nếu spider gọi `save_item()` theo quy ước của Crawlab, dữ liệu rơi vào MongoDB nội bộ và hiện ở tab Data. Chỗ đó tốt để kỹ sư soi kết quả lúc debug, nhưng nó không có lược đồ ràng buộc, không tách theo đơn vị, vòng đời dữ liệu gắn với nhu cầu vận hành của Crawlab, và quan trọng nhất là khoá mô hình dữ liệu của bạn vào một công cụ bên thứ ba mà sau này có thể muốn thay. Crawlab giữ đúng vai lịch chạy, worker và log; spider ghi thẳng vào kho của bạn.

```

```

### Lưu lịch sử thế nào cho khỏi phình

Hệ thống nguồn chỉ cho thấy trạng thái hiện tại, nên mỗi lần chạy là một lát cắt. Nếu cứ ghi lại toàn bộ bản ghi sau mỗi lần chạy thì với lịch hàng giờ, dung lượng tăng rất nhanh mà phần lớn là bản sao y hệt nhau. Vì mỗi văn bản có định danh ổn định, cách gọn hơn là băm bản ghi đã chuẩn hoá rồi chỉ ghi khi hash đổi, kèm `valid_from` và `valid_to`. Vừa nhỏ hơn nhiều lần, vừa trả lời được câu “văn bản này chuyển trạng thái lúc nào” — thứ mà lưu lát cắt phẳng không cho bạn.

### Vì sao PostgreSQL chứ không phải MongoDB

Lý do chính không phải hiệu năng — quy mô dữ liệu văn bản hành chính nằm gọn trong tầm của cả hai. Lý do là **row-level security ở tầng cơ sở dữ liệu**. Tầng phân quyền ở mục 07 là chỗ mà một lỗi làm lộ dữ liệu của cả đơn vị; quy tắc “mặc định từ chối” được cưỡng chế ngay trong database thì an toàn hơn hẳn so với chỉ nằm trong code ứng dụng, nơi một truy vấn quên mệnh đề lọc là đủ gây rò rỉ.

```
-- phân quyền cưỡng chế ở tầng database, không chỉ trong code
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_scope ON documents FOR SELECT
  USING (phong_ban_id = ANY (current_setting('app.phong_ban_cho_phep')::bigint[]));

-- không policy nào khớp ⇒ không trả về dòng nào. Mặc định là từ chối.
```

### Tách đơn vị và vòng đời dữ liệu

Mỗi đơn vị một schema riêng trong cùng một database là mức hợp lý nhất: đủ mạnh để giải trình với bộ phận an ninh, mà vẫn vận hành được khi số đơn vị tăng. Database riêng chỉ dành cho nơi nào yêu cầu. Bảng dùng chung với một cột `tenant_id` là mô hình dễ vận hành nhất nhưng cũng dễ rò nhất — không nên dùng cho loại dữ liệu này. Giai đoạn nội bộ chỉ có một đơn vị, nhưng vẫn nên dựng theo cấu trúc này ngay, vì thêm đơn vị thứ hai khi đó gần như không tốn gì.

Về vòng đời: lớp thô giữ 30–90 ngày rồi nén hoặc đẩy sang object storage; lớp chuẩn hoá giữ theo chính sách lưu trữ của đơn vị; lớp tổng hợp có thể dựng lại bất cứ lúc nào nên không cần sao lưu riêng. Nếu sau này có báo cáo cần tới file đính kèm, file đi vào object storage chứ không nhét vào database — phạm vi hiện tại chưa cần.

07

## Phân quyền — phần phải tự xây lại

Đây là cái giá kỹ thuật lớn nhất của việc quay về mô hình chạy nền. Khi spider dùng tài khoản dịch vụ, kho dữ liệu chứa mọi thứ tài khoản đó nhìn thấy — thường là toàn bộ đơn vị. Không còn cơ chế nào tự động giới hạn mỗi người xem đúng phần của họ, nên bạn phải dựng lại tầng phân quyền, và dựng đúng.

Với dữ liệu kiểu egov, mỗi bản ghi đã mang sẵn thông tin để làm việc đó: `UserCurrentId`, `NodeCurrentId`, phòng ban của người tạo. Việc cần làm là đồng bộ cây tổ chức từ hệ thống nguồn về, ánh xạ tài khoản người xem sang tài khoản bên hệ thống nguồn, rồi lọc ở tầng truy vấn theo ánh xạ đó.

Ba quy tắc nên chốt ngay từ đầu, vì sửa sau rất đắt. Thứ nhất, **mặc định là từ chối**: bản ghi không khớp được với một quy tắc cho phép nào thì không hiển thị, thay vì hiển thị rồi lọc sau. Thứ hai, ánh xạ tổ chức phải được đồng bộ lại theo lịch, vì người chuyển phòng ban hay nghỉ việc mà ánh xạ cũ vẫn còn là một lỗ rò. Thứ ba, tài khoản dịch vụ nên có quyền hẹp nhất vẫn đủ cho các báo cáo trong danh mục — đừng dùng tài khoản quản trị cho tiện, vì mọi thứ nó thấy đều sẽ nằm trong kho của bạn.

Rủi ro đặc trưng của phương án này

Ở bản chạy theo prompt, một lỗi phân quyền chỉ ảnh hưởng đúng người đang hỏi. Ở bản này, một lỗi phân quyền làm lộ dữ liệu của cả đơn vị cho bất kỳ ai mở được báo cáo. Cùng một loại lỗi, nhưng hậu quả khác hẳn về quy mô — nên tầng này cần kiểm thử riêng, có bộ test cố định với nhiều vai người dùng khác nhau.

08

## SSO và chỗ lưu phiên

Vì crawl chạy lúc 3 giờ sáng khi không ai ngồi trước máy, cách lấy phiên từ trình duyệt người dùng không dùng được ở đây. Phiên phải nằm trong một vault do hệ thống giữ, cùng với worker tự làm mới.

Với phạm vi giai đoạn đầu, việc này gọn hơn hẳn trường hợp tổng quát: cả ba hệ thống dùng chung một SSO, nên chỉ có **một luồng đăng nhập**. Worker đăng nhập vào SSO một lần, đi theo chuỗi chuyển hướng sang từng ứng dụng, và nhận về phiên riêng của eGov, eTask, bMail — mỗi ứng dụng vẫn có cookie phiên riêng của nó sau bước đó. Vault giữ một bộ thông tin đăng nhập dịch vụ, và ba phiên ứng dụng phái sinh kèm thời điểm hết hạn của từng cái. Khi một phiên ứng dụng hỏng mà SSO vẫn còn hiệu lực, chỉ cần lấy lại đúng phiên đó chứ không phải đăng nhập lại từ đầu.

Một điểm hay bị bỏ qua: **nên dùng tài khoản dịch vụ riêng, đừng mượn phiên của một nhân viên thật**. Không phải vì kỹ thuật mà vì truy vết. Nhật ký của hệ thống nguồn sẽ ghi nhận tài khoản đó truy cập hàng loạt văn bản lúc 3 giờ sáng mỗi ngày; nếu đó là tài khoản của một người cụ thể, bạn vừa tạo ra một vệt log rất khó giải thích khi có sự cố, và người đó phải chịu trách nhiệm cho những hành vi họ không thực hiện. Một tài khoản mang tên rõ ràng như `svc-report-bot` khiến nhật ký đọc được và kiểm toán được.

Đổi lại, tài khoản dịch vụ cần được khách hàng cấp chính thức, có chủ sở hữu, và nằm trong quy trình rà soát quyền định kỳ của họ — nghĩa là phải làm việc với bộ phận quản trị hệ thống của khách hàng ngay từ khi onboard, không phải xin tạm một tài khoản rồi tính sau.

09

## Rủi ro

Nhóm rủi ro về mô hình ngôn ngữ biến mất hoàn toàn. Đổi lại, nhóm về kho dữ liệu tập trung và về tài khoản dịch vụ nặng hơn hẳn hai bản trước.

Mức độ

| Rủi ro | Mức độ | Nhóm | Giảm thiểu |
| ------ | ------ | ---- | ---------- |

10

## Lộ trình

Ngắn và ít rủi ro công nghệ hơn hai bản trước, vì mọi thành phần đều là hạ tầng đã quen thuộc. Phần lâu nhất là cổng báo cáo và tầng phân quyền.

Điều đáng cân nhắc nhất

## Bản này không phải ngõ cụt của bản kia

Thứ tốn công nhất ở đây — spider tất định, vault, kho dữ liệu chuẩn hoá có lịch sử, tầng phân quyền — cũng chính là thứ một lớp hỏi đáp bằng AI sẽ cần nếu sau này bạn thêm vào. Khi đó chatbot không phải đi crawl gì cả: nó chỉ dịch câu hỏi thành một truy vấn trên kho dữ liệu đã có, với phân quyền đã được áp sẵn — rẻ hơn, nhanh hơn và an toàn hơn nhiều so với để mô hình trực tiếp điều khiển việc lấy dữ liệu.

Nói cách khác, nếu chưa chắc về việc đưa AI vào sản phẩm, làm bản này trước là lựa chọn giữ được cả hai đường. Còn nếu giá trị bán hàng cốt lõi nằm ở chỗ “hỏi gì cũng trả lời được”, thì bản này không thay thế được — nó là một sản phẩm khác, cho một kỳ vọng khác.

11

## Điều chỉnh 10/2026 — Vala lấy dữ liệu cá nhân

Sau khi dựng và chạy thật với eGov, eTask, mô hình lấy dữ liệu ở mục 07–08 được đổi. Phần này ghi lại quyết định, lý do
và hệ quả để những người đọc tài liệu sau không hiểu nhầm bản gốc là bản đang chạy.

### Quyết định

**Vala là công cụ lấy và báo cáo dữ liệu công việc của chính người dùng.** Mỗi người tự kết nối tài khoản eGov, eTask… của
mình; hệ thống lấy dữ liệu theo lịch người đó đặt (và tự cập nhật khi người đó đang dùng); mỗi người chỉ xem được dữ liệu
của mình. Không có tài khoản dịch vụ, không có báo cáo theo phòng ban.

### So với bản gốc

| Nội dung | Bản gốc | Đang chạy |
| -------- | ------- | --------- |
| Ai đi lấy dữ liệu | Một tài khoản dịch vụ (`svc-report-bot`) cho cả đơn vị | Từng người dùng, bằng phiên / uỷ quyền của chính họ |
| Lấy phiên | Worker tự đăng nhập SSO, không dùng phiên của nhân viên | Tiện ích trình duyệt gửi phiên của người dùng (đang dùng); uỷ quyền SSO (đang chờ xác nhận, xem dưới) |
| Báo cáo | Cho lãnh đạo, phạm vi "phòng ban của tôi và cấp dưới" | Cá nhân; đã bỏ phạm vi đơn vị trên giao diện |
| Phân quyền | Đồng bộ cây tổ chức, ánh xạ tài khoản, RLS theo phòng ban | RLS "ai xem dữ liệu nấy" (`records_own`) |
| Phạm vi hệ thống | eGov, eTask, bMail | eGov, eTask; bMail chưa làm |

Giữ nguyên như bản gốc: kho PostgreSQL có RLS, lưu lịch sử theo băm (`valid_from`/`valid_to`), lớp thô giữ 90 ngày, tách
schema theo đơn vị, danh mục báo cáo do quản trị dựng (nay không cần viết code), Crawlab không lộ ra người dùng cuối, lịch
do người dùng đặt (nay gắn theo nguồn dữ liệu).

### Vì sao đổi

1. **Bkav SSO có xác thực 2 lớp (OTP).** Tài khoản máy không tự đăng nhập lúc 3 giờ sáng được, trừ khi được miễn OTP hoặc
   có cơ chế đăng nhập cho máy — chưa có.
2. **API của eGov, eTask trả dữ liệu "của tôi"** (thư mục xử lý của người đang đăng nhập, việc được giao cho người đó). Tài
   khoản dịch vụ gọi các API này chỉ thấy dữ liệu của chính nó; muốn số liệu cả đơn vị cần API cấp đơn vị — hiện không có.

Lấy theo từng người là cách duy nhất có dữ liệu thật ngay, và tự nhiên đúng phân quyền: ai cũng chỉ lấy được thứ họ vốn
được xem trên hệ thống nguồn.

### Hệ quả và cách xử lý

- **Không có báo cáo cấp đơn vị.** Tổng hợp nhiều người chỉ cộng được dữ liệu của những người đã kết nối — không đủ tin cậy
  cho báo cáo hành chính, nên không làm.
- **Truy vết:** nhật ký hệ thống nguồn ghi nhận tài khoản người dùng truy cập theo lịch. Chấp nhận được vì đó là dữ liệu
  của chính họ, do họ tự kết nối và tự đặt lịch; cần ghi rõ điều này lúc người dùng kết nối (sự đồng ý) và trong quy chế
  sử dụng nội bộ.
- **Phiên dễ gãy** (eTask hay mất phiên, phải cài tiện ích). Đây là việc chính của giai đoạn tới.

### Lộ trình tiếp theo (giai đoạn 3 — lấy dữ liệu cá nhân ổn định hơn)

1. **Uỷ quyền qua SSO thay cho tiện ích.** Người dùng đăng nhập SSO một lần (nhập OTP lúc đó); Vala giữ token tự gia hạn
   và tự lấy dữ liệu, không cần tiện ích. Code đã có sẵn nhưng **dựa trên giả định chưa kiểm chứng** — cần đội SSO / eGov /
   eTask trả lời các câu hỏi bên dưới rồi mới hoàn thiện theo đúng cách chạy được.
2. **Đề xuất API "văn bản của tôi" / "công việc của tôi"** cho eGov, eTask, nhận token của bước 1 (kèm các trường còn
   thiếu, vd tên người đang xử lý văn bản).
3. **Kết nối bằng mã truy cập cá nhân** (personal access token) — khi cần thêm hệ thống như Jira, GitLab, Redmine.
4. **Tiện ích trình duyệt** giữ làm phương án cuối, không thêm tính năng.
5. **bMail** (theo bản gốc): mô hình cá nhân ⇒ IMAP bằng tài khoản của chính người dùng; làm sau khi bước 1 ổn.

Tạm dừng: hướng đóng gói cho khách hàng bên ngoài (cơ quan nhà nước). Phần đã làm — cấu hình nhận diện của đơn vị, đăng
nhập cổng bằng SSO chuẩn OIDC — giữ lại, không phải ưu tiên.

### Câu hỏi cần đội Bkav SSO / eGov / eTask trả lời

Gửi đội **Bkav SSO** (iam.bkav.com, WSO2):

1. Cấp được cho Vala một **client OAuth2** (confidential, authorization code) có **`offline_access`** (refresh token) không?
   Redirect URI: `{địa chỉ cổng Vala}/api/v1/sso/callback`.
2. Refresh token sống bao lâu, có xoay vòng không, có bị thu hồi khi người dùng đổi mật khẩu / đăng xuất không?
3. Lấy phiên eGov/eTask từ token: trang `/oauth2/authorize` có nhận **access token dạng Bearer** để coi như người dùng đã
   đăng nhập (không hỏi lại mật khẩu, OTP) không? Nếu không, WSO2 có bật được **token exchange** hoặc cơ chế tương đương
   cho client này không?
4. Phiên SSO trên trình duyệt (cookie `BkavSSOv2`) sống bao lâu; có cấu hình "ghi nhớ đăng nhập" dài hơn được không?

Gửi đội **eGov**, **eTask**:

5. API hiện tại (eGov `/home/GetDocuments`, eTask `serviceetask…`) có nhận **access token của Bkav SSO** trong header
   `Authorization: Bearer …` thay cho cookie phiên không? Nếu có, Vala gọi thẳng API bằng token, khỏi cần phiên trình duyệt.
6. Nếu chưa: có thể mở một API chỉ đọc "văn bản của tôi" / "công việc của tôi" nhận token đó không? Cần thêm trường **tên
   người đang xử lý** (hiện chỉ có `UserCurrentId`).
7. (eTask) Vì sao phiên phụ thuộc giá trị `meId` / `companyId` chỉ có khi tab đang mở — API có nhận được các giá trị này
   qua tham số / header thay vì cookie do JavaScript đặt không?

Câu 3 và 5 quyết định cách làm bước 1: nếu API nhận Bearer token (câu 5) ⇒ Vala gọi thẳng API, đơn giản và bền nhất; nếu chỉ
có câu 3 ⇒ đổi token lấy phiên ứng dụng như code hiện có; nếu cả hai đều không ⇒ giữ tiện ích, chờ API ở bước 2.


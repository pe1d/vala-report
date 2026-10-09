// Sinh src/app-icons-data.ts: bộ biểu tượng ứng dụng chọn lọc từ Lucide (lucide-static, giấy phép ISC — bản kế thừa
// Feather), chia nhóm + từ khoá tiếng Việt để tìm. Chạy lại khi thêm biểu tượng:  node packages/ui/scripts/gen-app-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nodes = require('lucide-static/icon-nodes.json');
const version = require('lucide-static/package.json').version;

/** Nhóm ⇒ [tên Lucide, từ khoá tiếng Việt]. */
const GROUPS = {
  lien_lac: [
    ['mail', 'thư email hộp thư'], ['mails', 'thư email nhiều'], ['mail-open', 'thư đã đọc'], ['mailbox', 'hộp thư'], ['inbox', 'hộp thư đến'],
    ['send', 'gửi'], ['message-square', 'tin nhắn chat'], ['message-circle', 'tin nhắn trò chuyện'], ['messages-square', 'tin nhắn nhóm'],
    ['phone', 'điện thoại gọi'], ['video', 'họp trực tuyến video'], ['bell', 'thông báo chuông'], ['megaphone', 'thông báo loa'],
    ['at-sign', 'email'], ['contact', 'danh bạ liên hệ'], ['users', 'người dùng nhóm danh bạ'], ['user', 'người dùng cá nhân'],
    ['user-check', 'người dùng duyệt'], ['user-cog', 'quản trị người dùng'], ['id-card', 'thẻ hồ sơ'], ['handshake', 'hợp tác'],
    ['headphones', 'hỗ trợ'], ['rss', 'tin tức'], ['share-2', 'chia sẻ'],
  ],
  van_ban: [
    ['file-text', 'văn bản tài liệu'], ['files', 'văn bản nhiều tài liệu'], ['file-check', 'văn bản đã duyệt'], ['file-pen-line', 'soạn thảo văn bản'],
    ['file-plus', 'tạo văn bản'], ['file-search', 'tra cứu văn bản'], ['file-spreadsheet', 'bảng tính excel'], ['file-archive', 'lưu trữ nén'],
    ['folder', 'thư mục'], ['folder-open', 'thư mục mở'], ['folders', 'thư mục nhiều'], ['archive', 'lưu trữ'], ['book-open', 'sách tài liệu'],
    ['book', 'sách'], ['book-marked', 'sổ tay'], ['library', 'thư viện'], ['notebook', 'sổ ghi chép'], ['notebook-pen', 'ghi chép'],
    ['clipboard-list', 'danh sách hồ sơ'], ['clipboard-check', 'kiểm tra hồ sơ'], ['scroll-text', 'quyết định nghị quyết'], ['newspaper', 'báo tin tức'],
    ['stamp', 'con dấu ban hành'], ['signature', 'chữ ký số'], ['pen-line', 'ký soạn'], ['printer', 'in'], ['paperclip', 'đính kèm'],
  ],
  cong_viec: [
    ['briefcase', 'công việc'], ['square-check', 'nhiệm vụ hoàn thành'], ['list-checks', 'danh sách việc'], ['list-todo', 'việc cần làm'],
    ['square-kanban', 'bảng công việc kanban'], ['kanban', 'kanban tiến độ'], ['calendar', 'lịch'], ['calendar-days', 'lịch làm việc'],
    ['calendar-check', 'lịch họp đã đặt'], ['clock', 'giờ thời gian'], ['alarm-clock', 'nhắc việc'], ['timer', 'hẹn giờ'], ['target', 'mục tiêu'],
    ['flag', 'cờ ưu tiên'], ['workflow', 'quy trình'], ['network', 'sơ đồ tổ chức'], ['presentation', 'thuyết trình họp'], ['projector', 'phòng họp'],
    ['vote', 'biểu quyết bầu cử'], ['hand-helping', 'hỗ trợ dịch vụ công'], ['ticket', 'phiếu yêu cầu'],
  ],
  bao_cao: [
    ['chart-column', 'báo cáo biểu đồ cột'], ['chart-bar-big', 'báo cáo thống kê'], ['chart-line', 'biểu đồ đường xu hướng'], ['chart-pie', 'biểu đồ tròn'],
    ['chart-no-axes-combined', 'phân tích'], ['trending-up', 'tăng trưởng'], ['gauge', 'chỉ số đo'], ['activity', 'hoạt động giám sát'],
    ['layout-dashboard', 'bảng điều khiển dashboard'], ['table', 'bảng dữ liệu'], ['database', 'cơ sở dữ liệu hệ thống nguồn'], ['server', 'máy chủ'],
    ['hard-drive', 'ổ lưu trữ'], ['cloud', 'đám mây'], ['layers', 'lớp tầng'],
  ],
  co_quan: [
    ['landmark', 'cơ quan nhà nước'], ['building', 'tòa nhà cơ quan'], ['building-2', 'đơn vị công ty'], ['school', 'trường học giáo dục'],
    ['graduation-cap', 'đào tạo học tập'], ['hospital', 'bệnh viện y tế'], ['heart-pulse', 'sức khỏe y tế'], ['stethoscope', 'khám bệnh'],
    ['scale', 'pháp luật tư pháp'], ['gavel', 'tòa án xử lý'], ['shield', 'an ninh bảo vệ'], ['shield-check', 'an toàn bảo mật'],
    ['badge-check', 'xác thực chứng nhận'], ['award', 'thi đua khen thưởng'], ['map', 'bản đồ'], ['map-pin', 'địa điểm'], ['globe', 'trang web cổng'],
    ['compass', 'định hướng'], ['house', 'trang chủ nhà'], ['store', 'cửa hàng'], ['warehouse', 'kho'], ['leaf', 'môi trường nông nghiệp'],
  ],
  tai_chinh: [
    ['wallet', 'ví tài chính'], ['banknote', 'tiền ngân sách'], ['credit-card', 'thẻ thanh toán'], ['receipt', 'hóa đơn chứng từ'],
    ['calculator', 'kế toán tính toán'], ['coins', 'tiền xu'], ['piggy-bank', 'tiết kiệm'], ['shopping-cart', 'mua sắm'], ['package', 'hàng hóa tài sản'],
    ['truck', 'vận chuyển'], ['car', 'xe đi lại'], ['bus', 'xe buýt giao thông'], ['plane', 'công tác máy bay'], ['utensils', 'ăn uống'], ['coffee', 'cà phê'],
  ],
  khac: [
    ['settings', 'cài đặt cấu hình'], ['wrench', 'sửa chữa công cụ'], ['search', 'tìm kiếm tra cứu'], ['link', 'liên kết'], ['key-round', 'khóa mật khẩu'],
    ['lock', 'khóa bảo mật'], ['qr-code', 'mã qr'], ['scan-line', 'quét'], ['camera', 'máy ảnh'], ['image', 'hình ảnh'], ['monitor', 'màn hình máy tính'],
    ['laptop', 'máy tính xách tay'], ['smartphone', 'điện thoại di động'], ['sun', 'mặt trời'], ['zap', 'nhanh điện'], ['lightbulb', 'ý tưởng sáng kiến'],
    ['rocket', 'khởi động'], ['star', 'yêu thích'], ['sparkles', 'trợ lý ai'], ['bot', 'trợ lý robot ai'], ['cpu', 'chip công nghệ'], ['wifi', 'mạng'],
    ['radio', 'phát thanh'], ['tv', 'truyền hình'], ['film', 'phim video'], ['download', 'tải xuống'], ['upload', 'tải lên'], ['refresh-cw', 'đồng bộ'],
    ['history', 'lịch sử'], ['circle-help', 'trợ giúp'], ['info', 'thông tin'], ['triangle-alert', 'cảnh báo'], ['life-buoy', 'cứu trợ hỗ trợ'],
  ],
};

const out = {};
const groups = {};
for (const [g, list] of Object.entries(GROUPS)) {
  groups[g] = [];
  for (const [name, vi] of list) {
    if (!nodes[name]) throw new Error(`Lucide ${version} không có biểu tượng ${name}`);
    if (out[name]) throw new Error(`Trùng ${name}`);
    out[name] = { n: nodes[name], k: `${vi} ${name.replace(/-/g, ' ')}` };
    groups[g].push(name);
  }
}

const file = new URL('../src/app-icons-data.ts', import.meta.url);
writeFileSync(file, `// TỆP SINH TỰ ĐỘNG — scripts/gen-app-icons.mjs (Lucide ${version}, giấy phép ISC). Không sửa tay.
/** Tên biểu tượng ⇒ { n: các phần tử SVG (viewBox 24×24, nét), k: từ khoá tìm (vi + en) }. */
export const ICONS: Record<string, { n: Array<[string, Record<string, string>]>; k: string }> = ${JSON.stringify(out)};
/** Nhóm hiển thị trong ô chọn biểu tượng. */
export const ICON_GROUPS: Record<string, string[]> = ${JSON.stringify(groups)};
`);
console.log(`app-icons-data.ts: ${Object.keys(out).length} biểu tượng, ${readFileSync(file).length} byte`);

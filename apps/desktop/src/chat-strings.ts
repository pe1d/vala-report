/** Chữ hiển thị của trang Trợ lý AI (chat-page.ts). Bản tiếng Anh phải đủ khoá như tiếng Việt. */
const vi = {
  title: 'Trợ lý AI', newChat: 'Cuộc trò chuyện mới',
  placeholder: 'Hỏi Trợ lý Vala… (gõ / để chạy thao tác của các hệ thống)',
  send: 'Gửi', hint: 'Enter để gửi · Shift+Enter xuống dòng · / chạy thao tác',
  you: 'Bạn', assistant: 'Trợ lý Vala',
  notConnected: 'Trợ lý AI đang được kết nối. Hiện bạn có thể gõ / để chạy thao tác của các hệ thống.',
  pickSystem: 'Chọn hệ thống', pickAction: 'Chọn thao tác', noSystems: 'Chưa có hệ thống nào — đăng nhập ở tab Báo cáo trước.',
  noMatch: 'Không có mục khớp', loadingActions: 'Đang mở hệ thống và nạp thao tác…', noActions: 'Hệ thống này chưa có thao tác nào.',
  run: 'Chạy', cancel: 'Huỷ', back: 'Quay lại', running: 'Đang chạy…', noParams: 'Thao tác này không cần tham số.',
  done: 'Xong.', empty: '(không có dữ liệu)', failed: 'Không chạy được', rows: 'dòng',
  tryAsk: 'Thử ngay', slashChip: 'Chạy thao tác',
};
const en: typeof vi = {
  title: 'AI assistant', newChat: 'New chat',
  placeholder: 'Ask the Vala assistant… (type / to run a system action)',
  send: 'Send', hint: 'Enter to send · Shift+Enter for a new line · / runs an action',
  you: 'You', assistant: 'Vala assistant',
  notConnected: 'The AI assistant is being connected. For now, type / to run actions of your systems.',
  pickSystem: 'Choose a system', pickAction: 'Choose an action', noSystems: 'No systems yet — sign in on the Reports tab first.',
  noMatch: 'Nothing matches', loadingActions: 'Opening the system and loading actions…', noActions: 'This system has no actions yet.',
  run: 'Run', cancel: 'Cancel', back: 'Back', running: 'Running…', noParams: 'This action takes no parameters.',
  done: 'Done.', empty: '(no data)', failed: 'Could not run', rows: 'rows',
  tryAsk: 'Try it', slashChip: 'Run an action',
};
export const strings = { vi, en };

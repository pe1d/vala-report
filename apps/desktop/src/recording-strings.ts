/** Chữ hiển thị của tab Bản ghi thao tác (recording-page.ts). Bản tiếng Anh phải đủ khoá như tiếng Việt. */
const vi = {
  title: 'Bản ghi thao tác',
  empty: 'Chưa có bản ghi. Chuột phải lên tab của một hệ thống ⇒ "Bắt đầu ghi thao tác", thao tác như bình thường rồi chuột phải ⇒ "Dừng ghi thao tác".',
  hint: 'Chuỗi request trang đã gửi khi bạn thao tác — dùng để viết kịch bản. Bản ghi chỉ nằm trên máy này. Mật khẩu, cookie, nội dung tệp không được ghi; __VIEWSTATE chỉ ghi độ dài.',
  recording: 'Đang ghi…', stopped: 'Đã dừng', steps: 'bước', truncated: 'Đã dừng ở 200 bước (giới hạn).',
  stopReason: 'Dừng vì', reasons_tab_dong: 'tab đã đóng', reasons_du_buoc: 'đủ 200 bước', reasons_khac: 'mất kết nối với trang',
  save: 'Lưu ra tệp', copyJson: 'Sao chép JSON', copyDraft: 'Sao chép', copied: 'Đã sao chép', saved: 'Đã lưu',
  url: 'Địa chỉ', fields: 'Trường đã gửi', files: 'Tệp đính kèm', response: 'Phản hồi', noFields: '(không có)',
  masked_mat_khau: 'đã che', masked_trang_thai: 'chỉ ghi độ dài', status: 'Mã phản hồi', location: 'Chuyển hướng tới',
  hidden: 'Trường ẩn trang trả về', submits: 'Nút trên trang', panels: 'Vùng UpdatePanel được cập nhật', frame: 'Khung con (iframe)',
  unreadable: 'Không đọc được thân request (trình duyệt không chuyển).', async: 'Gửi một phần trang (UpdatePanel)',
  draft: 'Bản nháp kịch bản', draftHint: 'Dán vào Quản trị → Kịch bản Desktop rồi sửa: đổi tên thao tác, thay giá trị cụ thể bằng tham số p.…',
  name: 'Tên', value: 'Giá trị',
};
const en: typeof vi = {
  title: 'Action recording',
  empty: 'No recording yet. Right-click a system’s tab ⇒ "Start recording actions", work as usual, then right-click ⇒ "Stop recording actions".',
  hint: 'The requests the page sent while you worked — for writing scripts. The recording stays on this computer. Passwords, cookies and file contents are not recorded; __VIEWSTATE only by length.',
  recording: 'Recording…', stopped: 'Stopped', steps: 'steps', truncated: 'Stopped at 200 steps (limit).',
  stopReason: 'Stopped because', reasons_tab_dong: 'the tab was closed', reasons_du_buoc: '200 steps reached', reasons_khac: 'the connection to the page was lost',
  save: 'Save to file', copyJson: 'Copy JSON', copyDraft: 'Copy', copied: 'Copied', saved: 'Saved',
  url: 'Address', fields: 'Fields sent', files: 'Attached files', response: 'Response', noFields: '(none)',
  masked_mat_khau: 'hidden', masked_trang_thai: 'length only', status: 'Status', location: 'Redirects to',
  hidden: 'Hidden fields returned', submits: 'Buttons on the page', panels: 'UpdatePanel regions updated', frame: 'Child frame (iframe)',
  unreadable: 'The request body could not be read (not passed on by the browser).', async: 'Partial page postback (UpdatePanel)',
  draft: 'Script draft', draftHint: 'Paste into Admin → Desktop scripts and edit: rename the action, replace literal values with p.… parameters.',
  name: 'Name', value: 'Value',
};
export const strings = { vi, en };

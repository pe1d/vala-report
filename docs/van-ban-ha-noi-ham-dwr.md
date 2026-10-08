# Văn bản Hà Nội — danh mục hàm DWR (tự trích, 08/10/2026)

Trích từ HTML/JS của 27 trang trong menu (tài khoản thử, quét bằng GET) + lưu lượng thật khi mở 3 trang. Cột "loại" đoán theo
tên hàm (get/load/check… ⇒ đọc) — **chưa kiểm chứng**; hàm "ghi/khác" có thể đổi dữ liệu thật, không gọi khi chưa rõ.

| Mô-đun | Hàm | Loại | Trang dùng |
|---|---|---|---|
| `giaobanthang.XuLyGiaoBanV2` | `getByIdGbt` | đọc | Giao việc |
| `giaobanthang.XuLyGiaoBanV2` | `getFileInfo` | đọc | Đăng ký phòng họp |
| `giaobanthang.XuLyGiaoBanV2` | `getListFileDinhKem` | đọc | Giao việc |
| `giaobanthang.XuLyGiaoBanV2` | `getVanBanLienQuan` | đọc | Giao việc |
| `hosoluutru.HoSoCaNhan` | `getHoSoVanBan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoCaNhan` | `getList` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoCaNhan` | `themVanBan` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoCaNhan` | `xoaVanBan` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `check_add_in_danhmucgoc` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getDanhMucCbo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getDanhMucKe` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getDanhMucKho` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getDataList` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getHRActiveAgent` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getListHSKtm` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getListUnit` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getNhanSuAgent` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getNhieuHoSoVanBan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `getYear4Filter` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `onDanhMucAction` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `hosoluutru.HoSoLuuTru` | `onDemucAction` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlcv.BaoCaoCaNhanTongHopMulti` | `getListDonViBaoCao` | đọc | Lịch đơn vị |
| `qlcv.DonViTongHopTapDoan` | `getListLanhDaoBaoCao` | đọc | Công việc cần xử lý, Giao việc |
| `qlcv.GiaoViecMultiXLC` | `checkTypeNotify` | đọc | inline-main.js |
| `qlcv.GiaoViecMultiXLC` | `getAllChucDanh` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getAllSchema` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getAllSchemaChildren` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getAllSchemaJobPosition` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getAllSchemaOption` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getAllSchemaParentOption` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getBaoCaoCVCaNhan` | đọc | inline-main.js |
| `qlcv.GiaoViecMultiXLC` | `getListCaNhan` | đọc | Tra cứu văn bản |
| `qlcv.GiaoViecMultiXLC` | `getListChucDanh` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getListChucDanhGiaoViec` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getListChucDanhOther` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getListDonViLanhDao` | đọc | Tra cứu văn bản |
| `qlcv.GiaoViecMultiXLC` | `getListLoaiCongViec` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getListNguoiDanhGia` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getListNguoiDanhGiaOther` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getListNhanSuNguoiDanhGia` | đọc | Giao việc |
| `qlcv.GiaoViecMultiXLC` | `getListNhanSuQuanLy` | đọc | Giao việc |
| `qlcv.QLCV_LoaiCongViec` | `getListComboBoxNCV` | đọc | Công việc cần xử lý |
| `qlcv.QLCV_MauNhap` | `getYKienMau` | đọc | Giao việc |
| `qlcv.QLCV_MauNhap` | `sf_sua_ykien` | ghi/khác | Giao việc |
| `qlcv.QLCV_MauNhap` | `sf_them_ykien` | ghi/khác | Giao việc |
| `qlcv.QLCV_MauNhap` | `sf_xoa_ykien` | ghi/khác | Giao việc |
| `qlcv.QuanLyCongViecCoQuanMulti` | `allFileDownloadTienTrinh` | ghi/khác | Công việc cần xử lý, Giao việc |
| `qlcv.QuanLyCongViecCoQuanMulti` | `export2ExcelTienTrinhXuLy` | ghi/khác | Công việc cần xử lý, Giao việc |
| `qlcv.QuanLyCongViecCoQuanMulti` | `getListTienTrinh` | đọc | Công việc cần xử lý, Giao việc |
| `qlcv.QuanLyCongViecCoQuanMulti` | `sf_detail_cv_from_logvb` | ghi/khác | inline-main.js |
| `qlcv.QuanLyCongViecCoQuanMulti` | `updateIsReadByNxlid` | ghi/khác | Công việc cần xử lý, Giao việc |
| `qlcv.QuanLyCongViecDaGiaoMulti` | `getFileJob` | đọc | Giao việc |
| `qlcv.QuanLyCongViecDaGiaoMulti` | `updateJobDocAndLog` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlcv.uyquyen` | `getListLanhDaoGiaoViec` | đọc | Công việc cần xử lý, Giao việc |
| `qlcv.uyquyen` | `getListLanhDaoGiaoViecBDH` | đọc | Giao việc |
| `qlcv.uyquyen` | `getListNguoiUyQuyenTaoViec` | đọc | Giao việc |
| `qllh.DuyetLichCongTac` | `chuyenDuyetLichCongTac` | ghi/khác | Đăng ký lịch công tác |
| `qllh.DuyetLichCongTac` | `getListLanhDao` | đọc | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.DuyetLichCongTac` | `layDanhSachLichTraLai` | đọc | Đăng ký lịch công tác |
| `qllh.DuyetLichCongTac` | `layLichCongTacCacLanhDao` | đọc | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCaNhan` | `getLichCaNhan` | đọc | inline-main.js |
| `qllh.LichCongTacLanhDao` | `copyLichCongTac_LichDonVi` | ghi/khác | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `copyLichCongTac_LichDonVi_Time` | ghi/khác | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `deleteDK_LichCongTac` | ghi/khác | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `export2Excel` | ghi/khác | Xem lịch công tác, Xem lịch công tác lãnh đạo, Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `getChuoiUserShare` | đọc | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `getDataTableLichCT` | đọc | Xem lịch công tác, Xem lịch công tác lãnh đạo, Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `getLichCongTacCaNhan` | đọc | Xem lịch công tác, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getListCaNhan` | đọc | Xem lịch công tác, Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getListCaNhanByUnit` | đọc | Xem lịch công tác, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getListDonViPhongBan_v2` | đọc | Xem lịch công tác, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getListEmployeeLCN` | đọc | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getListLanhDao` | đọc | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getListLanhDaoDangKy` | đọc | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `getListRaramUser` | đọc | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `getListRoleUser` | đọc | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `getListUnitLCN` | đọc | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getTableLichCT` | đọc | Xem lịch công tác, Xem lịch công tác lãnh đạo |
| `qllh.LichCongTacLanhDao` | `getUserChon` | đọc | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `saveLichCongTac` | ghi/khác | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `saveLichCongTacTime` | ghi/khác | Đăng ký lịch công tác |
| `qllh.LichCongTacLanhDao` | `shareLichCongTac` | ghi/khác | Đăng ký lịch công tác |
| `qllh.LichCongtacV2` | `export2Excel` | ghi/khác | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCongtacV2` | `getLichCaNhan` | đọc | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCongtacV2` | `getLichCaNhanBox` | đọc | inline-main.js |
| `qllh.LichCongtacV2` | `getLichLanhDao` | đọc | Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo |
| `qllh.LichCongtacV3` | `getLich` | đọc | inline-main.js |
| `qllh.LichCongtacV3` | `getLichCaNhanById` | đọc | inline-main.js |
| `qllh.LichDonVi` | `check_leader_of_unit` | đọc | Lịch đơn vị |
| `qllh.LichDonVi` | `chutri_xacnhan_thamgia` | ghi/khác | Lịch đơn vị |
| `qllh.LichDonVi` | `export2ExcelChuTri` | ghi/khác | Lịch đơn vị |
| `qllh.LichDonVi` | `getAllPermissionReservationView` | đọc | Lịch đơn vị |
| `qllh.LichDonVi` | `getCenterScheduleWeekByTime` | đọc | Lịch đơn vị |
| `qllh.LichDonVi` | `getChildDependentDeparment` | đọc | Lịch đơn vị |
| `qllh.LichDonVi` | `getDataTable` | đọc | Lịch đơn vị |
| `qllh.LichDonVi` | `getDataTableLichTrucLanhDao_wmconcat` | đọc | Lịch đơn vị |
| `qllh.LichDonVi` | `getPermissionReservationView` | đọc | Lịch đơn vị, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã |
| `qllh.LichDonVi` | `getUnitUserDocLap` | đọc | Lịch đơn vị, Xem lịch công tác cá nhân, Xem lịch công tác lãnh đạo, inline-main.js |
| `qllh.LichDonVi` | `insertCenterScheduleWeekByTime` | ghi/khác | Lịch đơn vị |
| `qllh.LichTrucBenhVien` | `getLichTruc` | đọc | inline-main.js |
| `qllh.NhomNhanLich` | `getListNhomNhanLich` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichCongTac` | `getLichCTByID` | đọc | Lịch đơn vị |
| `qllh.QuanLyDangKyLichHop` | `approve_booking` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `booking` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `bookingV2` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `booking_from_document` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `qllh.QuanLyDangKyLichHop` | `booking_from_invitation` | ghi/khác | Văn bản đi chờ xử lý |
| `qllh.QuanLyDangKyLichHop` | `booking_nhapnhanh` | ghi/khác | Lịch đơn vị |
| `qllh.QuanLyDangKyLichHop` | `cancel_booking` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `capNhatMau` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `checkBookedTime_S` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `checkDuplicateModerator` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `checkRole_nhapNhanh` | đọc | Lịch đơn vị |
| `qllh.QuanLyDangKyLichHop` | `checkViewDetail` | đọc | Lịch đơn vị, inline-main.js, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `check_role_hrm_booking_approve` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `check_status_lichhop` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `chutri_xacnhan_thamgia` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `countSearchMau` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `createLockedLichHop` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `deleteLichHop` | ghi/khác | Lịch đơn vị, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `deleteLichHop_Repeat` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `deleteLockedLichHop` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `edit_booking` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `edit_bookingV2` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `edit_nhapnhanh` | ghi/khác | Lịch đơn vị |
| `qllh.QuanLyDangKyLichHop` | `export2Excel` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `export2ExcelLichTuan` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `force_approve` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getAllUnitPermissionById` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getAllUserPermissionById` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getBookedRange` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getDSFileTaiLieuCuocHopById` | đọc | Lịch đơn vị, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã |
| `qllh.QuanLyDangKyLichHop` | `getDSLichSuThaoTac` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getDSNguoiDuyetLichHop` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getDataTable` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getDetailLockedLichHop` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getFormLockedDataTable` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getLichHopByID` | đọc | Lịch đơn vị, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã |
| `qllh.QuanLyDangKyLichHop` | `getListApprovers` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getListFile` | đọc | Lịch đơn vị, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã |
| `qllh.QuanLyDangKyLichHop` | `getListFileDocument` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `qllh.QuanLyDangKyLichHop` | `getListPaticipants` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getListReservationFlags` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getNhanSuLichHop` | đọc | Lịch đơn vị, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getPagingLockedLichHop` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getPagingParam` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getPhongHopLienQuanEditById` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `getThamGiaLichHopByID` | đọc | Lịch đơn vị, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã |
| `qllh.QuanLyDangKyLichHop` | `getUnitLichHop` | đọc | Lịch đơn vị, Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `get_dataTableR` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `is_Approve_Edit_By_Row` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `logging_lichhop` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `luuMau` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `pending_booking` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `printDoc` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `repeating` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `save_chutri_choxacnhan` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `searchMau` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `validatedExists_CreateLichHop` | đọc | Đăng ký phòng họp |
| `qllh.QuanLyDangKyLichHop` | `xoaMau` | ghi/khác | Đăng ký phòng họp |
| `qllh.QuanLyPhongHop` | `getConferenceRoom` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qllh.QuanLyPhongHop` | `getPhongHopInfo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `qllh.QuanLyPhongHop` | `getUnitConferenceRoom` | đọc | Lịch đơn vị |
| `qlvb.CASignServer` | `checkAccessSignServer` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.DcmNotification` | `get_list_user_notify_chuyentiep` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.DcmNotification` | `get_list_user_notify_comment` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.DcmNotification` | `get_list_user_notify_flow` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.DcmNotification` | `get_list_user_notify_p_comment` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.DcmNotification` | `get_list_user_notify_publish` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.DcmNotification` | `get_list_user_notify_thongbao` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.GetAPICDDH` | `checkCDDH` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.GetAPICDDH` | `checkCallApiCDDH` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.GetAPICDDH` | `huyChiDaoDieuHanh` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.GetAPICDDH` | `taoChiDaoDieuHanh` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.NoteFile` | `uploadFile` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignServer` | `checkAccessSignServer` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignServer` | `checkSignSmartCA` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignServer` | `getCertSmartCA` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `checkLoginVGCA` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `getBase64File` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `getBase64FilePdf` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `getFileConvertOnline` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `getInfoSignature` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.SignatureUtil` | `loginVGCA` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `outPutFile` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.SignatureUtil` | `outPutFileSmartCA` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `outPutFileVGCA` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `outPutFileVGCAApp` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.SignatureUtil` | `showFileDinhKemFEMFILE` | ghi/khác | Công việc cần xử lý, Giao việc, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi |
| `qlvb.ThamMuu` | `checkBtnThamMuu` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ThamMuu` | `saveDuKien` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ThamMuu` | `sf_get_list_dukien` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.TraCuuVanBanExport` | `expLotusNoteTinhUy` | ghi/khác | Tra cứu văn bản |
| `qlvb.axis_hcc` | `gui_trangthai_hcc` | ghi/khác | Giao việc, inline-main.js |
| `qlvb.axis_hcc` | `vb_nhan_hcc` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.baclieu.common` | `checkUserMenu` | đọc | inline-main.js |
| `qlvb.baclieu.van_ban_den` | `getListTrichYeu` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.baclieu.van_ban_di` | `capNhatTrangThaiKyVBTrinhKy` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.baclieu.van_ban_di` | `laySoTrinhKy` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.baocao.DocumentReport` | `getDuThaoVDiHNI` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getIdMenuBaoCaoChiTietCaNhan_GiaoViec` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getLichHopHni` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getListVbdiVipHni` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getSoLieuVB_KCNC` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getTKVanBan` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getTKVanBanKVDB` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getVBDenHNI` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getVBPhatHanhHNI` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getVbdiVipHni` | đọc | inline-main.js |
| `qlvb.baocao.DocumentReport` | `getXLHoSoCVHNI` | đọc | inline-main.js |
| `qlvb.common` | `agreeTermsAndConditions` | ghi/khác | inline-main.js |
| `qlvb.common` | `changeSysUser` | ghi/khác | inline-main.js |
| `qlvb.common` | `checkAllowedFileType` | đọc | Giao việc, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết |
| `qlvb.common` | `checkHaveRole` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.common` | `checkHaveRoleBTE` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.common` | `clearPassSmartCA` | ghi/khác | inline-main.js |
| `qlvb.common` | `getAnXemNhanhThongTinVB` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.common` | `getCongViecChoXuLy` | đọc | inline-main.js |
| `qlvb.common` | `getCongViecDaGiao` | đọc | inline-main.js |
| `qlvb.common` | `getContextRow` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.common` | `getDonviDoclapByUser` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.common` | `getDonviDoclapByUserV2` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.common` | `getFieldOfDoc` | đọc | Giao việc, inline-main.js |
| `qlvb.common` | `getIPSysUserLogin` | đọc | inline-main.js |
| `qlvb.common` | `getLogoHeader` | đọc | inline-main.js |
| `qlvb.common` | `getNameTitleUserLogin` | đọc | inline-main.js |
| `qlvb.common` | `getSessionTimeout` | đọc | inline-main.js |
| `qlvb.common` | `getVanBanChoXuLy` | đọc | inline-main.js |
| `qlvb.common` | `getVanBanChoXuLyTKV` | đọc | inline-main.js |
| `qlvb.common` | `getVanBanDiChoXuLyTKV` | đọc | inline-main.js |
| `qlvb.common` | `getVituarlInfo` | đọc | inline-main.js |
| `qlvb.common` | `get_menu_breadcrumb` | đọc | inline-main.js |
| `qlvb.common` | `get_menu_html` | đọc | Tra cứu văn bản, inline-main.js |
| `qlvb.common` | `get_menu_top_tao_van_ban` | đọc | Công việc cần xử lý, inline-main.js |
| `qlvb.common` | `get_menu_top_tao_vbkv` | đọc | inline-main.js |
| `qlvb.common` | `is_quantri_mucbo` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.common` | `lay_giatri_sequence` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.common` | `loadAttribute` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.common` | `loadsovanbanBTE` | đọc | Văn bản đi chờ xử lý |
| `qlvb.common` | `makeFileInfo` | đọc | Giao việc, inline-main.js |
| `qlvb.common` | `pageCache` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Tài liệu cá nhân, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem |
| `qlvb.common` | `readAll_notify` | ghi/khác | inline-main.js |
| `qlvb.common` | `read_notify` | ghi/khác | inline-main.js |
| `qlvb.common` | `send_notify` | ghi/khác | Tài liệu cá nhân, Tài liệu được chuyển giao |
| `qlvb.common` | `showWarningUserLogin` | ghi/khác | inline-main.js |
| `qlvb.danhmuc.loaicoquanbanhanh` | `loaiCoQuanByID` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.danhmuc.publish_group` | `checkAdmin` | đọc | Giao việc, inline-main.js |
| `qlvb.danhmuc.sovanban` | `getNameUserID` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.danhmuc.uyquyen` | `getListDonViAll` | đọc | Đăng ký lịch công tác |
| `qlvb.danhmuc.uyquyen` | `getListUserPage` | đọc | Đăng ký lịch công tác |
| `qlvb.ds_van_ban` | `checkQuanTriVanBan` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `checkUserHasRole` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `chuyenVBBCSClick` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ds_van_ban` | `daDocHangLoat` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `duyetLuuKetThuc` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ds_van_ban` | `getApproveVbChiDao` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ds_van_ban` | `getApprovedValue` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `getCheckCreateVbPhucDapTuVBCD` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ds_van_ban` | `getCoQuanBanHanhList` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `getConfigHanXuLyVanBan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ds_van_ban` | `getDSVanBanDen` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `getDcmVanBanChiDaoLog` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ds_van_ban` | `getDcmVanBanChiDaoLogDetail` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ds_van_ban` | `getDocDetail` | đọc | Tra cứu văn bản, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả  |
| `qlvb.ds_van_ban` | `getDonViChiDao` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ds_van_ban` | `getFileAttachLst` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `getFormNewVanBan` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `getListUserVBBCS` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ds_van_ban` | `getLstNguoiNhan` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `getNguoiBiTraLai` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ds_van_ban` | `getParamFromCabinet` | đọc | Tra cứu văn bản |
| `qlvb.ds_van_ban` | `getRejectVbChiDao` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ds_van_ban` | `getRoleTypeCode` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ds_van_ban` | `getStateXuLyUyQuyen` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `getYKienMau` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.ds_van_ban` | `sf_check_banhanh` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ds_van_ban` | `sf_getdukiennhan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ds_van_ban` | `sf_getfiledukiennhan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ds_van_ban` | `sf_sua_ykien` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.ds_van_ban` | `sf_them_ykien` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.ds_van_ban` | `sf_xoa_ykien` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.ds_van_ban` | `sp_get_nam_vanban` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.ds_van_ban` | `thamMuuLaiVanBan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ds_van_ban` | `validateShowLogDocument` | đọc | Tra cứu văn bản |
| `qlvb.ds_van_ban` | `xuLyDongThoi` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.edoc_doc` | `get_doc_child` | đọc | Công việc cần xử lý, Giao việc, Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn |
| `qlvb.edoc_exis` | `checkShowCancelDoc` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.edoc_exis` | `check_sokyhieu_lentruc` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.edoc_exis` | `check_trich_yeu_doc_by_id` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.edoc_exis` | `check_vao_so` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.edoc_exis` | `get_recv_status_by_docid` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.edoc_exis` | `get_recv_status_noibo` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.edoc_exis` | `gui_trangthai_lentruc` | ghi/khác | Giao việc, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã x |
| `qlvb.edoc_exis` | `gui_vb_lentruc` | ghi/khác | Giao việc, inline-main.js |
| `qlvb.edoc_exis` | `log_doc_before_edit` | ghi/khác | Giao việc, inline-main.js |
| `qlvb.edoc_exis` | `trinhKy` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.edoc_exis` | `xinYKien` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.guiMailCV` | `gui_vb_mailcv` | ghi/khác | Giao việc, inline-main.js |
| `qlvb.hni.HniCustom` | `getListUserPersonalConfig` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.hni.HniCustom` | `getSoBiThuList` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.hni.HniCustom` | `hniGetTKVanBan` | ghi/khác | inline-main.js |
| `qlvb.hni.HniCustom` | `qlvbGetListTooltipConfig` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.hni.HniCustom` | `qlvbSaveListTooltipConfig` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.hni.HniCustom` | `qlvbSaveUserPersonalConfig` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.hni.HniFileUtils` | `CloneFileToCustom` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.hni.HniFileUtils` | `DeleteFile` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.hni.HniFileUtils` | `createPhieuGiaoNhan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.hni.HniFileUtils` | `getFileInfo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.hni.HniFileUtils` | `outPutFileScan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `qlvb.hni.HniVbPrivateFilter` | `getFilterMenuIdsByUser` | đọc | inline-main.js |
| `qlvb.hni.HniVbPrivateFilter` | `getListMenu` | đọc | Tra cứu văn bản |
| `qlvb.hni.HniVbPrivateFilter` | `getListPrivateFilter` | đọc | Tra cứu văn bản |
| `qlvb.hni.HniVbPrivateFilter` | `getPrivateFilterById` | đọc | Tra cứu văn bản |
| `qlvb.hni.HniVbPrivateFilter` | `qlvbDeleteFilter` | ghi/khác | Tra cứu văn bản |
| `qlvb.hni.HniVbPrivateFilter` | `qlvbSaveFilter` | ghi/khác | Tra cứu văn bản |
| `qlvb.hni.LogViewDownloadFile` | `create_log` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Tài liệu cá nhân, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem |
| `qlvb.hni.LogViewDownloadFile` | `create_log_zip` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.hni.XinGiaHan` | `addDocGiaHan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.hni.XinGiaHan` | `checkVanBanDaGiaHan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.hni.XinGiaHan` | `layDanhSachNguoiDuyet` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.hni.XinGiaHan` | `updateDocGiaHan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.hoso_congviec.common` | `getSoDemHoso` | đọc | Tài liệu cá nhân, Tài liệu được chia sẻ, Tài liệu được chuyển giao |
| `qlvb.luu_tru_lsn` | `getDsHoso` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.luu_tru_lsn` | `guiHoso` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.luu_tru_lsn` | `guiHosoDL` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getAccessToken` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getChiTietDonThu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getDonThu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getDsDonThu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getDsDonThuChoVanBan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getDsDonThuPagination` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getEmailOfUser` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getListLogDeleteDonThu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getListUserJoin` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getListUserJoinActivity` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getListUserJoinAssign` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getListUserJoinDocument` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `getdsFileDinhKemDonThu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `saveDonThuChoVanBan` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `sentDataToDonThu` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.tichhop_donthu` | `showModalDSDonThu` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.totrinh_dexuat` | `checkTabPhieuTrinh` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.totrinh_dexuat` | `getDanhSachToTrinhYKien` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.totrinh_dexuat` | `guiThongTinDeXuat` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.totrinh_dexuat` | `printPhieuTrinhWithWatermark` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ubhn.tichhop_quanlyphonghop` | `qlcbhniBanCanSu` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ubhn.tichhop_quanlyphonghop` | `qlcbhniXinykien` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ubhn.tichhop_quanlyphonghop` | `qlchhniGiayMoi` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ubhn.vbden_xinchoduyet` | `checkXLChinhCuoiByDocid` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.ubhn.vbden_xinchoduyet` | `checkXLChinhCuoiByListId` | đọc | Giao việc, inline-main.js |
| `qlvb.ubhn.vbden_xinchoduyet` | `getDataByDocid` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ubhn.vbden_xinchoduyet` | `getDataByDocids` | đọc | Giao việc, inline-main.js |
| `qlvb.ubhn.vbden_xinchoduyet` | `getListUserApproveFinishDoc` | đọc | Giao việc, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã x |
| `qlvb.ubhn.vbden_xinchoduyet` | `xinDuyetKetThuc` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.ubhn.vbden_xingiahan` | `duyetXinGiaHan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ubhn.vbden_xingiahan` | `tieptucXinGiaHan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ubhn.vbden_xingiahan` | `tuChoiXinGiaHan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.ubhn.vbden_xingiahan` | `vbxgh_layDanhSachNguoiDuyet` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `addDocRelated` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `addDocRelatedClone` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `addFileDocRelated` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `addFileDocRelated2` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `addSingleFileDocAttached` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `callApiGoiYThammuuSingle` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `capNhatMaHoSoIGate` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `capNhatVanBanKhoDaXuLy` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `checkAgentLanhDaoChiDao` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `checkChuyenTiepBosung` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.van_ban_den` | `checkEditBanHanh` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `checkHinhthucVB` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `checkHoSoIgateHNI` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `checkLayLaiVanBan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkLayLaiVanBanDenBanHanh` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkNoValidateSoKyHieu` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkProcessHaveSampleForm` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkQuanTriVanBan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `checkRolePHAndXLC` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkRolePhucDapAndXLC` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkRoleViewDoc` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `checkStatusDocumentById` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `checkStatusPhucDapVB` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkThamMuuExisted` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `checkThammuuHangloat` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `checkTraLaiSauBH` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkUserUnitConfig` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkVBDiPhatHanhCaNhan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `checkVanBanDenDi` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `checkVanBanOpenDetail` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `chuyenLanhDao` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `chuyentiepVanBan` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.van_ban_den` | `clearThamMuu` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `countVanBanChiDao` | đọc | inline-main.js |
| `qlvb.van_ban_den` | `createPhieuXuLy` | ghi/khác | Tra cứu văn bản |
| `qlvb.van_ban_den` | `createSampleForm` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `createdOcrLog` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `crisPhieuTongHop` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `danhDauChuaDoc` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `danhDauChuaDocSingle` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `danhDauVBGiay` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `delDoc` | ghi/khác | Tra cứu văn bản |
| `qlvb.van_ban_den` | `delFileDocAttached` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `deleteShowYKienVBDen` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `deleteShowYKienVBDenDongThoi` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `downloadAllFileUserActivitiLog` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `duyetVBHangLoat` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `editBanHanh` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `expFileZip` | ghi/khác | Tra cứu văn bản |
| `qlvb.van_ban_den` | `expLotusNote` | ghi/khác | Tra cứu văn bản |
| `qlvb.van_ban_den` | `export2ExcelDoc` | ghi/khác | Tra cứu văn bản |
| `qlvb.van_ban_den` | `export2File` | ghi/khác | Tra cứu văn bản |
| `qlvb.van_ban_den` | `exportExcel` | ghi/khác | Tra cứu văn bản |
| `qlvb.van_ban_den` | `genFilePhieuChuyenTraLoi` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getActivitiLog` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getAgentList` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.van_ban_den` | `getAllNoiDungChuyen` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getAllThongTinThamMuu` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getApprovedValue` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getApprovedValueVBChoXuLyDongThoi` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getApprovedValueVBDuThaoDongThoi` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getAttachedFileLstDelete` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getCloneFileAttachLst` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getCloneFileAttachRelatedLst` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getCoQuanBanHanhList` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getCoQuanBanHanhList_VBDI` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getCommentList` | đọc | Giao việc, inline-main.js |
| `qlvb.van_ban_den` | `getConfigTypeKySo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getConfigXuLyChinh` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getCopyDoc` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getDSVanBan` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getDSVanBanDen` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getDanhSachLanhDaoTheoQuyen` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getDcmTrack` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getDcmTrackActivitiLog` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getDocById` | đọc | Giao việc, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết |
| `qlvb.van_ban_den` | `getDocDetail` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getDocList` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getDocList2` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getDocListApproveFinish` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getDocPhucDapDuyetKetThuc` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getDocRelated` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getDocRelatedForMeeting` | đọc | Lịch đơn vị, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã |
| `qlvb.van_ban_den` | `getDonViByGroupId` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getDonViCoVanThu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getDonViDocLap` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getDsNotify` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getEmplyeeUnit` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.van_ban_den` | `getFileAttachLst` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getFileAttachLstDelete` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getFileDocAttached` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getFileDocRelated` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getFileInfo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getFormNewVanBan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getFormNewVanBanWithApproved` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getFormNewVanBan_KGG` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getFrmFileUpload` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getHanXuLyOfDocument` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getHanXuLyVB` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getHandlerByDocId` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getHrmUnitEmpLst` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getHrmUnitEmpLst_DS` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getListActLog` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getListAgent` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getListAttachFileByDocId` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getListBHDuKienNhan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getListCaNhanDuKienNhan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getListDonViThucHien` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getListDonVi_CanBo` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getListDuKienNhan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getListHoSoLuuTruVBDi` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getListProcessed` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.van_ban_den` | `getListSoVanBanTheoLoai` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getListSoVanBanTraCuu` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getListSoVanBanTraCuuTheoNam` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getListThuTucHC` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `getListTrichYeu` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getListUserReceiverSmsNoti` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getListVBTraloi` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getLogIgate` | đọc | inline-main.js |
| `qlvb.van_ban_den` | `getLogThayDoiVanBanEOF` | đọc | inline-main.js |
| `qlvb.van_ban_den` | `getLogXuLyVanBanEOF` | đọc | inline-main.js |
| `qlvb.van_ban_den` | `getLstChuyenTiepV1` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.van_ban_den` | `getLstChuyenTiep_v1` | đọc | Văn bản đi chờ xử lý |
| `qlvb.van_ban_den` | `getLstDongGui` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getLstNguoiNhan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getMeetingRelated` | đọc | Lịch đơn vị, Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã |
| `qlvb.van_ban_den` | `getNewSoVBByHinhThuc` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getNewSoVanBan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getNguoiDungLinhVuc` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getNguoiDuyetLinhVuc` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getNhomCaNhanBanHanh` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.van_ban_den` | `getNhomCaNhanBanHanhTheoPhamVi` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getNhomDonViAllByUser` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getNhomDonViBanHanh` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getNoiDungChuyenDonViNgoai` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getNoiDungPhanCong` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getNoiDungYKienNguoiGui` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getOcrInfo` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getOcrSuggestion` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getPageTotalOfFile` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getProcessDefinitionKey` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `getRelatedDocLstDelete` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getRelatedFileLstDelete` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `getThongTinLuongVanBan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.van_ban_den` | `getTraCuuVanBanPaging` | đọc | Giao việc, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý,  |
| `qlvb.van_ban_den` | `getUnitsHandlerByDocId` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getVBDiLienQuan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `getVanBan` | đọc | Giao việc, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý,  |
| `qlvb.van_ban_den` | `getVanBanById` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getVanBanDenPaging` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getYKienChiDao` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `get_all_user_schema` | đọc | Tra cứu văn bản |
| `qlvb.van_ban_den` | `get_kho_vanban` | đọc | inline-main.js |
| `qlvb.van_ban_den` | `get_lst_rule_save_doc_inbooks` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `getshowNguoinhan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `goiYNguoiNhanHangLoat` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `goiYNoiNhan` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `inPhieuTrinh` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `inPhieuTrinhThamMuu` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `inPhieuTrinh_kg` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `inPhieuXuLy` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `isChuTri` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `ketThuc_vb_den_lienquan` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `ketthucVanBan` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `ketthucVanBanNoLog` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `ketthuc_vb_hangloat` | ghi/khác | Giao việc, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết |
| `qlvb.van_ban_den` | `ketthuc_vb_hangloat_noLog` | ghi/khác | Giao việc, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết |
| `qlvb.van_ban_den` | `layLaiVanBan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `linkDocRelation` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `newVanBanDen` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `saveAndApproveDoc` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `saveEditBanHanh` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `saveLogSignDocument` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `sendComment` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `setHinhThucChuyenCanVaoSo` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sfGetProcessDefine` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_TenPhieuTrinh` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_add_sotrong_vbden` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_check_cothe_capnhat_thongtin` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `sf_check_cothe_edit_banhanh` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `sf_check_hideWhenPublish` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `sf_check_hideWhenSoVanBan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_check_skh_existed` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_check_uyquyen_role` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_check_xuly_vanban` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `sf_cothe_ketthuc` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_getListChuyenTiepV1` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_getListDonViBanHanh` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.van_ban_den` | `sf_getListDonViBanHanhV2` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_getProcessDefinitionKey` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.van_ban_den` | `sf_getUnitPrimary` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.van_ban_den` | `sf_get_combined_exec_expected` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `sf_get_doc_byid` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_get_sohientai_vbden` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_get_sotrong_vbden` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_getnumber_log_of_doc_by_docId` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_has_change_doc_type` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_lanhdao_cua_vanthu` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `sf_laylai_kho` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `sf_lichsu_ykien_thammuu` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `sf_thammuu_nhieubuoc` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `taiPhieuTrinh` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `taoChiDaoDieuHanh` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `traLaiVanBanSauBH` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `updateCheckPhucDapVB` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `updateFileDocAttached` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `updateFileName` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `updateHandlerByDocId` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.van_ban_den` | `update_doc_by_rule` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `xacThucChuKySo` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.van_ban_den` | `xuLyDongThoi` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `xuLyDongThoi_VBChoXuLy` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.van_ban_den` | `xuLyVanBanTraLai` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `qlvb.vanban_da_huy` | `deleteDocById` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.vanban_di.CheckKySo` | `KiemTraCoKySo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `check_assign_ykien` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `dongGopYKien` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `fileByID` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `fileByLogID` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `get_danhsach_nguoigui` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `get_danhsach_xinykien` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `get_danhsach_ykien` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.LayYKien` | `xinYKien` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.LayYkienDuThao` | `checkBtnKetthuc` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `checkBtnReport` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `choYKien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `cloneFileXinYkien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `export2File` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `getListEmployee` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.LayYkienDuThao` | `getTotalEmployee` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.LayYkienDuThao` | `get_danhsach_choykien` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `get_danhsach_xinykien` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `giaHanXuLy` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `ketThucXinYKien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.LayYkienDuThao` | `xinYKien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `checkCreatedUser` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `choYKienSchema` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `exportReportXinGopY` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `getListPerson` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `getNhomCaNhanBanHanh` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `get_danhsach_choykien_schema` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `get_danhsach_xinykien_schema` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKienDuThaoSchema` | `xinYKienSchema` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `choGiaiTrinh` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `exportReportXinGopY_HDQT` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_choykien` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_giaitrinh` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_giaitrinh_by_cho_ykien_id` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_giaitrinh_by_yc_id` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_xinykien_HDQT` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_yeucau_giaitrinh_by_choykienid` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_yeucau_giaitrinh_by_docid` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_danhsach_yeucau_giaitrinh_by_ykienid` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_hanxuly_xinykien_HDQT` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_hoanthanh_xinykien_HDQT` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_menu_xin_ykien_id` | đọc | inline-main.js |
| `qlvb.vanban_di.XinYKien_HDQT` | `get_state_dcm_doc` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `update_gt_is_public` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `update_hoanthanh_xinykien_HDQT` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `update_ngayduyet_xin_ykien` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XinYKien_HDQT` | `update_thoihan_xinykien_HDQT` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `update_tonghop_xinykien_HDQT` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYKien_HDQT` | `yeuCauGiaiTrinh` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.XinYkienDuThao` | `choYKien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYkienDuThao` | `cloneFileXinYkien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYkienDuThao` | `get_danhsach_choykien` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYkienDuThao` | `get_danhsach_xinykien` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYkienDuThao` | `publicChoYkien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XinYkienDuThao` | `xinYKien` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.XuLy_BoNV` | `getCaNhanThuocBo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `getDonViThuocBo` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `getHTMLString` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `getHTMLTTCDString` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `getLogDataTable` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `getLogFileBNVs` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `getTTCDDataTable` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `get_ds_gui` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `isLayLai` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `layLai` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.XuLy_BoNV` | `tamDungTrinhKy` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `capNhatThongTin` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `checkFileUploadByUser2` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `checkIsTDNV` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `checkOnlyRoleYKien` | đọc | Công việc cần xử lý, Giao việc, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, V |
| `qlvb.vanban_di.act_activiti` | `checkShowBtnDelete` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.vanban_di.act_activiti` | `checkThamSoDonVi` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `checkTichTrangThaiDsHienThilanhDao` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `checkViewVbdiDuThao` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `check_ma_dinh_danh` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `checkquyencapsophong` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getCboDvtFilter` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getChuTriByDocId` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getDocList` | đọc | Công việc cần xử lý, Giao việc |
| `qlvb.vanban_di.act_activiti` | `getDvtChoiced` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getEmployeeUnit` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getFileByListDocId` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.act_activiti` | `getFlowDiagramVBDi` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getHanGiaiQuyet` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.act_activiti` | `getHrmUnitEmpLst` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.act_activiti` | `getListDSDuKienNhan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getListPhongBan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getListRaramUser` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getListRaramUserBanHanhVBDi` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getMaDinhDanh` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getOriginalFile` | đọc | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.act_activiti` | `getUserButtonYKien` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `getWebviewUrlTDNV` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `get_open_vbdi` | đọc | inline-main.js |
| `qlvb.vanban_di.act_activiti` | `get_start_workflow` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.vanban_di.act_activiti` | `getshowNguoinhan_DS` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.vanban_di.act_activiti` | `guiYKien` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `gui_thongtin_sang_igate` | ghi/khác | Giao việc, inline-main.js |
| `qlvb.vanban_di.act_activiti` | `publishTTDT` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `pushVanBanToTDNV` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `saveEditBanHanh` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `saveGoiYNoiNhanVbdiHangLoat` | ghi/khác | Văn bản đi chờ xử lý |
| `qlvb.vanban_di.act_activiti` | `saveProcessKey` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.act_activiti` | `sendDocFromOfficeToVSR` | ghi/khác | Giao việc, inline-main.js |
| `qlvb.vanban_di.act_activiti` | `sf_add_file_version` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.vanban_di.act_activiti` | `sf_add_file_version_signature` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `sf_chontruoc_nhieubuoc` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `sf_do_any_action_rs` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `sf_getListDonViBanHanhTabNhan` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.vanban_di.act_activiti` | `sf_getListDonViBanHanhTabNhanV2` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.vanban_di.act_activiti` | `sf_getListDonViBanHanhVbChiDao` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.act_activiti` | `sf_getListDonViNhiemVuVbChiDao` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `qlvb.vanban_di.act_activiti` | `sf_get_detail_doc` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `qlvb.vanban_di.act_activiti` | `sf_get_doc_byid` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đến cá nhân |
| `qlvb.vanban_di.act_activiti` | `sf_get_func_by_banhanh` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `sf_get_hinhthuc_vanban` | đọc | Công việc cần xử lý, Giao việc, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi |
| `qlvb.vanban_di.act_activiti` | `sf_get_hinhthuc_vanban_theoluong` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `sf_get_list_hoso_vanban` | đọc | Công việc cần xử lý, Giao việc, Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn |
| `qlvb.vanban_di.act_activiti` | `sf_get_menu_create_vb` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn  |
| `qlvb.vanban_di.act_activiti` | `sf_get_session_download` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `sf_update_date_file` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `qlvb.vanban_di.act_activiti` | `sf_update_hinhthucsao` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `syncKNTCOnPublish` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `updateConfigTypeKySo` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_di.act_activiti` | `vbdi_detail_get_donvingoai_text` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_lienthong.VanBanLienThong` | `getOrgFrom` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vanban_lienthong.VanBanLienThong` | `sendDocLienthong` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vnptai.TichHopAI` | `summary` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `qlvb.vnptai.TichHopAI` | `trainVanBan` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `quantrihethong.Agent` | `checkXuLyUyQuyen` | đọc | Giao việc, inline-main.js |
| `quantrihethong.Agent` | `getAgentByAgentId` | đọc | inline-main.js |
| `quantrihethong.Agent` | `getHeaderFooterAgentById` | đọc | inline-main.js |
| `quantrihethong.Agent` | `showDSDuocUyQuyen` | ghi/khác | Giao việc, inline-main.js |
| `quantrihethong.Agent` | `showDSUyQuyen` | ghi/khác | Giao việc, inline-main.js |
| `quantrihethong.AgentPublish` | `getDSDonViDangKyLichHop` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `quantrihethong.AgentPublish` | `loadDonViCauHinhLichHop` | đọc | Lịch đơn vị |
| `quantrihethong.DanhMucThuTucHanhChinh` | `getListForCombobox` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `quantrihethong.DonviNhansu` | `getDepartmentByUser` | đọc | inline-main.js |
| `quantrihethong.DonviNhansu` | `getDonviById` | đọc | Lịch đơn vị |
| `quantrihethong.DonviNhansu` | `getListChucDanhChoNhanSu` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `quantrihethong.DonviNhansu` | `getListDependentUnit` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `quantrihethong.DonviNhansu` | `getListDonViNhanSu` | đọc | inline-main.js |
| `quantrihethong.DonviNhansu` | `getListDonViNhanSuBySchema` | đọc | inline-main.js |
| `quantrihethong.DonviNhansu` | `getListDonViNhanSuIstorage` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `quantrihethong.DonviNhansu` | `getListDonViNhanSuRole_QLLH` | đọc | Lịch đơn vị, Đăng ký phòng họp |
| `quantrihethong.DonviNhansu` | `getListDonViNhanSu_QLLH` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `quantrihethong.DonviNhansu` | `getListNhanSu` | đọc | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân, Đăng ký phòng họp |
| `quantrihethong.DonviNhansu` | `getListUserSwitch` | đọc | inline-main.js |
| `quantrihethong.DonviNhansu` | `getPrimaryUnitName` | đọc | inline-main.js |
| `quantrihethong.DonviNhansu` | `getUnitByParentId` | đọc | Lịch đơn vị |
| `quantrihethong.HniMenuPrivateConfig` | `count_menu_private_config` | đọc | inline-main.js |
| `quantrihethong.HniMenuPrivateConfig` | `get_private_menu_html` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `checkUserRole` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `quantrihethong.HomePage` | `donDocVbDenPhuTrach` | ghi/khác | inline-main.js |
| `quantrihethong.HomePage` | `getBoxes` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getHTMLString` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getListDonViPhongBan` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getPhongBanByUser` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getThongKeChiDaoDieuHanh` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getThongKeVBDen` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getThongKeVBDi` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getUserBox` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `getVbDenPhuTrachCt` | đọc | inline-main.js |
| `quantrihethong.HomePage` | `updateUserBox` | ghi/khác | inline-main.js |
| `quantrihethong.HuongDanSuDung` | `exportAllFileHdsd` | ghi/khác | inline-main.js |
| `quantrihethong.HuongDanSuDung` | `getAllLXList` | đọc | inline-main.js |
| `quantrihethong.LicensePluggin` | `getLicenseUsing` | đọc | inline-main.js |
| `quantrihethong.LogAccess` | `addLogAccess` | ghi/khác | inline-main.js |
| `quantrihethong.Menu` | `doCountMenu` | ghi/khác | inline-main.js |
| `quantrihethong.Menu` | `getDefaultMenu` | đọc | inline-main.js |
| `quantrihethong.Menu` | `getMenuById` | đọc | inline-main.js |
| `quantrihethong.Menu` | `getMenuByUser` | đọc | inline-main.js |
| `quantrihethong.Menu` | `getMenuCountConfig` | đọc | inline-main.js |
| `quantrihethong.Menu` | `getMenuUrl` | đọc | inline-main.js |
| `quantrihethong.MenuAgent` | `getMenuTab` | đọc | inline-main.js |
| `quantrihethong.MenuAgent` | `updateMenuCountFlagUser` | ghi/khác | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn bản đến trả lại, Văn bản đến  |
| `quantrihethong.NhanSu` | `getListDonVi` | đọc | Tra cứu văn bản |
| `quantrihethong.NhanSu` | `getListDonViXinYKien` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `quantrihethong.NhanSu` | `getListEmpByBirthday` | đọc | inline-main.js |
| `quantrihethong.NhanSu` | `getListEmployee` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `quantrihethong.NhanSu` | `getTotalEmployee` | đọc | Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi chờ xử lý, Văn bản đi đã xử lý, Văn bản đến |
| `quantrihethong.Notification` | `checkNotificationConfig` | đọc | inline-main.js |
| `quantrihethong.Notification` | `connectFireBase` | ghi/khác | inline-main.js |
| `quantrihethong.Notification` | `countAllNotiUnRead` | đọc | inline-main.js |
| `quantrihethong.Notification` | `getAllNotifications` | đọc | inline-main.js |
| `quantrihethong.Notification` | `readAndSelectNotification` | ghi/khác | inline-main.js |
| `quantrihethong.Notification` | `readDocumentNotification` | ghi/khác | inline-main.js |
| `quantrihethong.Notification` | `readNotification` | ghi/khác | inline-main.js |
| `quantrihethong.Notification` | `replaceLanguage` | ghi/khác | inline-main.js |
| `quantrihethong.Notification` | `replaceLanguageKey` | ghi/khác | inline-main.js |
| `quantrihethong.Notification` | `sendSMSTraLai` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đi đã xử lý, Văn b |
| `quantrihethong.Notification` | `storeNotification` | ghi/khác | inline-main.js |
| `quantrihethong.Notification` | `updateNotification` | ghi/khác | inline-main.js |
| `quantrihethong.ThongBaoNguoiDung` | `getPopupThongBaoNguoiDung` | đọc | inline-main.js |
| `quantrihethong.ThongBaoNguoiDung` | `getThongBaoNguoiDung` | đọc | inline-main.js |
| `quantrihethong.UpdateUser` | `getDanhSachNgonngu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `quantrihethong.UpdateUser` | `getTTPhuTrach` | đọc | inline-main.js |
| `quantrihethong.UpdateUser` | `getThemeAndFontSize` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `quantrihethong.UpdateUser` | `getUserAvatar` | đọc | inline-main.js |
| `quantrihethong.UpdateUser` | `getUserImageSign` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `quantrihethong.UpdateUser` | `getUserUnit` | đọc | inline-main.js |
| `quantrihethong.UpdateUser` | `getVbAttr` | đọc | Ngoài đơn vị, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `quantrihethong.UpdateUser` | `saveTTPhuTrach` | ghi/khác | inline-main.js |
| `quantrihethong.UpdateUser` | `updateVbAttr` | ghi/khác | Ngoài đơn vị, Trong đơn vị, Văn bản đi chờ xử lý, Văn bản đến cá nhân |
| `quantrihethong.User` | `checkUserId` | đọc | myJS__websocket.js |
| `storage.danhmuc_hoso` | `gen_so_hoso` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `getListDeMuc` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `getListThoiGianBaoQuan` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `getListUnit` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `sf_get_list` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `sf_get_loaiHinhTaiLieu` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `sf_hs_by_id` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `sf_is_read` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `sf_save_hoso` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso` | `updateCntFile` | ghi/khác | Lịch đơn vị, Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để bi |
| `storage.danhmuc_hoso_chitiet` | `callAPICommon` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso_chitiet` | `getTokenAuthen` | đọc | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso_chitiet` | `sf_add_vanban` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `storage.danhmuc_hoso_chitiet` | `sf_add_vanban_by_api` | ghi/khác | Ngoài đơn vị, Tra cứu văn bản, Trong đơn vị, Văn bản lưu chờ phê duyệt, Văn bản theo dõi, Văn bản xem để biết, Văn bản đ |
| `theodoi_nhiemvu.TheoDoiNhiemVuVPCP` | `get_chitiet_nhiemvu` | đọc | Giao việc |
| `theodoi_nhiemvu.TheoDoiNhiemVuVPCP` | `get_nhiemvu_by_congviec` | đọc | Giao việc |
| `theodoi_nhiemvu.TheoDoiNhiemVuVPCP` | `save_conviec_nhiemvu` | ghi/khác | Giao việc |
| `thumoi.ThuMoiCuaToi` | `getTopNThuMoi` | đọc | inline-main.js |
| `traodoithongtin.TraoDoiThongTin` | `getTTDHNhan_PageHomeBox` | đọc | inline-main.js |
| `traodoithongtin.TraoDoiThongTinAction` | `getRoot` | đọc | inline-main.js |

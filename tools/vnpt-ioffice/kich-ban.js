// Gói kịch bản "phiên dịch" VNPT iOffice (Văn bản Hà Nội — quanlyvanban.hanoi.gov.vn) cho giao diện Văn bản chung của
// Vala Desktop (docs/van-ban-chung.md). Bản MẪU: bản chạy thật lưu trong CSDL (Quản trị → Kịch bản Desktop), mã
// vnpt_ioffice_hn. Cùng phần mềm ở tỉnh khác ⇒ dùng lại gói, chỉ đổi mẫu địa chỉ.
// Áp dụng cho trang: https://quanlyvanban.hanoi.gov.vn/*
//
// Gọi dữ liệu bằng DWR của chính trang (vala.dwr — docs/van-ban-ha-noi.md): phải đang ở trang chính sau đăng nhập, trang
// đăng nhập không có đối tượng DWR ⇒ lỗi het_phien (giao diện mời mở Trang gốc để đăng nhập).
//
// CHƯA KIỂM VỚI DỮ LIỆU THẬT: tài khoản khảo sát (08/10/2026) không có văn bản nào ⇒ tên trường của một dòng (pick(...)
// bên dưới) mới là dự đoán theo mã trang; chi tiết / tệp / thao tác xử lý làm khi có văn bản thử.

/** Bộ lọc đúng như trang gốc gửi (máy chủ đọc đủ các khoá) — chỉ đổi khoá cần. */
const LOC_DEN = {
  ma_dinh_danh: '', trich_yeu: '', kho: 'VAN_BAN_DEN_CA_NHAN', type: '', vbchidao: '', param_menu_congvan_dendi: '', vanbannoibo: '',
  hcm_q12_nobo: '', type_vbden_choxuly: '', view_hslt: '0', typexuly: '', trangthai_doc: '', trong_ngay: '', vbnoibo: '2', lanhdao: '',
  trichyeukhongdau: '0', ngay: '', loai: '', phieuchuyen: '', loai_cqbh: '', vaitro_user: '', cohanxly: '',
  hienthi_dsvb_blu: 'qlvb/van_ban_den/dsvb_den/lst_table', sel_year_search: '', is_current_year: '', in_dvbanhanh: '', notin_dvbanhanh: '',
  like_madinhdanh: '', notlike_madinhdanh: '', mailcv: '', order_do_khan: '0', dcm_approval: '3', order_vb_denhan: '0',
  CONFIG_VBDEN_HIENTHI_COT_TTVANBAN: '0', isConfigFuncHanchexem: '0', vbtrongngoai: '', phanloai: '', view_vb_vanthu_chuyen: '0', para_tooltip: '0',
};
const LOC_DI = {
  value_search: '', field_search: 'trich_yeu', typeget: 'vanban_di_choxuly', vbdi_songaydenhan: '0', isConfigFuncHanchexem: '0', typeDongBang: '',
  tachkho: '', vbchidao: '', check_tb_kho_vbdi: '', vanbannoibo: '', hinhthucvb: '', giaoDienBLU: '0', value_search_start_date: '',
  value_search_end_date: '', field_search_date: 'ngay_tao', trong_ngay: '', lanhdao: '', sel_year_search: '', is_current_year: '',
  order_do_khan: '0', para_tooltip: '0', trinhchuyen: '', vb_layykien: '', type_layykien: null,
};
const LOC_TRA_CUU = {
  don_vi: '', trich_yeu: '', trich_yeu_org: '', ma_duthao: '', nguoixuly: '', ansoden: '0', nguoisoan: '', nguoiky: '', donvixuly: '', so_kyhieu: '',
  so_kyhieu_org: '', dcm_type: '', dcm_linhvuc: '', dcm_priority: '', start_date_banhanh: '', end_date_banhanh: '', start_date_soanthao: '',
  end_date_soanthao: '', coquan_banhanh: '', start_date_han_xuly: '', end_date_han_xuly: '', txt_toanvan: '', fulltext_search: '', search_doc_id: '',
  avs_donvisoanthao: '', dcm_sovanban_avs: '', dcm_sovb_avs: '', kho_htvb: '', dcm_sovb_avs_range_dau: '', dcm_sovb_avs_range_cuoi: '', loai_vanban: '',
  loaitracuu: '', chk_search_toanvan: '0', condition: '', conditionType: '', qlvb_baocao_vbden_kynhan: '0', hinhthucvb: '', chk_search_chinhxac: '0',
  txt_start_date_ngayden: '', txt_end_date_ngayden: '', dcm_sovanban_text: '', fieldSort: '', sort: '', search_khongdau: '0', doc_type: '', is_read: '',
  ioffice_number: '', vanban_dientu_giay: '', noi_nhan: '', vb_toan_trinh: '0', phanloai_vanban_luongxanh: '', txt_tukhoa_any: '', txt_nguoi_xlc: '',
  vb_kyso: '', doc_nam: '-1', config_tim_kiem_chinh_xac_skh: '0', TRACUU_VALIDATE_CONTROL: '0', hinhthuc_chuyen: '', xulychinh_cuoi: '',
  sel_year_search: '', is_current_year: '', thu_tuc_hanh_chinh: '', txt_ngay_hop: '', txt_start_date_theoky: '', txt_end_date_theoky: '',
  isVBDungChung: '', vt_tthc: '', thuctuc_hsmc_id: null, CONFIG_VBDEN_HIENTHI_COT_TTVANBAN: '0', isConfigFuncHanchexem: '0', para_tooltip: '0',
  phanloaivb: '', vb_phieuchuyen: '',
};

/** Các hộp: hàm phân trang + bộ lọc (tìm kiếm đặt vào khoá `tim`). */
const HOP = [
  { ma: 'den_ngoai', ten: 'Đến từ ngoài đơn vị', loai: 'den', fn: 'qlvb.van_ban_den.getVanBanDenPaging', loc: { ...LOC_DEN, vbnoibo: '2' }, tim: 'trich_yeu' },
  { ma: 'den_trong', ten: 'Đến trong đơn vị', loai: 'den', fn: 'qlvb.van_ban_den.getVanBanDenPaging', loc: { ...LOC_DEN, vbnoibo: '1' }, tim: 'trich_yeu' },
  { ma: 'di_cho_xu_ly', ten: 'Đi chờ xử lý', loai: 'di', fn: 'qlvb.vanban_di.act_activiti.getListPaging', loc: LOC_DI, tim: 'value_search' },
  { ma: 'tra_cuu', ten: 'Tra cứu', loai: 'khac', fn: 'qlvb.van_ban_den.getTraCuuVanBanPaging', loc: LOC_TRA_CUU, tim: 'trich_yeu' },
];

/** Giá trị đầu tiên có của các khoá (tên trường mỗi bản iOffice một khác). */
const pick = (o, keys) => { for (const k of keys) { const v = o[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return undefined; };
/** "dd/MM/yyyy[ HH:mm]" ⇒ "yyyy-MM-dd[ HH:mm]". */
const ngayISO = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))?/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}${m[4] ? ` ${m[4].padStart(5, '0')}` : ''}` : s;
};
/** Chữ từ máy chủ có thể chứa HTML (thẻ, &amp;…) ⇒ chữ thường. */
const chu = (s) => { if (s === undefined) return undefined; const d = document.createElement('div'); d.innerHTML = s; return d.textContent.trim(); };

function dong(r) {
  const id = pick(r, ['id', 'doc_id', 'dcm_id', 'ID']);
  if (!id) return null;
  return {
    id,
    so_ky_hieu: chu(pick(r, ['so_kyhieu', 'so_ky_hieu', 'sokyhieu', 'dcm_code', 'so_hieu'])),
    trich_yeu: chu(pick(r, ['trich_yeu', 'trichyeu', 'dcm_title', 'title', 'noi_dung'])) || '',
    co_quan: chu(pick(r, ['coquan_banhanh', 'co_quan_ban_hanh', 'ten_coquan', 'noi_gui', 'don_vi_ban_hanh', 'ten_don_vi'])),
    ngay: ngayISO(pick(r, ['ngay_vanban', 'ngay_ban_hanh', 'ngay_den', 'ngay_tao', 'dcm_date', 'ngay'])),
    do_khan: chu(pick(r, ['ten_do_khan', 'do_khan_name', 'do_khan'])),
    han_xu_ly: ngayISO(pick(r, ['han_xuly', 'han_xu_ly', 'han_giaiquyet', 'deadline'])),
    trang_thai: chu(pick(r, ['ten_trang_thai', 'trang_thai_name', 'trang_thai', 'status_name'])),
    da_doc: r.is_read === undefined ? undefined : String(r.is_read) === '1',
  };
}

/** Dòng của lần xem danh sách gần nhất (chi tiết tạm lấy từ đây cho tới khi làm hàm chi tiết). */
const nho = new Map();

vala.action('vb_thong_tin', { mo_ta: 'Giao diện Văn bản: tên hệ thống, người đăng nhập, các hộp' }, async () => ({
  he_thong: 'Văn bản Hà Nội',
  nguoi_dung: await vala.dwr('DataRemoting.getJValue', vala.dwr.expr('qlvb.vanban_di.act_activiti.getUserLogin')),
  hop: HOP.map(({ ma, ten, loai }) => ({ ma, ten, loai })),
}));

vala.action('vb_danh_sach', { mo_ta: 'Giao diện Văn bản: danh sách một hộp' }, async ({ hop, trang = 1, so_dong = 20, tim = '' }) => {
  const h = HOP.find((x) => x.ma === hop) || HOP[0];
  const n = Math.min(Math.max(Number(so_dong) || 20, 1), 100);
  const loc = { ...h.loc, [h.tim]: String(tim || '') };
  const dem = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr(h.fn, -1, n, loc));
  const tong = Number((Array.isArray(dem) && dem[0] && dem[0].nor) || 0);
  const so_trang = Math.max(1, Number((Array.isArray(dem) && dem[0] && dem[0].nop) || 1));
  if (!tong) return { tong: 0, so_trang: 1, dong: [] };
  const rows = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr(h.fn, Math.min(Number(trang) || 1, so_trang), n, loc));
  const ds = (Array.isArray(rows) ? rows : []).map(dong).filter(Boolean);
  for (const d of ds) nho.set(d.id, d);
  return { tong, so_trang, dong: ds };
});

vala.action('vb_chi_tiet', { mo_ta: 'Giao diện Văn bản: chi tiết (tạm: thông tin của dòng trong danh sách)' }, async ({ id }) => {
  const d = nho.get(String(id));
  if (!d) throw new Error('Mở lại danh sách rồi chọn văn bản');
  return { ...d, tep: [], qua_trinh: [], thao_tac: [] };
});

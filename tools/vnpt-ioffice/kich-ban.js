// Gói kịch bản "phiên dịch" VNPT iOffice (Văn bản Hà Nội — quanlyvanban.hanoi.gov.vn) cho giao diện Văn bản chung của
// Vala Desktop (docs/van-ban-chung.md). Bản MẪU: bản chạy thật lưu trong CSDL (Quản trị → Kịch bản Desktop), mã
// vnpt_ioffice_hn. Cùng phần mềm ở tỉnh khác ⇒ dùng lại gói, chỉ đổi mẫu địa chỉ.
// Áp dụng cho trang: https://quanlyvanban.hanoi.gov.vn/*
//
// Gọi dữ liệu bằng DWR của chính trang (vala.dwr — docs/van-ban-ha-noi.md): phải đang ở trang chính sau đăng nhập, trang
// đăng nhập không có đối tượng DWR ⇒ lỗi het_phien (giao diện mời mở Trang gốc để đăng nhập).
//
// Đã kiểm với văn bản thật (08/10/2026, văn bản đi thử 2005200 trên tài khoản demo): danh sách văn bản đi, chi tiết
// (sf_get_detail_doc), tệp (getFileAttachLst + /qlvbdh/viewfile), tạo văn bản đi (addNew — qua chính form của hệ thống).
// Văn bản ĐẾN chưa có dữ liệu thật ⇒ tên trường của dòng văn bản đến (pick(...)) còn là dự đoán theo mã trang.

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

// ---- menu: đọc CHÍNH menu của hệ thống ⇒ Vala có đủ mọi chức năng; mục đã phiên dịch vẽ bằng giao diện Vala, mục chưa
// phiên dịch mở đúng trang đó của hệ thống (địa chỉ như trang tự đặt lên thanh địa chỉ khi bấm menu — hàm link()).
const TRANG_CHINH = 'CEt1CzAwJyHx4yjbTq9vCBtuTt9fCcPbUo..';
const urlGoc = (q) => `${location.origin}/qlvbdh/main?IzL1Dx9w5BxmCEtw5A9c6Bnb=${TRANG_CHINH}&${q}`;
/** Mã menu của hệ thống ⇒ mã hộp đã phiên dịch. */
const DA_PHIEN_DICH = { m4905: 'den_ngoai', m4906: 'den_trong', m2282: 'di_cho_xu_ly', m2286: 'tra_cuu' };
/** Văn bản đi tạo bằng "Tạo văn bản" nằm ở kho văn bản đi cá nhân (không có mục menu riêng) ⇒ Vala thêm mục này. */
const LOC_DI_CA_NHAN = { value_search: '', field_search: 'so_kyhieu', typeget: 'vanban_di_canhan', check_tb_kho_vbdi: '', giaoDienBLU: '0', para_tooltip: '0' };
const giaiThucThe = (s) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
const tenMenu = (s) => giaiThucThe(String(s || '')).replace(/\s*\(\s*\d+\s*\)/g, '').replace(/\s+/g, ' ').trim();
/** Tên một mục menu: bỏ ô đếm số văn bản của hệ thống (như trang tự làm khi dựng breadcrumb). */
const tenMuc = (a) => { const c = a.cloneNode(true); c.querySelectorAll('ul, i, em, .badge, .number, .menu_count, .parent-count').forEach((x) => x.remove()); return tenMenu(c.textContent); };

/** HTML menu trái: trang chính đã vẽ (#full_menu) hoặc bản trang lưu trong sessionStorage. */
function htmlMenu() {
  const dom = document.querySelector('#full_menu');
  if (dom && dom.querySelector('a[href*="link("]')) return dom.innerHTML;
  const k = Object.keys(sessionStorage).find((x) => /^vi_get_menu_html_0_/.test(x));
  if (!k) return '';
  const raw = sessionStorage.getItem(k) || '';
  try { const j = JSON.parse(raw); return typeof j === 'string' ? j : raw; } catch { return raw; }
}

function menuHeThong() {
  const box = document.createElement('div');
  box.innerHTML = htmlMenu();
  const nhom = [];
  for (const li of box.querySelectorAll(':scope > li, :scope > ul > li')) {
    const a0 = li.querySelector(':scope > a');
    const ten = li.querySelector(':scope > a .menu-item-parent') ? tenMenu(li.querySelector(':scope > a .menu-item-parent').textContent) : a0 ? tenMuc(a0) : '';
    const muc = [];
    const duyet = (el, tien_to) => {
      for (const c of el.querySelectorAll(':scope > ul > li')) {
        const a = c.querySelector(':scope > a');
        if (!a) continue;
        const t = tenMuc(a);
        const m = /link\("([^"]*)","([^"]*)","([^"]*)","[^"]*",\d+,\d+,"([^"]*)"\)/.exec(a.getAttribute('href') || '');
        if (m) {
          const [, id, config, bucket, param] = m;
          const ma = DA_PHIEN_DICH[id];
          const hop = ma && HOP.find((h) => h.ma === ma);
          muc.push(hop ? { ma, ten: tien_to ? `${tien_to}: ${t}` : t, loai: hop.loai }
            : { ma: id, ten: tien_to ? `${tien_to}: ${t}` : t, loai: 'khac', goc: urlGoc(`IyLlCc5f5w5fCES.=${config}&CBAkTA9f5o..=${id}${param}${bucket}`) });
        } else duyet(c, t);
      }
    };
    if (/link\(/.test((a0 && a0.getAttribute('href')) || '')) duyet({ querySelectorAll: () => [li] }, '');
    else duyet(li, '');
    if (muc.length) nhom.push({ ten, muc });
  }
  return nhom;
}

/**
 * Các luồng "Tạo văn bản" của hệ thống. Luồng văn bản đi (`vanban_di…`) ⇒ form Vala (vb_mau_tao / vb_tao, dùng chính form
 * của hệ thống); luồng khác ⇒ mở đúng form tạo của hệ thống (`goc`).
 */
async function luongTao() {
  const k = Object.keys(sessionStorage).find((x) => /^vi_get_menu_top_tao_van_ban_/.test(x));
  // Trang vừa tải (vd mở lại app) chưa kịp lưu danh sách vào sessionStorage ⇒ hỏi thẳng hệ thống (như trang tự làm).
  const raw = (k && sessionStorage.getItem(k)) || String(await vala.dwr('DataRemoting.getValue', vala.dwr.expr('qlvb.common.get_menu_top_tao_van_ban')) || '');
  return raw.split('|').filter(Boolean).map((it) => it.split(',')).filter((b) => b.length >= 6).map((b) => ({
    ma: `tao_${b[0]}_${b[4].split(':')[0]}`.replace(/[^A-Za-z0-9_.:|-]/g, '_').slice(0, 200), ten: tenMenu(b[1]), b,
    di: /^vanban_di/.test(b[2]),
    goc: urlGoc(`IyLlCc5f5w5fCES.=${b[5]}&CBAkTA9f5o..=${b[0]}&6yXl=${b[2]}&4BLw6B9k=${b[3]}&DFHl4yAvDx9a5B5fCcbw6B9k3yba=${b[4]}&5ELj3zP1DES.=${b[6] || ''}`),
  }));
}
const taoHeThong = async () => (await luongTao()).map((l) => (l.di ? { ma: l.ma, ten: l.ten } : { ma: l.ma, ten: l.ten, goc: l.goc }));

/** Các hộp: hàm phân trang + bộ lọc (tìm kiếm đặt vào khoá `tim`). */
const HOP = [
  { ma: 'den_ngoai', ten: 'Đến từ ngoài đơn vị', loai: 'den', fn: 'qlvb.van_ban_den.getVanBanDenPaging', loc: { ...LOC_DEN, vbnoibo: '2' }, tim: 'trich_yeu' },
  { ma: 'den_trong', ten: 'Đến trong đơn vị', loai: 'den', fn: 'qlvb.van_ban_den.getVanBanDenPaging', loc: { ...LOC_DEN, vbnoibo: '1' }, tim: 'trich_yeu' },
  { ma: 'di_cho_xu_ly', ten: 'Đi chờ xử lý', loai: 'di', fn: 'qlvb.vanban_di.act_activiti.getListPaging', loc: LOC_DI, tim: 'value_search' },
  { ma: 'di_ca_nhan', ten: 'Văn bản đi của tôi', loai: 'di', fn: 'qlvb.vanban_di.act_activiti.getListPaging', loc: LOC_DI_CA_NHAN, tim: 'value_search' },
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

/** Chữ trạng thái (mã số trạng thái nội bộ như "2" thì bỏ). */
const chuTrangThai = (s) => (s && !/^\d+$/.test(s) ? s : undefined);

function dong(r) {
  const id = pick(r, ['id', 'doc_id', 'dcm_id', 'ID']);
  if (!id) return null;
  const doc = pick(r, ['isread', 'is_read']);
  return {
    id,
    so_ky_hieu: chu(pick(r, ['so_kyhieu', 'so_ky_hieu', 'sokyhieu', 'dcm_code', 'so_hieu'])),
    trich_yeu: chu(pick(r, ['trich_yeu', 'trichyeu', 'dcm_title', 'title', 'noi_dung'])) || '',
    co_quan: chu(pick(r, ['coquan_banhanh', 'co_quan_ban_hanh', 'ten_coquan', 'noi_gui', 'don_vi_ban_hanh', 'donvi_banhanh', 'ten_don_vi', 'donvi_soanthao'])),
    ngay: ngayISO(pick(r, ['ngay_vanban', 'ngay_ban_hanh', 'ngay_den', 'ngay_tao', 'dcm_date', 'ngay'])),
    do_khan: chu(pick(r, ['priority_name', 'ten_do_khan', 'do_khan_name', 'do_khan'])),
    han_xu_ly: ngayISO(pick(r, ['han_xuly', 'han_xu_ly', 'han_giaiquyet', 'deadline'])),
    trang_thai: chuTrangThai(chu(pick(r, ['ten_trang_thai', 'trang_thai_name', 'bussiness_doc_type_name', 'trang_thai', 'status_name']))),
    nguoi_xu_ly: chu(pick(r, ['nguoi_xlc_cuoi', 'nguoi_xu_ly', 'nguoi_soan_danhsach'])),
    loai: chu(pick(r, ['ten_phanloaivanban', 'hinhthuc_vanban'])),
    da_doc: doc === undefined ? undefined : doc === '1' || doc === 'true',
  };
}

/** Dòng của lần xem danh sách gần nhất (chi tiết tạm lấy từ đây cho tới khi làm hàm chi tiết). */
const nho = new Map();

vala.action('vb_thong_tin', { mo_ta: 'Giao diện Văn bản: tên hệ thống, người đăng nhập, menu đủ như hệ thống' }, async () => {
  const nguoi_dung = await vala.dwr('DataRemoting.getJValue', vala.dwr.expr('qlvb.vanban_di.act_activiti.getUserLogin'));
  // Vừa đăng nhập: trang chính còn đang vẽ menu ⇒ chờ (không có thì dùng các hộp đã phiên dịch).
  try { await vala.waitFor(() => /link\(/.test(htmlMenu()), { timeout: 8000 }); } catch { /* không có menu */ }
  let menu = menuHeThong();
  // Chưa đọc được menu của trang ⇒ ít nhất các hộp đã phiên dịch.
  if (!menu.some((n) => n.muc.some((m) => !m.goc))) menu = [{ ten: 'Văn bản', muc: HOP.map(({ ma, ten, loai }) => ({ ma, ten, loai })) }, ...menu];
  // Kho văn bản đi cá nhân (văn bản vừa tạo) không có mục menu riêng ⇒ thêm vào nhóm văn bản đi.
  if (!menu.some((n) => n.muc.some((m) => m.ma === 'di_ca_nhan'))) {
    const nhom = menu.find((n) => n.muc.some((m) => m.ma === 'di_cho_xu_ly')) || menu[0];
    if (nhom) nhom.muc.unshift({ ma: 'di_ca_nhan', ten: 'Văn bản đi của tôi', loai: 'di' });
  }
  return { he_thong: 'Văn bản Hà Nội', nguoi_dung, menu, tao: await taoHeThong() };
});

vala.action('vb_dem', { mo_ta: 'Giao diện Văn bản: số văn bản các hộp đã phiên dịch' }, async () => {
  const out = {};
  for (const h of HOP) {
    const dem = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr(h.fn, -1, 20, h.loc));
    out[h.ma] = { tong: Number((Array.isArray(dem) && dem[0] && dem[0].nor) || 0) };
  }
  return out;
});

vala.action('vb_danh_sach', { mo_ta: 'Giao diện Văn bản: danh sách một hộp' }, async ({ hop, trang = 1, so_dong = 20, tim = '' }) => {
  const h = HOP.find((x) => x.ma === hop) || HOP[0];
  const n = Math.min(Math.max(Number(so_dong) || 20, 1), 100);
  const loc = { ...h.loc, [h.tim]: String(tim || '') };
  const dem = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr(h.fn, -1, n, loc));
  const tong = Number((Array.isArray(dem) && dem[0] && dem[0].nor) || 0);
  const so_trang = Math.max(1, Number((Array.isArray(dem) && dem[0] && dem[0].nop) || 1));
  if (!tong) return { tong: 0, so_trang: 1, dong: [] };
  const rows = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr(h.fn, Math.min(Number(trang) || 1, so_trang), n, loc));
  const goc = Array.isArray(rows) ? rows : [];
  const ds = goc.map(dong).filter(Boolean);
  ds.forEach((d) => nho.set(d.id, { ...d, _goc: goc.find((r) => String(pick(r, ['id', 'doc_id', 'dcm_id', 'ID'])) === d.id) }));
  return { tong, so_trang, dong: ds };
});

// ---- chi tiết, tệp, quá trình ----

/** Trường riêng của hệ thống (không có trong hợp đồng) ⇒ "Thông tin khác". */
const THEM = [
  ['ten_nguoi_soanthao', 'Người soạn thảo'], ['donvi_soanthao', 'Đơn vị soạn thảo'], ['nguoi_ky_chinh', 'Người ký'], ['chucvu_nguoiky', 'Chức vụ người ký'],
  ['linhvuc', 'Lĩnh vực'], ['ma_dinh_danh', 'Mã định danh'], ['ma_duthao', 'Mã dự thảo'], ['so_ban', 'Số bản'], ['so_trang', 'Số trang'],
  ['ngay_ban_hanh', 'Ngày ban hành'], ['ngay_tao', 'Ngày tạo'], ['bussiness_doc_type_name', 'Trạng thái nghiệp vụ'], ['tukhoa', 'Từ khoá'],
  ['ghi_chu', 'Ghi chú'], ['doc_note', 'Ghi chú văn bản'], ['ioffice_number', 'Số eOffice'],
];
const kichThuoc = (n) => { const b = Number(n); return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 0 ? `${Math.max(1, Math.round(b / 1024))} KB` : undefined; };
/** Tệp của lần xem chi tiết gần nhất: mã tệp (hdd_file) ⇒ tên. */
const tenTep = new Map();

async function quaTrinh(id) {
  try {
    const cay = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr('qlvb.van_ban_den.getDcmTrack', String(id), ''));
    const schema = (Array.isArray(cay) && cay[0] && cay[0].schema_id) || '';
    if (!schema) return [];
    const html = await vala.dwr('DataRemoting.getDoc', vala.dwr.expr('qlvb.van_ban_den.getDcmTrackActivitiLog', String(id), schema, '', '', ''));
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    box.querySelectorAll('style, script').forEach((x) => x.remove());
    // Bảng nhật ký (#dt_activiti_log): đọc theo tiêu đề cột — Người gửi, Chưa / Đang / Đã xử lý, Thời gian, Nội dung.
    const bang = box.querySelector('table');
    if (!bang) return [];
    const cot = [...bang.querySelectorAll('thead th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim());
    const o = (cells, ten) => { const i = cot.findIndex((c) => c.startsWith(ten)); return i >= 0 && cells[i] ? cells[i].textContent.replace(/\s+/g, ' ').trim() : ''; };
    return [...bang.querySelectorAll('tbody tr')].map((tr) => {
      const c = [...tr.children];
      const nhan = ['Chưa xử lý', 'Đang xử lý', 'Đã xử lý'].map((k) => (o(c, k) ? `${k}: ${o(c, k)}` : '')).filter(Boolean);
      return { luc: ngayISO(o(c, 'Thời gian')), nguoi: o(c, 'Người gửi'), viec: [o(c, 'Nội dung'), ...nhan].filter(Boolean).join(' · ').slice(0, 1000) };
    }).filter((q) => q.viec);
  } catch { return []; }
}

vala.action('vb_chi_tiet', { mo_ta: 'Giao diện Văn bản: chi tiết, tệp, quá trình xử lý' }, async ({ id }) => {
  const ma = String(id);
  const dsDong = nho.get(ma) || {};
  let ct = {};
  try { const r = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr('qlvb.vanban_di.act_activiti.sf_get_detail_doc', ma)); ct = (Array.isArray(r) && r[0]) || {}; } catch { /* văn bản không phải văn bản đi */ }
  let tep = [];
  try {
    const r = await vala.dwr('NEORemoting.getRSet', vala.dwr.expr('qlvb.van_ban_den.getFileAttachLst', ma, '0'));
    tep = (Array.isArray(r) ? r : []).filter((f) => f.hdd_file && f.name).map((f) => { tenTep.set(f.hdd_file, f.name); return { id: f.hdd_file, ten: chu(f.name), kich_thuoc: kichThuoc(f.file_size) }; });
  } catch { /* không có tệp */ }
  if (!ct.id && !dsDong.id) throw new Error('Không đọc được văn bản này — mở trên trang gốc');
  const d = dong({ ...dsDong._goc, ...ct, id: ma, trich_yeu: (dsDong._goc || {}).trich_yeu || ct.trich_yeu || dsDong.trich_yeu }) || dsDong;
  return {
    ...d,
    them: THEM.map(([k, ten]) => ({ ten, gia_tri: chu(ct[k] == null ? '' : String(ct[k])) })).filter((x) => x.gia_tri),
    tep, qua_trinh: await quaTrinh(ma), thao_tac: [],
  };
});

vala.action('vb_tep', { mo_ta: 'Giao diện Văn bản: nội dung một tệp đính kèm' }, async ({ tep }) => {
  const ma = String(tep || '');
  if (!/^[A-Za-z0-9+/=_-]{4,200}$/.test(ma)) throw new Error('Mã tệp không hợp lệ');
  // viewfile nhận mã tệp đã mã hoá base64 và trả thẳng nội dung tệp (nhị phân) ⇒ đọc bytes rồi tự mã hoá base64.
  const res = await fetch(`/qlvbdh/viewfile?file=${encodeURIComponent(btoa(ma))}&TFbm5O..=dmI~&version=1`, { credentials: 'include' });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!res.ok || !bytes.length || /^\s*</.test(new TextDecoder().decode(bytes.slice(0, 64)))) throw new Error('Hệ thống không trả tệp');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const base64 = btoa(bin);
  const ten = tenTep.get(ma) || 'tep';
  const mime = /\.pdf$/i.test(ten) ? 'application/pdf' : /\.docx?$/i.test(ten) ? 'application/msword' : 'application/octet-stream';
  return { ten, mime, base64 };
});

// ---- tạo văn bản đi: dùng chính form của hệ thống (hệ thống tự dựng ~90 trường của addNew như khi người dùng bấm) ----

const $id = (id) => document.getElementById(id);
const FORM_DI = [
  { ma: 'loai_van_ban', ten: 'Loại văn bản', id: 'PsLLAtbOPA9rRwPt', loai: 'chon', bat_buoc: true },
  { ma: 'do_khan', ten: 'Độ khẩn', id: 'StHHRxHHAtbVOw9sPO..', loai: 'chon', bat_buoc: true },
  { ma: 'trich_yeu', ten: 'Trích yếu', id: 'TRICH_YEU', loai: 'doan', bat_buoc: true },
  { ma: 'han_xu_ly', ten: 'Hạn xử lý', id: 'HAN_GIAIQUYET', loai: 'ngay' },
  { ma: 'nguoi_ky', ten: 'Người ký', id: 'RaTARwbVQxbVOwXHRaW.', loai: 'chon' },
  { ma: 'don_vi_soan_thao', ten: 'Đơn vị soạn thảo', id: 'DONVI_SOANTHAO', loai: 'chon', bat_buoc: true },
  { ma: 'theo_doi_nhiem_vu', ten: 'Văn bản theo dõi nhiệm vụ', id: 'chk_van_ban_tdnv', loai: 'chon', bat_buoc: true },
  { ma: 'noi_dung_xu_ly', ten: 'Nội dung xử lý', id: 'COMMENT', loai: 'doan' },
  { ma: 'tep', ten: 'File đính kèm', id: 'fileUpload', loai: 'tep', bat_buoc: true, nhieu: true, goi_y: 'Tối đa 50 MB mỗi tệp' },
];
const luaChon = (el) => [...el.options].filter((o) => o.value !== '' && !/^\s*--/.test(o.text)).map((o) => ({ ma: o.value, ten: o.text.trim() }));

async function moFormTao(loai) {
  const l = (await luongTao()).find((x) => x.ma === loai && x.di);
  if (!l) throw new Error(`Không tạo được loại ${loai} trên giao diện Vala — dùng trang gốc`);
  const b = l.b;
  window.newVanBanMenuTop(b[0], b[2], b[3], b[4], b[5], b[6]);
  await vala.waitFor(() => { const t = $id('TRICH_YEU'); return t && t.offsetParent ? t : null; }, { timeout: 25000 });
  await vala.sleep(1500);   // form còn nạp danh mục (người ký, đơn vị…)
  return l;
}

vala.action('vb_mau_tao', { mo_ta: 'Giao diện Văn bản: form tạo văn bản đi (lấy từ form của hệ thống)' }, async ({ loai }) => {
  const l = await moFormTao(loai);
  return {
    ten: l.ten,
    truong: FORM_DI.filter((f) => f.loai === 'tep' || $id(f.id)).map((f) => {
      const el = $id(f.id);
      const out = { ma: f.ma, ten: f.ten, loai: f.loai, bat_buoc: f.bat_buoc, nhieu: f.nhieu, goi_y: f.goi_y };
      if (f.loai === 'chon') { out.lua_chon = luaChon(el); if (el.value) out.mac_dinh = el.value; }
      return out;
    }),
  };
});

const ngayVN = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s || ''); };
const b64File = (t) => { const bin = atob(t.base64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new File([a], t.ten, { type: t.loai || 'application/octet-stream' }); };
const thongBaoMoi = (truoc) => [...document.querySelectorAll('[class*=toast], [class*=Toast]')].map((e) => e.innerText.trim()).filter(Boolean).slice(truoc);

vala.action('vb_tao', { mo_ta: 'Giao diện Văn bản: tạo văn bản đi (lưu để theo dõi, không trình)' }, async ({ loai, tep = [], ...v }) => {
  await moFormTao(loai);
  const $ = window.jQuery;
  for (const f of FORM_DI) {
    if (f.loai === 'tep' || v[f.ma] === undefined) continue;
    const el = $id(f.id);
    if (!el) continue;
    const val = f.loai === 'ngay' ? ngayVN(v[f.ma]) : String(v[f.ma]);
    if (f.loai === 'chon') { el.value = val; if ($) $(el).trigger('change'); else el.dispatchEvent(new Event('change', { bubbles: true })); }
    else await vala.fill(el, val);
  }
  // Tệp: đặt vào ô "File đính kèm" như người dùng chọn ⇒ trang tự tải lên, ghi mã tệp vào danh sách của form.
  if (tep.length) {
    const input = $id('fileUpload');
    const dt = new DataTransfer();
    for (const t of tep) dt.items.add(b64File(t));
    input.files = dt.files;
    if ($) $(input).trigger('change'); else input.dispatchEvent(new Event('change', { bubbles: true }));
    await vala.waitFor(() => String(window.vbdi_getFileList('file_id_list') || '').split(',').filter(Boolean).length >= tep.length, { timeout: 120000 });
  }
  // Bắt kết quả addNew của trang ("TRUE|<mã>"); trang báo lỗi kiểm tra (thiếu trường…) ⇒ trả đúng câu báo.
  const goc = window.DataRemoting.getDoc;
  let ketQua = null;
  window.DataRemoting.getDoc = function (expr, cb) {
    if (!/act_activiti\.addNew\(/.test(String(expr))) return goc.apply(this, arguments);
    const xong = (r) => { ketQua = String(r); };
    const wrap = typeof cb === 'function' ? (r) => { xong(r); return cb(r); } : { ...cb, callback: (r) => { xong(r); return cb.callback && cb.callback(r); } };
    return goc.call(this, expr, wrap);
  };
  const truoc = thongBaoMoi(0).length;
  try {
    window.vbdi_savedoc('1');
    await vala.waitFor(() => ketQua || (thongBaoMoi(truoc).length ? 'loi' : null), { timeout: 60000 });
  } finally { window.DataRemoting.getDoc = goc; }
  const m = /^TRUE\|(\d+)/.exec(ketQua || '');
  if (!m) throw new Error(thongBaoMoi(truoc).join('; ') || `Hệ thống không lưu được văn bản (${ketQua || 'không có phản hồi'})`);
  return { id: m[1], thong_bao: 'Đã tạo văn bản đi (lưu để theo dõi)' };
});

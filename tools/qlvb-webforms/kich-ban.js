// Gói kịch bản "QLVB Thử nghiệm" (hệ thống ASP.NET WebForms giả lập, T07). Bản MẪU: bản chạy thật lưu trong CSDL
// (Quản trị → Kịch bản Desktop, mã qlvb_thu) — nạp bằng `node tools/qlvb-webforms/nap-vao-vala.mjs`.
// Áp dụng cho trang: http://localhost:4030/*
//
// Gửi form trực tiếp bằng vala.webform (docs/tich-hop-aspnet.md): không bấm trên giao diện, không đổi trang đang xem ⇒ chạy
// được cả trong Vala Desktop lẫn trên máy chủ (runner). Chọn phần tử theo ĐUÔI id ([id$="_lblTong"]) để chạy được cả id
// kiểu Mono / ASP.NET cũ (ctl00_MainContent_…) lẫn ASP.NET 4 (MainContent_…). Thao tác ghi đọc lại để xác nhận, không tự
// thử lại (tránh chuyển / phát hành hai lần).

const id$ = (ten) => `[id$="_${ten}"]`;
const loi = (msg) => { const e = new Error(msg); e.code = 'nghiep_vu'; return e; };

/** Câu lỗi nghiệp vụ trang hiện (nhãn lblLoi) ⇒ ném. */
function kiemLoi(f) {
  const t = f.read(id$('lblLoi'));
  if (t) throw loi(t);
}

/** Lựa chọn khớp mã hoặc tên (không phân biệt hoa thường) — trả mã; không có ⇒ lỗi kèm danh sách hợp lệ. */
function chon(options, giaTri, ten) {
  const v = String(giaTri ?? '').trim().toLowerCase();
  const o = options.find((x) => x.value.toLowerCase() === v) || options.find((x) => x.text.toLowerCase() === v);
  if (!o || o.value === '') throw loi(`${ten} "${giaTri}" không có. Chọn một trong: ${options.filter((x) => x.value !== '').map((x) => x.text).join(', ')}`);
  return o.value;
}

const COT = { 'Mã': 'id', 'Số ký hiệu': 'so_ky_hieu', 'Trích yếu': 'trich_yeu', 'Loại': 'loai', 'Trạng thái': 'trang_thai', 'Ngày tạo': 'ngay_tao', 'Người đang xử lý': 'nguoi_xu_ly' };
const dong = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [COT[k] ?? k, k === 'Mã' ? Number(v) : v]));

function chiTiet(f) {
  kiemLoi(f);
  return {
    id: Number(f.read(id$('lblMa'))),
    so_ky_hieu: f.read(id$('lblSoKyHieu')),
    trich_yeu: f.read(id$('lblTrichYeu')),
    loai: f.read(id$('lblLoai')),
    trang_thai: f.read(id$('lblTrangThai')),
    han_xu_ly: f.read(id$('lblHan')),
    noi_dung: f.read(id$('lblNoiDung')),
    tep: f.read(id$('lblTep')),
    lich_su: f.table(id$('gvLichSu')).map((r) => ({ thoi_gian: r['Thời gian'], nguoi_xu_ly: r['Người xử lý'], hanh_dong: r['Hành động'], noi_dung: r['Nội dung'] })),
  };
}

const tepDinhKem = (tep) => (tep && tep.length ? { files: { fuDinhKem: { ten: tep[0].ten, loai: tep[0].loai, base64: tep[0].base64 } } } : {});

vala.action('lay_danh_muc', { mo_ta: 'Danh mục để chọn khi tạo / chuyển / phát hành: loại văn bản, đơn vị và người nhận, sổ văn bản' }, async () => {
  const dt = await vala.webform('/DuThao.aspx');
  const loai_van_ban = dt.options('ddlLoai').filter((o) => o.value).map((o) => ({ ma: o.value, ten: o.text }));
  // Đơn vị / người nhận lấy từ màn hình Chuyển của một văn bản còn chuyển được (người nhận chỉ hiện sau khi chọn đơn vị).
  const ds = await vala.webform('/VanBan.aspx');
  await ds.postback('ddlTrangThai', { ddlTrangThai: 'Dự thảo' });
  const mau = ds.table(id$('gvVanBan'))[0];
  const don_vi = [];
  if (mau) {
    const ch = await vala.webform(`/Chuyen.aspx?id=${mau['Mã']}`);
    for (const dv of ch.options('ddlDonVi').filter((o) => o.value)) {
      await ch.postback('ddlDonVi', { ddlDonVi: dv.value });
      don_vi.push({ ma: dv.value, ten: dv.text, nguoi_nhan: ch.options('cblNguoiNhan').map((o) => ({ ma: o.value, ten: o.text })) });
    }
  }
  // Sổ văn bản chỉ văn thư xem được (màn hình Phát hành).
  let so_van_ban = [];
  if (mau) {
    const ph = await vala.webform(`/PhatHanh.aspx?id=${mau['Mã']}`);
    if (!ph.read(id$('lblLoi'))) so_van_ban = ph.options('ddlSo').filter((o) => o.value).map((o) => ({ ma: o.value, ten: o.text }));
  }
  return { loai_van_ban, don_vi, so_van_ban };
});

vala.action('lay_danh_sach_van_ban', {
  mo_ta: 'Danh sách văn bản (10 văn bản / trang, mới nhất trước)',
  params: { trang: 'số trang (mặc định 1)', tu_khoa: 'tìm theo số ký hiệu / trích yếu', trang_thai: 'Dự thảo | Đang xử lý | Đã kết thúc | Đã phát hành' },
}, async ({ trang = 1, tu_khoa = '', trang_thai = '' }) => {
  const f = await vala.webform('/VanBan.aspx');
  if (trang_thai) await f.postback('ddlTrangThai', { ddlTrangThai: chon(f.options('ddlTrangThai'), trang_thai, 'Trạng thái') });
  if (tu_khoa) await f.submit('btnTim', { txtTuKhoa: tu_khoa });
  const tong = Number((f.read(id$('lblTong')).match(/\d+/) || ['0'])[0]);
  const so_trang = Math.max(1, Math.ceil(tong / 10));
  if (trang > 1) {
    if (trang > so_trang) return { trang, so_trang, tong, van_ban: [] };
    await f.postback('gvVanBan', { __EVENTARGUMENT: `Page$${trang}` });
  }
  return { trang, so_trang, tong, van_ban: f.table(id$('gvVanBan')).map(dong) };
});

vala.action('lay_chi_tiet_van_ban', { mo_ta: 'Thông tin và lịch sử xử lý của một văn bản', params: { id: 'mã văn bản' } }, async ({ id }) => {
  return chiTiet(await vala.webform(`/ChiTiet.aspx?id=${Number(id)}`));
});

vala.action('tao_du_thao', {
  mo_ta: 'Tạo dự thảo văn bản',
  params: { loai_van_ban: 'mã hoặc tên loại', trich_yeu: 'bắt buộc', noi_dung: '', tep: '[{ ten, loai, base64 }] — tối đa 1 tệp' },
}, async ({ loai_van_ban, trich_yeu, noi_dung = '', tep }) => {
  const f = await vala.webform('/DuThao.aspx');
  await f.submit('btnLuu', { ddlLoai: chon(f.options('ddlLoai'), loai_van_ban, 'Loại văn bản'), txtTrichYeu: trich_yeu ?? '', txtNoiDung: noi_dung }, tepDinhKem(tep));
  const id = Number(new URL(f.url).searchParams.get('id'));
  const ct = chiTiet(f);
  if (!id || ct.trang_thai !== 'Dự thảo' || ct.trich_yeu !== String(trich_yeu).trim()) throw loi('Không xác nhận được dự thảo vừa tạo');
  return { id, ...ct };
});

vala.action('chuyen_van_ban', {
  mo_ta: 'Chuyển văn bản cho người xử lý',
  params: { id: 'mã văn bản', don_vi: 'mã hoặc tên đơn vị', nguoi_nhan: '[mã hoặc tên]', y_kien: '', han_xu_ly: 'dd/MM/yyyy', tep: '[{ ten, loai, base64 }]' },
}, async ({ id, don_vi, nguoi_nhan = [], y_kien = '', han_xu_ly = '', tep }) => {
  const f = await vala.webform(`/Chuyen.aspx?id=${Number(id)}`);
  kiemLoi(f);
  // WebForms: phải gửi lại "chọn đơn vị" trước — danh sách người nhận (và EventValidation) mới có người của đơn vị đó.
  await f.postback('ddlDonVi', { ddlDonVi: chon(f.options('ddlDonVi'), don_vi, 'Đơn vị') });
  const ds = f.options('cblNguoiNhan');
  const nhan = [].concat(nguoi_nhan).map((n) => chon(ds, n, 'Người nhận'));
  const truoc = (await vala.webform(`/ChiTiet.aspx?id=${Number(id)}`)).table(id$('gvLichSu')).length;
  await f.submit('btnChuyen', { cblNguoiNhan: nhan, txtYKien: y_kien, txtHanXuLy: han_xu_ly }, tepDinhKem(tep));
  const ct = chiTiet(f);
  const moi = ct.lich_su[ct.lich_su.length - 1];
  if (ct.lich_su.length !== truoc + 1 || !moi || moi.hanh_dong !== 'Chuyển xử lý') throw loi('Không xác nhận được văn bản đã chuyển');
  return { id: ct.id, trang_thai: ct.trang_thai, han_xu_ly: ct.han_xu_ly, lich_su_moi: moi };
});

vala.action('ket_thuc_van_ban', { mo_ta: 'Kết thúc xử lý văn bản (văn bản đang xử lý)', params: { id: 'mã văn bản', y_kien: '' } }, async ({ id, y_kien = '' }) => {
  const f = await vala.webform(`/ChiTiet.aspx?id=${Number(id)}`);
  kiemLoi(f);
  if (!f.$(id$('lnkKetThuc'))) throw loi(`Văn bản ${f.read(id$('lblTrangThai')).toLowerCase()}, không kết thúc được`);
  await f.postback('lnkKetThuc', { txtYKienKetThuc: y_kien });
  const ct = chiTiet(f);
  if (ct.trang_thai !== 'Đã kết thúc') throw loi('Không xác nhận được văn bản đã kết thúc');
  return { id: ct.id, trang_thai: ct.trang_thai };
});

vala.action('phat_hanh_van_ban', {
  mo_ta: 'Phát hành văn bản (chỉ văn thư): vào sổ, cấp số ký hiệu',
  params: { id: 'mã văn bản', so_van_ban: 'mã hoặc tên sổ', don_vi_nhan: '[mã hoặc tên đơn vị]' },
}, async ({ id, so_van_ban, don_vi_nhan = [] }) => {
  const f = await vala.webform(`/PhatHanh.aspx?id=${Number(id)}`);
  kiemLoi(f);
  // Sổ nằm trong UpdatePanel: chọn sổ ⇒ máy chủ điền số dự kiến (gửi một phần trang).
  await f.postback('ddlSo', { ddlSo: chon(f.options('ddlSo'), so_van_ban, 'Sổ văn bản') }, { async: true });
  const du_kien = f.$(id$('txtSoKyHieu')).getAttribute('value') || '';
  const nhan = [].concat(don_vi_nhan).map((d) => chon(f.options('cblDonViNhan'), d, 'Đơn vị nhận'));
  await f.submit('btnPhatHanh', { cblDonViNhan: nhan });
  const ct = chiTiet(f);
  if (ct.trang_thai !== 'Đã phát hành' || !ct.so_ky_hieu) throw loi('Không xác nhận được văn bản đã phát hành');
  return { id: ct.id, so_ky_hieu: ct.so_ky_hieu, so_du_kien: du_kien };
});
